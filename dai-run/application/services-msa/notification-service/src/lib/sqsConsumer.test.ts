import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSqsDomainEvent } from './sqsConsumer.js';

const event = { eventId: 'event-1', eventType: 'ChallengeCompleted', payload: { challengeId: 'challenge-1' } };

test('ChallengeCompleted raw 이벤트를 파싱한다', () => {
  assert.deepEqual(parseSqsDomainEvent(JSON.stringify(event), ['ChallengeCompleted']), event);
});

test('잘못된 payload를 거부한다', () => {
  assert.throws(() => parseSqsDomainEvent(JSON.stringify({ ...event, payload: null }), ['ChallengeCompleted']));
});
