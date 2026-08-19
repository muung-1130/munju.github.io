import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.CHAT_TABLE_NAME ?? 'crew_chat_messages';
const REGION = process.env.CHAT_TABLE_REGION ?? process.env.AWS_REGION;

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true }
});

export function chatTableName(): string {
  return TABLE_NAME;
}

export const dynamoDb = client;

export type CrewChatMessage = {
  room_id: string;
  sender_user_id: string;
  sender_name: string;
  message: string;
  created_at: string;
};
