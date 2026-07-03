import type { StalactiteBreaks, StalactiteSize } from './score';
import { restartAnimation } from './fx';

/* Heads-Up Display controller, world-agnostic: any screen that keeps the
   established HUD class names (.seconds-value, .level-value, .lives-*) can
   reuse it as-is. Lookups are memoized — the HUD is static for the lifetime of
   a game screen, so each element hits the DOM once instead of every frame. */
export class Hud {
  private readonly cache = new Map<string, HTMLElement | null>();
  private lastScore: number | null = null;

  private query(selector: string): HTMLElement | null {
    if (!this.cache.has(selector)) this.cache.set(selector, document.querySelector(selector));
    return this.cache.get(selector) ?? null;
  }

  setScore(score: number): boolean {
    if (score === this.lastScore) return false;
    this.lastScore = score;
    const el = this.query('.seconds-value');
    if (el) el.textContent = String(score);
    return true;
  }

  setTimeWarning(on: boolean): void {
    this.query('.seconds-value')?.classList.toggle('time-warning', on);
  }

  /** Floats a self-removing "+N" pop below the level slot. */
  popBank(points: number): void {
    const slot = this.query('.level-item');
    if (!slot) return;
    const pop = document.createElement('span');
    pop.className = 'bank-pop';
    pop.textContent = `+${points}`;
    slot.appendChild(pop);
    pop.addEventListener('animationend', () => pop.remove(), { once: true });
  }

  private blinkHudText(container: HTMLElement): void {
    container.querySelectorAll('.hud-label, .hud-value').forEach((el) => {
      restartAnimation(el, 'blink');
    });
  }

  blinkHudScore(): void {
    const score = this.query('.hud-score');
    if (score) this.blinkHudText(score);
  }

  /** Floats "+N" and blinks the score slot when points are banked. */
  scoreGain(points: number): void {
    this.popBank(points);
    this.blinkHudScore();
  }

  setLevel(label: string): void {
    const level = this.query('.level-value');
    if (level) level.textContent = label;
    const levelItem = this.query('.level-item');
    if (levelItem) this.blinkHudText(levelItem);
  }

  showLevelBanner(label: string): void {
    const banner = this.query('.level-up-banner');
    if (!banner) return;
    banner.textContent = label;
    restartAnimation(banner, 'show');
  }

  showLevelUpEffect(levelLabel: string): void {
    this.showLevelBanner(levelLabel);
    restartAnimation(document.querySelector('.game-stage'), 'flash-active');
  }

  setLivesValue(lives: number): void {
    const el = this.query('.lives-value');
    if (el) el.textContent = String(lives);
  }

  initLivesIcons(lives: number, iconSrc: string): void {
    const container = this.query('.lives-icons');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 0; i < lives; i++) {
      const img = document.createElement('img');
      img.src = iconSrc;
      img.className = 'life-icon';
      img.alt = '';
      container.appendChild(img);
    }
  }

  displayLives(lives: number): void {
    this.setLivesValue(lives);
    const container = this.query('.lives-icons');
    if (!container) return;

    const activeIcons = container.querySelectorAll('.life-icon:not(.life-losing)');
    const excess = activeIcons.length - Math.max(0, lives);

    for (let i = 0; i < excess; i++) {
      const icon = activeIcons[activeIcons.length - 1 - i] as HTMLElement;
      icon.classList.add('life-losing');
      icon.addEventListener('animationend', () => icon.remove(), { once: true });
    }

    if (excess > 0) restartAnimation(this.query('.lives-item'), 'blink');
  }

  setAbyssBombs(carried: number, cap: number): void {
    const el = this.query('.abyss-bombs');
    if (el) el.textContent = `${carried}/${cap}`;
  }

  updateAbyssStalactites(breaks: StalactiteBreaks, availableSizes: readonly StalactiteSize[]): void {
    for (const size of ['small', 'medium', 'large'] as const) {
      const item = this.query(`.abyss-stal[data-size="${size}"]`);
      if (!item) continue;

      const available = availableSizes.includes(size);
      item.toggleAttribute('hidden', !available);

      if (available) {
        const count = item.querySelector('.abyss-hint-count');
        if (count) count.textContent = String(breaks[size]);
      }
    }
  }
}
