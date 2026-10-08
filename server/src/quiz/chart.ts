// 퀴즈 이미지: 가린 차트를 SVG로 그려 PNG로 변환한다 (1080×1080, 스레드와 X 공용)

import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import type { Candle } from '../binance.ts';

const SIZE = 1080;
const PAD = 48;
const HEADER = 150;
const FOOTER = 150;
const AXIS = 120;
const VOLUME = 110;

const COLOR = {
  bg: '#161a1e',
  panel: '#1e2329',
  grid: '#2b3139',
  text: '#eaecef',
  muted: '#848e9c',
  up: '#2ebd85',
  down: '#f6465d',
  accent: '#f0b90b',
};

// 어느 서버에서 만들어도 같게 보이도록 글꼴 파일을 함께 둔다 (Pretendard, SIL OFL)
const FONT_DIR = fileURLToPath(new URL('../../assets/fonts/', import.meta.url));
const FONT_FILES = ['Pretendard-Regular.otf', 'Pretendard-Bold.otf'].map((f) => FONT_DIR + f);
const FONT = 'Pretendard';

export interface QuizChartInput {
  number: number;
  /** 가린 가격과 시각으로 바꾼 봉 */
  candles: Candle[];
  /** 정답 구간 길이(봉 개수). 차트 오른쪽에 물음표 구간으로 비워 둔다 */
  futureBars: number;
  pricePrecision: number;
  intervalLabel: string;
  horizonLabel: string;
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 보기 좋은 눈금 간격 (1, 2, 5 × 10^n) */
function niceStep(range: number, ticks: number) {
  const raw = range / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
}

function kstTime(ms: number) {
  const d = new Date(ms + 9 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function quizSvg(input: QuizChartInput): string {
  const { candles, futureBars, pricePrecision } = input;
  const left = PAD;
  const right = SIZE - PAD - AXIS;
  const top = HEADER + 20;
  const bottom = SIZE - FOOTER - VOLUME - 20;
  const volTop = bottom + 16;
  const volBottom = SIZE - FOOTER - 20;

  const slots = candles.length + futureBars;
  const slotW = (right - left) / slots;
  const bodyW = Math.max(2, slotW * 0.62);

  let hi = -Infinity;
  let lo = Infinity;
  let maxVol = 0;
  for (const c of candles) {
    hi = Math.max(hi, c[2]);
    lo = Math.min(lo, c[3]);
    maxVol = Math.max(maxVol, c[5]);
  }
  const margin = (hi - lo) * 0.08 || hi * 0.001;
  hi += margin;
  lo -= margin;
  const y = (p: number) => top + ((hi - p) / (hi - lo)) * (bottom - top);
  const x = (i: number) => left + slotW * (i + 0.5);

  const parts: string[] = [];
  parts.push(`<rect width="${SIZE}" height="${SIZE}" fill="${COLOR.bg}"/>`);

  // 머리말
  parts.push(
    `<text x="${PAD}" y="${PAD + 40}" font-family="${FONT}" font-size="44" font-weight="700" fill="${COLOR.text}">` +
      `<tspan fill="${COLOR.accent}">◆</tspan> BlindCandle 차트 퀴즈 <tspan fill="${COLOR.accent}">#${input.number}</tspan></text>`,
  );
  parts.push(
    `<text x="${PAD}" y="${PAD + 92}" font-family="${FONT}" font-size="28" fill="${COLOR.muted}">` +
      esc(`BTCUSDT 무기한 · ${input.intervalLabel} · 날짜와 가격은 가렸습니다`) +
      `</text>`,
  );

  // 가격 눈금 (마지막 가격 표시와 겹치는 글자는 생략)
  const lastY = y(candles[candles.length - 1][4]);
  const step = niceStep(hi - lo, 5);
  for (let p = Math.ceil(lo / step) * step; p <= hi; p += step) {
    const yy = y(p).toFixed(1);
    parts.push(`<line x1="${left}" x2="${right}" y1="${yy}" y2="${yy}" stroke="${COLOR.grid}" stroke-width="1"/>`);
    if (Math.abs(Number(yy) - lastY) < 30) continue;
    parts.push(
      `<text x="${right + 12}" y="${Number(yy) + 8}" font-family="${FONT}" font-size="22" fill="${COLOR.muted}">` +
        p.toLocaleString('en-US', { minimumFractionDigits: pricePrecision, maximumFractionDigits: pricePrecision }) +
        `</text>`,
    );
  }

  // 시각 눈금 (6시간마다)
  for (let i = 0; i < candles.length; i++) {
    const t = candles[i][0];
    if (((t / 3600_000) % 6) === 0) {
      parts.push(
        `<line x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${top}" y2="${volBottom}" stroke="${COLOR.grid}" stroke-width="1" stroke-dasharray="4 6"/>`,
      );
      parts.push(
        `<text x="${x(i).toFixed(1)}" y="${volBottom + 30}" text-anchor="middle" font-family="${FONT}" font-size="22" fill="${COLOR.muted}">${kstTime(t)}</text>`,
      );
    }
  }

  // 봉과 거래량
  candles.forEach((c, i) => {
    const [, o, h, l, cl, v] = c;
    const color = cl >= o ? COLOR.up : COLOR.down;
    const cx = x(i).toFixed(1);
    parts.push(`<line x1="${cx}" x2="${cx}" y1="${y(h).toFixed(1)}" y2="${y(l).toFixed(1)}" stroke="${color}" stroke-width="2"/>`);
    const yTop = y(Math.max(o, cl));
    const bh = Math.max(1.5, y(Math.min(o, cl)) - yTop);
    parts.push(
      `<rect x="${(x(i) - bodyW / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bodyW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${color}"/>`,
    );
    const vh = maxVol ? (v / maxVol) * (volBottom - volTop) : 0;
    parts.push(
      `<rect x="${(x(i) - bodyW / 2).toFixed(1)}" y="${(volBottom - vh).toFixed(1)}" width="${bodyW.toFixed(1)}" height="${vh.toFixed(1)}" fill="${color}" opacity="0.45"/>`,
    );
  });

  // 마지막 가격선
  const last = candles[candles.length - 1][4];
  const ly = y(last);
  parts.push(
    `<line x1="${left}" x2="${right}" y1="${ly.toFixed(1)}" y2="${ly.toFixed(1)}" stroke="${COLOR.accent}" stroke-width="1.5" stroke-dasharray="6 6"/>`,
  );
  parts.push(`<rect x="${right + 4}" y="${(ly - 18).toFixed(1)}" width="${AXIS - 4}" height="36" rx="4" fill="${COLOR.accent}"/>`);
  parts.push(
    `<text x="${right + 12}" y="${(ly + 8).toFixed(1)}" font-family="${FONT}" font-size="22" font-weight="700" fill="${COLOR.bg}">` +
      last.toLocaleString('en-US', { minimumFractionDigits: pricePrecision, maximumFractionDigits: pricePrecision }) +
      `</text>`,
  );

  // 정답 구간
  const qx = left + slotW * candles.length;
  parts.push(
    `<rect x="${qx.toFixed(1)}" y="${top}" width="${(right - qx).toFixed(1)}" height="${bottom - top}" fill="${COLOR.panel}" opacity="0.9"/>`,
  );
  parts.push(
    `<text x="${((qx + right) / 2).toFixed(1)}" y="${((top + bottom) / 2 + 40).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="120" font-weight="700" fill="${COLOR.accent}">?</text>`,
  );
  parts.push(
    `<text x="${((qx + right) / 2).toFixed(1)}" y="${((top + bottom) / 2 + 90).toFixed(1)}" text-anchor="middle" font-family="${FONT}" font-size="26" fill="${COLOR.muted}">${esc(input.horizonLabel)}</text>`,
  );

  // 꼬리말
  const fy = SIZE - FOOTER + 50;
  parts.push(
    `<text x="${PAD}" y="${fy}" font-family="${FONT}" font-size="40" font-weight="700" fill="${COLOR.text}">` +
      esc(`${input.horizonLabel} 가격은?`) +
      ` <tspan fill="${COLOR.up}">▲ 상승</tspan>  <tspan fill="${COLOR.down}">▼ 하락</tspan></text>`,
  );
  parts.push(
    `<text x="${PAD}" y="${fy + 56}" font-family="${FONT}" font-size="26" fill="${COLOR.muted}">가린 차트로 직접 매매 연습 · <tspan fill="${COLOR.accent}">blindcandle.com</tspan></text>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${parts.join('')}</svg>`;
}

export function quizPng(input: QuizChartInput): Buffer {
  const resvg = new Resvg(quizSvg(input), {
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: FONT },
  });
  return resvg.render().asPng();
}
