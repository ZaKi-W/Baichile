import { afterEach, describe, expect, it, vi } from 'vitest';
import { suggestPlaces } from './location';

describe('location service', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('surfaces a useful message when the Tencent Maps quota is exhausted', async () => {
    vi.stubGlobal('uni', {
      request(options: UniApp.RequestOptions) {
        options.success?.({
          data: { message: '此key每日调用量已达到上限' },
          statusCode: 502,
          header: {},
          cookies: [],
          errMsg: 'request:ok',
        });
      },
    });

    await expect(suggestPlaces('小区')).rejects.toThrow('地图服务今日额度已用完，请稍后再试');
  });
});
