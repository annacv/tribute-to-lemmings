import '../test-app-mocks';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import '../main';
import { AbyssGame, ABYSS_TIME_BUDGET_S } from '../worlds/abyss/AbyssGame';
import { stubAnimationFrame } from '../test-helpers';
import { bootDebugScreen, SettledImage, stubAudioTracking } from '../test-dom';

describe('abyss screen win path', () => {
  let audioSrcs: string[] = [];
  let abysses: AbyssGame[] = [];

  beforeAll(() => {
    stubAnimationFrame();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('Image', SettledImage);

    ({ sources: audioSrcs } = stubAudioTracking());
    abysses = [];
    const origStart = AbyssGame.prototype.startGame;

    vi.spyOn(AbyssGame.prototype, 'startGame').mockImplementation(function (this: AbyssGame) {
      abysses.push(this);
      origStart.call(this);
    });

    localStorage.setItem('audio-muted', '0');
    localStorage.setItem('surface-modal-dismissed', '1');
    localStorage.setItem('tunnel-modal-dismissed', '1');
    localStorage.setItem('abyss-modal-dismissed', '1');
    bootDebugScreen('abyss');
  });

  afterEach(() => {
    history.replaceState(null, '', '/');
    localStorage.removeItem('audio-muted');
    localStorage.removeItem('surface-modal-dismissed');
    localStorage.removeItem('tunnel-modal-dismissed');
    localStorage.removeItem('abyss-modal-dismissed');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    stubAnimationFrame();
  });

  it('exit-door close → win score → The End → ranking; DIE never plays; ranking music starts once, at the ranking', () => {
    vi.advanceTimersByTime(2000);
    const game = abysses[0];
    expect(game).toBeDefined();

    const sfx = vi.spyOn(game.sfx, 'play');
    if (game.player) game.player.lives = Number.MAX_SAFE_INTEGER;
    game.stepCount = ABYSS_TIME_BUDGET_S * 60 - 1;
    game.step();
    expect(game.isOver).toBe(true);
    game['host']['frame']();

    vi.advanceTimersByTime(1000);

    expect(sfx).toHaveBeenCalledWith('letsgo');
    expect(document.querySelector('.win-bg')).not.toBeNull();
    expect(document.querySelectorAll('.go-count-line').length).toBeGreaterThan(0);
    expect(audioSrcs.some((src) => /die\.wav/i.test(src))).toBe(false);

    const rankingStarts = () => audioSrcs.filter((src) => /reed-flutes/i.test(src)).length;

    vi.advanceTimersByTime(2500);
    expect(rankingStarts()).toBe(0);

    vi.advanceTimersByTime(2600);
    expect(document.querySelector('.the-end-screen')).not.toBeNull();
    expect(document.querySelector('.ranking-screen')).toBeNull();
    expect(audioSrcs.some((src) => /tim_2/i.test(src))).toBe(true);
    expect(rankingStarts()).toBe(0);

    vi.advanceTimersByTime(20000);
    expect(document.querySelector('.ranking-screen')).not.toBeNull();
    expect(rankingStarts()).toBe(1);
  });

  it('keeps the ranking music gated until the ranking — the win tally and The End never start it', () => {
    vi.advanceTimersByTime(2000);
    const game = abysses[0];
    if (game.player) game.player.lives = Number.MAX_SAFE_INTEGER;
    game.stepCount = ABYSS_TIME_BUDGET_S * 60 - 1;
    game.step();
    game['host']['frame']();
    vi.advanceTimersByTime(1000);

    const total = String(game.currentBreakdown().total);
    const rankingStarts = () => audioSrcs.filter((src) => /reed-flutes/i.test(src)).length;
    const shownScore = () => document.querySelector('.go-score-value')?.textContent;

    for (let t = 0; t < 1700; t += 100) {
      if (shownScore() !== total) expect(rankingStarts()).toBe(0);
      vi.advanceTimersByTime(100);
    }

    vi.advanceTimersByTime(1000);
    expect(shownScore()).toBe(total);
    expect(rankingStarts()).toBe(0);
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(`Score: ${total}`);

    vi.advanceTimersByTime(30000);
    expect(document.querySelector('.ranking-screen')).not.toBeNull();
    expect(rankingStarts()).toBe(1);
  });
});
