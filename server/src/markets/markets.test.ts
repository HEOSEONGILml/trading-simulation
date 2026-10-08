import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../app.ts';
import { MINUTE, type Candle } from '../binance.ts';
import { STOCKS } from './symbols.ts';
import type { MarketSource } from './types.ts';

/** 1분마다 봉이 있는 가짜 주식 시장 (가격 50,000원 근처) */
const fakeKr: MarketSource = {
  market: 'kr',
  earliest: Date.UTC(2023, 0, 1),
  history: async (_s, before, count) =>
    Array.from({ length: count }, (_, i): Candle => {
      const t = before - (count - i) * MINUTE;
      return [t, 50_000, 50_100, 49_900, 50_000 + i, 1000];
    }),
  future: async (_s, from, count) => Array.from({ length: count }, (_, i): Candle => [from + i * MINUTE, 50_000, 50_100, 49_900, 50_000, 1000]),
};

async function player(app: ReturnType<typeof buildApp>) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { username: 'stocker', password: 'password123' } });
  const headers = { cookie: `session=${res.cookies.find((c) => c.name === 'session')!.value}` };
  await app.inject({ method: 'PUT', url: '/api/auth/nickname', headers, payload: { nickname: '주식연습' } });
  return headers;
}

const SETTINGS = { rangeStart: Date.UTC(2023, 0, 1), rangeEnd: Date.UTC(2024, 0, 1), historyMinutes: 120, hideDate: true, hidePrice: true };

test('주식 라운드는 종목을 끝날 때까지 숨기고, 끝나면 공개한다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'markets-'));
  const app = buildApp({ dbPath: join(dir, 'test.db'), sources: { kr: fakeKr } });
  try {
    const headers = await player(app);
    assert.deepEqual((await app.inject({ url: '/api/markets' })).json(), { markets: ['kr'] });

    const created = await app.inject({ method: 'POST', url: '/api/rounds', headers, payload: { ...SETTINGS, market: 'kr' } });
    assert.equal(created.statusCode, 200, created.body);
    const round = created.json();
    assert.equal(round.market, 'kr');
    assert.equal(round.currency, 'KRW');
    // 가린 가격이 실제보다 작으면 원화도 소수 자릿수가 생길 수 있다
    assert.ok(Number.isInteger(round.pricePrecision) && round.pricePrecision >= 0 && round.pricePrecision <= 4);
    assert.equal(round.history.length, 120);
    const codes = Object.keys(STOCKS.kr);
    // 6자리 코드는 시각, 가격 숫자 안에 우연히 들어 있을 수 있어서 따옴표로 감싼 값과 symbol 필드만 본다
    const leaks = (body: string) =>
      body.includes('"symbol"') || codes.some((code) => body.includes(`"${code}"`)) || Object.values(STOCKS.kr).some((n) => body.includes(n));
    assert.ok(!leaks(created.body), '시작 응답에 종목이 보이면 안 된다');
    const resumed = await app.inject({ url: '/api/rounds/active', headers });
    assert.ok(!leaks(resumed.body), '이어하기 응답에 종목이 보이면 안 된다');

    const finished = await app.inject({
      method: 'POST',
      url: `/api/rounds/${round.roundId}/finish`,
      headers,
      payload: { candleCount: 30, startEquity: 10_000_000, endEquity: 10_100_000, realizedPnl: 100_000, fees: 0, tradeCount: 1, winCount: 1, maxDrawdownPct: 0, liquidationCount: 0, profitMinutes: 30, lossMinutes: 0, trades: [] },
    });
    const record = finished.json().record;
    assert.equal(record.market, 'kr');
    assert.ok(codes.includes(record.symbol));
    assert.equal(record.symbolName, STOCKS.kr[record.symbol]);
    assert.equal(record.realEndTime - record.realStartTime, 30 * MINUTE);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('켜지 않은 시장은 라운드를 만들 수 없다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'markets-'));
  const app = buildApp({ dbPath: join(dir, 'test.db'), sources: { kr: fakeKr } });
  try {
    const headers = await player(app);
    const res = await app.inject({ method: 'POST', url: '/api/rounds', headers, payload: { ...SETTINGS, market: 'us' } });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /준비 중/);
    const bad = await app.inject({ method: 'POST', url: '/api/rounds', headers, payload: { ...SETTINGS, market: 'fx' } });
    assert.equal(bad.statusCode, 400);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
