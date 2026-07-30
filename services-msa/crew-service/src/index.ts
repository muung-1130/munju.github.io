import './otel.js';
import express from 'express';
import { attachSession } from './middleware/session.js';
import battleRouter from './routes/battle.js';
import crewRouter from './routes/crew.js';
import adminRouter from './routes/admin.js';
import internalRouter from './routes/internal.js';

const app = express();
app.use(express.json());
app.use(attachSession);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/crew/admin', adminRouter);
app.use('/api/crew/internal', internalRouter);
app.use('/api/crew', crewRouter);
app.use('/api/crew', battleRouter);

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[crew-service] listening on :${PORT}`);
});
