import 'dotenv/config';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import dataSource from '../database/typeorm.data-source';
import {
  buildMultiSourceImport,
  importBuiltCatalog,
  type CatalogSourceInput,
  type ChownowStore,
} from '../database/catalog.chownow-import';
import {
  buildCatalogTranslations,
  catalogTranslationKey,
  loadCatalogTranslationCache,
  requestChineseTranslation,
  saveCatalogTranslationCache,
  type CatalogTranslationEntry,
} from './catalog-translations';

const cachePath = resolve(__dirname, '../../data/catalog-translations.json');

function loadStores(inputDirectory: string): ChownowStore[] {
  return readdirSync(inputDirectory)
    .map((name) => join(inputDirectory, name))
    .filter((path) => statSync(path).isDirectory())
    .map((path) => join(path, 'metadata.json'))
    .filter(existsSync)
    .map((path) => JSON.parse(readFileSync(path, 'utf8')) as ChownowStore);
}

function parseInputs(args: string[]): CatalogSourceInput[] {
  const inputs = args.filter((arg) => !arg.startsWith('--')).map((arg) => {
    const separator = arg.indexOf('=');
    if (separator < 1) throw new Error(`目录参数格式应为 source=/path，收到：${arg}`);
    const source = arg.slice(0, separator).trim();
    const directory = resolve(arg.slice(separator + 1));
    if (!existsSync(directory)) throw new Error(`目录不存在：${directory}`);
    return { source, stores: loadStores(directory) };
  });
  if (!inputs.length) {
    throw new Error('请提供至少一个 source=/path 数据目录');
  }
  return inputs;
}

function splitStableId(stableId: string): { source: string; id: string } {
  const separator = stableId.indexOf(':');
  return {
    source: stableId.slice(0, separator),
    id: stableId.slice(separator + 1),
  };
}

function translationEntries(
  catalog: ReturnType<typeof buildMultiSourceImport>,
): CatalogTranslationEntry[] {
  return [
    ...catalog.stores.map((store) => {
      const { source, id } = splitStableId(String(store.id));
      return { kind: 'store' as const, source, id, original: String(store.name) };
    }),
    ...catalog.menuItems.map((item) => {
      const { source, id } = splitStableId(String(item.id));
      return { kind: 'item' as const, source, id, original: String(item.name) };
    }),
  ];
}

async function main() {
  const args = process.argv.slice(2);
  const inputs = parseInputs(args);
  const untranslatedCatalog = buildMultiSourceImport(inputs);
  const entries = translationEntries(untranslatedCatalog);
  let cache = loadCatalogTranslationCache(cachePath);

  if (args.includes('--translate')) {
    let checkpoints = 0;
    cache = await buildCatalogTranslations(
      entries,
      cache,
      requestChineseTranslation,
      (nextCache) => {
        checkpoints += 1;
        if (checkpoints % 10 === 0) saveCatalogTranslationCache(cachePath, nextCache);
      },
      6,
    );
    saveCatalogTranslationCache(cachePath, cache);
  }

  const missingTranslations = entries.filter((entry) => !cache[
    catalogTranslationKey(entry.kind, entry.source, entry.id, entry.original)
  ]).length;
  const catalog = buildMultiSourceImport(
    inputs,
    existsSync,
    cache,
    catalogTranslationKey,
  );
  const summary = {
    sources: inputs.map((input) => ({
      source: input.source,
      readStores: input.stores.length,
      readMenuItems: input.stores.reduce(
        (total, store) => total + (store.menuItems?.length ?? 0),
        0,
      ),
    })),
    finalStores: catalog.stores.length,
    finalMenuItems: catalog.menuItems.length,
    filteredStores: inputs.reduce((total, input) => total + input.stores.length, 0)
      - catalog.stores.length,
    filteredOrDuplicateMenuItems: inputs.reduce(
      (total, input) => total + input.stores.reduce(
        (subtotal, store) => subtotal + (store.menuItems?.length ?? 0),
        0,
      ),
      0,
    ) - catalog.menuItems.length,
    missingTranslations,
  };

  if (args.includes('--dry-run') || args.includes('--translate')) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  if (missingTranslations) {
    throw new Error(`仍有 ${missingTranslations} 条名称没有翻译缓存，请先运行 --translate`);
  }

  await dataSource.initialize();
  await dataSource.runMigrations();
  const result = await importBuiltCatalog(dataSource, catalog, { replaceDerived: true });
  console.log(JSON.stringify({ ...summary, imported: result }, null, 2));
  await dataSource.destroy();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exitCode = 1;
});
