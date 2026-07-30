import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getPool } from '../lib/db.js';
import { withdrawAccount } from '../lib/account.js';
import { defaultWeightKgForGender } from '../lib/calorie.js';
import { isMailConfigured } from '../lib/mailer.js';
import { confirmPasswordReset, requestPasswordResetCode, sendUsernameByEmail } from '../lib/passwordReset.js';
import { resolveUniqueField } from '../lib/uniqueField.js';
import { validateEmail, validateNickname, validatePassword, validateUsername } from '../lib/validators.js';
import { requireAuth } from '../middleware/session.js';
import { getSessionId } from '../middleware/sessionId.js';

const RUNNING_RECORD_SERVICE_URL = process.env.RUNNING_RECORD_SERVICE_URL ?? 'http://running-record-service:4000';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET!;

const router = Router();

router.post('/signup', async (req, res) => {
  const body = req.body;
  const username: string = (body.username ?? '').trim();
  const password: string = body.password ?? '';
  const email: string = (body.email ?? '').trim();
  const name: string = (body.name ?? '').trim();
  const gender: string = body.gender ?? '';
  const birthYear: number = Number(body.birthYear);
  const dong: string = (body.dong ?? '').trim();
  const nickname: string = (body.nickname ?? '').trim();
  const weightInput = body.weightKg === '' || body.weightKg === undefined || body.weightKg === null ? null : Number(body.weightKg);

  const errors: string[] = [...validateUsername(username), ...validatePassword(password), ...validateNickname(nickname)];
  if (!name) errors.push('이름을 입력해주세요.');
  if (!validateEmail(email)) errors.push('올바른 이메일 형식이 아니에요.');
  if (gender !== 'M' && gender !== 'F') errors.push('성별을 선택해주세요.');
  if (!Number.isInteger(birthYear) || birthYear < 1930 || birthYear > new Date().getFullYear()) errors.push('출생년도를 선택해주세요.');
  if (!dong) errors.push('동 정보를 선택해주세요.');
  if (weightInput !== null && (!Number.isFinite(weightInput) || weightInput < 20 || weightInput > 250)) {
    errors.push('몸무게를 올바르게 입력해주세요.');
  }

  if (errors.length > 0) {
    res.status(400).json({ success: false, errors });
    return;
  }

  try {
    const pool = getPool();
    const usernameTaken = await pool.query('SELECT 1 FROM auth_user.users WHERE user_name = $1', [username]);
    if (usernameTaken.rows.length > 0) {
      res.status(409).json({ success: false, errors: ['이미 사용 중인 아이디예요.'] });
      return;
    }
    const emailTaken = await pool.query('SELECT 1 FROM auth_user.users WHERE user_email = $1', [email]);
    if (emailTaken.rows.length > 0) {
      res.status(409).json({ success: false, errors: ['이미 가입된 이메일이에요.'] });
      return;
    }

    const finalNickname = await resolveUniqueField(pool, 'nickname', nickname, username);
    const passwordHash = await bcrypt.hash(password, 10);
    const weightKg = weightInput ?? defaultWeightKgForGender(gender);

    await pool.query(
      `INSERT INTO auth_user.users (user_name, user_email, gender, birth_year, dong, nickname, real_name, weight_kg, status, user_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9)`,
      [username, email, gender, birthYear, dong, finalNickname, name, weightKg, passwordHash]
    );

    res.json({ success: true, nickname: finalNickname });
  } catch {
    res.status(503).json({ success: false, errors: ['DB에 연결할 수 없어요. 잠시 후 다시 시도해주세요.'] });
  }
});

router.get('/check-username', async (req, res) => {
  const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
  const errors = validateUsername(username);
  if (errors.length > 0) {
    res.status(400).json({ available: false, errors });
    return;
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query('SELECT 1 FROM auth_user.users WHERE user_name = $1', [username]);
    res.json({ available: rows.length === 0 });
  } catch {
    res.status(503).json({ available: false, errors: ['DB에 연결할 수 없어요. 잠시 후 다시 시도해주세요.'] });
  }
});

router.get('/check-nickname', async (req, res) => {
  const nickname = typeof req.query.nickname === 'string' ? req.query.nickname.trim() : '';
  if (nickname.length === 0) {
    res.json({ available: true });
    return;
  }
  const errors = validateNickname(nickname);
  if (errors.length > 0) {
    res.status(400).json({ available: false, errors });
    return;
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query('SELECT 1 FROM auth_user.users WHERE nickname = $1', [nickname]);
    res.json({ available: rows.length === 0 });
  } catch {
    res.status(503).json({ available: false, errors: ['DB에 연결할 수 없어요. 잠시 후 다시 시도해주세요.'] });
  }
});

