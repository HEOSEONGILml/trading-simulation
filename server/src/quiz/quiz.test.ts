import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../app.ts';
import type { Candle } from '../binance.ts';
import { quizPng } from './chart.ts';
import { threadsText, type Quiz } from './quiz.ts';

const QUIZ: Quiz = {
  number: 12,
  png: Buffer.alloc(0),
  answerPng: Buffer.alloc(0),
  realTime: Date.UTC(2022, 0, 19, 6, 45),
  realPrice: 42_364,
  realFuturePrice: 43_342.5,
  changePct: 2.3086,
};

test('스레드 본문은 정답과 정답 차트 링크만 스포일러로 가린다', () => {
  const { text, spoiler } = threadsText(QUIZ);
  const hidden = text.slice(spoiler.offset, spoiler.offset + spoiler.length);
  assert.equal(hidden, '▲ 상승 +2.31% (실제 2022-01-19 15:45 KST · 42,364 → 43,342.5 USDT)\n정답 차트: https://blindcandle.com/quiz/12');
  assert.ok(text.slice(0, spoiler.offset).endsWith('정답: '));
  assert.ok(!text.slice(spoiler.offset + spoiler.length).includes('/quiz/'), '정답 링크가 가림 밖에 나오면 안 된다');
  assert.equal([...text].length, text.length, 'BMP 밖 글자가 있으면 오프셋 단위가 달라질 수 있다');
  assert.ok(text.length <= 500, '스레드 글자 수 한도');
});

test('문제 이미지와 정답 이미지는 PNG로 만들어진다', () => {
  const bar = (i: number): Candle => {
    const o = 30_000 + Math.sin(i / 5) * 300;
    return [Date.UTC(2010, 0, 1) + i * 15 * 60_000, o, o + 80, o - 80, o + (i % 2 ? 40 : -40), 100 + i];
  };
  const chart = {
    number: 1,
    candles: Array.from({ length: 96 }, (_, i) => bar(i)),
    futureBars: 16,
    pricePrecision: 0,
    intervalLabel: '15분봉',
    horizonLabel: '4시간 뒤',
  };
  const answer = { future: Array.from({ length: 16 }, (_, i) => bar(96 + i)), up: true, result: '▲ 상승 +1.00%', real: '실제' };
  for (const png of [quizPng(chart), quizPng({ ...chart, answer })]) {
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  }
});

test('퀴즈 이미지와 정답 페이지만 공개한다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'quiz-'));
  mkdirSync(join(dir, 'quiz'));
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  writeFileSync(join(dir, 'quiz', '3.png'), png);
  writeFileSync(join(dir, 'quiz', '3-answer.png'), png);
  writeFileSync(join(dir, 'quiz', '3.json'), JSON.stringify({ number: 3, up: false, result: '▼ 하락 -1.20%', real: '실제 <b>' }));
  writeFileSync(join(dir, 'quiz', 'state.json'), '{"secret":true}');
  const app = buildApp({ dbPath: join(dir, 'test.db') });
  try {
    const image = await app.inject({ url: '/quiz/3.png' });
    assert.equal(image.statusCode, 200);
    assert.equal(image.headers['content-type'], 'image/png');
    assert.equal((await app.inject({ url: '/quiz/3-answer.png' })).statusCode, 200);

    const page = await app.inject({ url: '/quiz/3' });
    assert.equal(page.statusCode, 200);
    assert.ok(page.body.includes('<meta property="og:image" content="https://blindcandle.com/quiz/3.png">'), '미리보기는 문제 이미지');
    assert.ok(page.body.includes('<img src="/quiz/3-answer.png"'));
    assert.ok(page.body.includes('실제 &lt;b&gt;'), 'HTML 이스케이프');

    for (const url of ['/quiz/4', '/quiz/3.json', '/quiz/state.json', '/quiz/..%2Ftest.db', '/quiz/9.png']) {
      assert.equal((await app.inject({ url })).statusCode, 404, url);
    }
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('스레드 계정 연결은 설정이 있을 때만 열리고, 위조된 콜백은 거절한다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'quiz-'));
  const threadsApp = { appId: '123', appSecret: 'secret', redirectUri: 'https://blindcandle.com/auth/threads/callback' };
  const off = buildApp({ dbPath: join(dir, 'off.db') });
  const on = buildApp({ dbPath: join(dir, 'on.db'), threadsApp });
  try {
    assert.equal((await off.inject({ url: '/auth/threads/start' })).statusCode, 404);
    const start = await on.inject({ url: '/auth/threads/start' });
    assert.equal(start.statusCode, 302);
    const to = new URL(start.headers.location as string);
    assert.equal(to.origin + to.pathname, 'https://threads.net/oauth/authorize');
    assert.equal(to.searchParams.get('client_id'), '123');
    assert.equal(to.searchParams.get('redirect_uri'), threadsApp.redirectUri);
    assert.equal(to.searchParams.get('scope'), 'threads_basic,threads_content_publish');
    const forged = await on.inject({ url: '/auth/threads/callback?code=abc&state=wrong' });
    assert.equal(forged.statusCode, 400);
  } finally {
    await off.close();
    await on.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
