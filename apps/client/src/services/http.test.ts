import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestApi, resolveCloudTransport } from './http';

const webCloudCall = vi.hoisted(() => vi.fn());
vi.mock('../platform/cloudbase-web', () => ({
  callWebCloudFunction: webCloudCall,
}));

describe('requestApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    webCloudCall.mockReset();
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

  it('uses the Web SDK transport in a browser without wx.cloud', async () => {
    vi.stubGlobal('window', { location: {} });
    vi.stubGlobal('wx', undefined);
    webCloudCall.mockResolvedValue({ ok: true, data: { platform: 'h5' } });

    expect(resolveCloudTransport()).toBe('web');
    await expect(requestApi('GET', '/v1/health', '')).resolves.toEqual({ platform: 'h5' });
    expect(webCloudCall).toHaveBeenCalledWith({
      method: 'GET',
      path: '/v1/health',
      data: undefined,
      authorization: '',
    });
  });

  it('prefers wx.cloud when both runtime globals exist', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('wx', { cloud: {} });
    expect(resolveCloudTransport()).toBe('wechat');
  });
});
