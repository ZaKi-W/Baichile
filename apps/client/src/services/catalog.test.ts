import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeResponse, StoreDetail, StoreSummary } from '@baichile/api-contract';

const requestApi = vi.hoisted(() => vi.fn());

vi.mock('./http', () => ({ requestApi }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function home(marker: string): HomeResponse {
  return {
    categories: [],
    featured: [{ id: marker } as StoreSummary],
    flashSaleItems: [],
    storePromotions: [],
    stores: [],
    nextCursor: null,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-28T00:00:00.000Z'));
  requestApi.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('catalog stale-while-revalidate cache', () => {
  it('returns stale home data immediately and merges background refreshes', async () => {
    const firstRequest = deferred<HomeResponse>();
    requestApi.mockReturnValueOnce(firstRequest.promise);
    const { catalogService } = await import('./catalog');

    const first = catalogService.home();
    const duplicate = catalogService.home();
    expect(requestApi).toHaveBeenCalledTimes(1);
    firstRequest.resolve(home('old'));
    await expect(first).resolves.toEqual(home('old'));
    await expect(duplicate).resolves.toEqual(home('old'));

    vi.advanceTimersByTime(30_001);
    const refresh = deferred<HomeResponse>();
    requestApi.mockReturnValueOnce(refresh.promise);
    await expect(catalogService.home()).resolves.toEqual(home('old'));
    await expect(catalogService.home()).resolves.toEqual(home('old'));
    expect(requestApi).toHaveBeenCalledTimes(2);

    refresh.resolve(home('fresh'));
    await refresh.promise;
    await Promise.resolve();
    await expect(catalogService.home()).resolves.toEqual(home('fresh'));
  });

  it('serves a stale store while a forced caller joins the same refresh', async () => {
    const oldStore = { id: 'store_1', name: '旧店铺', menu: [] } as unknown as StoreDetail;
    const freshStore = { id: 'store_1', name: '新店铺', menu: [] } as unknown as StoreDetail;
    requestApi.mockResolvedValueOnce(oldStore);
    const { catalogService } = await import('./catalog');
    await expect(catalogService.store('store_1')).resolves.toBe(oldStore);

    vi.advanceTimersByTime(60_001);
    const refresh = deferred<StoreDetail>();
    requestApi.mockReturnValueOnce(refresh.promise);
    await expect(catalogService.store('store_1')).resolves.toBe(oldStore);
    const forced = catalogService.store('store_1', { force: true });
    expect(requestApi).toHaveBeenCalledTimes(2);

    refresh.resolve(freshStore);
    await expect(forced).resolves.toBe(freshStore);
    await expect(catalogService.store('store_1')).resolves.toBe(freshStore);
  });

  it('uses stale-while-revalidate and request merging for list queries', async () => {
    const oldRows = [{ id: 'old' } as StoreSummary];
    const freshRows = [{ id: 'fresh' } as StoreSummary];
    requestApi.mockResolvedValueOnce(oldRows);
    const { catalogService } = await import('./catalog');
    await expect(catalogService.search('咖啡')).resolves.toBe(oldRows);

    vi.advanceTimersByTime(30_001);
    const refresh = deferred<StoreSummary[]>();
    requestApi.mockReturnValueOnce(refresh.promise);
    await expect(catalogService.search(' 咖啡 ')).resolves.toBe(oldRows);
    await expect(catalogService.search('咖啡')).resolves.toBe(oldRows);
    expect(requestApi).toHaveBeenCalledTimes(2);

    refresh.resolve(freshRows);
    await refresh.promise;
    await Promise.resolve();
    await expect(catalogService.search('咖啡')).resolves.toBe(freshRows);
  });
});
