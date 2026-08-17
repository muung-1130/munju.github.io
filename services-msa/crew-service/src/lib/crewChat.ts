import { getChatDb, crewChatCollection } from './mongo.js';

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

function toDto(doc: { sender_user_id: string; sender_name: string; message: string; created_at: Date }): ChatMessageDto {
  const { dateLabel, timeLabel } = toKstLabels(doc.created_at);
  return {
    senderUserId: doc.sender_user_id,
    senderName: doc.sender_name,
    message: doc.message,
    createdAt: doc.created_at.toISOString(),
    dateLabel,
    timeLabel
  };
}

// room_id = crew_id로 매칭되는 채팅 내용을 MongoDB에 둔다. 처음 입장할 때 방이 비어 있으면
// 크루장 환영 인사 등 몇 개의 시드 메시지를 만들어둔다.
export async function seedCrewChatIfEmpty(roomId: string, crewName: string, ownerName: string) {
  const db = await getChatDb();
  const collection = crewChatCollection(db);
  const existing = await collection.countDocuments({ room_id: roomId });
  if (existing > 0) return;

  const now = Date.now();
  await collection.insertMany([
    {
      room_id: roomId,
      sender_user_id: 'system',
      sender_name: ownerName,
      message: `${crewName}에 오신 걸 환영해요! 편하게 인사 나눠요 🏃`,
      created_at: new Date(now - 1000 * 60 * 30)
    },
    {
      room_id: roomId,
      sender_user_id: 'system',
      sender_name: ownerName,
      message: '이번 주 모임 장소랑 시간은 공지에서 확인해주세요!',
      created_at: new Date(now - 1000 * 60 * 20)
    }
  ]);
}

export async function getCrewChatMessages(roomId: string): Promise<ChatMessageDto[]> {
  const db = await getChatDb();
  const collection = crewChatCollection(db);
  const docs = await collection.find({ room_id: roomId }).sort({ created_at: 1 }).toArray();
  return docs.map((doc) =>
    toDto({ sender_user_id: doc.sender_user_id, sender_name: doc.sender_name, message: doc.message, created_at: doc.created_at })
  );
}

export async function addCrewChatMessage(
  roomId: string,
  senderUserId: string,
  senderName: string,
  message: string
): Promise<ChatMessageDto> {
  const db = await getChatDb();
  const collection = crewChatCollection(db);
  const createdAt = new Date();
  await collection.insertOne({
    room_id: roomId,
    sender_user_id: senderUserId,
    sender_name: senderName,
    message,
    created_at: createdAt
  });
  return toDto({ sender_user_id: senderUserId, sender_name: senderName, message, created_at: createdAt });
}
