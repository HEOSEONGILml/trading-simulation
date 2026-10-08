import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `vite build --mode miniapp`: 토스 미니앱 번들 (web/.env.miniapp 의 VITE_MINIAPP=1, VITE_API_BASE)
// 일반 웹 빌드(dist)는 서버가 서빙하므로 미니앱 결과는 dist-miniapp 에 따로 만든다
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'miniapp' ? './' : '/',
  build: { outDir: mode === 'miniapp' ? 'dist-miniapp' : 'dist' },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3001' },
  },
}));
