export interface MenuButtonRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export function getSafeMenuButtonRect(systemInfo = uni.getSystemInfoSync()): MenuButtonRect {
  const platformUni = uni as typeof uni & {
    getMenuButtonBoundingClientRect?: () => MenuButtonRect;
  };
  if (typeof platformUni.getMenuButtonBoundingClientRect === 'function') {
    return platformUni.getMenuButtonBoundingClientRect();
  }
  const top = (systemInfo.statusBarHeight ?? 0) + 8;
  const height = 32;
  const right = systemInfo.windowWidth - 12;
  const width = 88;
  return {
    top,
    bottom: top + height,
    left: right - width,
    right,
    width,
    height,
  };
}