router.post('/find-username', async (req, res) => {
  if (!isMailConfigured()) {
    res.status(503).json({ error: '이메일 발송이 아직 설정되지 않았어요. 관리자에게 문의해주세요.' });
    return;
  }
  const email = req.body.email;
  if (typeof email !== 'string' || !validateEmail(email)) {
    res.status(400).json({ error: '올바른 이메일을 입력해주세요.' });
    return;
  }
  try {
    const found = await sendUsernameByEmail(email);
    if (!found) {
      res.status(404).json({ error: '회원정보에 없는 이메일이에요.' });
      return;
    }
  } catch (err) {
    console.error('sendUsernameByEmail 실패:', err);
    res.status(502).json({ error: '메일 발송에 실패했어요. 잠시 후 다시 시도해주세요.' });
    return;
  }
  res.json({ success: true });
});

router.post('/password-reset/request', async (req, res) => {
  if (!isMailConfigured()) {
    res.status(503).json({ error: '이메일 발송이 아직 설정되지 않았어요. 관리자에게 문의해주세요.' });
    return;
  }
  const { username, email } = req.body;
  if (typeof username !== 'string' || validateUsername(username).length > 0) {
    res.status(400).json({ error: '아이디를 확인해주세요.' });
    return;
  }
  if (typeof email !== 'string' || !validateEmail(email)) {
    res.status(400).json({ error: '올바른 이메일을 입력해주세요.' });
    return;
  }
  try {
    const found = await requestPasswordResetCode(username, email);
    if (!found) {
      res.status(404).json({ error: '회원정보에 없는 아이디/이메일이에요.' });
      return;
    }
  } catch (err) {
    console.error('requestPasswordResetCode 실패:', err);
    res.status(502).json({ error: '메일 발송에 실패했어요. 잠시 후 다시 시도해주세요.' });
    return;
  }
  res.json({ success: true });
});

router.post('/password-reset/confirm', async (req, res) => {
  const { username, email, code, newPassword } = req.body;
  if (typeof username !== 'string' || typeof email !== 'string' || typeof code !== 'string') {
    res.status(400).json({ error: '입력값을 확인해주세요.' });
    return;
  }
  const passwordErrors = typeof newPassword === 'string' ? validatePassword(newPassword) : ['비밀번호를 입력해주세요.'];
  if (passwordErrors.length > 0) {
    res.status(400).json({ error: passwordErrors.join(' ') });
    return;
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);
  const result = await confirmPasswordReset(username, email, code.trim(), newPasswordHash);

  if (result === 'expired') {
    res.status(400).json({ error: '인증코드가 만료됐어요. 다시 요청해주세요.' });
    return;
  }
  if (result === 'invalid') {
    res.status(400).json({ error: '인증코드가 올바르지 않아요.' });
    return;
  }
  res.json({ success: true });
});

router.post('/revoke-session', async (req, res) => {
  const sessionId = await getSessionId(req.headers.cookie);
  if (sessionId) {
    const pool = getPool();
    await pool.query('UPDATE auth_user.auth_sessions SET revoked_at = now() WHERE session_id = $1 AND revoked_at IS NULL', [sessionId]);
  }
  res.json({ success: true });
});

router.get('/update-profile', requireAuth, async (req, res) => {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT user_name, user_email, nickname, real_name, gender, birth_year, dong, (user_password IS NOT NULL) AS has_password
       FROM auth_user.users WHERE user_id = $1 AND deleted_at IS NULL`,
    [req.userId]
  );
  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: '사용자를 찾을 수 없어요.' });
    return;
  }
  res.json({
    username: row.user_name,
    email: row.user_email,
    nickname: row.nickname,
    name: row.real_name,
    gender: row.gender,
    birthYear: row.birth_year,
    dong: row.dong,
    hasPassword: row.has_password
  });
});

router.patch('/update-profile', requireAuth, async (req, res) => {
  const userId = req.userId!;
  const { username, email, nickname, name, gender, birthYear, dong, currentPassword, newPassword } = req.body ?? {};

  const errors: string[] = [];
  if (typeof username !== 'string' || username.trim().length === 0) errors.push('아이디를 입력해주세요.');
  else errors.push(...validateUsername(username));
  if (typeof email !== 'string' || !validateEmail(email)) errors.push('올바른 이메일을 입력해주세요.');
  if (typeof nickname !== 'string' || nickname.trim().length === 0) errors.push('닉네임을 입력해주세요.');
  else errors.push(...validateNickname(nickname));
  if (typeof name !== 'string' || name.trim().length === 0) errors.push('이름을 입력해주세요.');
  if (gender !== 'M' && gender !== 'F') errors.push('성별을 선택해주세요.');
  if (!Number.isInteger(Number(birthYear)) || Number(birthYear) < 1930 || Number(birthYear) > new Date().getFullYear()) {
    errors.push('출생년도를 선택해주세요.');
  }
  if (typeof dong !== 'string' || dong.trim().length === 0) errors.push('동 정보를 선택해주세요.');

  if (errors.length > 0) {
    res.status(400).json({ success: false, errors });
    return;
  }

  const pool = getPool();
  const { rows: currentRows } = await pool.query(
    `SELECT user_name, nickname, user_password FROM auth_user.users WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  const currentRow = currentRows[0];
  if (!currentRow) {
    res.status(404).json({ success: false, errors: ['사용자를 찾을 수 없어요.'] });
    return;
  }

  if (username !== currentRow.user_name) {
    const taken = await pool.query('SELECT 1 FROM auth_user.users WHERE user_name = $1 AND user_id <> $2', [username, userId]);
    if (taken.rows.length > 0) {
      res.status(409).json({ success: false, errors: ['이미 사용 중인 아이디예요.'] });
      return;
    }
  }
  if (nickname !== currentRow.nickname) {
    const taken = await pool.query('SELECT 1 FROM auth_user.users WHERE nickname = $1 AND user_id <> $2', [nickname, userId]);
    if (taken.rows.length > 0) {
      res.status(409).json({ success: false, errors: ['이미 사용 중인 닉네임이에요.'] });
      return;
    }
  }

  let newPasswordHash: string | null = null;
  if (typeof newPassword === 'string' && newPassword.length > 0) {
    const passwordErrors = validatePassword(newPassword);
    if (passwordErrors.length > 0) {
      res.status(400).json({ success: false, errors: passwordErrors });
      return;
    }
    if (currentRow.user_password) {
      if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
        res.status(400).json({ success: false, errors: ['현재 비밀번호를 입력해주세요.'] });
        return;
      }
      const valid = await bcrypt.compare(currentPassword, currentRow.user_password);
      if (!valid) {
        res.status(400).json({ success: false, errors: ['현재 비밀번호가 올바르지 않아요.'] });
        return;
      }
    }
    newPasswordHash = await bcrypt.hash(newPassword, 10);
  }

  await pool.query(
    `UPDATE auth_user.users
        SET user_name = $1, user_email = $2, nickname = $3, real_name = $4, gender = $5, birth_year = $6, dong = $7,
            user_password = COALESCE($8, user_password), updated_at = now()
      WHERE user_id = $9`,
    [username, email, nickname, name, gender, Number(birthYear), dong, newPasswordHash, userId]
  );

  res.json({ success: true, nickname });
});

