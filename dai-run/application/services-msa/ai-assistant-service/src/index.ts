import './otel.js';
import express from 'express';
import { attachSession } from './middleware/session.js';
import aiAssistantRouter from './routes/aiAssistant.js';

const app = express();
app.use(express.json());
app.use(attachSession);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/ai-assistant', aiAssistantRouter);

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[ai-assistant-service] listening on :${PORT}`);
});
