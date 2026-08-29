import './otel.js';
import express from 'express';
import { attachSession } from './middleware/session.js';
import { ensureBucketExists } from './lib/s3.js';
import mediaRouter from './routes/media.js';
import internalMediaRouter from './routes/internalMedia.js';

const app = express();
app.use(express.json());
app.use(attachSession);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/media', mediaRouter);
app.use('/api/internal/media', internalMediaRouter);

const PORT = Number(process.env.PORT ?? 4000);

ensureBucketExists()
  .catch((err) => console.error('[media-service] 버킷 확인/생성 실패:', err))
  .finally(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[media-service] listening on :${PORT}`);
    });
  });
