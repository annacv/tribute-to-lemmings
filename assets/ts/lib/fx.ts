export const prefersReducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Removes and re-adds an animation class so the CSS animation restarts even
    when it is still running (the reflow read resets the animation clock). */
export function restartAnimation(el: Element | null, className: string): void {
  if (!el) return;
  el.classList.remove(className);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(className);
}
