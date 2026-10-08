// 차트 퀴즈를 매일 스레드에 올린다
//   node src/quiz/run.ts --dry     퀴즈 하나를 만들어 이미지와 글만 저장 (게시 안 함)
//   node src/quiz/run.ts --now     지금 바로 한 번 게시
//   node src/quiz/run.ts           매일 POST_HOUR_KST 시에 게시 (운영 서버의 quiz 컨테이너)
//
// 스레드 계정은 /auth/threads/start 로 연결한다 (토큰은 quiz/state.json). THREADS_TOKEN 환경 변수로 직접 줄 수도 있다
// 문제 이미지, 정답 이미지, 정답 페이지는 앱이 /quiz/<번호>.png, /quiz/<번호>-answer.png, /quiz/<번호> 로 공개한다

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeQuiz, realText, resultText, threadsText } from './quiz.ts';
import { loadState as load, quizDir, saveState as save, type QuizPage, type QuizState } from './state.ts';
import { postThreads, refreshIfOld } from './threads.ts';

const POST_HOUR_KST = 21;
const SITE = process.env.SITE_URL ?? 'https://blindcandle.com';
const dbPath = process.env.DB_PATH ?? fileURLToPath(new URL('../../data/results.db', import.meta.url));
const QUIZ_DIR = quizDir(dbPath);
const loadState = () => load(QUIZ_DIR);
const saveState = (s: QuizState) => save(QUIZ_DIR, s);

function kstDay(ms = Date.now()) {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}

const connected = () => Boolean(process.env.THREADS_TOKEN || loadState().threads);

async function runOnce(dry: boolean) {
  mkdirSync(QUIZ_DIR, { recursive: true });
  const state = loadState();
  const number = state.count + 1;
  const quiz = await makeQuiz(number);
  writeFileSync(join(QUIZ_DIR, `${number}.png`), quiz.png);
  writeFileSync(join(QUIZ_DIR, `${number}-answer.png`), quiz.answerPng);
  const page: QuizPage = { number, up: quiz.changePct >= 0, result: resultText(quiz), real: realText(quiz) };
  writeFileSync(join(QUIZ_DIR, `${number}.json`), JSON.stringify(page));
  const post = threadsText(quiz);

  if (dry) {
    writeFileSync(join(QUIZ_DIR, `${number}.txt`), post.text);
    console.log(`미리보기 저장: ${join(QUIZ_DIR, `${number}.png`)}`);
    return;
  }

  const entry: QuizState['log'][number] = { number, at: new Date().toISOString() };
  try {
    // 갱신한 토큰은 state에 남기고, 환경 변수 토큰은 처음 한 번만 쓴다
    state.threads = await refreshIfOld(state.threads ?? { token: process.env.THREADS_TOKEN!, refreshedAt: Date.now() });
    saveState(state);
    entry.threads = await postThreads(state.threads.token, { imageUrl: `${SITE}/quiz/${number}.png`, ...post });
    state.count = number;
    state.lastPostedDay = kstDay();
  } catch (err) {
    entry.error = (err as Error).message;
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
  if (!connected()) console.log('스레드 계정이 연결되지 않아 대기합니다 (/auth/threads/start).');
  for (;;) {
    await new Promise((r) => setTimeout(r, msUntilNextPost()));
    if (loadState().lastPostedDay === kstDay() || !connected()) continue;
    await runOnce(false).catch((err) => console.error(err));
  }
}
