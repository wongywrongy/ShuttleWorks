/** Small, optional controls for the regulations document.
 *
 * The document is complete HTML without this module. Print remains a native
 * browser action and download creates a plain-text copy of the visible
 * document, with no private request or inline script.
 */

export function documentText(root) {
  const title = root?.getAttribute('data-document-title') || 'Tournament regulations';
  const documentNode = root?.ownerDocument?.getElementById('regulations-document');
  const content = (documentNode?.innerText || documentNode?.textContent || '').trim();
  return `${title}\n\n${content}\n`;
}

export function downloadText(root) {
  const doc = root?.ownerDocument;
  const view = doc?.defaultView;
  if (!doc || !view || typeof view.Blob === 'undefined') return false;
  const blob = new view.Blob([documentText(root)], { type: 'text/plain;charset=utf-8' });
  const url = view.URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = 'tournament-regulations.txt';
  link.click();
  view.setTimeout(() => view.URL.revokeObjectURL(url), 0);
  return true;
}

export function boot(root) {
  const view = root?.ownerDocument?.defaultView;
  if (!root || !view) return;
  root.hidden = false;
  root.querySelector('[data-regulations-print]')?.addEventListener('click', () => view.print());
  root.querySelector('[data-regulations-download]')?.addEventListener('click', () => downloadText(root));
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('regulations-actions');
  if (root) boot(root);
}
