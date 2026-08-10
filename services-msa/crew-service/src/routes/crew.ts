import { Router } from 'express';
import {
  createCrew,
  createJoinRequest,
  decideJoinRequest,
  ensureCrewMember,
  getCrewJoinType,
  getCrewMembersWithStats,
  getCrews,
  getCrewWeeklyStats,
  getMostRecentCrewChat,
  getMyCrewForBattle,
  getOtherActiveCrewMembership,
  isActiveCrewMember,
  leaveCrew,
  recordCrewChatJoin
} from '../lib/crew.js';
import { addCrewChatMessage, getCrewChatMessages, seedCrewChatIfEmpty } from '../lib/crewChat.js';
import { getPool } from '../lib/db.js';
import { publishCrewJoinRequestEvent } from '../lib/kafka.js';
import { requireAuth } from '../middleware/session.js';

const router = Router();

router.get('/', async (req, res) => {
  const crews = await getCrews(req.userId ?? null, req.dong ?? undefined);
  res.json({ crews });
});

router.post('/', requireAuth, async (req, res) => {
  const body = req.body;
  const crewName = typeof body.crewName === 'string' ? body.crewName.trim() : '';
  if (crewName.length === 0) {
    res.status(400).json({ error: '크루 이름을 입력해주세요.' });
    return;
  }
  const joinType = body.joinType === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC';
  const maxMembers = Number(body.maxMembers);
  if (!Number.isInteger(maxMembers) || maxMembers <= 0) {
    res.status(400).json({ error: '최대 인원을 올바르게 입력해주세요.' });
    return;
  }

  const toIntOrNull = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));
  const targetDistanceMinM = toIntOrNull(body.targetDistanceMinM);
  const targetDistanceMaxM = toIntOrNull(body.targetDistanceMaxM);
  const paceMinSecPerKm = toIntOrNull(body.paceMinSecPerKm);
  const paceMaxSecPerKm = toIntOrNull(body.paceMaxSecPerKm);
  const minimumWeeklyFrequency = toIntOrNull(body.minimumWeeklyFrequency);

  if (targetDistanceMinM !== null && targetDistanceMaxM !== null && targetDistanceMinM > targetDistanceMaxM) {
    res.status(400).json({ error: '목표 거리 범위를 확인해주세요.' });
    return;
  }
  if (paceMinSecPerKm !== null && paceMaxSecPerKm !== null && paceMinSecPerKm > paceMaxSecPerKm) {
    res.status(400).json({ error: '페이스 범위를 확인해주세요.' });
    return;
  }

  const crewId = await createCrew({
    ownerUserId: req.userId!,
    crewName,
    description: typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : '',
    regionCode: typeof body.regionCode === 'string' && body.regionCode.length > 0 ? body.regionCode : null,
    meetingLocation: typeof body.meetingLocation === 'string' && body.meetingLocation.length > 0 ? body.meetingLocation : null,
    targetDistanceMinM,
    targetDistanceMaxM,
    paceMinSecPerKm,
    paceMaxSecPerKm,
    minimumWeeklyFrequency,
    joinType,
    maxMembers
  });

  res.json({ success: true, crewId });
});

router.get('/my-chat', async (req, res) => {
  if (!req.userId) {
    res.json({ crewId: null });
    return;
  }
  const recent = await getMostRecentCrewChat(req.userId);
  if (!recent) {
    res.json({ crewId: null });
    return;
  }
  const messages = await getCrewChatMessages(recent.crewId);
  res.json({ crewId: recent.crewId, crewName: recent.crewName, messages });
});

router.get('/battle/my-crew', async (req, res) => {
  if (!req.userId) {
    res.json({ crewId: null });
    return;
  }
  const crew = await getMyCrewForBattle(req.userId);
  res.json(crew ?? { crewId: null });
});

router.get('/:crewId/weekly-stats', async (req, res) => {
  const stats = await getCrewWeeklyStats(req.params.crewId);
  if (!stats) {
    res.status(404).json({ error: '크루를 찾을 수 없어요.' });
    return;
  }
  res.json({ stats });
});

router.get('/:crewId/members', requireAuth, async (req, res) => {
  if (!(await isActiveCrewMember(req.params.crewId, req.userId!))) {
    res.status(403).json({ error: '이 크루의 멤버만 볼 수 있어요.' });
    return;
  }
  const members = await getCrewMembersWithStats(req.params.crewId);
  res.json({ members });
});

