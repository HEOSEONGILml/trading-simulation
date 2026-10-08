// 시장(섹션)별 표시 정보와 거래 규칙. 화면은 BTC/USDT 같은 값을 직접 쓰지 않고 여기서 가져온다

import { FUTURES_RULES, KR_STOCK_RULES, US_STOCK_RULES, type ExchangeRules } from './engine/exchange.ts';

export type Market = 'coin' | 'kr' | 'us';
export const MARKETS: Market[] = ['coin', 'kr', 'us'];

export interface MarketInfo {
  market: Market;
  /** 섹션 이름 */
  label: string;
  /** 진행 중에 보이는 종목 표시 (주식은 종목을 가린다) */
  symbol: string;
  product: string;
  /** 금액 단위 표시 */
  currency: string;
  /** 금액 소수 자릿수 */
  moneyDigits: number;
  qtyUnit: string;
  qtyDigits: number;
  /** 선물이면 레버리지, 숏, 청산이 있다 */
  futures: boolean;
  buyLabel: string;
  sellLabel: string;
  rules: ExchangeRules;
  /** 1분봉을 고를 수 있는 가장 이른 날짜 */
  earliestDate: string;
  /** 시작 전 보여줄 과거 구간 (주식은 정규장 봉 수) */
  historyOptions: { label: string; minutes: number }[];
  /** 새 라운드 안내 */
  description: string;
}

const COIN_HISTORY = [
  { label: '6시간', minutes: 360 },
  { label: '12시간', minutes: 720 },
  { label: '1일', minutes: 1440 },
  { label: '3일', minutes: 4320 },
  { label: '7일', minutes: 10080 },
  { label: '14일', minutes: 20160 },
  { label: '30일', minutes: 43200 },
];

// 정규장은 한국, 미국 모두 하루 390분
const STOCK_HISTORY = [
  { label: '반나절', minutes: 195 },
  { label: '1일', minutes: 390 },
  { label: '3일', minutes: 1170 },
  { label: '5일', minutes: 1950 },
  { label: '10일', minutes: 3900 },
];

export const MARKET_INFO: Record<Market, MarketInfo> = {
  coin: {
    market: 'coin',
    label: '코인',
    symbol: 'BTCUSDT',
    product: '무기한',
    currency: 'USDT',
    moneyDigits: 2,
    qtyUnit: 'BTC',
    qtyDigits: 4,
    futures: true,
    buyLabel: '매수/롱',
    sellLabel: '매도/숏',
    rules: FUTURES_RULES,
    earliestDate: '2019-09-10',
    historyOptions: COIN_HISTORY,
    description: '지정한 기간에서 무작위 시점을 골라 BTCUSDT 무기한 선물 1분봉 차트를 보여줍니다. 시작하면 1분봉이 하나씩 추가됩니다.',
  },
  kr: {
    market: 'kr',
    label: '국내 주식',
    symbol: '가린 종목',
    product: '국내',
    currency: '원',
    moneyDigits: 0,
    qtyUnit: '주',
    qtyDigits: 0,
    futures: false,
    buyLabel: '매수',
    sellLabel: '매도',
    rules: KR_STOCK_RULES,
    earliestDate: '2022-11-23',
    historyOptions: STOCK_HISTORY,
    description:
      '국내 대형주 중 하나를 무작위로 골라 정규장(09:00~15:30) 1분봉을 보여줍니다. 종목은 라운드가 끝나면 공개됩니다. 공매도와 레버리지는 없습니다.',
  },
  us: {
    market: 'us',
    label: '미국 주식',
    symbol: '가린 종목',
    product: '미국',
    currency: 'USD',
    moneyDigits: 2,
    qtyUnit: '주',
    qtyDigits: 0,
    futures: false,
    buyLabel: '매수',
    sellLabel: '매도',
    rules: US_STOCK_RULES,
    earliestDate: '2021-12-01',
    historyOptions: STOCK_HISTORY,
    description:
      '미국 대형주와 ETF 중 하나를 무작위로 골라 정규장(뉴욕 09:30~16:00) 1분봉을 보여줍니다. 종목은 라운드가 끝나면 공개됩니다. 공매도와 레버리지는 없습니다.',
  },
};

export const marketInfo = (market: Market | undefined) => MARKET_INFO[market ?? 'coin'];
