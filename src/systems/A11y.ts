/**
 * Screen reader accessibility helper.
 * Updates the visually-hidden aria-live polite container in index.html.
 *
 * Clears then re-sets text so repeated identical messages still fire (AT often
 * skips unchanged live-region content).
 */
export function announce(message: string): void {
  const el = document.getElementById('game-a11y-status');
  if (!el) return;
  el.textContent = '';
  // Microtask/timeout so assistive tech notices the change before the new text.
  window.setTimeout(() => {
    el.textContent = message;
  }, 0);
}
