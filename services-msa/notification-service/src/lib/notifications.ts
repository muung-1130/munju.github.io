import { getPool } from './db.js';
import type { ChallengeCompletedEventPayload } from './kafka.js';

// challenge-service의 ChallengeCompleted 컨슈머가 호출한다. source_event_id UNIQUE(부분 인덱스,
// db/016)로 at-least-once 재전달에도 중복 알림이 안 생긴다.
export async function createChallengeCompletedNotification(eventId: string, payload: ChallengeCompletedEventPayload): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO notification.notifications
       (user_id, notification_type, title, body, target_url, reference_type, reference_id, source_event_id)
     VALUES ($1, 'CHALLENGE_COMPLETED', '챌린지 달성 성공!', $2, $3, 'CHALLENGE', $4, $5)
     ON CONFLICT (source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING`,
    [
      payload.userId,
      `'${payload.challengeName}' 챌린지 달성에 성공했어요!`,
      `/challenges/${payload.challengeId}`,
      payload.challengeId,
      eventId
    ]
  );
}

export type AppNotification = {
  notificationId: string;
  notificationType: string;
  title: string;
  body: string;
  targetUrl: string | null;
  referenceType: string | null;
  referenceId: string | null;
  crewName: string | null;
  joinRequestMessage: string | null;
  applicantNickname: string | null;
  createdAt: string;
};

// 알림 벨은 notification.notifications 하나만 읽는다 — 크루 가입 신청/승인 알림은
// crew-notification-consumer가 Kafka 이벤트(crew.join-request-events)를 받아 이 테이블에
// 미리 적재해둔 걸 여기서는 조회만 한다(크루 서비스 테이블을 직접 JOIN하지 않는 것이 원칙이지만,
// 여기서는 알림 화면에 표시할 크루명/신청 메시지를 보강하기 위한 읽기 전용 표시용 조인이다).
export async function getUnreadNotifications(userId: string): Promise<AppNotification[]> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT n.notification_id, n.notification_type, n.title, n.body, n.target_url,
            n.reference_type, n.reference_id, n.created_at,
            COALESCE(c1.crew_name, c2.crew_name) AS crew_name,
            jr.message AS join_request_message,
            au.nickname AS applicant_nickname
       FROM notification.notifications n
       LEFT JOIN crew.crews c1 ON n.reference_type = 'CREW' AND c1.crew_id = n.reference_id::uuid
       LEFT JOIN crew.crew_join_requests jr
         ON n.reference_type = 'CREW_JOIN_REQUEST' AND jr.join_request_id = n.reference_id::uuid
       LEFT JOIN crew.crews c2 ON jr.crew_id = c2.crew_id
       LEFT JOIN auth_user.users au ON au.user_id = jr.applicant_user_id
      WHERE n.user_id = $1 AND n.status = 'UNREAD'
      ORDER BY n.created_at DESC
      LIMIT 50`,
    [userId]
  );
  return rows.map((row) => ({
    notificationId: row.notification_id,
    notificationType: row.notification_type,
    title: row.title,
    body: row.body,
    targetUrl: row.target_url,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    crewName: row.crew_name,
    joinRequestMessage: row.join_request_message,
    applicantNickname: row.applicant_nickname,
    createdAt: row.created_at
  }));
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE notification.notifications SET status = 'READ', read_at = now()
      WHERE notification_id = $1 AND user_id = $2 AND status = 'UNREAD'`,
    [notificationId, userId]
  );
  return (rowCount ?? 0) > 0;
}
