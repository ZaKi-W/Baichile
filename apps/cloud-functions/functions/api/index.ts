import { createRouter } from '../../src/index';

const cloud = require('wx-server-sdk');
const tcb = require('@cloudbase/node-sdk') as {
  init(options: { env: string }): {
    auth(): {
      getUserInfo(): { uid?: string };
      getEndUserInfo(uid: string): Promise<{ userInfo?: unknown }>;
      queryUserInfo(query: { platform: 'PHONE'; platformId: string }): Promise<{ userInfo?: unknown }>;
      getClientIP(): string;
    };
  };
};

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const cloudbaseApp = tcb.init({
  env: process.env.CLOUDBASE_ENV_ID || cloud.DYNAMIC_CURRENT_ENV,
});
const cloudbaseAuth = cloudbaseApp.auth();
const router = createRouter('public');

exports.main = async (event: unknown, context: unknown) => {
  const wxContext = cloud.getWXContext() as { OPENID?: string; APPID?: string; UNIONID?: string };
  let webUid = '';
  let webPhoneNumber = '';
  let clientIp = '';
  try {
    webUid = cloudbaseAuth.getUserInfo().uid?.trim() ?? '';
    clientIp = cloudbaseAuth.getClientIP();
  } catch (error) {
    console.warn('[auth] Unable to resolve CloudBase Web caller', error instanceof Error ? error.message : 'unknown error');
  }
  if (webUid && requestPath(event) === '/v1/auth/web-phone/session') {
    try {
      const { userInfo } = await cloudbaseAuth.getEndUserInfo(webUid);
      webPhoneNumber = extractVerifiedPhone(userInfo);
    } catch (error) {
      console.warn('[auth] Unable to read CloudBase Web profile', error instanceof Error ? error.message : 'unknown error');
    }
    const phoneCandidate = extractRequestedPhone(event);
    if (!webPhoneNumber && phoneCandidate) {
      try {
          const matched = await cloudbaseAuth.queryUserInfo({
            platform: 'PHONE',
            platformId: phoneCandidate,
          });
          if (extractUid(matched.userInfo) === webUid) webPhoneNumber = phoneCandidate;
      } catch (error) {
        console.warn('[auth] Unable to verify CloudBase phone identity', error instanceof Error ? error.message : 'unknown error');
      }
    }
  }
  return router.handle(event as never, {
    ...(context && typeof context === 'object' ? context : {}),
    ...wxContext,
    WEB_UID: webUid,
    WEB_PHONE_NUMBER: webPhoneNumber,
    CLIENT_IP: clientIp,
  });
};

function requestPath(event: unknown): string {
  if (!event || typeof event !== 'object') return '';
  const record = event as Record<string, unknown>;
  if (typeof record.path === 'string') return record.path;
  if (typeof record.body !== 'string') return '';
  try {
    const body = JSON.parse(record.body) as unknown;
    return body && typeof body === 'object' && 'path' in body && typeof body.path === 'string'
      ? body.path
      : '';
  } catch {
    return '';
  }
}

function extractVerifiedPhone(userInfo: unknown): string {
  if (!userInfo || typeof userInfo !== 'object') return '';
  const record = userInfo as Record<string, unknown>;
  for (const key of ['phoneNumber', 'phone_number', 'phone']) {
    if (typeof record[key] === 'string' && record[key].trim()) return record[key].trim();
  }
  for (const key of ['userMetadata', 'user_metadata', 'profile']) {
    const nested = record[key];
    if (!nested || typeof nested !== 'object') continue;
    const nestedRecord = nested as Record<string, unknown>;
    for (const phoneKey of ['phoneNumber', 'phone_number', 'phone']) {
      if (typeof nestedRecord[phoneKey] === 'string' && nestedRecord[phoneKey].trim()) {
        return nestedRecord[phoneKey].trim();
      }
    }
  }
  return '';
}

function extractRequestedPhone(event: unknown): string {
  if (!event || typeof event !== 'object') return '';
  const record = event as Record<string, unknown>;
  const data = record.data;
  if (!data || typeof data !== 'object') return '';
  const candidate = (data as Record<string, unknown>).phoneNumber;
  if (typeof candidate !== 'string') return '';
  const compact = candidate.trim().replace(/[\s-]/g, '');
  const national = compact.startsWith('+86') ? compact.slice(3) : compact;
  return /^1[3-9]\d{9}$/.test(national) ? `+86${national}` : '';
}

function extractUid(userInfo: unknown): string {
  if (!userInfo || typeof userInfo !== 'object') return '';
  const record = userInfo as Record<string, unknown>;
  for (const key of ['uid', 'sub']) {
    if (typeof record[key] === 'string') return record[key].trim();
  }
  return '';
}
