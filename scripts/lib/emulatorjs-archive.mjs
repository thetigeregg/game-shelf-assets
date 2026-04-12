/** @param {string} url */
export function archiveKindFromUrl(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith('.7z')) return '7z';
  return 'tar.gz';
}
