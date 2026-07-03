import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from '../src/catalog.service';
import { AuthService } from '../src/auth.service';

describe('managed client protections', () => {
  it('queries only active stores and menu items', async () => {
    const stores = { find: vi.fn().mockResolvedValue([]) };
    const menuItems = { find: vi.fn().mockResolvedValue([]) };
    const categories = { find: vi.fn() };
    const subCategories = { find: vi.fn().mockResolvedValue([]) };
    const service = new CatalogService(
      categories as never,
      stores as never,
      menuItems as never,
      subCategories as never,
    );

    await service.list();

    expect(stores.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'active' },
    }));
  });

  it('rejects a disabled persisted account', async () => {
    const accounts = {
      findOneBy: vi.fn().mockResolvedValue({ id: 'account_test', status: 'disabled' }),
    };
    const service = new AuthService(accounts as never, {} as never, {} as never);

    await expect(service.resolvePersistedIdentity('Bearer account.test'))
      .rejects.toMatchObject({ status: 401 });
  });
});
