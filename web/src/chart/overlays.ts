// 포지션/주문 가격선과 체결 표시 오버레이

import { registerLocale, registerOverlay, type OverlayTemplate } from 'klinecharts';
import { COLORS } from './theme.ts';

export interface TradeLineData {
  label: string;
  color: string;
  priceText: string;
  dashed: boolean;
}

export interface FillMarkerData {
  side: 'buy' | 'sell';
}

const FONT = "'IBM Plex Sans', Arial, sans-serif";

const tradeLine: OverlayTemplate<TradeLineData> = {
  name: 'tradeLine',
  totalStep: 1,
  lock: true,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    const data = overlay.extendData;
    const y = coordinates[0].y;
    return [
      {
        type: 'line',
        attrs: { coordinates: [{ x: 0, y }, { x: bounding.width, y }] },
        styles: { color: data.color, style: data.dashed ? 'dashed' : 'solid', dashedValue: [4, 4], size: 1 },
        ignoreEvent: true,
      },
      {
        type: 'text',
        attrs: { x: 8, y, text: data.label, align: 'left', baseline: 'middle' },
        styles: {
          color: '#FFFFFF',
          backgroundColor: data.color,
          borderColor: data.color,
          borderRadius: 2,
          size: 11,
          family: FONT,
          paddingLeft: 5,
          paddingRight: 5,
          paddingTop: 3,
          paddingBottom: 3,
        },
        ignoreEvent: true,
      },
    ];
  },
  createYAxisFigures: ({ coordinates, bounding, overlay }) => {
    const data = overlay.extendData;
    return {
      type: 'text',
      attrs: { x: 0, y: coordinates[0].y, text: data.priceText, align: 'left', baseline: 'middle', width: bounding.width },
      styles: {
        color: '#FFFFFF',
        backgroundColor: data.color,
        borderColor: data.color,
        size: 11,
        family: FONT,
        paddingLeft: 4,
        paddingRight: 4,
        paddingTop: 3,
        paddingBottom: 3,
      },
      ignoreEvent: true,
    };
  },
};

const fillMarker: OverlayTemplate<FillMarkerData> = {
  name: 'fillMarker',
  totalStep: 1,
  lock: true,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, overlay }) => {
    const { x, y } = coordinates[0];
    const buy = overlay.extendData.side === 'buy';
    const color = buy ? COLORS.up : COLORS.down;
    // 매수는 가격 아래 위쪽 삼각형, 매도는 가격 위 아래쪽 삼각형
    const tip = buy ? y + 4 : y - 4;
    const base = buy ? y + 12 : y - 12;
    return [
      {
        type: 'polygon',
        attrs: { coordinates: [{ x, y: tip }, { x: x - 5, y: base }, { x: x + 5, y: base }] },
        styles: { style: 'fill', color },
        ignoreEvent: true,
      },
      {
        type: 'text',
        attrs: { x, y: buy ? base + 2 : base - 2, text: buy ? 'B' : 'S', align: 'center', baseline: buy ? 'top' : 'bottom' },
        styles: { color, size: 10, family: FONT, weight: 'bold', backgroundColor: 'transparent', paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0 },
        ignoreEvent: true,
      },
    ];
  },
};

let registered = false;

export function registerExtensions() {
  if (registered) return;
  registered = true;
  registerOverlay(tradeLine);
  registerOverlay(fillMarker);
  registerLocale('ko-KR', {
    time: '시간: ',
    open: '시가: ',
    high: '고가: ',
    low: '저가: ',
    close: '종가: ',
    volume: '거래량: ',
    turnover: '거래대금: ',
    change: '변화: ',
    second: '초',
    minute: '분',
    hour: '시간',
    day: '일',
    week: '주',
    month: '월',
    year: '년',
  });
}
