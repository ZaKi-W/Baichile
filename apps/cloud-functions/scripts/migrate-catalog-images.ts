import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { stores } from '@baichile/catalog-data';
import {
  CATALOG_IMAGE_CLOUD_PATH,
  CATALOG_IMAGE_LOCAL_PREFIX,
  DEFAULT_CATALOG_IMAGE_UPLOAD_TARGET,
  normalizeCatalogImageBaseUrl,
  resolveCatalogImageUrl,
} from '../src/catalog-images';
import { collections } from '../src/collections';
import { createCloudBaseDatabase } from '../src/database';

const sourceDir = resolve(process.env.CATALOG_IMAGE_SOURCE_DIR || resolve(__dirname, '../../client/src/static/choutuan-img'));
const cloudPath = process.env.CATALOG_IMAGE_CLOUD_PATH?.replace(/^\/+|\/+$/g, '') || CATALOG_IMAGE_CLOUD_PATH;
const uploadTarget = process.env.CATALOG_IMAGE_UPLOAD_TARGET || DEFAULT_CATALOG_IMAGE_UPLOAD_TARGET;
const STORAGE_BATCH_SIZE = 2;
const STORAGE_RETRY_COUNT = 3;

async function main() {
  const envId = requiredEnv('CLOUDBASE_ENV_ID');
  assertCatalogImages(sourceDir);

  if (uploadTarget === 'storage') {
    const fileIdMap = process.env.SKIP_CATALOG_IMAGE_UPLOAD === '1'
      ? new Map<string, string>()
      : await uploadCatalogImagesToStorage(envId);
    await updateCloudBaseImagesToStorage(fileIdMap, envId);
    return;
  }

  const baseUrl = normalizeCatalogImageBaseUrl(requiredEnv('CATALOG_IMAGE_BASE_URL'));
  if (!baseUrl) throw new Error('缺少 CATALOG_IMAGE_BASE_URL');

  if (process.env.SKIP_CATALOG_IMAGE_UPLOAD === '1') {
    console.log('SKIP_CATALOG_IMAGE_UPLOAD=1, skipped hosting upload');
  } else {
    uploadCatalogImagesToHosting(envId);
  }

  await updateCloudBaseImagesToHosting(baseUrl);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少 ${name}`);
  return value;
}

function expectedImageFileNames(): string[] {
  return [...new Set(stores.flatMap((store) => {
    const fileNames: string[] = [];
    if (store.coverUrl?.startsWith(CATALOG_IMAGE_LOCAL_PREFIX)) fileNames.push(basename(store.coverUrl));
    for (const item of store.menu) {
      if (item.imageUrl?.startsWith(CATALOG_IMAGE_LOCAL_PREFIX)) fileNames.push(basename(item.imageUrl));
    }
    return fileNames;
  }))].sort();
}

function assertCatalogImages(dir: string) {
  const actualFiles = readdirSync(dir, { withFileTypes: true })
    .filter((item) => item.isFile() && item.name.endsWith('.webp'))
    .map((item) => item.name)
    .sort();
  const expectedFiles = expectedImageFileNames();
  const missingFiles = expectedFiles.filter((file) => !actualFiles.includes(file));
  if (missingFiles.length) {
    throw new Error(`目录 ${dir} 缺少 ${missingFiles.length} 张目录图，示例: ${missingFiles.slice(0, 10).join(', ')}`);
  }
  console.log(`catalog images: ${actualFiles.length} files in ${dir}`);
}

function uploadCatalogImagesToHosting(envId: string) {
  const command = process.env.TCB_CLI || 'npx';
  const cliPrefix = process.env.TCB_CLI ? [] : ['-y', '-p', '@cloudbase/cli@latest', 'tcb'];
  const args = [
    ...cliPrefix,
    '-e',
    envId,
    'hosting',
    'deploy',
    sourceDir,
    cloudPath,
    '--retry-count',
    '3',
  ];
  console.log(`${command} ${args.join(' ')}`);
  runCommand(command, args);
}

async function uploadCatalogImagesToStorage(envId: string): Promise<Map<string, string>> {
  const mod = require('@cloudbase/node-sdk');
  const app = mod.init({
    env: envId,
    secretId: process.env.TENCENTCLOUD_SECRETID,
    secretKey: process.env.TENCENTCLOUD_SECRETKEY,
    sessionToken: process.env.TENCENTCLOUD_SESSIONTOKEN,
  });
  const files = expectedImageFileNames();
  const uploaded = new Map<string, string>();

  for (let index = 0; index < files.length; index += STORAGE_BATCH_SIZE) {
    const batch = files.slice(index, index + STORAGE_BATCH_SIZE);
    await Promise.all(batch.map(async (fileName) => {
      const fileContent = readFileSync(resolve(sourceDir, fileName));
      const response = await retry(async () => app.uploadFile({
        cloudPath: `${cloudPath}/${fileName}`,
        fileContent,
      }));
      uploaded.set(fileName, response.fileID);
    }));
  }

  console.log(`uploaded ${uploaded.size} catalog images to cloud storage`);
  return uploaded;
}

async function retry<T>(run: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= STORAGE_RETRY_COUNT; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt === STORAGE_RETRY_COUNT) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 800));
    }
  }
  throw lastError;
}

function runCommand(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`command failed with exit code ${result.status ?? 'unknown'}`);
  }
}

async function updateCloudBaseImagesToHosting(baseUrl: string) {
  const db = createCloudBaseDatabase();
  const storeCount = await updateCloudBaseCollection(db, collections.stores, 'coverUrl', (value) => resolveHostingUrl(value, baseUrl));
  const itemCount = await updateCloudBaseCollection(db, collections.menuItems, 'imageUrl', (value) => resolveHostingUrl(value, baseUrl));
  console.log(`CloudBase updated: ${storeCount} stores, ${itemCount} menu_items`);
}

async function updateCloudBaseImagesToStorage(fileIdMap: Map<string, string>, envId: string) {
  const db = createCloudBaseDatabase();
  const storeCount = await updateCloudBaseCollection(db, collections.stores, 'coverUrl', (value) => resolveStorageFileId(value, fileIdMap, envId));
  const itemCount = await updateCloudBaseCollection(db, collections.menuItems, 'imageUrl', (value) => resolveStorageFileId(value, fileIdMap, envId));
  console.log(`CloudBase updated: ${storeCount} stores, ${itemCount} menu_items`);
}

function resolveHostingUrl(value: unknown, baseUrl: string): string | null | undefined {
  if (typeof value !== 'string') return value as undefined;
  return resolveCatalogImageUrl(value, baseUrl);
}

function resolveStorageFileId(
  value: unknown,
  fileIdMap: Map<string, string>,
  envId: string,
): string | null | undefined {
  if (typeof value !== 'string') return value as undefined;
  if (value.startsWith('cloud://')) return value;
  if (!value.startsWith(CATALOG_IMAGE_LOCAL_PREFIX)) return value;
  const fileName = basename(value);
  return fileIdMap.get(fileName) ?? `cloud://${envId}/${cloudPath}/${fileName}`;
}

async function updateCloudBaseCollection(
  db: ReturnType<typeof createCloudBaseDatabase>,
  collectionName: string,
  field: 'coverUrl' | 'imageUrl',
  transform: (value: unknown) => string | null | undefined,
): Promise<number> {
  const collection = db.collection<Record<string, unknown>>(collectionName);
  let count = 0;
  const pageSize = 100;
  for (let skip = 0;; skip += pageSize) {
    const rows = await collection.list({ skip, limit: pageSize });
    for (const row of rows) {
      const nextValue = transform(row[field]);
      if (nextValue === row[field]) continue;
      const id = String(row._id ?? row.id);
      await collection.update(id, { [field]: nextValue });
      count += 1;
    }
    if (rows.length < pageSize) break;
  }
  return count;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
