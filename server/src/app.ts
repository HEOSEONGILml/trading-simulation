import { existsSync } from 'node:fs';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import {
  AttemptLimiter,
  AuthError,
  SESSION_COOKIE,
  createSession,
  logIn,
  publicUser,
  signUp,
  validateNickname,
} from './auth.ts';
import { MINUTE } from './binance.ts';
import { RANKING_MIN_ROUNDS, Store, summarize, type RankingSort, type RoundResultInput, type User } from './db.ts';
import { RoundError, Rounds, type RoundSettings } from './rounds.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

const MAX_FUTURE_BATCH = 2000;
const MAX_SETTINGS_LENGTH = 10_000;
const RANKING_SORTS: RankingSort[] = ['compound', 'average', 'winrate'];

export function buildApp(options: { dbPath: string; staticDir?: string }) {
  // cloudflared 터널 뒤에서 실행되므로 X-Forwarded-* 헤더를 신뢰한다
  const app = Fastify({ logger: { level: 'warn' }, bodyLimit: 10 * 1024 * 1024, trustProxy: true });
  const store = new Store(options.dbPath);
  const rounds = new Rounds(store);
  const limiter = new AttemptLimiter();

  app.addHook('onClose', async () => store.close());
  app.register(fastifyCookie);
  app.decorateRequest('user', null);

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof RoundError) return reply.status(400).send({ error: err.message });
    if (err instanceof AuthError) return reply.status(err.statusCode).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    return reply.status(status).send({ error: status >= 500 ? '서버 오류가 발생했습니다.' : (err as Error).message });
  });

  app.addHook('onRequest', async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    req.user = token ? (store.findSessionUser(token) ?? null) : null;
  });

  const clientIp = (req: FastifyRequest) => String(req.headers['cf-connecting-ip'] ?? req.ip);

  const setSessionCookie = (req: FastifyRequest, reply: FastifyReply, userId: string) => {
    const { token, expiresAt } = createSession(store, userId);
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: req.protocol === 'https',
      expires: new Date(expiresAt),
    });
  };

  const requireUser = (req: FastifyRequest): User => {
    if (!req.user) throw new AuthError('로그인이 필요합니다.', 401);
    return req.user;
  };

  /** 게임 기능은 닉네임까지 설정한 회원만 사용한다 */
  const requirePlayer = (req: FastifyRequest): User => {
    const user = requireUser(req);
    if (!user.nickname) throw new AuthError('닉네임을 먼저 설정해주세요.', 403);
    return user;
  };

  // ---------- 회원 ----------

  app.get('/api/auth/me', async (req) => ({ user: req.user ? publicUser(req.user) : null }));

  app.post<{ Body: { username?: unknown; password?: unknown } }>('/api/auth/signup', async (req, reply) => {
    limiter.check(clientIp(req));
    const user = await signUp(store, req.body?.username, req.body?.password);
    setSessionCookie(req, reply, user.id);
    return { user: publicUser(user) };
  });

  app.post<{ Body: { username?: unknown; password?: unknown } }>('/api/auth/login', async (req, reply) => {
    limiter.check(clientIp(req));
    const user = await logIn(store, req.body?.username, req.body?.password);
    setSessionCookie(req, reply, user.id);
    return { user: publicUser(user) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) store.deleteSession(token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.put<{ Body: { nickname?: unknown } }>('/api/auth/nickname', async (req) => {
    const user = requireUser(req);
    const nickname = validateNickname(req.body?.nickname);
    if (store.nicknameTaken(nickname, user.id)) throw new AuthError('이미 사용 중인 닉네임입니다.', 409);
    store.setNickname(user.id, nickname);
    return { user: publicUser({ ...user, nickname }) };
  });

  // ---------- 회원별 설정 ----------

  app.get('/api/settings', async (req) => ({ settings: store.getSettings(requirePlayer(req).id) }));

  app.put<{ Body: { settings?: unknown } }>('/api/settings', async (req, reply) => {
    const user = requirePlayer(req);
    const settings = req.body?.settings;
    const valid = settings !== null && typeof settings === 'object' && !Array.isArray(settings);
    if (!valid || JSON.stringify(settings).length > MAX_SETTINGS_LENGTH) {
      return reply.status(400).send({ error: '설정 값이 올바르지 않습니다.' });
    }
    store.saveSettings(user.id, settings);
    return { ok: true };
  });

  // ---------- 라운드 ----------

  app.post<{ Body: RoundSettings }>('/api/rounds', async (req) => {
    const user = requirePlayer(req);
    const { rangeStart, rangeEnd, historyMinutes, hideDate, hidePrice } = req.body ?? ({} as RoundSettings);
    if (![rangeStart, rangeEnd, historyMinutes].every(Number.isFinite)) {
      throw new RoundError('설정 값이 올바르지 않습니다.');
    }
    return rounds.create(user.id, { rangeStart, rangeEnd, historyMinutes, hideDate: !!hideDate, hidePrice: !!hidePrice });
  });

  /** 이전 세션에서 끝내지 않은 라운드 */
  app.get('/api/rounds/active', async (req) => ({ round: await rounds.resume(requirePlayer(req).id) }));

  app.put<{ Params: { id: string }; Body: { state?: unknown } }>('/api/rounds/:id/state', async (req) => {
    rounds.saveState(requirePlayer(req).id, req.params.id, req.body?.state);
    return { ok: true };
  });

  app.get<{ Params: { id: string }; Querystring: { from?: string; count?: string } }>(
    '/api/rounds/:id/candles',
    async (req) => {
      const user = requirePlayer(req);
      const from = Math.max(0, Math.floor(Number(req.query.from ?? 0)));
      const count = Math.min(MAX_FUTURE_BATCH, Math.max(1, Math.floor(Number(req.query.count ?? 500))));
      if (!Number.isFinite(from) || !Number.isFinite(count)) throw new RoundError('잘못된 요청입니다.');
      return rounds.futureCandles(user.id, req.params.id, from, count);
    },
  );

  app.post<{ Params: { id: string }; Body: RoundResultInput }>('/api/rounds/:id/finish', async (req) => {
    const user = requirePlayer(req);
    const reveal = rounds.finish(user.id, req.params.id);
    const result = req.body;
    const record = {
      id: req.params.id,
      userId: user.id,
      playedAt: Date.now(),
      realStartTime: reveal.realStartTime,
      realEndTime: reveal.realStartTime + result.candleCount * MINUTE,
      hideDate: reveal.settings.hideDate,
      hidePrice: reveal.settings.hidePrice,
      dateOffset: reveal.dateOffset,
      priceFactor: reveal.priceFactor,
      candleCount: result.candleCount,
      startEquity: result.startEquity,
      endEquity: result.endEquity,
      returnPct: ((result.endEquity - result.startEquity) / result.startEquity) * 100,
      realizedPnl: result.realizedPnl,
      fees: result.fees,
      tradeCount: result.tradeCount,
      winCount: result.winCount,
      maxDrawdownPct: result.maxDrawdownPct,
      liquidationCount: result.liquidationCount,
      trades: Array.isArray(result.trades) ? result.trades : [],
    };
    // 시간이 흐르지 않은 라운드는 기록하지 않는다
    const saved = record.candleCount > 0;
    if (saved) store.insertRound(record);
    return { saved, record };
  });

  // ---------- 기록, 랭킹 ----------

  app.get('/api/history', async (req) => {
    const user = requirePlayer(req);
    const records = store.listRounds(user.id);
    return { summary: summarize(records), rounds: records.map(({ trades: _trades, ...rest }) => rest) };
  });

  app.get<{ Params: { id: string } }>('/api/history/:id', async (req, reply) => {
    const record = store.getRound(requirePlayer(req).id, req.params.id);
    if (!record) return reply.status(404).send({ error: '기록을 찾을 수 없습니다.' });
    return record;
  });

  app.delete<{ Params: { id: string } }>('/api/history/:id', async (req, reply) => {
    if (!store.deleteRound(requirePlayer(req).id, req.params.id)) {
      return reply.status(404).send({ error: '기록을 찾을 수 없습니다.' });
    }
    return { ok: true };
  });

  app.get<{ Querystring: { sort?: string } }>('/api/ranking', async (req) => {
    const user = requirePlayer(req);
    const sort = RANKING_SORTS.includes(req.query.sort as RankingSort) ? (req.query.sort as RankingSort) : 'compound';
    const entries = store.ranking(sort).map(({ userId, ...e }) => ({ ...e, isMe: userId === user.id }));
    return { sort, minRounds: RANKING_MIN_ROUNDS, entries };
  });

  if (options.staticDir && existsSync(options.staticDir)) {
    app.register(fastifyStatic, { root: options.staticDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.status(404).send({ error: 'Not Found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
