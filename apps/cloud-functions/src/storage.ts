import { createHash, randomUUID } from 'node:crypto';
import { badRequest } from './errors';

const TEMP_URL_TTL_MS = 45 * 60 * 1000;
const BATCH_SIZE = 50;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const fileUrlCache = new Map<string, { url: string; expiresAt: number }>();
let cloudbaseApp: any;
const miniCodeCache = new Map<string, string>();

export async function resolveCloudFileUrls(fileIds: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniqueFileIds = [...new Set(fileIds.filter(isCloudFileId))];
  const result = new Map<string, string>();
  const pending = uniqueFileIds.filter((fileId) => {
    const cached = fileUrlCache.get(fileId);
    if (cached && cached.expiresAt > Date.now()) {
      result.set(fileId, cached.url);
      return false;
    }
    return true;
  });

  if (!pending.length) return result;

  const app = getCloudBaseApp();
  for (let index = 0; index < pending.length; index += BATCH_SIZE) {
    const batch = pending.slice(index, index + BATCH_SIZE);
    let response: { fileList?: Array<{ code?: string; fileID: string; tempFileURL?: string }> };
    try {
      response = await app.getTempFileURL({ fileList: batch });
    } catch {
      continue;
    }
    for (const item of response.fileList ?? []) {
      if (item.code !== 'SUCCESS' || !item.tempFileURL) continue;
      fileUrlCache.set(item.fileID, {
        url: item.tempFileURL,
        expiresAt: Date.now() + TEMP_URL_TTL_MS,
      });
      result.set(item.fileID, item.tempFileURL);
    }
  }

  return result;
}

export async function createShareMiniProgramCode(token: string): Promise<string | undefined> {
  const cached = miniCodeCache.get(token);
  if (cached) return cached;
  if (process.env.NODE_ENV === 'test') return undefined;
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    const result = await cloud.openapi.wxacode.getUnlimited({
      scene: token,
      page: 'pages/share-landing/index',
      checkPath: false,
      envVersion: process.env.MINIPROGRAM_ENV_VERSION || 'release',
      width: 430,
    });
    if (!result?.buffer) return undefined;
    const cloudPath = `share-codes/${token}.png`;
    const uploaded = await cloud.uploadFile({ cloudPath, fileContent: result.buffer });
    if (!uploaded?.fileID) return undefined;
    const urls = await resolveCloudFileUrls([uploaded.fileID]);
    const url = urls.get(uploaded.fileID);
    if (url) miniCodeCache.set(token, url);
    return url;
  } catch {
    return undefined;
  }
}

export async function uploadValidatedAvatar(openId: string, contentBase64: string): Promise<string> {
  const { buffer, extension } = validateAvatarUpload(contentBase64);
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  const owner = createHash('sha256').update(openId).digest('hex').slice(0, 32);
  const cloudPath = `avatars/${owner}/${randomUUID()}.${extension}`;
  const uploaded = await cloud.uploadFile({ cloudPath, fileContent: buffer });
  if (!uploaded?.fileID) badRequest('头像上传失败', 'AVATAR_UPLOAD_FAILED');
  return uploaded.fileID;
}

export async function removeCloudFiles(fileIds: Array<string | null | undefined>): Promise<void> {
  const valid = fileIds.filter(isCloudFileId);
  if (!valid.length) return;
  try {
    const cloud = require('wx-server-sdk');
    cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
    await cloud.deleteFile({ fileList: valid });
  } catch {
    // 新头像已成功保存时，旧头像清理失败不应阻断登录。
  }
}

export function validateAvatarUpload(contentBase64: string): { buffer: Buffer; extension: 'jpg' | 'png' | 'webp' } {
  if (typeof contentBase64 !== 'string' || !contentBase64 || contentBase64.length > Math.ceil(MAX_AVATAR_BYTES * 4 / 3) + 8) {
    badRequest('头像不得超过 2MB', 'AVATAR_TOO_LARGE');
  }
  if (!/^[a-zA-Z0-9+/]+={0,2}$/.test(contentBase64)) badRequest('头像数据格式不正确', 'INVALID_AVATAR');
  const buffer = Buffer.from(contentBase64, 'base64');
  if (!buffer.length || buffer.length > MAX_AVATAR_BYTES) badRequest('头像不得超过 2MB', 'AVATAR_TOO_LARGE');
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { buffer, extension: 'png' };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { buffer, extension: 'jpg' };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { buffer, extension: 'webp' };
  }
  badRequest('头像仅支持 JPEG、PNG 或 WebP', 'INVALID_AVATAR_TYPE');
}

function isCloudFileId(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith('cloud://');
}

function getCloudBaseApp(): any {
  if (cloudbaseApp) return cloudbaseApp;
  const mod = require('@cloudbase/node-sdk');
  cloudbaseApp = mod.init({
    env: process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || undefined,
  });
  return cloudbaseApp;
}
