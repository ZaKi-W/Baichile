import { main } from '../../src/index';

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = (event: unknown, context: unknown) => {
  const wxContext = cloud.getWXContext() as { OPENID?: string; APPID?: string; UNIONID?: string };
  return main(event, { ...(context && typeof context === 'object' ? context : {}), ...wxContext });
};
