import './otel.js';
import express from 'express';
import { attachSession } from './middleware/session.js';
import marathonRouter from './routes/marathon.js';

const app = express();
app.use(express.json());
app.use(attachSession);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/marathon', marathonRouter);

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[marathon-service] listening on :${PORT}`);
});
