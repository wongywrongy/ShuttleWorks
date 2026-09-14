/** Hand a Blob to the browser's download flow without navigating away. */
export function saveBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** The server-chosen name from ``Content-Disposition``, else ``fallback``.
 *  Path separators are stripped: the header is data, not a path. */
export function attachmentFilename(disposition: string | undefined, fallback: string): string {
  const quoted = disposition ? /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1] : undefined;
  let name = quoted;
  if (name) {
    try { name = decodeURIComponent(name); } catch { /* keep the raw value */ }
  }
  const safe = name?.replace(/[\\/]/g, '_').trim();
  return safe || fallback;
}
