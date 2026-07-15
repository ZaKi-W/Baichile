import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const listAddresses = vi.fn();

vi.mock('../services/addresses', () => ({
  addressService: {
    list: listAddresses,
    save: vi.fn(),
    remove: vi.fn(),
  },
}));

describe('address store ownership', () => {
  const storage = new Map<string, unknown>();

  beforeEach(() => {
    vi.resetModules();
    listAddresses.mockReset();
    storage.clear();
    setActivePinia(createPinia());
    vi.stubGlobal('uni', {
      getStorageSync: vi.fn((key: string) => storage.get(key) ?? ''),
      setStorageSync: vi.fn((key: string, value: unknown) => storage.set(key, value)),
    });
    vi.stubGlobal('wx', {
      cloud: {
        callFunction: vi.fn().mockResolvedValue({
          result: { ok: true, data: { visitorId: 'visitor_new', accessToken: 'guest.new' } },
        }),
      },
    });
  });

  it('starts empty instead of exposing global demo addresses', async () => {
    storage.set('baichile:addresses', [{ id: 'demo_address' }]);
    listAddresses.mockResolvedValue([]);
    const { useAddressStore } = await import('./address');
    const addresses = useAddressStore();

    await addresses.load();

    expect(addresses.addresses).toEqual([]);
    expect(addresses.selected).toMatchObject({
      id: 'addr_default_ganfan_station',
      address: '上海市黄浦区干饭研究院',
    });
    expect(listAddresses).toHaveBeenCalledOnce();
  });

  it('keeps the selected address scoped to the current account', async () => {
    storage.set('baichile:account', {
      accountId: 'account_me',
      accessToken: 'account.token',
      provider: 'wechat',
      profile: { avatarUrl: 'avatar', nickname: '我' },
    });
    storage.set('baichile:visitor', {
      visitorId: 'visitor_me',
      accessToken: 'guest.token',
    });
    storage.set('baichile:selected-address:account_other', 'addr_other');
    listAddresses.mockResolvedValue([{
      id: 'addr_mine', name: '我', phone: '13800000000', address: '我的地址',
      detail: '', tag: '家', lat: 31, lng: 121, isDefault: true,
    }]);
    const { useAddressStore } = await import('./address');
    const addresses = useAddressStore();

    await addresses.load();

    expect(addresses.selected?.id).toBe('addr_mine');
    expect(addresses.selectedId).toBe('addr_mine');
  });
});