router.post('/:crewId/join-request', requireAuth, async (req, res) => {
  const crew = await getCrewJoinType(req.params.crewId);
  if (!crew) {
    res.status(404).json({ error: '크루를 찾을 수 없어요.' });
    return;
  }
  if (crew.joinType !== 'PRIVATE') {
    res.status(400).json({ error: '이 크루는 신청 없이 바로 입장할 수 있어요.' });
    return;
  }

  const other = await getOtherActiveCrewMembership(req.userId!, req.params.crewId);
  if (other) {
    res.status(409).json({ error: `이미 '${other.crewName}' 크루에 가입되어 있어요. 먼저 크루를 탈퇴한 뒤 다시 시도해주세요.` });
    return;
  }

  const message = req.body.message;
  const trimmedMessage = typeof message === 'string' ? message.trim().slice(0, 500) : '';
  const joinRequestId = await createJoinRequest(req.params.crewId, req.userId!, trimmedMessage);
  if (!joinRequestId) {
    res.status(409).json({ error: '이미 대기중인 가입 신청이 있어요.' });
    return;
  }

  try {
    await publishCrewJoinRequestEvent(
      {
        joinRequestId,
        crewId: req.params.crewId,
        crewName: crew.crewName,
        applicantUserId: req.userId!,
        applicantNickname: req.userName ?? '',
        ownerUserId: crew.ownerUserId,
        message: trimmedMessage || null
      },
      'JoinRequestSubmitted'
    );
  } catch (err) {
    console.error('JoinRequestSubmitted 이벤트 발행 실패:', err);
  }

  res.json({ success: true });
});

router.post('/:crewId/leave', requireAuth, async (req, res) => {
  const result = await leaveCrew(req.params.crewId, req.userId!);
  if (result === 'not-member') {
    res.status(404).json({ error: '이 크루의 멤버가 아니에요.' });
    return;
  }
  res.json({ success: true, crewDeleted: result === 'crew-deleted' });
});

router.post('/join-requests/:requestId/decision', requireAuth, async (req, res) => {
  const approve = req.body.approve;
  const result = await decideJoinRequest(req.params.requestId, req.userId!, Boolean(approve));
  if (!result) {
    res.status(404).json({ error: '요청을 처리할 수 없어요.' });
    return;
  }

  if (approve) {
    try {
      await publishCrewJoinRequestEvent(
        {
          joinRequestId: req.params.requestId,
          crewId: result.crewId,
          crewName: result.crewName,
          applicantUserId: result.applicantUserId,
          applicantNickname: result.applicantNickname,
          ownerUserId: result.ownerUserId,
          message: null
        },
        'JoinRequestApproved'
      );
    } catch (err) {
      console.error('JoinRequestApproved 이벤트 발행 실패:', err);
    }
  }

  res.json({ success: true });
});

router.get('/:crewId/chat/messages', async (req, res) => {
  const messages = await getCrewChatMessages(req.params.crewId);
  res.json({ messages });
});

router.post('/:crewId/chat/messages', requireAuth, async (req, res) => {
  const message = req.body.message;
  if (typeof message !== 'string' || message.trim().length === 0) {
    res.status(400).json({ error: '메시지를 입력해주세요.' });
    return;
  }
  const saved = await addCrewChatMessage(req.params.crewId, req.userId!, req.userName ?? '나', message.trim().slice(0, 500));
  res.json({ message: saved });
});

router.post('/:crewId/chat/join', requireAuth, async (req, res) => {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT c.crew_name, c.join_type, c.owner_user_id, u.nickname AS owner_nickname
       FROM crew.crews c JOIN auth_user.users u ON u.user_id = c.owner_user_id
      WHERE c.crew_id = $1`,
    [req.params.crewId]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: '크루를 찾을 수 없어요.' });
    return;
  }
  const crew = rows[0];
  const alreadyMyCrew = await isActiveCrewMember(req.params.crewId, req.userId!);

  if (!alreadyMyCrew) {
    const other = await getOtherActiveCrewMembership(req.userId!, req.params.crewId);
    if (other) {
      res.status(409).json({ error: `이미 '${other.crewName}' 크루에 가입되어 있어요. 먼저 크루를 탈퇴한 뒤 다시 시도해주세요.` });
      return;
    }
  }

  if (crew.join_type === 'PRIVATE' && crew.owner_user_id !== req.userId && !alreadyMyCrew) {
    res.status(403).json({ error: '크루장 승인이 필요한 크루예요. 가입 신청을 먼저 보내주세요.' });
    return;
  }

  await recordCrewChatJoin(req.params.crewId, req.userId!);
  await ensureCrewMember(req.params.crewId, req.userId!);
  await seedCrewChatIfEmpty(req.params.crewId, crew.crew_name, crew.owner_nickname);
  const messages = await getCrewChatMessages(req.params.crewId);

  res.json({ messages });
});

export default router;
