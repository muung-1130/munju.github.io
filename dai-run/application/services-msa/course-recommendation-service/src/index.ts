import './otel.js';
import express from 'express';
import { attachSession } from './middleware/session.js';
import aiRecommendationsRouter from './routes/aiRecommendations.js';

const app = express();
app.use(express.json());
app.use(attachSession);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/ai-recommendations', aiRecommendationsRouter);

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[course-recommendation-service] listening on :${PORT}`);
});
