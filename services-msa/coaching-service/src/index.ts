import './otel.js';
import express from 'express';
import environmentRouter from './routes/environment.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/environment', environmentRouter);

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[coaching-service] listening on :${PORT}`);
});
