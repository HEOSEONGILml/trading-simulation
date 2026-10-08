import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';

// 배포 시 HOST=0.0.0.0, 결과 DB 위치는 DB_PATH로 영구 디스크를 지정
const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '127.0.0.1';
const dbPath = process.env.DB_PATH ?? fileURLToPath(new URL('../data/results.db', import.meta.url));
const staticDir = fileURLToPath(new URL('../../web/dist', import.meta.url));

const app = buildApp({ dbPath, staticDir });
await app.listen({ port: PORT, host: HOST });
console.log(`서버 실행 중: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
