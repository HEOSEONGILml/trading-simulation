// 회원, 세션, 회원별 설정, 진행 중인 라운드, 라운드 결과 저장 (SQLite)

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
  profitMinutes: number;
  lossMinutes: number;
  trades: unknown[];
}

export interface RoundRecord extends Omit<RoundResultInput, 'trades' | 'profitMinutes' | 'lossMinutes'> {
  /** 미실현 수익/손실 시간 (분). 집계 기능 이전의 기록은 null */
  profitMinutes: number | null;
  lossMinutes: number | null;
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

/** 진행 중인 라운드. 세션을 나갔다가 돌아와도 이어서 할 수 있도록 저장한다 */
export interface ActiveRound {
  id: string;
  userId: string;
  settings: { rangeStart: number; rangeEnd: number; historyMinutes: number; hideDate: boolean; hidePrice: boolean };
  realStartTime: number;
  dateOffset: number;
  priceFactor: number;
  pricePrecision: number;
  createdAt: number;
  /** 클라이언트가 보낸 진행 상태 (아직 저장된 적이 없으면 null) */
  state: unknown;
}

export type RankingSort = 'compound' | 'average' | 'winrate';
export type EventType = 'signup' | 'visit' | 'round_start' | 'round_finish';
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
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        settings_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS active_rounds (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        settings_json TEXT NOT NULL,
        real_start_time INTEGER NOT NULL,
        date_offset INTEGER NOT NULL,
        price_factor REAL NOT NULL,
        price_precision INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        state_json TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_user ON events(user_id, at);
    `);
    // 회원 기능 이전에 만든 DB에는 user_id 컬럼이 없다
    const columns = this.db.prepare('PRAGMA table_info(rounds)').all() as { name: string }[];
    if (!columns.some((c) => c.name === 'user_id')) {
      this.db.exec('ALTER TABLE rounds ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE');
    }
    // 미실현 수익/손실 시간은 나중에 추가된 컬럼이다
    if (!columns.some((c) => c.name === 'profit_minutes')) {
      this.db.exec('ALTER TABLE rounds ADD COLUMN profit_minutes INTEGER');
      this.db.exec('ALTER TABLE rounds ADD COLUMN loss_minutes INTEGER');
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS rounds_user ON rounds(user_id, played_at)');
  }

  close() {
    this.db.close();
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

  /** 세션, 설정, 라운드, 기록, 이벤트는 외래 키로 함께 삭제된다 */
  deleteUser(id: string) {
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  // ---------- 이용 지표용 이벤트 ----------

  logEvent(userId: string, type: EventType, at = Date.now()) {
    this.db.prepare('INSERT INTO events (user_id, type, at) VALUES (?, ?, ?)').run(userId, type, at);
  }

  /** 방문은 회원별로 하루(한국 시간)에 한 번만 기록한다 */
  logVisit(userId: string, at = Date.now()) {
    const seen = this.db
      .prepare("SELECT 1 FROM events WHERE user_id = ? AND type = 'visit' AND at >= ?")
      .get(userId, kstDayStart(at));
    if (!seen) this.logEvent(userId, 'visit', at);
  }

  /** 검증 지표 (PLAN.md 4장) */
  metrics(now = Date.now()) {
    const users = this.db.prepare('SELECT id, created_at FROM users').all() as { id: string; created_at: number }[];
    const events = this.db.prepare('SELECT user_id, type, at FROM events').all() as {
      user_id: string;
      type: EventType;
      at: number;
    }[];
    const byUser = new Map<string, { type: EventType; at: number }[]>();
    for (const e of events) {
      const list = byUser.get(e.user_id) ?? [];
      list.push(e);
      byUser.set(e.user_id, list);
    }
    const has = (userId: string, type: EventType) => (byUser.get(userId) ?? []).some((e) => e.type === type);
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

    // 첫 판 완료율: 라운드를 시작해본 회원 중 한 판이라도 끝까지 마친 비율
    const starters = users.filter((u) => has(u.id, 'round_start'));
    const finishers = starters.filter((u) => has(u.id, 'round_finish'));

    // 7일 재방문율: 가입 후 8일이 지난 회원 중 가입 다음 날부터 7일 안에 다시 활동한 비율
    const matured = users.filter((u) => u.created_at <= now - 8 * DAY);
    const returned = matured.filter((u) => {
      const from = kstDayStart(u.created_at) + DAY;
      return (byUser.get(u.id) ?? []).some((e) => e.at >= from && e.at < from + 7 * DAY);
    });

    const weekAgo = now - 7 * DAY;
    const activeUsers = new Set(events.filter((e) => e.at >= weekAgo).map((e) => e.user_id)).size;
    const finishedRounds = events.filter((e) => e.type === 'round_finish' && e.at >= weekAgo).length;

    return {
      users: users.length,
      firstRound: { started: starters.length, finished: finishers.length, completionPct: pct(finishers.length, starters.length) },
      retention7d: { cohort: matured.length, returned: returned.length, pct: pct(returned.length, matured.length) },
      last7Days: {
        signups: users.filter((u) => u.created_at >= weekAgo).length,
        activeUsers,
        finishedRounds,
        roundsPerActiveUser: activeUsers ? Math.round((finishedRounds / activeUsers) * 10) / 10 : null,
      },
    };
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

  // ---------- 회원별 설정 ----------

  getSettings(userId: string): unknown {
    const row = this.db.prepare('SELECT settings_json FROM user_settings WHERE user_id = ?').get(userId) as Row | undefined;
    return row ? JSON.parse(row.settings_json) : null;
  }

  saveSettings(userId: string, settings: unknown) {
    this.db
      .prepare(
        `INSERT INTO user_settings (user_id, settings_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at`,
      )
      .run(userId, JSON.stringify(settings), Date.now());
  }

  // ---------- 진행 중인 라운드 ----------

  /** 회원당 하나만 유지한다. 새 라운드를 만들면 이전 라운드는 버려진다 */
  saveActiveRound(round: ActiveRound) {
    this.db.prepare('DELETE FROM active_rounds WHERE user_id = ?').run(round.userId);
    this.db
      .prepare(
        `INSERT INTO active_rounds (id, user_id, settings_json, real_start_time, date_offset, price_factor, price_precision,
          created_at, state_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        round.id,
        round.userId,
        JSON.stringify(round.settings),
        round.realStartTime,
        round.dateOffset,
        round.priceFactor,
        round.pricePrecision,
        round.createdAt,
        round.state == null ? null : JSON.stringify(round.state),
        Date.now(),
      );
  }

  /** id를 생략하면 회원의 진행 중인 라운드 */
  getActiveRound(userId: string, id?: string): ActiveRound | undefined {
    const row = (
      id === undefined
        ? this.db.prepare('SELECT * FROM active_rounds WHERE user_id = ?').get(userId)
        : this.db.prepare('SELECT * FROM active_rounds WHERE user_id = ? AND id = ?').get(userId, id)
    ) as Row | undefined;
    return row && toActiveRound(row);
  }

  saveRoundState(userId: string, id: string, state: unknown): boolean {
    return (
      this.db
        .prepare('UPDATE active_rounds SET state_json = ?, updated_at = ? WHERE id = ? AND user_id = ?')
        .run(JSON.stringify(state), Date.now(), id, userId).changes > 0
    );
  }

  deleteActiveRound(userId: string, id: string) {
    this.db.prepare('DELETE FROM active_rounds WHERE id = ? AND user_id = ?').run(id, userId);
  }

  // ---------- 라운드 기록 ----------

  insertRound(record: RoundRecord) {
    this.db
      .prepare(
        `INSERT INTO rounds (id, user_id, played_at, real_start_time, real_end_time, candle_count, hide_date, hide_price,
          date_offset, price_factor, start_equity, end_equity, return_pct, realized_pnl, fees, trade_count, win_count,
          max_drawdown_pct, liquidation_count, profit_minutes, loss_minutes, trades_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        record.profitMinutes,
        record.lossMinutes,
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

const DAY = 24 * 3600_000;
const KST_OFFSET = 9 * 3600_000;

/** at이 속한 한국 시간 날짜의 0시 (UTC 밀리초) */
function kstDayStart(at: number): number {
  return Math.floor((at + KST_OFFSET) / DAY) * DAY - KST_OFFSET;
}

function toUser(r: Row): User {
  return { id: r.id, username: r.username, nickname: r.nickname, passwordHash: r.password_hash, createdAt: r.created_at };
}

function toActiveRound(r: Row): ActiveRound {
  return {
    id: r.id,
    userId: r.user_id,
    settings: JSON.parse(r.settings_json),
    realStartTime: r.real_start_time,
    dateOffset: r.date_offset,
    priceFactor: r.price_factor,
    pricePrecision: r.price_precision,
    createdAt: r.created_at,
    state: r.state_json === null ? null : JSON.parse(r.state_json),
  };
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
    profitMinutes: r.profit_minutes,
    lossMinutes: r.loss_minutes,
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
    totalProfitMinutes: sum((r) => r.profitMinutes ?? 0),
    totalLossMinutes: sum((r) => r.lossMinutes ?? 0),
  };
}
