function drawConnectors(root) {
  const rootRect = root.getBoundingClientRect();
  for (const path of root.querySelectorAll('path[data-feeder-node-key][data-target-node-key]')) {
    const fromKey = path.getAttribute('data-feeder-node-key');
    const toKey = path.getAttribute('data-target-node-key');
    const from = root.querySelector(`[data-node-key="${CSS.escape(fromKey)}"]`);
    const to = root.querySelector(`[data-node-key="${CSS.escape(toKey)}"]`);
    if (!from || !to) continue;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const x1 = a.right - rootRect.left;
    const y1 = a.top + a.height / 2 - rootRect.top;
    const x2 = b.left - rootRect.left;
    const y2 = b.top + b.height / 2 - rootRect.top;
    const mid = x1 + (x2 - x1) / 2;
    path.setAttribute('d', `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`);
  }
}

for (const root of document.querySelectorAll('[data-bracket-connect]')) {
  drawConnectors(root);
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => drawConnectors(root)).observe(root);
  } else {
    window.addEventListener('resize', () => drawConnectors(root));
  }
}
