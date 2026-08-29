import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSqsEvent } from './sqs.mjs';

const event = { eventId: 'event-1', eventType: 'BattleStarted', payload: { battleId: 'battle-1' } };

test('BattleStarted 이벤트를 파싱한다', () => {
  assert.deepEqual(parseSqsEvent(JSON.stringify(event), ['BattleStarted']), event);
});

test('eventId가 없으면 거부한다', () => {
  assert.throws(() => parseSqsEvent(JSON.stringify({ eventType: 'BattleStarted', payload: {} }), ['BattleStarted']));
});
