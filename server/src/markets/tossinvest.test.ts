import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MINUTE } from '../binance.ts';
import { SESSIONS, TossInvestClient, inSession, tossSource } from './tossinvest.ts';

/** 2024-03-04(월)~ 이틀치 국내 1분봉(08:01~20:00 종료 시각)을 가진 가짜 토스증권 서버 */
function fakeServer() {
  const ends: number[] = [];
  for (const day of ['2024-03-04', '2024-03-05']) {
    const base = Date.parse(`${day}T08:01:00+09:00`);
    for (let i = 0; i < 720; i++) ends.push(base + i * MINUTE);
  }
  let calls = 0;
  const fetchImpl = (async (url: string) => {
    calls++;
    if (url.endsWith('/oauth2/token')) return Response.json({ access_token: 't', token_type: 'Bearer', expires_in: 86400 });
    const q = new URL(url).searchParams;
    const before = Date.parse(q.get('before')!);
    const page = ends.filter((e) => e <= before).slice(-200).reverse();
    const candles = page.map((e, i) => ({
      timestamp: new Date(e).toISOString(),
      openPrice: String(1000 + i),
      highPrice: String(1001 + i),
      lowPrice: String(999 + i),
      closePrice: String(1000 + i),
      volume: '10',
      currency: 'KRW',
    }));
    const nextBefore = page.length === 200 ? new Date(page[page.length - 1] - MINUTE).toISOString() : null;
    return Response.json({ result: { candles, nextBefore } });
  }) as typeof fetch;
  return { fetchImpl, calls: () => calls };
}

test('정규장 판정: 한국 09:00~15:29, 미국은 뉴욕 시각 09:30~15:59 (서머타임 반영)', () => {
  assert.ok(inSession(Date.parse('2024-03-04T09:00:00+09:00'), SESSIONS.kr));
  assert.ok(inSession(Date.parse('2024-03-04T15:29:00+09:00'), SESSIONS.kr));
  assert.ok(!inSession(Date.parse('2024-03-04T15:30:00+09:00'), SESSIONS.kr));
  assert.ok(!inSession(Date.parse('2024-03-04T08:59:00+09:00'), SESSIONS.kr));
  // 7월(서머타임) 뉴욕 09:30 = UTC 13:30, 1월 = UTC 14:30
  assert.ok(inSession(Date.parse('2024-07-01T13:30:00Z'), SESSIONS.us));
  assert.ok(!inSession(Date.parse('2024-07-01T13:29:00Z'), SESSIONS.us));
  assert.ok(inSession(Date.parse('2024-01-02T14:30:00Z'), SESSIONS.us));
  assert.ok(!inSession(Date.parse('2024-01-02T21:00:00Z'), SESSIONS.us));
});

test('과거 봉: 시작 시각 기준, 오래된 순, 정규장 봉만, 기준 시각 이전만', async () => {
  const { fetchImpl } = fakeServer();
  const source = tossSource('kr', new TossInvestClient({ clientId: 'a', clientSecret: 'b' }, fetchImpl));
  const before = Date.parse('2024-03-05T10:00:00+09:00');
  const history = await source.history('005930', before, 100);
  assert.equal(history.length, 100);
  assert.equal(history[history.length - 1][0], before - MINUTE, '마지막 봉은 09:59 시작 봉');
  assert.ok(history.every((c, i) => i === 0 || c[0] > history[i - 1][0]), '오래된 순');
  assert.ok(history.every((c) => inSession(c[0], SESSIONS.kr)), '정규장만');
  // 당일 09:00~09:59 60개에 전날 14:50~15:29 40개가 이어진다
  assert.equal(history[0][0], Date.parse('2024-03-04T14:50:00+09:00'), '당일 60개 + 전날 마감 전 40개');
});

test('미래 봉: 장 마감과 다음날 개장을 건너 이어 붙인다', async () => {
  const { fetchImpl } = fakeServer();
  const source = tossSource('kr', new TossInvestClient({ clientId: 'a', clientSecret: 'b' }, fetchImpl));
  const from = Date.parse('2024-03-04T15:00:00+09:00');
  const future = await source.future('005930', from, 60);
  assert.equal(future.length, 60);
  assert.equal(future[0][0], from);
  assert.equal(future[29][0], Date.parse('2024-03-04T15:29:00+09:00'));
  assert.equal(future[30][0], Date.parse('2024-03-05T09:00:00+09:00'), '다음날 09:00 시작 봉');
  assert.ok(future.every((c) => inSession(c[0], SESSIONS.kr)));
});