router.post('/complete-profile', requireAuth, async (req, res) => {
  const body = req.body;
  const gender: string = body.gender ?? '';
  const birthYear: number = Number(body.birthYear);
  const dong: string = (body.dong ?? '').trim();
  const nickname: string = (body.nickname ?? '').trim();

  const errors: string[] = [...validateNickname(nickname)];
  if (gender !== 'M' && gender !== 'F') errors.push('성별을 선택해주세요.');
  if (!Number.isInteger(birthYear) || birthYear < 1930 || birthYear > new Date().getFullYear()) errors.push('출생년도를 선택해주세요.');
  if (!dong) errors.push('동 정보를 선택해주세요.');
  if (!nickname) errors.push('닉네임을 입력해주세요.');

  if (errors.length > 0) {
    res.status(400).json({ success: false, errors });
    return;
  }

  try {
    const pool = getPool();
    const userId = req.userId!;

    let finalNickname = nickname;
    if (nickname !== req.userName) {
      const taken = await pool.query('SELECT 1 FROM auth_user.users WHERE nickname = $1 AND user_id <> $2', [nickname, userId]);
      if (taken.rows.length > 0) {
        finalNickname = await resolveUniqueField(pool, 'nickname', nickname, nickname);
      }
    }

    await pool.query(
      `UPDATE auth_user.users SET gender = $1, birth_year = $2, dong = $3, nickname = $4, updated_at = now() WHERE user_id = $5`,
      [gender, birthYear, dong, finalNickname, userId]
    );

    res.json({ success: true, nickname: finalNickname });
  } catch {
    res.status(503).json({ success: false, errors: ['DB에 연결할 수 없어요. 잠시 후 다시 시도해주세요.'] });
  }
});

router.post('/withdraw', requireAuth, async (req, res) => {
  await withdrawAccount(req.userId!);
  res.json({ success: true });
});

router.get('/weight', requireAuth, async (req, res) => {
  const pool = getPool();
  const { rows } = await pool.query(`SELECT weight_kg FROM auth_user.users WHERE user_id = $1`, [req.userId]);
  res.json({ weightKg: rows[0]?.weight_kg !== undefined ? Number(rows[0].weight_kg) : null });
});

router.patch('/weight', requireAuth, async (req, res) => {
  const weightKg = Number(req.body.weightKg);
  if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 250) {
    res.status(400).json({ error: '몸무게를 20~250kg 사이로 입력해주세요.' });
    return;
  }
  const pool = getPool();
  await pool.query(`UPDATE auth_user.users SET weight_kg = $1, updated_at = now() WHERE user_id = $2`, [weightKg, req.userId]);

  // 과거 러닝 기록의 칼로리 재계산은 running_record 스키마 소유인 running-record-service의
  // 내부 API로 위임한다(이 서비스가 그 스키마를 직접 UPDATE하지 않는다).
  const calRes = await fetch(`${RUNNING_RECORD_SERVICE_URL}/api/internal/users/${req.userId}/recalculate-calories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_API_SECRET },
    body: JSON.stringify({ weightKg })
  });
  if (!calRes.ok) console.error('칼로리 재계산 요청 실패:', calRes.status);

  res.json({ success: true, weightKg });
});

export default router;
