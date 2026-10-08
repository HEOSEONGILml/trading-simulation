// 퀴즈 게시 상태 (번호, 스레드 토큰, 게시 기록). 데이터 볼륨의 quiz/state.json 에 둔다

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ThreadsToken } from './threads.ts';

export interface QuizState {
  count: number;
  /** 마지막으로 게시한 날 (KST, YYYY-MM-DD). 재시작해도 하루 두 번 올리지 않는다 */
  lastPostedDay?: string;
  threads?: ThreadsToken;
  log: { number: number; at: string; threads?: string; error?: string }[];
}

/** 정답 페이지에 보여 줄 내용 (quiz/<번호>.json) */
export interface QuizPage {
  number: number;
  up: boolean;
  result: string;
  real: string;
}

export function quizDir(dbPath: string) {
  return join(dirname(dbPath), 'quiz');
}

export function loadState(dir: string): QuizState {
  const file = join(dir, 'state.json');
  if (!existsSync(file)) return { count: 0, log: [] };
  return JSON.parse(readFileSync(file, 'utf8')) as QuizState;
}

export function saveState(dir: string, s: QuizState) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'state.json'), JSON.stringify(s, null, 2));
}
