import './otel.js';
import express from 'express';
import { attachSession } from './middleware/session.js';
import coursesRouter from './routes/courses.js';
import geoRouter from './routes/geo.js';

const app = express();
app.use(express.json());
app.use(attachSession);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/courses', coursesRouter);
app.use('/api', geoRouter);

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[course-service] listening on :${PORT}`);
});
