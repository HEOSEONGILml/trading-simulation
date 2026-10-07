// 검증 지표 출력: node src/metrics.ts (운영 서버: docker compose exec app node server/src/metrics.ts)

import { fileURLToPath } from 'node:url';
import { Store } from './db.ts';

const dbPath = process.env.DB_PATH ?? fileURLToPath(new URL('../data/results.db', import.meta.url));
const store = new Store(dbPath);
console.log(JSON.stringify(store.metrics(), null, 2));
store.close();
