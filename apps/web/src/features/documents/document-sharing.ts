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
