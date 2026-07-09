import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CATALOG_IMAGE_CLOUD_PATH,
  CATALOG_IMAGE_LOCAL_PREFIX,
  DEFAULT_CATALOG_IMAGE_UPLOAD_TARGET,
  EXPECTED_CATALOG_IMAGE_COUNT,
  normalizeCatalogImageBaseUrl,
  rewriteCatalogRecordImages,
} from '../src/catalog-images';
import { collections } from '../src/collections';
import { createCloudBaseDatabase } from '../src/database';

const { Client } = require('pg') as {
  Client: new (options: { connectionString: string }) => {
    connect(): Promise<void>;
    end(): Promise<void>;
    query(sql: string, params?: unknown[]): Promise<{ rowCount?: number | null }>;
  };
};

const sourceDir = resolve(process.env.CATALOG_IMAGE_SOURCE_DIR || resolve(__dirname, '../../client/static/choutuan-img'));
const cloudPath = process.env.CATALOG_IMAGE_CLOUD_PATH?.replace(/^\/+|\/+$/g, '') || CATALOG_IMAGE_CLOUD_PATH;
const uploadTarget = process.env.CATALOG_IMAGE_UPLOAD_TARGET || DEFAULT_CATALOG_IMAGE_UPLOAD_TARGET;

async function main() {
  const envId = requiredEnv('CLOUDBASE_ENV_ID');
  const baseUrl = normalizeCatalogImageBaseUrl(requiredEnv('CATALOG_IMAGE_BASE_URL'));
  if (!baseUrl) throw new Error('缺少 CATALOG_IMAGE_BASE_URL');

  assertCatalogImages(sourceDir);

  if (process.env.SKIP_CATALOG_IMAGE_UPLOAD === '1') {
    console.log('SKIP_CATALOG_IMAGE_UPLOAD=1, skipped storage upload');
  } else {
    uploadCatalogImages(envId);
  }

  await updatePostgresImages(baseUrl);

  if (process.env.UPDATE_CLOUDBASE_CATALOG_IMAGES === '1') {
    await updateCloudBaseImages(baseUrl);
  }

  if (process.env.VERIFY_CATALOG_IMAGE_URLS === '1') {
    await verifySampleUrls(baseUrl);
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少 ${name}`);
  return value;
}

function assertCatalogImages(dir: string) {
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((item) => item.isFile() && item.name.endsWith('.webp'));
  if (files.length !== EXPECTED_CATALOG_IMAGE_COUNT) {
    throw new Error(`目录 ${dir} 中应有 ${EXPECTED_CATALOG_IMAGE_COUNT} 张 webp，实际 ${files.length} 张`);
  }
  console.log(`catalog images: ${files.length} files in ${dir}`);
}

function uploadCatalogImages(envId: string) {
  const command = process.env.TCB_CLI || 'npx';
  const cliPrefix = process.env.TCB_CLI ? [] : ['-y', '-p', '@cloudbase/cli@latest', 'tcb'];
  if (uploadTarget === 'hosting') {
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
    return;
  }
  if (uploadTarget !== 'storage') {
    throw new Error('CATALOG_IMAGE_UPLOAD_TARGET 只能是 hosting 或 storage');
  }
  const args = [
    ...cliPrefix,
    '-e',
    envId,
    'storage',
    'upload',
    sourceDir,
    cloudPath,
    '--times',
    '3',
  ];
  console.log(`${command} ${args.join(' ')}`);
  runCommand(command, args);
}

function runCommand(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`command failed with exit code ${result.status ?? 'unknown'}`);
  }
}

async function updatePostgresImages(baseUrl: string) {
  const url = process.env.DATABASE_URL;
  if (!url || process.env.SKIP_POSTGRES_IMAGE_URL_UPDATE === '1') {
    console.log('Postgres image URL update skipped');
    return;
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const stores = await client.query(
      `UPDATE stores
       SET cover_url = $1 || substring(cover_url from $2)
       WHERE cover_url LIKE $3`,
      [baseUrl, CATALOG_IMAGE_LOCAL_PREFIX.length + 1, `${CATALOG_IMAGE_LOCAL_PREFIX}%`],
    );
    const items = await client.query(
      `UPDATE menu_items
       SET image_url = $1 || substring(image_url from $2)
       WHERE image_url LIKE $3`,
      [baseUrl, CATALOG_IMAGE_LOCAL_PREFIX.length + 1, `${CATALOG_IMAGE_LOCAL_PREFIX}%`],
    );
    console.log(`Postgres updated: ${stores.rowCount ?? 0} stores, ${items.rowCount ?? 0} menu_items`);
  } finally {
    await client.end();
  }
}

async function updateCloudBaseImages(baseUrl: string) {
  const db = createCloudBaseDatabase();
  const storeCount = await updateCloudBaseCollection(db, collections.stores, 'coverUrl', baseUrl);
  const itemCount = await updateCloudBaseCollection(db, collections.menuItems, 'imageUrl', baseUrl);
  console.log(`CloudBase updated: ${storeCount} stores, ${itemCount} menu_items`);
}

async function updateCloudBaseCollection(
  db: ReturnType<typeof createCloudBaseDatabase>,
  collectionName: string,
  field: 'coverUrl' | 'imageUrl',
  baseUrl: string,
): Promise<number> {
  const collection = db.collection<Record<string, unknown>>(collectionName);
  let count = 0;
  const pageSize = 100;
  for (let skip = 0;; skip += pageSize) {
    const rows = await collection.list({ skip, limit: pageSize });
    for (const row of rows) {
      const rewritten = rewriteCatalogRecordImages(collectionName, row, baseUrl);
      if (rewritten[field] === row[field]) continue;
      const id = String(row._id ?? row.id);
      await collection.update(id, { [field]: rewritten[field] });
      count += 1;
    }
    if (rows.length < pageSize) break;
  }
  return count;
}

async function verifySampleUrls(baseUrl: string) {
  const files = readdirSync(sourceDir, { withFileTypes: true })
    .filter((item) => item.isFile() && item.name.endsWith('.webp'))
    .slice(0, 10);
  for (const file of files) {
    const url = `${baseUrl}/${file.name}`;
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) throw new Error(`HEAD ${url} failed: ${response.status}`);
  }
  console.log(`verified ${files.length} catalog image URLs`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
