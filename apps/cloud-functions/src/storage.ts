const TEMP_URL_TTL_MS = 45 * 60 * 1000;
const BATCH_SIZE = 50;

const fileUrlCache = new Map<string, { url: string; expiresAt: number }>();
let cloudbaseApp: any;

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
