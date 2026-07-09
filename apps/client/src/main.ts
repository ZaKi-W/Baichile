import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { CLOUDBASE_ENV_ID, USE_CLOUDBASE_API } from './config/api';

let cloudInitialized = false;

function initCloudBase() {
  if (!USE_CLOUDBASE_API || cloudInitialized || typeof wx === 'undefined' || !wx.cloud) return;
  wx.cloud.init({ env: CLOUDBASE_ENV_ID, traceUser: true });
  cloudInitialized = true;
}

export function createApp() {
  initCloudBase();
  const app = createSSRApp(App);
  app.use(createPinia());
  return { app };
}
