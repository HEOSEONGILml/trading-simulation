// 회원, 세션, 라운드 결과 저장 (SQLite)

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface RoundResultInput {
  candleCount: number;
  startEquity: number;
  endEquity: number;
  realizedPnl: number;
  fees: number;
  tradeCount: number;
  winCount: number;
  maxDrawdownPct: number;
  liquidationCount: number;
  trades: unknown[];
}

export interface RoundRecord extends Omit<RoundResultInput, 'trades'> {
  id: string;
  userId: string;
  playedAt: number;
  realStartTime: number;
  realEndTime: number;
  hideDate: boolean;
  hidePrice: boolean;
  returnPct: number;
  dateOffset: number;
  priceFactor: number;
  trades: unknown[];
}

export interface User {
  id: string;
  username: string;
  nickname: string | null;
  passwordHash: string;
  createdAt: number;
}

export type RankingSort = 'compound' | 'average' | 'winrate';
export const RANKING_MIN_ROUNDS = 5;

type Row = Record<string, never>;

export class Store {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        nickname TEXT UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rounds (
        id TEXT PRIMARY KEY,
        played_at INTEGER NOT NULL,
        real_start_time INTEGER NOT NULL,
        real_end_time INTEGER NOT NULL,
        candle_count INTEGER NOT NULL,
        hide_date INTEGER NOT NULL,
        hide_price INTEGER NOT NULL,
        date_offset INTEGER NOT NULL,
        price_factor REAL NOT NULL,
        start_equity REAL NOT NULL,
        end_equity REAL NOT NULL,
        return_pct REAL NOT NULL,
        realized_pnl REAL NOT NULL,
        fees REAL NOT NULL,
        trade_count INTEGER NOT NULL,
        win_count INTEGER NOT NULL,
        max_drawdown_pct REAL NOT NULL,
        liquidation_count INTEGER NOT NULL,
        trades_json TEXT NOT NULL
      );
    `);
    // 회원 기능 이전에 만든 DB에는 user_id 컬럼이 없다
    const columns = this.db.prepare('PRAGMA table_info(rounds)').all() as { name: string }[];
    if (!columns.some((c) => c.name === 'user_id')) {
      this.db.exec('ALTER TABLE rounds ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE');
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS rounds_user ON rounds(user_id, played_at)');
  }

  // ---------- 회원 ----------

  createUser(user: User) {
    this.db
      .prepare('INSERT INTO users (id, username, nickname, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(user.id, user.username, user.nickname, user.passwordHash, user.createdAt);
  }

  findUserByUsername(username: string): User | undefined {
    const row = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as Row | undefined;
    return row && toUser(row);
  }

  findUserById(id: string): User | undefined {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row | undefined;
    return row && toUser(row);
  }

  nicknameTaken(nickname: string, exceptUserId: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM users WHERE nickname = ? AND id != ?').get(nickname, exceptUserId);
  }

  setNickname(userId: string, nickname: string) {
    this.db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nickname, userId);
  }

  // ---------- 세션 ----------

  createSession(token: string, userId: string, expiresAt: number) {
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    this.db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  }

  findSessionUser(token: string): User | undefined {
    const row = this.db
      .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?')
      .get(token, Date.now()) as Row | undefined;
    return row && toUser(row);
  }

  deleteSession(token: string) {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  // ---------- 라운드 기록 ----------

  insertRound(record: RoundRecord) {
    this.db
      .prepare(
        `INSERT INTO rounds (id, user_id, played_at, real_start_time, real_end_time, candle_count, hide_date, hide_price,
          date_offset, price_factor, start_equity, end_equity, return_pct, realized_pnl, fees, trade_count, win_count,
          max_drawdown_pct, liquidation_count, trades_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.userId,
        record.playedAt,
        record.realStartTime,
        record.realEndTime,
        record.candleCount,
        record.hideDate ? 1 : 0,
        record.hidePrice ? 1 : 0,
        record.dateOffset,
        record.priceFactor,
        record.startEquity,
        record.endEquity,
        record.returnPct,
        record.realizedPnl,
        record.fees,
        record.tradeCount,
        record.winCount,
        record.maxDrawdownPct,
        record.liquidationCount,
        JSON.stringify(record.trades),
      );
  }

  listRounds(userId: string): RoundRecord[] {
    const rows = this.db.prepare('SELECT * FROM rounds WHERE user_id = ? ORDER BY played_at DESC').all(userId) as Row[];
    return rows.map(toRecord);
  }

  getRound(userId: string, id: string): RoundRecord | undefined {
    const row = this.db.prepare('SELECT * FROM rounds WHERE id = ? AND user_id = ?').get(id, userId) as Row | undefined;
    return row && toRecord(row);
  }

  deleteRound(userId: string, id: string): boolean {
    return this.db.prepare('DELETE FROM rounds WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
  }

  ranking(sort: RankingSort) {
    const rows = this.db
      .prepare(
        `SELECT u.id AS user_id, u.nickname, r.return_pct, r.trade_count, r.win_count
         FROM rounds r JOIN users u ON u.id = r.user_id
         WHERE u.nickname IS NOT NULL
         ORDER BY r.played_at`,
      )
      .all() as { user_id: string; nickname: string; return_pct: number; trade_count: number; win_count: number }[];

    const byUser = new Map<string, { nickname: string; returns: number[]; tradeCount: number; winCount: number }>();
    for (const r of rows) {
      const entry = byUser.get(r.user_id) ?? { nickname: r.nickname, returns: [], tradeCount: 0, winCount: 0 };
      entry.returns.push(r.return_pct);
      entry.tradeCount += r.trade_count;
      entry.winCount += r.win_count;
      byUser.set(r.user_id, entry);
    }

    const entries = [...byUser.entries()].map(([userId, e]) => {
      const n = e.returns.length;
      return {
        userId,
        nickname: e.nickname,
        roundCount: n,
        compoundReturnPct: (e.returns.reduce((acc, r) => acc * (1 + r / 100), 1) - 1) * 100,
        avgReturnPct: e.returns.reduce((a, b) => a + b, 0) / n,
        profitableRoundPct: (e.returns.filter((r) => r > 0).length / n) * 100,
        tradeWinRatePct: e.tradeCount ? (e.winCount / e.tradeCount) * 100 : 0,
        bestReturnPct: Math.max(...e.returns),
      };
    });

    const key = { compound: 'compoundReturnPct', average: 'avgReturnPct', winrate: 'profitableRoundPct' } as const;
    return entries
      .filter((e) => sort === 'compound' || e.roundCount >= RANKING_MIN_ROUNDS)
      .sort((a, b) => b[key[sort]] - a[key[sort]] || b.roundCount - a.roundCount)
      .map((e, i) => ({ rank: i + 1, ...e }));
  }
}

