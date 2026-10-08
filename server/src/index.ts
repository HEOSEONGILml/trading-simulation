import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { coinSource } from './markets/coin.ts';
import { TossInvestClient, tossSource } from './markets/tossinvest.ts';
import type { Market, MarketSource } from './markets/types.ts';

// 배포 시 HOST=0.0.0.0, 결과 DB 위치는 DB_PATH로 영구 디스크를 지정
const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '127.0.0.1';
const dbPath = process.env.DB_PATH ?? fileURLToPath(new URL('../data/results.db', import.meta.url));
const staticDir = fileURLToPath(new URL('../../web/dist', import.meta.url));

// 주식(한국, 미국)은 토스증권 데이터 사용을 토스에서 허락받은 뒤에만 켠다 (PLAN.md 6장)
// STOCKS_ENABLED=1 과 토스증권 Open API 키(TOSSINVEST_CLIENT_ID, TOSSINVEST_CLIENT_SECRET)가 모두 있어야 한다
const sources: Partial<Record<Market, MarketSource>> = { coin: coinSource };
const { STOCKS_ENABLED, TOSSINVEST_CLIENT_ID, TOSSINVEST_CLIENT_SECRET } = process.env;
if (STOCKS_ENABLED === '1' && TOSSINVEST_CLIENT_ID && TOSSINVEST_CLIENT_SECRET) {
  const client = new TossInvestClient({ clientId: TOSSINVEST_CLIENT_ID, clientSecret: TOSSINVEST_CLIENT_SECRET });
  sources.kr = tossSource('kr', client);
  sources.us = tossSource('us', client);
}

const app = buildApp({ dbPath, staticDir, sources });
await app.listen({ port: PORT, host: HOST });
console.log(`서버 실행 중: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT} (시장: ${Object.keys(sources).join(', ')})`);
