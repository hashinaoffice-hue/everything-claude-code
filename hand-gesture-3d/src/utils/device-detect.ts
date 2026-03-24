export interface DeviceInfo {
  readonly isMobile: boolean;
  readonly isIOS: boolean;
  readonly pixelRatio: number;
}

export function detectDevice(): DeviceInfo {
  const ua = navigator.userAgent;
  const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry/i.test(ua) ||
    (navigator.maxTouchPoints > 0 && /Macintosh/i.test(ua));
  const isIOS = /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 0);
  const pixelRatio = Math.min(window.devicePixelRatio ?? 1, 2);

  return { isMobile, isIOS, pixelRatio };
}