function toUser(r: Row): User {
  return { id: r.id, username: r.username, nickname: r.nickname, passwordHash: r.password_hash, createdAt: r.created_at };
}

function toRecord(r: Row): RoundRecord {
  return {
    id: r.id,
    userId: r.user_id,
    playedAt: r.played_at,
    realStartTime: r.real_start_time,
    realEndTime: r.real_end_time,
    candleCount: r.candle_count,
    hideDate: r.hide_date === 1,
    hidePrice: r.hide_price === 1,
    dateOffset: r.date_offset,
    priceFactor: r.price_factor,
    startEquity: r.start_equity,
    endEquity: r.end_equity,
    returnPct: r.return_pct,
    realizedPnl: r.realized_pnl,
    fees: r.fees,
    tradeCount: r.trade_count,
    winCount: r.win_count,
    maxDrawdownPct: r.max_drawdown_pct,
    liquidationCount: r.liquidation_count,
    trades: JSON.parse(r.trades_json),
  };
}

export function summarize(records: RoundRecord[]) {
  const n = records.length;
  const sum = (f: (r: RoundRecord) => number) => records.reduce((acc, r) => acc + f(r), 0);
  const tradeCount = sum((r) => r.tradeCount);
  const winCount = sum((r) => r.winCount);
  const returns = records.map((r) => r.returnPct);
  return {
    roundCount: n,
    profitableRounds: records.filter((r) => r.returnPct > 0).length,
    avgReturnPct: n ? sum((r) => r.returnPct) / n : 0,
    compoundReturnPct: n ? (records.reduce((acc, r) => acc * (1 + r.returnPct / 100), 1) - 1) * 100 : 0,
    bestReturnPct: n ? Math.max(...returns) : 0,
    worstReturnPct: n ? Math.min(...returns) : 0,
    avgMaxDrawdownPct: n ? sum((r) => r.maxDrawdownPct) / n : 0,
    tradeCount,
    winCount,
    tradeWinRatePct: tradeCount ? (winCount / tradeCount) * 100 : 0,
    totalFees: sum((r) => r.fees),
    liquidationCount: sum((r) => r.liquidationCount),
    totalMinutes: sum((r) => r.candleCount),
  };
}
