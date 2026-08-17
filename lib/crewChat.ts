import { getChatDb, crewChatCollection } from '@/lib/mongo';

export type ChatMessageDto = {
  senderUserId: string;
  senderName: string;
  message: string;
  createdAt: string;
};

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
  return docs.map((doc) => ({
    senderUserId: doc.sender_user_id,
    senderName: doc.sender_name,
    message: doc.message,
    createdAt: doc.created_at.toISOString()
  }));
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
  return { senderUserId, senderName, message, createdAt: createdAt.toISOString() };
}
