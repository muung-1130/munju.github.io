import { MongoClient, type Db } from 'mongodb';

declare global {
  // eslint-disable-next-line no-var
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017';
const DB_NAME = 'dai_run_chat';

function getClientPromise(): Promise<MongoClient> {
  if (!global.__mongoClientPromise) {
    const client = new MongoClient(MONGO_URI);
    global.__mongoClientPromise = client.connect();
  }
  return global.__mongoClientPromise;
}

export async function getChatDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(DB_NAME);
}

export type CrewChatMessage = {
  room_id: string;
  sender_user_id: string;
  sender_name: string;
  message: string;
  created_at: Date;
};

export function crewChatCollection(db: Db) {
  return db.collection<CrewChatMessage>('crew_chat_messages');
}
