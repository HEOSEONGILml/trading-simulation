// 회원가입/로그인: scrypt 비밀번호 해시, 쿠키 세션

import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Store, User } from './db.ts';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const SESSION_COOKIE = 'session';
export const SESSION_TTL = 30 * 24 * 3600_000;

const USERNAME_RE = /^[a-zA-Z0-9_]{4,20}$/;
const NICKNAME_RE = /^[가-힣a-zA-Z0-9_]{2,12}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

export class AuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored.startsWith('scrypt$')) return false; // 토스 익명 키 회원은 비밀번호 로그인 불가
  const [, saltB64, hashB64] = stored.split('$');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

export function validateNickname(nickname: unknown): string {
  const value = typeof nickname === 'string' ? nickname.trim() : '';
  if (!NICKNAME_RE.test(value)) throw new AuthError('닉네임은 한글, 영문, 숫자, _ 로 2~12자여야 합니다.');
  return value;
}

export async function signUp(store: Store, username: unknown, password: unknown): Promise<User> {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw new AuthError('아이디는 영문, 숫자, _ 로 4~20자여야 합니다.');
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw new AuthError(`비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다.`);
  }
  if (store.findUserByUsername(username)) throw new AuthError('이미 사용 중인 아이디입니다.', 409);
  const user: User = {
    id: randomUUID(),
    username,
    nickname: null,
    passwordHash: await hashPassword(password),
    createdAt: Date.now(),
  };
  store.createUser(user);
  return user;
}

export async function logIn(store: Store, username: unknown, password: unknown): Promise<User> {
  const user = typeof username === 'string' ? store.findUserByUsername(username) : undefined;
  const ok = user && typeof password === 'string' && (await verifyPassword(password, user.passwordHash));
  if (!ok) throw new AuthError('아이디 또는 비밀번호가 올바르지 않습니다.', 401);
  return user;
}

export const TOSS_NO_PASSWORD = '!';
const TOSS_KEY_RE = /^[A-Za-z0-9_\-=+/.]{8,200}$/;

export const isTossUser = (user: User) => user.passwordHash === TOSS_NO_PASSWORD;

/**
 * 토스 미니앱: 익명 사용자 키(User.getAnonymousKey()의 hash)로 회원을 찾거나 자동으로 만든다.
 * 닉네임은 자동으로 정해 주고, 나중에 바꿀 수 있다.
 */
export function tossLogin(store: Store, tossKey: unknown): { user: User; created: boolean } {
  if (typeof tossKey !== 'string' || !TOSS_KEY_RE.test(tossKey)) throw new AuthError('토스 사용자 키가 올바르지 않습니다.');
  const found = store.findUserByTossKey(tossKey);
  if (found) return { user: found, created: false };
  let nickname: string | null = null;
  for (let i = 0; i < 20 && !nickname; i++) {
    const candidate = `연습생${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`;
    if (!store.nicknameTaken(candidate, '')) nickname = candidate;
  }
  const id = randomUUID();
  const user: User = {
    id,
    username: `toss_${id.replaceAll('-', '').slice(0, 16)}`,
    nickname,
    passwordHash: TOSS_NO_PASSWORD,
    createdAt: Date.now(),
  };
  store.createTossUser(user, tossKey);
  return { user, created: true };
}

export function createSession(store: Store, userId: string): { token: string; expiresAt: number } {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_TTL;
  store.createSession(token, userId, expiresAt);
  return { token, expiresAt };
}

/** IP별 로그인/가입 시도 제한 (1분에 10회) */
export class AttemptLimiter {
  private attempts = new Map<string, number[]>();
  private limit: number;
  private windowMs: number;

  constructor(limit = 10, windowMs = 60_000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  check(key: string) {
    const now = Date.now();
    const recent = (this.attempts.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) throw new AuthError('시도가 너무 많습니다. 잠시 후 다시 시도해주세요.', 429);
    recent.push(now);
    this.attempts.set(key, recent);
  }
}

export const publicUser = (user: User) => ({
  id: user.id,
  username: user.username,
  nickname: user.nickname,
  toss: isTossUser(user),
});

/** 토스 미니앱이 API를 부를 수 있는 출처 (https://{appName}.apps.tossmini.com, ...private-apps.tossmini.com) */
export function tossOrigins(appName: string): string[] {
  return [`https://${appName}.apps.tossmini.com`, `https://${appName}.private-apps.tossmini.com`];
}

export function bearerToken(header: unknown): string | undefined {
  return typeof header === 'string' && /^Bearer\s+\S+$/i.test(header) ? header.split(/\s+/)[1] : undefined;
}
