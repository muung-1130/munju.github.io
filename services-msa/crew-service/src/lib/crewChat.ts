import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDb, chatTableName, type CrewChatMessage } from './dynamodb.js';

export type ChatMessageDto = {
  senderUserId: string;
  senderName: string;
  message: string;
  createdAt: string;
  dateLabel: string;
  timeLabel: string;
};

// 채팅 시각은 서버가 이미 KST로 변환한 문자열(dateLabel/timeLabel)로 내려준다 — 프론트는 이 값을
// 그대로 찍기만 한다(타임존 계산을 프론트에서 다시 하지 않는다).
const KST_PARTS_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

function toKstLabels(date: Date): { dateLabel: string; timeLabel: string } {
  const parts = Object.fromEntries(KST_PARTS_FMT.formatToParts(date).map((p) => [p.type, p.value])) as Record<string, string>;
  return { dateLabel: `${parts.year}.${parts.month}.${parts.day}`, timeLabel: `${parts.hour}:${parts.minute}` };
}

function toDto(item: CrewChatMessage): ChatMessageDto {
  const createdAtDate = new Date(item.created_at);
  const { dateLabel, timeLabel } = toKstLabels(createdAtDate);
  return {
    senderUserId: item.sender_user_id,
    senderName: item.sender_name,
    message: item.message,
    createdAt: createdAtDate.toISOString(),
    dateLabel,
    timeLabel
  };
}

// room_id = crew_id로 매칭되는 채팅 내용을 DynamoDB(room_id HASH, created_at RANGE)에 둔다.
// 처음 입장할 때 방이 비어 있으면 크루장 환영 인사 등 몇 개의 시드 메시지를 만들어둔다.
export async function seedCrewChatIfEmpty(roomId: string, crewName: string, ownerName: string) {
  const existing = await dynamoDb.send(
    new QueryCommand({
      TableName: chatTableName(),
      KeyConditionExpression: 'room_id = :roomId',
      ExpressionAttributeValues: { ':roomId': roomId },
      Limit: 1
    })
  );
  if ((existing.Items?.length ?? 0) > 0) return;

  const now = Date.now();
  const seedMessages: CrewChatMessage[] = [
    {
      room_id: roomId,
      sender_user_id: 'system',
      sender_name: ownerName,
      message: `${crewName}에 오신 걸 환영해요! 편하게 인사 나눠요 🏃`,
      created_at: new Date(now - 1000 * 60 * 30).toISOString()
    },
    {
      room_id: roomId,
      sender_user_id: 'system',
      sender_name: ownerName,
      message: '이번 주 모임 장소랑 시간은 공지에서 확인해주세요!',
      created_at: new Date(now - 1000 * 60 * 20).toISOString()
    }
  ];
  await Promise.all(
    seedMessages.map((item) => dynamoDb.send(new PutCommand({ TableName: chatTableName(), Item: item })))
  );
}

export async function getCrewChatMessages(roomId: string): Promise<ChatMessageDto[]> {
  const result = await dynamoDb.send(
    new QueryCommand({
      TableName: chatTableName(),
      KeyConditionExpression: 'room_id = :roomId',
      ExpressionAttributeValues: { ':roomId': roomId },
      ScanIndexForward: true // created_at 오름차순
    })
  );
  return (result.Items as CrewChatMessage[] | undefined ?? []).map(toDto);
}

export async function addCrewChatMessage(
  roomId: string,
  senderUserId: string,
  senderName: string,
  message: string
): Promise<ChatMessageDto> {
  const item: CrewChatMessage = {
    room_id: roomId,
    sender_user_id: senderUserId,
    sender_name: senderName,
    message,
    created_at: new Date().toISOString()
  };
  await dynamoDb.send(new PutCommand({ TableName: chatTableName(), Item: item }));
  return toDto(item);
}
