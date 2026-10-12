import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 검색 노출(T0095): 소유확인 태그, 한글 서비스명, JS 없이 읽히는 정적 소개가 빠지지 않게 지킨다
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('index.html 검색 노출', () => {
  it('네이버 서치어드바이저 소유확인 태그가 있다', () => {
    expect(html).toContain('<meta name="naver-site-verification" content="d4dd32b425b5a2d303164378183a7c7f1f0d6d85" />');
  });

  it('title·description·og에 한글명 블라인드캔들이 들어 있다', () => {
    expect(html).toMatch(/<title>[^<]*블라인드캔들[^<]*<\/title>/);
    expect(html).toMatch(/<meta name="description" content="[^"]*블라인드캔들/);
    expect(html).toMatch(/<meta property="og:title" content="[^"]*블라인드캔들/);
    expect(html).toMatch(/<meta property="og:description" content="[^"]*블라인드캔들/);
  });

  it('#root 안에 정적 h1과 소개 문단이 있다 (앱 렌더 시 덮어씀)', () => {
    const root = html.slice(html.indexOf('<div id="root">'), html.indexOf('<script type="module"'));
    expect(root).toMatch(/<h1[^>]*>[^<]*블라인드캔들/);
    expect(root).toMatch(/<p>[^<]*모의투자/);
    expect(root).toContain('투자 권유가 아닙니다');
  });
});
