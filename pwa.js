'use strict';

/* 홈 화면 추가(PWA) 지원.
 * - 서비스 워커는 http/https 에서만 등록된다 (file:// 로 열면 건너뛴다).
 * - 단일 파일 배포본에는 sw.js 가 없으므로 등록을 시도하지 않는다.
 */
(function () {
  const http = location.protocol === 'http:' || location.protocol === 'https:';
  if (!http || !('serviceWorker' in navigator) || window.SINGLE_FILE) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
})();
