// Shared page scroll lock for game engines and the result modal. Hiding the
// root scrollbar is the only way to stop a fast click near the arena's edge
// from landing on the scrollbar track and page-jumping the window. The
// scrollbar-gutter reserved in global.css keeps the layout width identical
// while the scrollbar is hidden.
//
// Locks are keyed by reason so overlapping owners (a running game, the arena
// hover guard, the result modal) cannot clobber each other's unlock.

const reasons = new Set<string>();

export function lockPageScroll(reason: string, locked: boolean): void {
  if (locked) reasons.add(reason);
  else reasons.delete(reason);
  document.documentElement.style.overflow = reasons.size > 0 ? 'hidden' : '';
}
