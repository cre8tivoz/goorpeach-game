/**
 * Screen reader accessibility helper.
 * Updates the visually-hidden aria-live polite container in index.html.
 */
export function announce(message: string): void {
  const el = document.getElementById('game-a11y-status');
  if (el) {
    el.textContent = message;
  }
}
