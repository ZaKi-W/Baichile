import cloudbase from '@cloudbase/js-sdk';
import {
  CLOUDBASE_ACCESS_KEY,
  CLOUDBASE_API_FUNCTION,
  CLOUDBASE_ENV_ID,
  CLOUDBASE_REGION,
} from '../config/api';

type CloudBaseWebApp = ReturnType<typeof cloudbase.init>;

interface AuthErrorShape {
  message?: string;
}

interface AuthResultShape {
  data?: unknown;
  error?: AuthErrorShape | null;
}

type VerifyOtpCallback = (input: { token: string }) => Promise<unknown>;

let webApp: CloudBaseWebApp | undefined;

export function initializeWebCloudBase(): CloudBaseWebApp {
  if (webApp) return webApp;
  if (!CLOUDBASE_ENV_ID || !CLOUDBASE_ACCESS_KEY) {
    throw new Error('H5 云开发配置缺失，请检查环境 ID 和 Publishable Key');
  }
  webApp = cloudbase.init({
    env: CLOUDBASE_ENV_ID,
    region: CLOUDBASE_REGION,
    accessKey: CLOUDBASE_ACCESS_KEY,
    auth: { detectSessionInUrl: true },
  });
  return webApp;
}

export async function callWebCloudFunction(data: Record<string, unknown>): Promise<unknown> {
  const response = await initializeWebCloudBase().callFunction({
    name: CLOUDBASE_API_FUNCTION,
    data,
    parse: true,
  });
  return response.result as unknown;
}

export async function sendWebPhoneOtp(phoneNumber: string): Promise<(code: string) => Promise<string>> {
  const phone = normalizeWebPhone(phoneNumber);
  const result = parseAuthResult(await initializeWebCloudBase().auth.signInWithOtp({ phone }));
  throwAuthError(result, '验证码发送失败');
  const verifyOtp = readVerifyOtp(result.data);
  return async (code: string) => {
    const token = code.trim();
    if (!/^\d{4,8}$/.test(token)) throw new Error('请输入正确的短信验证码');
    const verification = parseAuthResult(await verifyOtp({ token }));
    throwAuthError(verification, '验证码校验失败');
    if (!await hasWebPhoneSession()) throw new Error('手机号登录态未建立，请重新获取验证码');
    return phone;
  };
}

export async function hasWebPhoneSession(): Promise<boolean> {
  const result = parseAuthResult(await initializeWebCloudBase().auth.getSession());
  if (result.error) return false;
  if (!result.data || typeof result.data !== 'object' || !('session' in result.data)) return false;
  const session = (result.data as Record<string, unknown>).session;
  if (!session || typeof session !== 'object') return false;
  const user = 'user' in session ? (session as Record<string, unknown>).user : undefined;
  return !(user && typeof user === 'object' && (user as Record<string, unknown>).is_anonymous === true);
}

export async function signOutWebPhone(): Promise<void> {
  await initializeWebCloudBase().auth.signOut();
}

export function normalizeWebPhone(input: string): string {
  const compact = input.trim().replace(/[\s-]/g, '');
  const national = compact.startsWith('+86')
    ? compact.slice(3)
    : compact.startsWith('86') && compact.length === 13
      ? compact.slice(2)
      : compact;
  if (!/^1[3-9]\d{9}$/.test(national)) throw new Error('请输入正确的中国大陆手机号');
  return `+86${national}`;
}

function parseAuthResult(value: unknown): AuthResultShape {
  if (!value || typeof value !== 'object') return {};
  const record = value as Record<string, unknown>;
  const error = record.error && typeof record.error === 'object'
    ? record.error as AuthErrorShape
    : null;
  return { data: record.data, error };
}

function throwAuthError(result: AuthResultShape, fallback: string): void {
  if (result.error) throw new Error(result.error.message || fallback);
}

function readVerifyOtp(value: unknown): VerifyOtpCallback {
  if (!value || typeof value !== 'object' || !('verifyOtp' in value)) {
    throw new Error('短信验证流程未正确初始化');
  }
  const callback = (value as Record<string, unknown>).verifyOtp;
  if (typeof callback !== 'function') throw new Error('短信验证流程未正确初始化');
  return callback as VerifyOtpCallback;
}
