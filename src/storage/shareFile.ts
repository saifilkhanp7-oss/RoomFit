import { isIOS } from '../hooks/usePlatform';

/**
 * Give a file to the user.
 * - iPhone/iPad/Android: open the share sheet (Save Image, Files, WhatsApp…).
 * - Laptop: normal download.
 * - Old iPhones without file sharing: open the file in a new tab to long-press and save.
 * Returns 'shared' | 'downloaded' | 'opened' | 'cancelled'.
 */
export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<'shared' | 'downloaded' | 'opened' | 'cancelled'> {
  const touch = isIOS() || /Android/i.test(navigator.userAgent);
  if (touch && typeof navigator.share === 'function' && typeof File !== 'undefined') {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title });
        return 'shared';
      } catch (e) {
        if ((e as Error).name === 'AbortError') return 'cancelled';
        // fall through to download
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  if ('download' in a && !(isIOS() && !navigator.share)) {
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return 'downloaded';
  }
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'opened';
}
