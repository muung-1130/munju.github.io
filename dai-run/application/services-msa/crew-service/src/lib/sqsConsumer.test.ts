import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSqsDomainEvent } from './sqsConsumer.js';

const event = { eventId: 'event-1', eventType: 'RunCompleted', payload: { userId: 'user-1' } };

test('raw와 SNS envelope 형식을 모두 파싱한다', () => {
  assert.deepEqual(parseSqsDomainEvent(JSON.stringify(event), ['RunCompleted']), event);
  assert.deepEqual(
    parseSqsDomainEvent(JSON.stringify({ Type: 'Notification', Message: JSON.stringify(event) }), ['RunCompleted']),
    event
  );
});

test('eventId가 없으면 거부한다', () => {
  assert.throws(() => parseSqsDomainEvent(JSON.stringify({ eventType: 'RunCompleted', payload: {} }), ['RunCompleted']));
});
