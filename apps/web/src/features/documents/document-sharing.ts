export function canShare(file: File): boolean {
  try {
    return (
      window.isSecureContext !== false &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    );
  } catch {
    return false;
  }
}

/** Mobile printing uses the OS share sheet and installed printer apps. */
export function prefersSystemSharing(): boolean {
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent ?? '') ||
    (/Macintosh/i.test(navigator.userAgent ?? '') && navigator.maxTouchPoints > 1);
  return mobile && canShare(new File([], 'ticket.pdf', { type: 'application/pdf' }));
}
