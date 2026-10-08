// 앱인토스 미니앱 설정 (SDK 3.x 는 granite.config 대신 apps-in-toss.config 를 읽는다)
// appName 은 앱인토스 콘솔에서 정한 이름과 같아야 한다. 확정 전 기본값은 blindcandle.
// 바꾸는 법: AIT_APP_NAME=<이름> 으로 빌드하거나 아래 기본값을 고친다. (서버 CORS 는 TOSS_APP_NAME 환경변수)
import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: process.env.AIT_APP_NAME || 'blindcandle',
  brand: {
    primaryColor: '#3182F6',
  },
  // 클립보드, 카메라 등 기기 권한은 쓰지 않는다
  permissions: [],
  navigationBar: {
    withBackButton: true,
    withHomeButton: false,
    theme: 'light',
  },
  // `vite build --mode miniapp` 의 출력 폴더 (index.html 포함)
  webBundleDir: 'dist-miniapp',
});
