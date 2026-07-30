import './otel.js';
import express from 'express';
import { attachSession } from './middleware/session.js';
import internalRouter from './routes/internal.js';
import mypageRouter from './routes/mypage.js';
import runsRouter from './routes/runs.js';

const app = express();
app.use(express.json());
app.use(attachSession);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/runs', runsRouter);
app.use('/api/mypage', mypageRouter);
// 러닝 완료 후 챌린지 진행도/크루 배틀/AI 축하 메시지를 이 서비스가 동기 호출로 대신 처리하던
// /api/internal/run-completed는 제거했다 — 각 도메인 서비스(challenge/crew/ai-assistant)가
// running.run-completed-events를 직접 구독하는 네이티브 Consumer로 대체됐다. 지금 이 internal
// 라우터에 남은 건 auth-service의 체중 변경 시 칼로리 재계산 요청뿐이다.
app.use('/api/internal', internalRouter);

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[running-record-service] listening on :${PORT}`);
});
