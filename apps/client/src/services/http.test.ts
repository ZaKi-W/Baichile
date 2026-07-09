import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestApi } from './http';

describe('requestApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls the configured CloudBase function', async () => {
    const callFunction = vi.fn().mockResolvedValue({ result: { ok: true, data: { checkedIn: true } } });
    vi.stubGlobal('wx', {
      cloud: { callFunction },
    });

    await expect(requestApi('POST', '/v1/accounts/me/check-in', 'account-token'))
      .resolves.toEqual({ checkedIn: true });

    expect(callFunction).toHaveBeenCalledWith({
      name: 'api',
      data: {
        method: 'POST',
        path: '/v1/accounts/me/check-in',
        data: undefined,
        authorization: 'Bearer account-token',
      },
    });
  });
});
