import { afterEach, describe, expect, it, vi } from 'vitest';
import { suggestPlaces } from './location';

describe('location service', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests suggestions through the CloudBase API function', async () => {
    const callFunction = vi.fn().mockResolvedValue({ result: { ok: true, data: [] } });
    vi.stubGlobal('wx', {
      cloud: { callFunction },
    });

    await expect(suggestPlaces('小区')).resolves.toEqual([]);
    expect(callFunction).toHaveBeenCalledWith({
      name: 'api',
      data: {
        method: 'GET',
        path: '/v1/map/suggest?keyword=%E5%B0%8F%E5%8C%BA',
        data: undefined,
        authorization: '',
      },
    });
  });
});
