import { createRouter } from '../../src/index';

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const router = createRouter('public');

exports.main = (event: unknown, context: unknown) => {
  const wxContext = cloud.getWXContext() as { OPENID?: string; APPID?: string; UNIONID?: string };
  return router.handle(event as never, { ...(context && typeof context === 'object' ? context : {}), ...wxContext });
};
