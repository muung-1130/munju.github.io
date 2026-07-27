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
app.use('/api/internal', internalRouter);

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[running-record-service] listening on :${PORT}`);
});
