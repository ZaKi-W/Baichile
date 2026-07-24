import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { CLOUDBASE_ENV_ID, USE_CLOUDBASE_API } from './config/api';

let cloudInitialized = false;

function initCloudBase() {
  // #ifdef H5
  if (typeof window !== 'undefined' && (typeof wx === 'undefined' || !wx.cloud)) {
    void import('./platform/cloudbase-web').then(({ initializeWebCloudBase }) => {
      initializeWebCloudBase();
    });
    return;
  }
  // #endif
  // #ifdef MP-WEIXIN
  if (!USE_CLOUDBASE_API || cloudInitialized || typeof wx === 'undefined' || !wx.cloud) return;
  wx.cloud.init({ env: CLOUDBASE_ENV_ID, traceUser: true });
  cloudInitialized = true;
  // #endif
}

export function createApp() {
  initCloudBase();
  const app = createSSRApp(App);
  app.use(createPinia());
  return { app };
}
