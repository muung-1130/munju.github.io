import './otel.js';
import express from 'express';
import { attachSession } from './middleware/session.js';
import authRouter from './routes/auth.js';
import runningPreferencesRouter from './routes/runningPreferences.js';

const app = express();
app.use(express.json());
app.use(attachSession);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRouter);
app.use('/api/user-running-preferences', runningPreferencesRouter);

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[auth-service] listening on :${PORT}`);
});
