// 퀴즈 정답 페이지 (/quiz/<번호>). 스레드 본문의 가린 정답 안에 링크가 들어간다
// 링크 미리보기가 정답을 드러내지 않도록 og:image는 문제 이미지로 둔다

import type { QuizPage } from './state.ts';

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function quizAnswerPage(p: QuizPage) {
  const title = `BlindCandle 차트 퀴즈 #${p.number} 정답`;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="날짜와 가격을 가린 실제 BTC 선물 차트 퀴즈의 정답입니다.">
<meta property="og:type" content="article">
<meta property="og:site_name" content="BlindCandle">
<meta property="og:title" content="BlindCandle 차트 퀴즈 #${p.number}">
<meta property="og:description" content="4시간 뒤 가격은? 상승 / 하락">
<meta property="og:image" content="https://blindcandle.com/quiz/${p.number}.png">
<meta name="robots" content="noindex">
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #161a1e; color: #eaecef; font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; }
  main { max-width: 640px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 20px; margin: 0 0 16px; }
  h1 span { color: #f0b90b; }
  img { width: 100%; height: auto; border-radius: 8px; display: block; }
  .result { font-size: 28px; font-weight: 700; margin: 20px 0 4px; color: ${p.up ? '#2ebd85' : '#f6465d'}; }
  .real { color: #848e9c; margin: 0 0 28px; }
  .cta { display: block; text-align: center; background: #f0b90b; color: #161a1e; font-weight: 700; text-decoration: none; padding: 16px; border-radius: 8px; }
  .note { color: #848e9c; font-size: 13px; margin-top: 16px; text-align: center; }
</style>
</head>
<body>
<main>
  <h1><span>◆</span> ${esc(title)}</h1>
  <img src="/quiz/${p.number}-answer.png" alt="가렸던 4시간을 채운 정답 차트" width="1080" height="1080">
  <p class="result">${esc(p.result)}</p>
  <p class="real">${esc(p.real)}</p>
  <a class="cta" href="/">가린 차트로 직접 매매해 보기</a>
  <p class="note">모의 매매 연습 도구이며 투자 권유가 아닙니다.</p>
</main>
</body>
</html>`;
}
