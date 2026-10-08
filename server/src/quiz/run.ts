// 차트 퀴즈를 매일 스레드와 X에 올린다
//   node src/quiz/run.ts --dry     퀴즈 하나를 만들어 이미지와 글만 저장 (게시 안 함)
//   node src/quiz/run.ts --now     지금 바로 한 번 게시
//   node src/quiz/run.ts           매일 POST_HOUR_KST 시에 게시 (운영 서버의 quiz 컨테이너)
//
// 환경 변수 (deploy/secrets.env): THREADS_TOKEN, X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
// 둘 중 설정된 곳에만 올린다. 이미지는 앱이 /quiz/<번호>.png 로 공개한다 (스레드는 공개 URL이 필요)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeQuiz, threadsText, xTexts } from './quiz.ts';
import { postThreads, refreshIfOld, type ThreadsToken } from './threads.ts';
import { postX, type XCredentials } from './x.ts';

const POST_HOUR_KST = 21;
const SITE = process.env.SITE_URL ?? 'https://blindcandle.com';
const dbPath = process.env.DB_PATH ?? fileURLToPath(new URL('../../data/results.db', import.meta.url));
export const QUIZ_DIR = join(dirname(dbPath), 'quiz');
const STATE_FILE = join(QUIZ_DIR, 'state.json');

interface State {
  count: number;
  /** 마지막으로 게시한 날 (KST, YYYY-MM-DD). 재시작해도 하루 두 번 올리지 않는다 */
  lastPostedDay?: string;
  threads?: ThreadsToken;
  log: { number: number; at: string; threads?: string; x?: string; error?: string }[];
}

function loadState(): State {
  if (!existsSync(STATE_FILE)) return { count: 0, log: [] };
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as State;
}

function saveState(s: State) {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

function kstDay(ms = Date.now()) {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}

function xCredentials(): XCredentials | null {
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET } = process.env;
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_SECRET) return null;
  return { apiKey: X_API_KEY, apiSecret: X_API_SECRET, accessToken: X_ACCESS_TOKEN, accessSecret: X_ACCESS_SECRET };
}

async function runOnce(dry: boolean) {
  mkdirSync(QUIZ_DIR, { recursive: true });
  const state = loadState();
  const number = state.count + 1;
  const quiz = await makeQuiz(number);
  const png = join(QUIZ_DIR, `${number}.png`);
  writeFileSync(png, quiz.png);
  const th = threadsText(quiz);
  const x = xTexts(quiz);

  if (dry) {
    writeFileSync(join(QUIZ_DIR, `${number}.txt`), `[스레드]\n${th.text}\n\n[X 글]\n${x.post}\n\n[X 답글]\n${x.reply}\n`);
    console.log(`미리보기 저장: ${png}`);
    return;
  }

  const entry: State['log'][number] = { number, at: new Date().toISOString() };
  const errors: string[] = [];

  const initialToken = process.env.THREADS_TOKEN;
  if (state.threads || initialToken) {
    try {
      // 갱신한 토큰은 state에 남기고, 처음 한 번만 환경 변수 토큰을 쓴다
      state.threads = await refreshIfOld(state.threads ?? { token: initialToken!, refreshedAt: Date.now() });
      saveState(state);
      entry.threads = await postThreads(state.threads.token, { imageUrl: `${SITE}/quiz/${number}.png`, ...th });
    } catch (err) {
      errors.push(`threads: ${(err as Error).message}`);
    }
  }

  const xc = xCredentials();
  if (xc) {
    try {
      entry.x = (await postX(xc, { png: quiz.png, text: x.post, reply: x.reply })).postId;
    } catch (err) {
      errors.push(`x: ${(err as Error).message}`);
    }
  }

  if (errors.length) entry.error = errors.join(' | ');
  // 한 곳이라도 올라갔으면 번호를 쓴 것으로 본다
  if (entry.threads || entry.x) {
    state.count = number;
    state.lastPostedDay = kstDay();
  }
  state.log.push(entry);
  saveState(state);
  console.log(JSON.stringify(entry));
}

function msUntilNextPost() {
  const now = Date.now();
  const kst = new Date(now + 9 * 3600_000);
  let target = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), POST_HOUR_KST) - 9 * 3600_000;
  if (target <= now) target += 24 * 3600_000;
  return target - now;
}

const args = process.argv.slice(2);
if (args.includes('--dry') || args.includes('--now')) {
  await runOnce(args.includes('--dry'));
} else {
  if (!process.env.THREADS_TOKEN && !xCredentials() && !loadState().threads) {
    console.log('게시할 계정 설정이 없어 대기합니다 (deploy/secrets.env).');
  }
  for (;;) {
    await new Promise((r) => setTimeout(r, msUntilNextPost()));
    if (loadState().lastPostedDay === kstDay()) continue;
    if (!process.env.THREADS_TOKEN && !xCredentials() && !loadState().threads) continue;
    await runOnce(false).catch((err) => console.error(err));
  }
}
