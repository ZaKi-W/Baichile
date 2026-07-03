import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

export type CatalogTranslationKind = 'store' | 'item';

export interface CatalogTranslationEntry {
  kind: CatalogTranslationKind;
  source: string;
  id: string;
  original: string;
}

export type CatalogTranslationCache = Record<string, string>;
export type TextTranslator = (text: string) => Promise<string>;

const OFFICIAL_MERCHANT_NAMES: Array<[RegExp, string]> = [
  [/^mcdonald'?s(?:®)?/i, '麦当劳'],
  [/^gong cha\b/i, '贡茶'],
  [/^sugarfish\b/i, 'SUGARFISH'],
];

export function catalogTranslationKey(
  kind: CatalogTranslationKind,
  source: string,
  id: string,
  original: string,
): string {
  const fingerprint = createHash('sha256').update(original).digest('hex').slice(0, 16);
  return `${kind}:${source}:${id}:${fingerprint}`;
}

export async function translateMerchantName(
  original: string,
  translate: TextTranslator,
): Promise<string> {
  const official = OFFICIAL_MERCHANT_NAMES.find(([pattern]) => pattern.test(original));
  const baseName = official?.[1];
  const withoutOfficial = official ? original.replace(official[0], '').trim() : original;
  const parenthesized = withoutOfficial.match(/^\((.+)\)$/);
  if (baseName && parenthesized) {
    return `${baseName}（${await translate(parenthesized[1])}）`;
  }

  const location = withoutOfficial.match(/^(.*?)\s*-\s+(.+)$/);
  if (location) {
    const brand = baseName || location[1].trim();
    return `${brand} - ${await translate(location[2].trim())}`;
  }
  return baseName || original;
}

export async function buildCatalogTranslations(
  entries: CatalogTranslationEntry[],
  initial: CatalogTranslationCache,
  translate: TextTranslator,
  onCheckpoint?: (cache: CatalogTranslationCache) => void,
  concurrency = 1,
): Promise<CatalogTranslationCache> {
  const cache = { ...initial };
  const pending = entries.filter((entry) => !cache[
    catalogTranslationKey(entry.kind, entry.source, entry.id, entry.original)
  ]);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < pending.length) {
      const entry = pending[nextIndex];
      nextIndex += 1;
    const key = catalogTranslationKey(entry.kind, entry.source, entry.id, entry.original);
      try {
        cache[key] = entry.kind === 'store'
          ? await translateMerchantName(entry.original, translate)
          : await translate(entry.original);
      } catch {
        cache[key] = entry.original;
      }
      onCheckpoint?.(cache);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(concurrency, pending.length || 1)) },
      () => worker(),
    ),
  );
  return cache;
}

export function loadCatalogTranslationCache(path: string): CatalogTranslationCache {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8')) as CatalogTranslationCache;
}

export function saveCatalogTranslationCache(
  path: string,
  cache: CatalogTranslationCache,
): void {
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  renameSync(temporaryPath, path);
}

export async function requestChineseTranslation(text: string): Promise<string> {
  const query = new URLSearchParams({
    client: 'gtx',
    sl: 'auto',
    tl: 'zh-CN',
    dt: 't',
    q: text,
  });
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`https://translate.googleapis.com/translate_a/single?${query}`);
      if (!response.ok) throw new Error(`translation HTTP ${response.status}`);
      const payload = await response.json() as Array<Array<[string]>>;
      const translated = payload[0]?.map((part) => part[0]).join('').trim();
      if (!translated) throw new Error('empty translation');
      return translated;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError;
}
