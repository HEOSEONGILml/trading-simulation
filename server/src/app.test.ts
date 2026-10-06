import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from './app.ts';
import { createDisguise, precisionFor } from './disguise.ts';

const WEEK = 7 * 24 * 3600_000;

type App = ReturnType<typeof buildApp>;

async function signUp(app: App, username: string, nickname?: string) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { username, password: 'password123' } });
  assert.equal(res.statusCode, 200, res.body);
  const cookie = res.cookies.find((c) => c.name === 'session')!;
  const headers = { cookie: `session=${cookie.value}` };
  if (nickname) {
    const nick = await app.inject({ method: 'PUT', url: '/api/auth/nickname', headers, payload: { nickname } });
    assert.equal(nick.statusCode, 200, nick.body);
  }
  return headers;
}

const RESULT = {
  candleCount: 30,
  startEquity: 10_000,
  endEquity: 10_500,
  realizedPnl: 520,
  fees: 20,
  tradeCount: 2,
  winCount: 1,
  maxDrawdownPct: 3,
  liquidationCount: 0,
  trades: [],
};

async function createRound(app: App, headers: Record<string, string>) {
  const created = await app.inject({
    method: 'POST',
    url: '/api/rounds',
    headers,
    payload: { rangeStart: Date.UTC(2023, 0, 1), rangeEnd: Date.UTC(2023, 0, 10), historyMinutes: 120, hideDate: true, hidePrice: true },
  });
  assert.equal(created.statusCode, 200, created.body);
  return created.json();
}

async function playRound(app: App, headers: Record<string, string>, endEquity: number) {
  const round = await createRound(app, headers);
  const finished = await app.inject({
    method: 'POST',
    url: `/api/rounds/${round.roundId}/finish`,
    headers,
    payload: { ...RESULT, endEquity },
  });
  return { round, finished: finished.json() };
}

test('더미 날짜는 7일 단위로 이동하고 더미 시작가는 1,000 단위', () => {
  const realStart = Date.UTC(2022, 5, 15, 13, 37);
  for (let i = 0; i < 200; i++) {
    const d = createDisguise(realStart, 21_234.5, true, true);
    assert.equal(Math.abs(d.dateOffset % WEEK), 0);
    const fake = new Date(realStart + d.dateOffset);
    assert.ok(fake.getUTCFullYear() >= 1999 && fake.getUTCFullYear() <= 2019);
    const fakeStart = 21_234.5 * d.priceFactor;
    assert.ok(Math.abs(fakeStart - Math.round(fakeStart / 1000) * 1000) < 1e-6);
  }
  const plain = createDisguise(realStart, 21_234.5, false, false);
  assert.deepEqual([plain.dateOffset, plain.priceFactor, plain.pricePrecision], [0, 1, 1]);
  assert.equal(precisionFor(2000 / 60000), 3);
});

test('회원가입, 로그인, 닉네임 규칙', async () => {
  const app = buildApp({ dbPath: ':memory:' });

  assert.equal((await app.inject({ url: '/api/auth/me' })).json().user, null);
  const bad = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { username: 'ab', password: 'password123' } });
  assert.equal(bad.statusCode, 400);
  const short = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { username: 'alice', password: 'short' } });
  assert.equal(short.statusCode, 400);

  const headers = await signUp(app, 'alice');
  assert.deepEqual((await app.inject({ url: '/api/auth/me', headers })).json().user.nickname, null);
  // 닉네임 없이는 게임 기능을 쓸 수 없다
  assert.equal((await app.inject({ url: '/api/history', headers })).statusCode, 403);

  const dup = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { username: 'ALICE', password: 'password123' } });
  assert.equal(dup.statusCode, 409);

  const wrong = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'alice', password: 'wrongpass1' } });
  assert.equal(wrong.statusCode, 401);
  const ok = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'alice', password: 'password123' } });
  assert.equal(ok.statusCode, 200);

  const nick = await app.inject({ method: 'PUT', url: '/api/auth/nickname', headers, payload: { nickname: '앨리스' } });
  assert.equal(nick.json().user.nickname, '앨리스');
  const bob = await signUp(app, 'bobby');
  const taken = await app.inject({ method: 'PUT', url: '/api/auth/nickname', headers: bob, payload: { nickname: '앨리스' } });
  assert.equal(taken.statusCode, 409);
  const invalid = await app.inject({ method: 'PUT', url: '/api/auth/nickname', headers: bob, payload: { nickname: 'a b' } });
  assert.equal(invalid.statusCode, 400);

  await app.inject({ method: 'POST', url: '/api/auth/logout', headers });
  assert.equal((await app.inject({ url: '/api/auth/me', headers })).json().user, null);
  await app.close();
});

test('라운드 진행과 회원별 기록, 랭킹', { timeout: 60_000 }, async () => {
  const app = buildApp({ dbPath: ':memory:' });
  const alice = await signUp(app, 'alice', '앨리스');
  const bob = await signUp(app, 'bobby', '밥돌이');

  const { round, finished } = await playRound(app, alice, 10_500);
  assert.equal(round.history.length, 120);
  assert.equal(finished.saved, true);
  assert.equal(finished.record.returnPct, 5);
  assert.equal(finished.record.realStartTime + finished.record.dateOffset, round.startTime);

  // 다른 회원의 라운드에는 접근할 수 없다
  const bobRound = await createRound(app, bob);
  const peek = await app.inject({ url: `/api/rounds/${bobRound.roundId}/candles?from=0&count=1`, headers: alice });
  assert.equal(peek.statusCode, 400);
  const steal = await app.inject({ method: 'POST', url: `/api/rounds/${bobRound.roundId}/finish`, headers: alice, payload: RESULT });
  assert.equal(steal.statusCode, 400);
  const own = await app.inject({ url: `/api/rounds/${bobRound.roundId}/candles?from=0&count=1`, headers: bob });
  assert.equal(own.statusCode, 200);
  await app.inject({ method: 'POST', url: `/api/rounds/${bobRound.roundId}/finish`, headers: bob, payload: { ...RESULT, endEquity: 9_000 } });

  const aliceHistory = (await app.inject({ url: '/api/history', headers: alice })).json();
  assert.equal(aliceHistory.summary.roundCount, 1);
  assert.equal(aliceHistory.rounds[0].returnPct, 5);
  const forbidden = await app.inject({ method: 'DELETE', url: `/api/history/${aliceHistory.rounds[0].id}`, headers: bob });
  assert.equal(forbidden.statusCode, 404);

  const ranking = (await app.inject({ url: '/api/ranking?sort=compound', headers: bob })).json();
  assert.deepEqual(
    ranking.entries.map((e: { nickname: string; isMe: boolean }) => [e.nickname, e.isMe]),
    [
      ['앨리스', false],
      ['밥돌이', true],
    ],
  );
  // 평균 수익률 랭킹은 최소 라운드 수를 채워야 표시된다
  const average = (await app.inject({ url: '/api/ranking?sort=average', headers: bob })).json();
  assert.equal(average.entries.length, 0);
  await app.close();
});
