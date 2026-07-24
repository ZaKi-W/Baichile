import { describe, expect, it, vi } from 'vitest';
import { getSafeMenuButtonRect } from './system-ui';

describe('system UI platform fallback', () => {
  it('uses a browser-safe header rectangle when the mini-program API is absent', () => {
    vi.stubGlobal('uni', {});
    expect(getSafeMenuButtonRect({
      statusBarHeight: 0,
      windowWidth: 390,
    } as UniApp.GetSystemInfoResult)).toEqual({
      top: 8,
      bottom: 40,
      left: 290,
      right: 378,
      width: 88,
      height: 32,
    });
  });
});
