import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSqsDomainEvent } from './sqsConsumer.js';

const event = { eventId: 'event-1', eventType: 'RunCompleted', payload: { userId: 'user-1' } };

test('raw SNS delivery 이벤트를 파싱한다', () => {
  assert.deepEqual(parseSqsDomainEvent(JSON.stringify(event), ['RunCompleted']), event);
});

test('기본 SNS envelope 이벤트를 파싱한다', () => {
  const body = JSON.stringify({ Type: 'Notification', Message: JSON.stringify(event) });
  assert.deepEqual(parseSqsDomainEvent(body, ['RunCompleted']), event);
});

test('허용하지 않은 eventType을 거부한다', () => {
  assert.throws(() => parseSqsDomainEvent(JSON.stringify({ ...event, eventType: 'Other' }), ['RunCompleted']));
});
