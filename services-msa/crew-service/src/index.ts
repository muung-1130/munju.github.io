import './otel.js';
import express from 'express';
import { attachSession } from './middleware/session.js';
import battleRouter from './routes/battle.js';
import crewRouter from './routes/crew.js';
import adminRouter from './routes/admin.js';
import internalRouter from './routes/internal.js';
import { sweepExpiredBattles } from './lib/crewBattle.js';

const app = express();
app.use(express.json());
app.use(attachSession);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/crew/admin', adminRouter);
app.use('/api/crew/internal', internalRouter);
app.use('/api/crew', crewRouter);
app.use('/api/crew', battleRouter);

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[crew-service] listening on :${PORT}`);
});

// 24시간 응답 기한이 지난 배틀 제안을 5분마다 능동적으로 거절 처리한다(§crewBattle.ts의
// sweepExpiredBattles 주석 참고) — 누군가 크루 페이지를 열 때까지 기다리지 않는다.
const BATTLE_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  sweepExpiredBattles().catch((err) => console.error('[crew-service] sweepExpiredBattles 주기 실행 실패:', err));
}, BATTLE_SWEEP_INTERVAL_MS);
sweepExpiredBattles().catch((err) => console.error('[crew-service] sweepExpiredBattles 초기 실행 실패:', err));
