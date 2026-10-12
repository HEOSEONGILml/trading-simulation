import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 검색용 안내 페이지(T0096): 고유 title·description·h1, 고지문, 내부 링크, sitemap 포함을 지킨다
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const PAGES = ['index.html', 'coin-futures-mock-trading.html', 'long-short-leverage.html', 'chart-practice.html'];
const pick = (html: string, re: RegExp) => html.match(re)?.[1] ?? '';

describe('guide 페이지', () => {
  const pages = PAGES.map((name) => ({ name, html: read(`../public/guide/${name}`) }));

  it('title·description·h1이 있고 서로 겹치지 않는다', () => {
    for (const re of [/<title>([^<]+)<\/title>/, /<meta name="description" content="([^"]+)"/, /<h1>([^<]+)<\/h1>/]) {
      const values = pages.map((p) => pick(p.html, re));
      values.forEach((v) => expect(v.length).toBeGreaterThan(4));
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('투자 권유 아님 고지와 홈 링크가 있고, 금지 표현이 없다', () => {
    for (const { html } of pages) {
      expect(html).toContain('투자 권유가 아닙니다');
      expect(html).toContain('href="/"');
      expect(html).not.toMatch(/수익 보장|고수익|추천 종목|무조건/);
    }
  });

  it('FAQ 구조화 데이터가 올바른 JSON이다', () => {
    for (const { html } of pages) {
      const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (m) expect(() => JSON.parse(m[1])).not.toThrow();
    }
  });

  it('sitemap과 홈에서 모든 안내 페이지로 링크된다', () => {
    const sitemap = read('../public/sitemap.xml');
    const home = read('../index.html');
    for (const name of PAGES) {
      const path = name === 'index.html' ? '/guide/' : `/guide/${name}`;
      expect(sitemap).toContain(`<loc>https://blindcandle.com${path}</loc>`);
      expect(home).toContain(`href="${path}"`);
    }
  });
});
