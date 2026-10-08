import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from './app.ts';

const KEY = 'toss-anonymous-key-abcdef123456';

test('토스 익명 키로 회원 자동 생성, 같은 키는 같은 회원, Bearer 토큰으로 게임 API 사용', async () => {
  const app = buildApp({ dbPath: ':memory:' });
  const first = await app.inject({ method: 'POST', url: '/api/auth/toss', payload: { anonymousKey: KEY } });
  assert.equal(first.statusCode, 200, first.body);
  const body = first.json();
  assert.ok(body.token);
  assert.match(body.user.nickname, /^연습생\d{6}$/);
  assert.equal(body.user.toss, true);
  assert.equal(first.cookies.length, 0, '쿠키를 쓰지 않는다');

  const auth = { authorization: `Bearer ${body.token}` };
  const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth });
  assert.equal(me.json().user.id, body.user.id);
  const settings = await app.inject({ method: 'GET', url: '/api/settings', headers: auth });
  assert.equal(settings.statusCode, 200);

  // 같은 키로 다시 로그인하면 같은 회원 (새 토큰)
  const again = (await app.inject({ method: 'POST', url: '/api/auth/toss', payload: { anonymousKey: KEY } })).json();
  assert.equal(again.user.id, body.user.id);
  assert.notEqual(again.token, body.token);

  // 닉네임은 나중에 바꿀 수 있다
  const nick = await app.inject({ method: 'PUT', url: '/api/auth/nickname', headers: auth, payload: { nickname: '새닉네임' } });
  assert.equal(nick.statusCode, 200, nick.body);

  // 다른 키는 다른 회원
  const other = (await app.inject({ method: 'POST', url: '/api/auth/toss', payload: { anonymousKey: `${KEY}-2` } })).json();
  assert.notEqual(other.user.id, body.user.id);

  // 로그아웃하면 토큰이 무효
  await app.inject({ method: 'POST', url: '/api/auth/logout', headers: auth });
  const after = await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth });
  assert.equal(after.json().user, null);
  await app.close();
});

test('토스 키 회원은 비밀번호 로그인이 불가하고, 잘못된 키와 가짜 토큰은 거부', async () => {
  const app = buildApp({ dbPath: ':memory:' });
  const { user } = (await app.inject({ method: 'POST', url: '/api/auth/toss', payload: { anonymousKey: KEY } })).json();
  for (const password of ['!', '', 'password123']) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: user.username, password } });
    assert.equal(res.statusCode, 401);
  }
  for (const anonymousKey of [undefined, '', 'short', 'x'.repeat(300), '한글키입니다한글키입니다', 123]) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/toss', payload: { anonymousKey } });
    assert.equal(res.statusCode, 400);
  }
  const fake = await app.inject({ method: 'GET', url: '/api/settings', headers: { authorization: 'Bearer nope' } });
  assert.equal(fake.statusCode, 401);
  await app.close();
});

test('토스 키 회원은 비밀번호 없이 탈퇴할 수 있고 데이터가 삭제된다', async () => {
  const app = buildApp({ dbPath: ':memory:' });
  const { token } = (await app.inject({ method: 'POST', url: '/api/auth/toss', payload: { anonymousKey: KEY } })).json();
  const auth = { authorization: `Bearer ${token}` };
  const del = await app.inject({ method: 'DELETE', url: '/api/auth/account', headers: auth, payload: {} });
  assert.equal(del.statusCode, 200, del.body);
  const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth });
  assert.equal(me.json().user, null);
  await app.close();
});

test('CORS: 토스 미니앱 출처만 허용 (appName 변경 가능)', async () => {
  const app = buildApp({ dbPath: ':memory:' });
  for (const origin of ['https://blindcandle.apps.tossmini.com', 'https://blindcandle.private-apps.tossmini.com']) {
    const pre = await app.inject({
      method: 'OPTIONS',
      url: '/api/auth/toss',
      headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' },
    });
    assert.equal(pre.statusCode, 204);
    assert.equal(pre.headers['access-control-allow-origin'], origin);
    assert.match(String(pre.headers['access-control-allow-headers']), /authorization/);
    const res = await app.inject({ method: 'GET', url: '/api/markets', headers: { origin } });
    assert.equal(res.headers['access-control-allow-origin'], origin);
    assert.equal(res.headers['access-control-allow-credentials'], undefined);
  }
  for (const origin of ['https://evil.example.com', 'https://other.apps.tossmini.com', 'https://blindcandle.apps.tossmini.com.evil.com']) {
    const res = await app.inject({ method: 'GET', url: '/api/markets', headers: { origin } });
    assert.equal(res.headers['access-control-allow-origin'], undefined);
  }
  await app.close();

  const renamed = buildApp({ dbPath: ':memory:', tossAppName: 'myapp', extraCorsOrigins: ['http://localhost:5173'] });
  const ok = await renamed.inject({ method: 'GET', url: '/api/markets', headers: { origin: 'https://myapp.apps.tossmini.com' } });
  assert.equal(ok.headers['access-control-allow-origin'], 'https://myapp.apps.tossmini.com');
  const dev = await renamed.inject({ method: 'GET', url: '/api/markets', headers: { origin: 'http://localhost:5173' } });
  assert.equal(dev.headers['access-control-allow-origin'], 'http://localhost:5173');
  const old = await renamed.inject({ method: 'GET', url: '/api/markets', headers: { origin: 'https://blindcandle.apps.tossmini.com' } });
  assert.equal(old.headers['access-control-allow-origin'], undefined);
  await renamed.close();
});
