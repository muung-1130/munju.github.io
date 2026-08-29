import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSqsEvent } from './sqs.mjs';

const event = { eventId: 'event-1', eventType: 'CourseLiked', payload: { courseId: 'course-1' } };

test('raw와 SNS envelope 형식을 모두 파싱한다', () => {
  assert.deepEqual(parseSqsEvent(JSON.stringify(event), ['CourseLiked']), event);
  assert.deepEqual(parseSqsEvent(JSON.stringify({ Type: 'Notification', Message: JSON.stringify(event) }), ['CourseLiked']), event);
});

test('허용하지 않은 이벤트를 거부한다', () => {
  assert.throws(() => parseSqsEvent(JSON.stringify({ ...event, eventType: 'Other' }), ['CourseLiked']));
});
