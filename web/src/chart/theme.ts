import type { DeepPartial, Styles } from 'klinecharts';

// 바이낸스 선물 다크 테마 색상
export const COLORS = {
  bg: '#181A20',
  grid: '#22262D',
  border: '#2B3139',
  text: '#EAECEF',
  textSecondary: '#848E9C',
  up: '#2EBD85',
  down: '#F6465D',
  yellow: '#F0B90B',
  crosshair: '#5E6673',
};

const FONT = "'IBM Plex Sans', 'BinancePlex', Arial, sans-serif";

export const chartStyles: DeepPartial<Styles> = {
  grid: {
    horizontal: { color: COLORS.grid },
    vertical: { color: COLORS.grid },
  },
  candle: {
    bar: {
      upColor: COLORS.up,
      downColor: COLORS.down,
      noChangeColor: COLORS.up,
      upBorderColor: COLORS.up,
      downBorderColor: COLORS.down,
      noChangeBorderColor: COLORS.up,
      upWickColor: COLORS.up,
      downWickColor: COLORS.down,
      noChangeWickColor: COLORS.up,
    },
    priceMark: {
      high: { color: COLORS.textSecondary, textFamily: FONT },
      low: { color: COLORS.textSecondary, textFamily: FONT },
      last: {
        upColor: COLORS.up,
        downColor: COLORS.down,
        noChangeColor: COLORS.up,
        compareRule: 'current_open',
        line: { style: 'dashed', dashedValue: [3, 3], size: 1 },
        text: { family: FONT, size: 11, paddingLeft: 4, paddingRight: 4, paddingTop: 3, paddingBottom: 3 },
        extendTexts: [
          {
            show: true,
            position: 'below_price',
            size: 11,
            family: FONT,
            paddingLeft: 4,
            paddingRight: 4,
            paddingTop: 2,
            paddingBottom: 3,
            updateInterval: 250,
          },
        ],
      },
    },
    tooltip: {
      showRule: 'always',
      showType: 'standard',
      title: { show: false },
      legend: { color: COLORS.textSecondary, size: 11, family: FONT },
    },
  },
  indicator: {
    tooltip: {
      title: { color: COLORS.textSecondary, size: 11, family: FONT },
      legend: { size: 11, family: FONT },
    },
    lastValueMark: { show: false },
  },
  xAxis: {
    axisLine: { color: COLORS.border },
    tickLine: { color: COLORS.border },
    tickText: { color: COLORS.textSecondary, family: FONT, size: 11 },
  },
  yAxis: {
    axisLine: { color: COLORS.border },
    tickLine: { color: COLORS.border },
    tickText: { color: COLORS.textSecondary, family: FONT, size: 11 },
  },
  separator: { color: COLORS.border, activeBackgroundColor: 'rgba(240,185,11,0.08)' },
  crosshair: {
    horizontal: {
      line: { color: COLORS.crosshair, dashedValue: [4, 3] },
      text: { backgroundColor: '#474D57', borderColor: '#474D57', family: FONT, size: 11 },
    },
    vertical: {
      line: { color: COLORS.crosshair, dashedValue: [4, 3] },
      text: { backgroundColor: '#474D57', borderColor: '#474D57', family: FONT, size: 11 },
    },
  },
  overlay: {
    line: { color: '#2962FF' },
    point: {
      color: '#2962FF',
      borderColor: 'rgba(41,98,255,0.35)',
      activeColor: '#2962FF',
      activeBorderColor: 'rgba(41,98,255,0.35)',
    },
    polygon: { color: 'rgba(41,98,255,0.12)' },
    rect: { color: 'rgba(41,98,255,0.12)', borderColor: '#2962FF' },
    text: { color: COLORS.text, family: FONT },
  },
};
