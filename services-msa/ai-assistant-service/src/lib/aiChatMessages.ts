import { getPool } from './db.js';
import type { RunCompletedEventPayload } from './kafka.js';

function formatPace(secPerKm: number | null): string {
  if (secPerKm === null) return '';
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}'${String(sec).padStart(2, '0')}"`;
}

function buildCongratsMessage(run: RunCompletedEventPayload, completedChallengeNames: string[]): string {
  const km = (run.distanceM / 1000).toFixed(1);
  const paceText = run.averagePaceSecPerKm ? ` 평균 페이스 ${formatPace(run.averagePaceSecPerKm)}/km로` : '';
  let message = `🎉 ${km}km 완주 훌륭해요!${paceText} 오늘도 멋지게 해내셨네요. 꾸준히 이 페이스를 유지해봐요!`;
  if (completedChallengeNames.length > 0) {
    message += `\n\n🏆 "${completedChallengeNames.join('", "')}" 챌린지 목표를 달성했어요! 정말 대단해요.`;
  }
  return message;
}

// ai_assistant.chat_sessions/chat_messages는 지금까지 스키마만 있고 실제로 쓰이지 않던 테이블이다
// (프론트의 AI 강아지 챗봇은 지금까지 클라이언트 로컬 상태로만 동작). 러닝 완료 축하 메시지부터
// 이 테이블에 실제로 적재해서, AssistantChatWidget이 폴링해 말풍선으로 띄울 수 있게 한다.
export async function sendRunCongratsMessage(
  eventId: string,
  userId: string,
  run: RunCompletedEventPayload,
  completedChallengeNames: string[]
): Promise<void> {
  const pool = getPool();

  const { rows: sessionRows } = await pool.query(
    `SELECT session_id FROM ai_assistant.chat_sessions
      WHERE user_id = $1 AND assistant_type = 'RUNNING_COACH' AND status = 'ACTIVE'
      ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );

  let sessionId: string;
  if (sessionRows.length > 0) {
    sessionId = sessionRows[0].session_id;
  } else {
    const { rows: created } = await pool.query(
      `INSERT INTO ai_assistant.chat_sessions (user_id, assistant_type, title, status)
       VALUES ($1, 'RUNNING_COACH', 'AI 러닝 코치', 'ACTIVE')
       RETURNING session_id`,
      [userId]
    );
    sessionId = created[0].session_id;
  }

  const { rows: seqRows } = await pool.query(
    `SELECT COALESCE(MAX(sequence_no), 0) + 1 AS next_seq FROM ai_assistant.chat_messages WHERE session_id = $1`,
    [sessionId]
  );
  const nextSeq = seqRows[0].next_seq;

  const content = buildCongratsMessage(run, completedChallengeNames);

  const { rowCount } = await pool.query(
    `INSERT INTO ai_assistant.chat_messages (session_id, role, content, sequence_no, source_event_id)
     VALUES ($1, 'ASSISTANT', $2, $3, $4)
     ON CONFLICT (source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING`,
    [sessionId, content, nextSeq, eventId]
  );
  if (!rowCount) return; // 같은 이벤트가 재전달됨 — 이미 보낸 축하 메시지, 다시 안 보낸다.
  await pool.query(`UPDATE ai_assistant.chat_sessions SET last_message_at = now() WHERE session_id = $1`, [sessionId]);
}

const AI_RAG_SERVICE_URL = process.env.AI_RAG_SERVICE_URL ?? 'http://192.168.0.212:8000';

type AskAssistantResult = { answer: string; sessionId: string | null; blocked: boolean };

// AssistantChatWidget의 실제 사용자 질문을 ai-rag-service(RAG + Tool Calling)로 전달하고,
// 로그인 사용자면 대화를 ai_assistant.chat_sessions/chat_messages에 남긴다.
export async function askAssistant(
  userId: string | null,
  question: string,
  bedrockSessionId: string | null,
  latitude: number | null,
  longitude: number | null
): Promise<AskAssistantResult> {
  const res = await fetch(`${AI_RAG_SERVICE_URL}/api/v1/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, sessionId: bedrockSessionId, userId, latitude, longitude }),
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`AI 비서 서비스 요청 실패: ${res.status}`);
  const data = await res.json();
  const answer: string = data.answer ?? '답변을 생성하지 못했어요.';
  const blocked: boolean = !!data.blocked;

  if (userId && !blocked) {
    await persistChatTurn(userId, question, answer).catch(() => {
      // 대화 로그 저장 실패는 사용자에게 보여줄 답변 자체와는 무관하므로 조용히 넘어간다.
    });
  }

  return { answer, sessionId: data.sessionId ?? null, blocked };
}

async function persistChatTurn(userId: string, question: string, answer: string): Promise<void> {
  const pool = getPool();
  const { rows: sessionRows } = await pool.query(
    `SELECT session_id FROM ai_assistant.chat_sessions
      WHERE user_id = $1 AND assistant_type = 'RUNNING_COACH' AND status = 'ACTIVE'
      ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );

  let sessionId: string;
  if (sessionRows.length > 0) {
    sessionId = sessionRows[0].session_id;
  } else {
    const { rows: created } = await pool.query(
      `INSERT INTO ai_assistant.chat_sessions (user_id, assistant_type, title, status)
       VALUES ($1, 'RUNNING_COACH', 'AI 러닝 비서', 'ACTIVE')
       RETURNING session_id`,
      [userId]
    );
    sessionId = created[0].session_id;
  }

  const { rows: seqRows } = await pool.query(
    `SELECT COALESCE(MAX(sequence_no), 0) AS max_seq FROM ai_assistant.chat_messages WHERE session_id = $1`,
    [sessionId]
  );
  const nextSeq = Number(seqRows[0].max_seq) + 1;

  await pool.query(
    `INSERT INTO ai_assistant.chat_messages (session_id, role, content, sequence_no) VALUES ($1, 'USER', $2, $3)`,
    [sessionId, question, nextSeq]
  );
  await pool.query(
    `INSERT INTO ai_assistant.chat_messages (session_id, role, content, sequence_no) VALUES ($1, 'ASSISTANT', $2, $3)`,
    [sessionId, answer, nextSeq + 1]
  );
  await pool.query(`UPDATE ai_assistant.chat_sessions SET last_message_at = now() WHERE session_id = $1`, [sessionId]);
}

export type NewAssistantMessage = { messageId: string; content: string; createdAt: string };

// AssistantChatWidget이 폴링해서 아직 못 본 ASSISTANT 메시지가 있으면 말풍선으로 띄운다.
export async function getNewAssistantMessages(userId: string, sinceIso: string | null): Promise<NewAssistantMessage[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT m.message_id, m.content, m.created_at
       FROM ai_assistant.chat_messages m
       JOIN ai_assistant.chat_sessions s ON s.session_id = m.session_id
      WHERE s.user_id = $1 AND m.role = 'ASSISTANT'
        AND ($2::timestamptz IS NULL OR m.created_at > $2::timestamptz)
      ORDER BY m.created_at ASC
      LIMIT 20`,
    [userId, sinceIso]
  );
  return rows.map((row) => ({ messageId: row.message_id, content: row.content, createdAt: row.created_at }));
}
