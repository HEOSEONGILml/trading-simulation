import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../app.ts';
import type { Candle } from '../binance.ts';
import { quizPng } from './chart.ts';
import { threadsText, xTexts, type Quiz } from './quiz.ts';
import { oauthHeader } from './x.ts';

const QUIZ: Quiz = {
  number: 12,
  png: Buffer.alloc(0),
  realTime: Date.UTC(2022, 0, 19, 6, 45),
  realPrice: 42_364,
  realFuturePrice: 43_342.5,
  changePct: 2.3086,
};

test('스레드 본문은 정답 부분만 스포일러로 가린다', () => {
  const { text, spoiler } = threadsText(QUIZ);
  const hidden = text.slice(spoiler.offset, spoiler.offset + spoiler.length);
  assert.equal(hidden, '▲ 상승 +2.31% (실제 2022-01-19 15:45 KST, 42,364 → 43,342.5 USDT)');
  assert.ok(text.slice(0, spoiler.offset).endsWith('정답: '));
  assert.equal([...text].length, text.length, 'BMP 밖 글자가 있으면 오프셋 단위가 달라질 수 있다');
  assert.ok(text.length <= 500, '스레드 글자 수 한도');
});

test('X 글은 280자 한도 안이고 링크가 없다', () => {
  // X는 한글 등 CJK 글자를 2자로 센다
  const weighted = (s: string) => [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x10ff ? 2 : 1), 0);
  const { post, reply } = xTexts({ ...QUIZ, changePct: -12.3456 });
  assert.ok(weighted(post) <= 280, post);
  assert.ok(weighted(reply) <= 280, reply);
  assert.ok(!/https?:|\.com/.test(post + reply), '링크가 있는 글은 API 요금이 비싸다');
  assert.ok(reply.includes('▼ 하락 -12.35%'));
});

test('퀴즈 이미지는 PNG로 만들어진다', () => {
  const candles: Candle[] = Array.from({ length: 96 }, (_, i) => {
    const o = 30_000 + Math.sin(i / 5) * 300;
    return [Date.UTC(2010, 0, 1) + i * 15 * 60_000, o, o + 80, o - 80, o + (i % 2 ? 40 : -40), 100 + i];
  });
  const png = quizPng({ number: 1, candles, futureBars: 16, pricePrecision: 0, intervalLabel: '15분봉', horizonLabel: '4시간 뒤' });
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

test('OAuth 1.0a 서명 헤더 형식', () => {
  const h = oauthHeader('POST', 'https://api.x.com/2/tweets', { apiKey: 'k', apiSecret: 's', accessToken: 't', accessSecret: 'ts' }, 'nonce', 1);
  assert.match(h, /^OAuth oauth_consumer_key="k", oauth_nonce="nonce", oauth_signature="[^"]+", oauth_signature_method="HMAC-SHA1", oauth_timestamp="1", oauth_token="t", oauth_version="1.0"$/);
});

test('퀴즈 이미지는 번호.png 이름만 공개한다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'quiz-'));
  mkdirSync(join(dir, 'quiz'));
  writeFileSync(join(dir, 'quiz', '3.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(join(dir, 'quiz', 'state.json'), '{"secret":true}');
  const app = buildApp({ dbPath: join(dir, 'test.db') });
  try {
    const ok = await app.inject({ url: '/quiz/3.png' });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.headers['content-type'], 'image/png');
    assert.equal((await app.inject({ url: '/quiz/state.json' })).statusCode, 404);
    assert.equal((await app.inject({ url: '/quiz/..%2Ftest.db' })).statusCode, 404);
    assert.equal((await app.inject({ url: '/quiz/9.png' })).statusCode, 404);
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
