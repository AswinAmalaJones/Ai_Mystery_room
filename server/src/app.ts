import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z, ZodError } from 'zod';
import mongoose from 'mongoose';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { User, Mystery, Attempt } from './models.js';
import { generateCase } from './ai.js';
import { environment } from './env.js';
import type { AuthRequest, CaseContent } from './types.js';

const app = express();
const allowedOrigins = environment.clientOrigins;

function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  if (host) {
    if (origin === `http://${host}` || origin === `https://${host}`) return true;
  }
  return false;
}

app.set('trust proxy', environment.nodeEnv === 'production' ? 1 : false);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || isAllowedOrigin(origin, undefined)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '24kb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !isAllowedOrigin(origin, req.get('host'))) {
    return res.status(403).json({
      error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Request origin is not allowed.' },
    });
  }
  return next();
});

const secret = () => environment.sessionSecret;
const cookieSameSite = environment.cookieSameSite;
const isSecureCookie = environment.nodeEnv === 'production' || cookieSameSite === 'none';

const tokenCookie = (res: Response, token: string) =>
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: cookieSameSite,
    secure: isSecureCookie,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });

const asyncRoute = (fn: (req: AuthRequest, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req as AuthRequest, res, next)).catch(next);

const auth = asyncRoute(async (req, res, next) => {
  const raw = req.cookies?.session as string | undefined;
  if (!raw) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
  try {
    const p = jwt.verify(raw, secret()) as { id: string };
    const user = await User.findById(p.id).select('displayName email');
    if (!user) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Your session has expired. Sign in to continue.' } });
    req.user = { id: user.id, displayName: user.displayName, email: user.email };
    next();
  } catch {
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Your session has expired. Sign in to continue.' } });
  }
});

const safe = (u: { id: string; displayName: string; email: string }) => ({
  id: u.id,
  displayName: u.displayName,
  email: u.email,
});

async function owned(id: string, userId: string, includePrivate = false) {
  if (!mongoose.isValidObjectId(id)) return null;
  const m = await Mystery.findOne({ _id: id, ownerId: userId }).select(
    includePrivate ? '+solution +hints +requiredClueIds' : ''
  );
  return m;
}

function publicCase(m: any, a: any) {
  return {
    _id: m.id,
    title: m.title,
    genre: m.genre,
    difficulty: m.difficulty,
    tone: m.tone,
    length: m.length,
    setting: m.setting,
    premise: m.premise,
    briefing: m.briefing,
    incident: m.incident,
    timeline: m.timeline,
    suspects: m.suspects,
    clues: m.clues.map((c: any) => ({
      id: c.id,
      title: a.discoveredClueIds.includes(c.id) ? c.title : '',
      description: a.discoveredClueIds.includes(c.id) ? c.description : '',
      source: a.discoveredClueIds.includes(c.id) ? c.source : '',
      discovered: a.discoveredClueIds.includes(c.id),
    })),
    hintsUsed: a.hintsUsed,
    hintLimit: m.length === 'short' ? 1 : m.length === 'long' ? 3 : 2,
    status: a.status,
    createdAt: m.createdAt,
    completedAt: a.completedAt,
  };
}

const error = (res: Response, code: string, message: string, status = 400) =>
  res.status(status).json({ error: { code, message } });

const generationLimit = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const hintLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

app.get('/api/v1/health', (_req, res) => res.json({ data: { status: 'ok' } }));

app.post('/api/v1/auth/register', authLimit, asyncRoute(async (req, res) => {
  const x = z.object({
    displayName: z.string().trim().min(2).max(50),
    email: z.string().trim().email().max(254),
    password: z.string().min(8).max(128),
  }).parse(req.body);
  const email = x.email.toLowerCase();
  if (await User.exists({ email })) return error(res, 'CONFLICT', 'An account with this email already exists.', 409);
  const user = await User.create({ displayName: x.displayName, email, passwordHash: await bcrypt.hash(x.password, 12) });
  tokenCookie(res, jwt.sign({ id: user.id }, secret(), { expiresIn: '7d' }));
  res.status(201).json({ data: { user: safe({ id: user.id, displayName: user.displayName, email: user.email }) } });
}));

app.post('/api/v1/auth/login', authLimit, asyncRoute(async (req, res) => {
  const x = z.object({
    email: z.string().trim().email(),
    password: z.string().min(1).max(128),
  }).parse(req.body);
  const user = await User.findOne({ email: x.email.toLowerCase() });
  if (!user || !(await bcrypt.compare(x.password, user.passwordHash))) {
    return error(res, 'INVALID_CREDENTIALS', 'Email or password is incorrect.', 401);
  }
  tokenCookie(res, jwt.sign({ id: user.id }, secret(), { expiresIn: '7d' }));
  res.json({ data: { user: safe({ id: user.id, displayName: user.displayName, email: user.email }) } });
}));

