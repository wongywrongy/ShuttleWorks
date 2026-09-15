/**
 * Signup's Turnstile controller.
 *
 * This is intentionally a small external module: entrant pages do not ship
 * React hydration or inline scripts. It makes the widget's loading, expiry,
 * and provider-error states visible and recoverable without weakening the
 * server-side verification requirement. A token is still accepted only by
 * FastAPI's `verify_turnstile`; this module never treats rendering as proof.
 */

const container = document.getElementById('turnstile-widget');
const status = document.getElementById('turnstile-status');
const help = document.getElementById('turnstile-help');

if (container && status) {
  let widgetId = null;
  let retryButton = null;
  let timer = null;
  let attempts = 0;

  const setStatus = (message, tone = 'muted') => {
    status.textContent = message;
    if (help) help.hidden = tone === 'success';
    status.className =
      tone === 'error'
        ? 'text-sm text-status-attention'
        : tone === 'success'
          ? 'text-sm text-status-live'
          : 'text-sm text-muted-foreground';
  };

  const removeRetry = () => {
    retryButton?.remove();
    retryButton = null;
  };

  const addRetry = () => {
    if (retryButton) return;
    retryButton = document.createElement('button');
    retryButton.type = 'button';
    // The twin of `BUTTON_SECONDARY` in `app/lib/ui.ts`, byte-identical and
    // pinned so by `tests/uiTwins.test.ts`. A browser ES module cannot
    // import that file, so the string is copied — which is exactly the drift
    // A-9/A-13 found: this copy wore the 44px control's radius on a 40px
    // control and carried no focus ring at all.
    retryButton.className =
      'inline-flex min-h-10 select-none items-center justify-center rounded border border-rule-control px-4 py-2 text-sm font-semibold tracking-[0.01em] text-foreground transition-colors duration-fast ease-out-quick ring-offset-surface-base hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground';
    retryButton.textContent = 'Try the human check again';
    retryButton.addEventListener('click', () => {
      removeRetry();
      attempts = 0;
      start();
    });
    status.insertAdjacentElement('afterend', retryButton);
  };

  const error = (message) => {
    if (timer) window.clearTimeout(timer);
    timer = null;
    setStatus(message, 'error');
    addRetry();
  };

  const start = () => {
    const api = window.turnstile;
    if (!api || typeof api.render !== 'function') {
      attempts += 1;
      if (attempts > 100) {
        error('The human check could not load. Check your connection and try again.');
        return;
      }
      timer = window.setTimeout(start, 100);
      return;
    }

    removeRetry();
    setStatus('Complete the human check to continue.');
    if (widgetId !== null && typeof api.reset === 'function') {
      api.reset(widgetId);
      return;
    }

    try {
      widgetId = api.render(container, {
        sitekey: container.dataset.sitekey,
        action: container.dataset.action || 'signup',
        callback: () => setStatus('Human check complete.', 'success'),
        'expired-callback': () => setStatus('The human check expired. Complete it again.', 'error'),
        'error-callback': () => error('The human check could not load. Try again.'),
      });
    } catch {
      widgetId = null;
      error('The human check could not load. Try again.');
    }
  };

  start();
}
