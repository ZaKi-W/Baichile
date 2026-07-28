import type { HomeResponse, StoreDetail, StoreSummary } from '@baichile/api-contract';
import { requestApi } from './http';

const HOME_TTL_MS = 30_000;
const STORE_TTL_MS = 60_000;
let homeCache: { value: HomeResponse; updatedAt: number } | undefined;
let homeRequest: Promise<HomeResponse> | undefined;
const storeCache = new Map<string, { value: StoreDetail; updatedAt: number }>();
const storeRequests = new Map<string, Promise<StoreDetail>>();
const listCache = new Map<string, { value: StoreSummary[]; updatedAt: number }>();
const listRequests = new Map<string, Promise<StoreSummary[]>>();

async function fetchHome(): Promise<HomeResponse> {
  if (!homeRequest) {
    homeRequest = requestApi<HomeResponse>('GET', '/v1/catalog/home', '')
      .then((value) => {
        homeCache = { value, updatedAt: Date.now() };
        return value;
      })
      .finally(() => {
        homeRequest = undefined;
      });
  }
  return homeRequest;
}

async function fetchStore(id: string): Promise<StoreDetail> {
  const active = storeRequests.get(id);
  if (active) return active;
  const request = requestApi<StoreDetail>('GET', `/v1/catalog/stores/${encodeURIComponent(id)}`, '')
    .then((value) => {
      storeCache.set(id, { value, updatedAt: Date.now() });
      return value;
    })
    .finally(() => {
      storeRequests.delete(id);
    });
  storeRequests.set(id, request);
  return request;
}

async function fetchList(key: string, path: string): Promise<StoreSummary[]> {
  const active = listRequests.get(key);
  if (active) return active;
  const request = requestApi<StoreSummary[]>('GET', path, '')
    .then((value) => {
      listCache.set(key, { value, updatedAt: Date.now() });
      return value;
    })
    .finally(() => listRequests.delete(key));
  listRequests.set(key, request);
  return request;
}

function isFresh(updatedAt: number, ttlMs: number): boolean {
  return Date.now() - updatedAt < ttlMs;
}

function revalidateInBackground<T>(request: Promise<T>, onUpdate?: (value: T) => void): void {
  void request.then((value) => onUpdate?.(value)).catch(() => undefined);
}

async function listStaleWhileRevalidate(key: string, path: string): Promise<StoreSummary[]> {
  const cached = listCache.get(key);
  if (!cached) return fetchList(key, path);
  if (!isFresh(cached.updatedAt, HOME_TTL_MS)) {
    revalidateInBackground(fetchList(key, path));
  }
  return cached.value;
}

export const catalogService = {
  async home(options: { force?: boolean } = {}): Promise<HomeResponse> {
    if (!options.force && homeCache) {
      if (!isFresh(homeCache.updatedAt, HOME_TTL_MS)) {
        revalidateInBackground(fetchHome());
      }
      return homeCache.value;
    }
    return fetchHome();
  },
  async homeStaleWhileRevalidate(onUpdate: (value: HomeResponse) => void): Promise<HomeResponse> {
    if (!homeCache) return fetchHome();
    if (!isFresh(homeCache.updatedAt, HOME_TTL_MS)) {
      revalidateInBackground(fetchHome(), onUpdate);
    }
    return homeCache.value;
  },
  async store(id: string, options: { force?: boolean } = {}): Promise<StoreDetail> {
    const cached = storeCache.get(id);
    if (!options.force && cached) {
      if (!isFresh(cached.updatedAt, STORE_TTL_MS)) {
        revalidateInBackground(fetchStore(id));
      }
      return cached.value;
    }
    return fetchStore(id);
  },
  async search(query: string): Promise<StoreSummary[]> {
    const normalized = query.trim();
    return listStaleWhileRevalidate(
      `search:${normalized}`,
      `/v1/catalog/search?q=${encodeURIComponent(normalized)}`,
    );
  },
  async byCategory(categoryId: string): Promise<StoreSummary[]> {
    return listStaleWhileRevalidate(
      `category:${categoryId}`,
      `/v1/catalog/stores?categoryId=${encodeURIComponent(categoryId)}`,
    );
  },
};
