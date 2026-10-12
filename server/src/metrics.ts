// 검증 지표 출력 (정의는 docs/metrics.md)
//   node src/metrics.ts [--markdown] [--since <시각>]
//   운영 서버: deploy/metrics.sh 가 docker compose exec 로 실행한다
// --since 또는 METRICS_SINCE: 이 시각 이전 가입자를 뺀다 (ISO 시각 또는 밀리초)
// METRICS_EXCLUDE_USER_IDS: 쉼표로 구분한 회원 ID (출력에는 제외 인원수만 나온다)
// 출력은 집계값뿐이다. 회원 ID·닉네임·토스 키는 출력하지 않는다.

import { fileURLToPath } from 'node:url';
import { MIN_SAMPLE, Store, kstDate } from './db.ts';

type Metrics = ReturnType<Store['metrics']>;
type ChannelMetrics = Metrics['channels']['toss'];

export function parseTime(value: string): number {
  const ms = /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`시각을 읽을 수 없습니다: ${value}`);
  return ms;
}

export function kstTime(at: number): string {
  return `${new Date(at + 9 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')} KST`;
}

const rate = (a: number, b: number, p: number | null) => (b ? `${p}% (${a}/${b})` : '-');

function retentionCell(r: { eligible: number; returned: number; pct: number | null; mature: boolean }, signups: number) {
  if (r.mature) return rate(r.returned, r.eligible, r.pct);
  if (!r.eligible) return '미성숙';
  return `미성숙 (판정 가능 ${r.eligible}/${signups}명 중 ${rate(r.returned, r.eligible, r.pct)})`;
}

function cohortTable(m: ChannelMetrics): string {
  if (!m.cohorts.length) return '_해당 기간 가입자 없음_\n';
  const rows = m.cohorts.map((c) => {
    const f = c.firstRound7d;
    const completion = `${rate(f.finished, f.started, f.pct)}${f.mature ? '' : ' 미성숙'}`;
    return `| ${c.week} | ${c.signups} | ${f.started} | ${completion} | ${retentionCell(c.d1, c.signups)} | ${retentionCell(c.d7, c.signups)} | ${c.smallSample ? '표본 부족' : '판정 가능'} |`;
  });
  return [
    '| 가입 주(KST 월요일) | 가입자 | 7일 안 첫 판 시작 | 7일 안 첫 판 완료율 (완료/시작) | D1 재방문율 | 7일 재방문율 | 표본 |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

function summaryRow(name: string, m: ChannelMetrics) {
  const f = m.firstRound;
  return `| ${name} | ${m.users} | ${rate(f.finished, f.started, f.completionPct)} | ${rate(m.retentionD1.returned, m.retentionD1.eligible, m.retentionD1.pct)} | ${rate(m.retention7d.returned, m.retention7d.cohort, m.retention7d.pct)} | ${m.last7Days.signups} | ${m.last7Days.activeUsers} | ${m.last7Days.finishedRounds} |`;
}

export function toMarkdown(m: Metrics, command: string): string {
  const ex = m.excluded;
  const basis = ex.since === null ? '기준 시각 없음' : `기준 시각 ${kstTime(ex.since)} 이전 가입자`;
  return [
    `### ${kstDate(m.generatedAt)} 기록 (집계 기준 시각 ${kstTime(m.generatedAt)})`,
    '',
    `- 실행한 명령: \`${command}\``,
    `- 제외한 회원 수 ${ex.total}명, 기준: ${basis} ${ex.beforeSince}명 + 지정한 테스트 계정 ${ex.byId}명`,
    `- 표본 기준: 코호트 가입자 ${MIN_SAMPLE}명 미만이면 '표본 부족' (판정 보류)`,
    '',
    '#### toss 채널: 가입 주별 코호트',
    '',
    cohortTable(m.channels.toss),
    '#### 채널별 요약 (누적)',
    '',
    '| 채널 | 회원 | 누적 첫 판 완료율 (완료/시작) | D1 재방문율 | 7일 재방문율 | 지난 7일 가입 | 지난 7일 활성 | 지난 7일 완료 판 |',
    '|---|---|---|---|---|---|---|---|',
    summaryRow('toss', m.channels.toss),
    summaryRow('web', m.channels.web),
    summaryRow('전체', m),
    '',
    '#### web 채널: 가입 주별 코호트 (참고)',
    '',
    cohortTable(m.channels.web),
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const sinceIdx = args.indexOf('--since');
  const sinceRaw = sinceIdx >= 0 ? args[sinceIdx + 1] : process.env.METRICS_SINCE;
  const excludeUserIds = (process.env.METRICS_EXCLUDE_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const dbPath = process.env.DB_PATH ?? fileURLToPath(new URL('../data/results.db', import.meta.url));
  const store = new Store(dbPath);
  const metrics = store.metrics(Date.now(), { since: sinceRaw ? parseTime(sinceRaw) : undefined, excludeUserIds });
  store.close();
  if (args.includes('--markdown')) {
    const command = process.env.METRICS_COMMAND ?? `node server/src/metrics.ts ${args.join(' ')}`.trim();
    console.log(toMarkdown(metrics, command));
  } else {
    console.log(JSON.stringify(metrics, null, 2));
  }
}
