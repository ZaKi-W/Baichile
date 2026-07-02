import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestApi } from './http';

describe('requestApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses a non-JSON content type for a POST without input data', async () => {
    let requestOptions: UniApp.RequestOptions | undefined;
    vi.stubGlobal('uni', {
      request(options: UniApp.RequestOptions) {
        requestOptions = options;
        options.success?.({
          data: { ok: true },
          statusCode: 200,
          header: {},
          cookies: [],
          errMsg: 'request:ok',
        });
      },
    });

    await requestApi('POST', '/v1/accounts/me/check-in', 'account-token');

    expect(requestOptions?.data).toBeUndefined();
    expect(requestOptions?.header).toMatchObject({
      Authorization: 'Bearer account-token',
      'Content-Type': 'application/x-www-form-urlencoded',
    });
  });
});
