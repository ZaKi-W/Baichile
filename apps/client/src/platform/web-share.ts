export async function shareWebPage(title: string, miniProgramPath?: string): Promise<boolean> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const url = miniProgramPath
    ? `${window.location.origin}${window.location.pathname}#${miniProgramPath.startsWith('/') ? miniProgramPath : `/${miniProgramPath}`}`
    : window.location.href;
  if (navigator.share) {
    try {
      await navigator.share({ title, text: title, url });
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
    }
  }
  await copyWebText(url);
  uni.showToast({ title: '分享链接已复制', icon: 'success' });
  return true;
}

export async function downloadWebFile(filePath: string, filename: string): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  const anchor = document.createElement('a');
  anchor.href = filePath;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return true;
}

async function copyWebText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    uni.setClipboardData({
      data: text,
      success: () => resolve(),
      fail: reject,
    });
  });
}
