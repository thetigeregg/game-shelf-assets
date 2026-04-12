/** @param {string} url */
export function archiveKindFromUrl(url) {
  let pathname;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    throw new TypeError(`Invalid source URL: ${url}`);
  }
  if (pathname.endsWith('.7z')) return '7z';
  if (pathname.endsWith('.tar.gz') || pathname.endsWith('.tgz')) return 'tar.gz';
  throw new Error(
    `Unsupported archive URL path "${pathname}". Expected a path ending in .7z, .tar.gz, or .tgz.`
  );
}
