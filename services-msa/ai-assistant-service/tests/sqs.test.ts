import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRunCompletedEvent } from '../src/lib/sqs.js';

const event = {
  eventId: '11111111-1111-4111-8111-111111111111',
  eventType: 'RunCompleted',
  occurredAt: '2026-08-17T00:00:00.000Z',
  producer: 'running-record-service',
  aggregateId: '22222222-2222-4222-8222-222222222222',
  schemaVersion: 1,
  traceId: '33333333-3333-4333-8333-333333333333',
  payload: {
    runId: '22222222-2222-4222-8222-222222222222',
    userId: '44444444-4444-4444-8444-444444444444',
    courseId: null,
    myShoeId: null,
    sourceType: 'CANARY',
    startedAt: '2026-08-17T00:00:00.000Z',
    completedAt: '2026-08-17T00:30:00.000Z',
    createdAt: '2026-08-17T00:30:00.000Z',
    distanceM: 5000,
    durationSec: 1800,
    movingDurationSec: 1750,
    averagePaceSecPerKm: 360,
    bestPaceSecPerKm: 330,
    averageHeartRate: 145,
    maxHeartRate: 170
  }
};

test('parses an SNS raw-delivery RunCompleted event', () => {
  assert.deepEqual(parseRunCompletedEvent(JSON.stringify(event)), event);
});

test('also parses the standard SNS notification envelope', () => {
  const envelope = { Type: 'Notification', Message: JSON.stringify(event) };
  assert.deepEqual(parseRunCompletedEvent(JSON.stringify(envelope)), event);
});

test('rejects an unrelated event without acknowledging it', () => {
  assert.throws(
    () => parseRunCompletedEvent(JSON.stringify({ ...event, eventType: 'RunStarted' })),
    /RunCompleted/
  );
});