app.post('/api/v1/auth/logout', (_req, res) =>
  res.clearCookie('session', {
    httpOnly: true,
    sameSite: cookieSameSite,
    secure: isSecureCookie,
    path: '/',
  }).json({ data: { ok: true } })
);

app.get('/api/v1/auth/me', auth, asyncRoute(async (req, res) => res.json({ data: safe(req.user!) })));

app.post('/api/v1/mysteries', auth, generationLimit, asyncRoute(async (req, res) => {
  const x = z.object({
    genre: z.enum(['classic-detective', 'locked-room', 'heist', 'historical', 'sci-fi', 'supernatural', 'custom']),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    tone: z.enum(['light', 'serious', 'noir', 'atmospheric']),
    length: z.enum(['short', 'standard', 'long']),
    setting: z.string().trim().max(120).optional().default(''),
    premise: z.string().trim().max(500).optional().default(''),
  }).parse(req.body);

  let content: CaseContent;
  try {
    content = await generateCase(x);
  } catch {
    return error(res, 'GENERATION_FAILED', 'We couldn’t create this case right now. Your case hasn’t been saved. Please try again.', 503);
  }

  const mystery = await Mystery.create({ ...x, ...content, ownerId: req.user!.id });
  const attempt = await Attempt.create({ mysteryId: mystery.id, userId: req.user!.id });
  res.status(201).json({ data: publicCase(mystery, attempt) });
}));

