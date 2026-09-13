import type { DefaultTreeAdapterTypes } from 'parse5';

export function documentText(node: DefaultTreeAdapterTypes.Node): string {
  if ('tagName' in node && (node.tagName === 'script' || node.tagName === 'style')) return '';
  if ('value' in node) return node.value;
  return 'childNodes' in node ? node.childNodes.map(documentText).join(' ') : '';
}
