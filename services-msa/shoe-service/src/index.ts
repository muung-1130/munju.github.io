import './otel.js';
import express from 'express';
import { attachSession } from './middleware/session.js';
import shoesRouter from './routes/shoes.js';
import userShoesRouter from './routes/userShoes.js';

const app = express();
app.use(express.json());
app.use(attachSession);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/shoes', shoesRouter);
app.use('/api/user-shoes', userShoesRouter);

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[shoe-service] listening on :${PORT}`);
});
