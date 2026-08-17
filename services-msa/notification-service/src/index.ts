import './otel.js';
import express from 'express';
import { attachSession } from './middleware/session.js';
import notificationsRouter from './routes/notifications.js';
import supportRouter from './routes/support.js';

const app = express();
app.use(express.json());
app.use(attachSession);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/notifications', notificationsRouter);
app.use('/api/support', supportRouter);

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[notification-service] listening on :${PORT}`);
});