app.get('/api/v1/mysteries', auth, asyncRoute(async (req, res) => {
  const q = z.object({
    status: z.enum(['in-progress', 'completed']).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    page: z.coerce.number().int().min(1).default(1),
  }).parse(req.query);

  const filters: any = { userId: req.user!.id };
  if (q.status) filters.status = q.status;

  const attempts = await Attempt.find(filters).sort({ updatedAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit);
  const cases = await Promise.all(
    attempts.map(async (a) => {
      const m = await owned(a.mysteryId.toString(), req.user!.id);
      return m ? publicCase(m, a) : null;
    })
  );
  res.json({ data: cases.filter(Boolean), meta: { page: q.page, limit: q.limit } });
}));

app.get('/api/v1/mysteries/:id', auth, asyncRoute(async (req, res) => {
  const m = await owned(req.params.id, req.user!.id);
  if (!m) return error(res, 'NOT_FOUND', 'Case not found.', 404);
  const a = await Attempt.findOne({ mysteryId: m.id, userId: req.user!.id });
  if (!a) return error(res, 'NOT_FOUND', 'Case not found.', 404);

  if (a.status === 'completed') {
    const full = await owned(req.params.id, req.user!.id, true);
    const sol = full!.get('solution') as CaseContent['solution'];
    const reveal = {
      isCorrect: a.isCorrect,
      score: a.score,
      culprit: (full!.suspects as any[]).find((s) => s.id === sol.culpritSuspectId)?.name,
      motive: sol.motive,
      method: sol.method,
      explanation: sol.explanation,
      evidenceLinks: sol.evidenceLinks,
      redHerrings: sol.redHerrings,
    };
    return res.json({ data: { ...publicCase(m, a), reveal } });
  }

  res.json({ data: publicCase(m, a) });
}));

app.delete('/api/v1/mysteries/:id', auth, asyncRoute(async (req, res) => {
  const m = await owned(req.params.id, req.user!.id);
  if (!m) return error(res, 'NOT_FOUND', 'Case not found.', 404);
  await Attempt.deleteMany({ mysteryId: m.id, userId: req.user!.id });
  await m.deleteOne();
  res.json({ data: { deleted: true } });
}));

app.get('/api/v1/mysteries/:id/suspects/:suspectId', auth, asyncRoute(async (req, res) => {
  const m = await owned(req.params.id, req.user!.id);
  const s = m?.suspects.find((v: any) => v.id === req.params.suspectId);
  if (!s) return error(res, 'NOT_FOUND', 'Suspect not found.', 404);
  res.json({ data: s });
}));

app.get('/api/v1/mysteries/:id/clues', auth, asyncRoute(async (req, res) => {
  const m = await owned(req.params.id, req.user!.id);
  if (!m) return error(res, 'NOT_FOUND', 'Case not found.', 404);
  const a = await Attempt.findOne({ mysteryId: m.id, userId: req.user!.id });
  if (!a) return error(res, 'NOT_FOUND', 'Case not found.', 404);

  res.json({
    data: m.clues.map((c: any) => ({
      id: c.id,
      title: a.discoveredClueIds.includes(c.id) ? c.title : '',
      description: a.discoveredClueIds.includes(c.id) ? c.description : '',
      source: a.discoveredClueIds.includes(c.id) ? c.source : '',
      discovered: a.discoveredClueIds.includes(c.id),
    })),
  });
}));

app.post('/api/v1/mysteries/:id/clues/:clueId/discover', auth, asyncRoute(async (req, res) => {
  const m = await owned(req.params.id, req.user!.id);
  if (!m) return error(res, 'NOT_FOUND', 'Case not found.', 404);
  const clue = (m.clues as any[]).find((c) => c.id === req.params.clueId);
  const a = await Attempt.findOne({ mysteryId: m.id, userId: req.user!.id });
  if (!clue || !a) return error(res, 'NOT_FOUND', 'Clue not found.', 404);
  if (a.status === 'completed') return error(res, 'CASE_CLOSED', 'This case is already closed.', 409);

  if (!a.discoveredClueIds.includes(clue.id)) {
    a.discoveredClueIds.push(clue.id);
    await a.save();
  }
  res.json({ data: { discovered: true } });
}));

app.post('/api/v1/mysteries/:id/hints', auth, hintLimit, asyncRoute(async (req, res) => {
  const m = await owned(req.params.id, req.user!.id, true);
  if (!m) return error(res, 'NOT_FOUND', 'Case not found.', 404);
  const a = await Attempt.findOne({ mysteryId: m.id, userId: req.user!.id });
  if (!a) return error(res, 'NOT_FOUND', 'Case not found.', 404);
  if (a.status === 'completed') return error(res, 'CASE_CLOSED', 'Hints are unavailable after the case is closed.', 409);

  const hints = m.get('hints') as { level: number; text: string }[];
  if (a.hintsUsed >= hints.length) return error(res, 'NO_HINTS', 'No hints remain for this case.', 409);

  const hint = hints[a.hintsUsed];
  a.hintsUsed++;
  await a.save();
  res.json({ data: { hint } });
}));

app.post('/api/v1/mysteries/:id/accusation', auth, asyncRoute(async (req, res) => {
  const { suspectId } = z.object({ suspectId: z.string().min(1) }).parse(req.body);
  const m = await owned(req.params.id, req.user!.id, true);
  if (!m) return error(res, 'NOT_FOUND', 'Case not found.', 404);
  const a = await Attempt.findOne({ mysteryId: m.id, userId: req.user!.id });
  if (!a) return error(res, 'NOT_FOUND', 'Case not found.', 404);
  if (a.status === 'completed') return error(res, 'CASE_CLOSED', 'An accusation has already been submitted.', 409);
  if (!(m.suspects as any[]).some((s) => s.id === suspectId)) return error(res, 'INVALID_SUSPECT', 'Choose a valid suspect.', 400);

  const sol = m.get('solution') as CaseContent['solution'];
  const correct = suspectId === sol.culpritSuspectId;
  const required = m.get('requiredClueIds') as string[];
  const score = correct
    ? Math.max(0, 100 - 10 * a.hintsUsed - 5 * required.filter((id) => !a.discoveredClueIds.includes(id)).length)
    : 0;

  a.accusationSuspectId = suspectId;
  a.isCorrect = correct;
  a.score = score;
  a.status = 'completed';
  a.completedAt = new Date();
  await a.save();

  m.status = 'completed';
  m.completedAt = a.completedAt;
  await m.save();

  const reveal = {
    isCorrect: correct,
    score,
    culprit: (m.suspects as any[]).find((s) => s.id === sol.culpritSuspectId)?.name,
    motive: sol.motive,
    method: sol.method,
    explanation: sol.explanation,
    evidenceLinks: sol.evidenceLinks,
    redHerrings: sol.redHerrings,
  };
  res.json({ data: reveal });
}));

// Serve static frontend build in production or when client/dist exists
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(moduleDirectory, '../../client/dist');
console.log('Frontend path:', clientDistPath);
console.log('Frontend exists:', fs.existsSync(clientDistPath));

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    const indexPath = path.join(clientDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    return next();
  });
}

// 404 fallback for unhandled API routes
app.use('/api/*', (_req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'API route not found.' },
  });
});

// Global error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please check the submitted information.',
        details: err.issues.map((i) => ({ path: i.path, message: i.message })),
      },
    });
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Please check the submitted information.' },
    });
  }

  console.error('request_error', err instanceof Error ? err.message : 'unknown');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
  });
});

export default app;
