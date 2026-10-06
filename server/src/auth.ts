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

export const publicUser = (user: User) => ({ id: user.id, username: user.username, nickname: user.nickname });
