import './otel.js';
import express from 'express';
import { attachSession } from './middleware/session.js';
import challengesRouter from './routes/challenges.js';

const app = express();
app.use(express.json());
app.use(attachSession);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/challenges', challengesRouter);

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[challenge-service] listening on :${PORT}`);
});
