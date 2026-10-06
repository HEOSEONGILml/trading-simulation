// 바이낸스 USDⓈ-M 선물 BTCUSDT 1분봉 조회

export type Candle = [time: number, open: number, high: number, low: number, close: number, volume: number];

const BASE_URL = 'https://fapi.binance.com/fapi/v1/klines';
const SYMBOL = 'BTCUSDT';
export const MINUTE = 60_000;
const MAX_LIMIT = 1500;

// BTCUSDT 무기한 선물 상장 직후 1분봉은 거래가 거의 없어 2019-09-10부터 사용
export const EARLIEST_TIME = Date.UTC(2019, 8, 10);

async function request(params: URLSearchParams): Promise<unknown[][]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}?${params}`);
      if (res.status === 429 || res.status === 418) {
        const retryAfter = Number(res.headers.get('retry-after') ?? 5);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }
      if (!res.ok) throw new Error(`Binance API ${res.status}: ${await res.text()}`);
      return (await res.json()) as unknown[][];
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

/** startTime(포함)부터 최대 count개의 1분봉을 가져온다. endTime(포함)을 넘지 않는다. */
export async function fetchCandles(startTime: number, count: number, endTime?: number): Promise<Candle[]> {
  const result: Candle[] = [];
  let cursor = startTime;
  while (result.length < count) {
    const limit = Math.min(MAX_LIMIT, count - result.length);
    const params = new URLSearchParams({
      symbol: SYMBOL,
      interval: '1m',
      startTime: String(cursor),
      limit: String(limit),
    });
    if (endTime !== undefined) params.set('endTime', String(endTime));
    const rows = await request(params);
    // 아직 마감되지 않은 현재 분봉은 제외
    const closed = rows.filter((r) => Number(r[6]) < Date.now());
    for (const r of closed) {
      result.push([Number(r[0]), Number(r[1]), Number(r[2]), Number(r[3]), Number(r[4]), Number(r[5])]);
    }
    if (closed.length < limit) break;
    cursor = result[result.length - 1][0] + MINUTE;
  }
  return result;
}
