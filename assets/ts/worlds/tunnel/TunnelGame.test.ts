import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  TunnelGame, TUNNEL_LEVEL_CONFIG, TUNNEL_TIME_BUDGET_S, TOTAL_CYCLES,
  FLOOR_FRAC, CRUSH_HEADROOM_FRAC,
  CRACK_MIN_X_FRAC, CRACK_MAX_X_FRAC,
  BREACH_PAN_END_STEPS,
} from './TunnelGame';
import { makeBreakdown, type ScoreBreakdown } from '../../lib/score';
import { makeCanvas, stubAnimationFrame } from '../../test-helpers';
import { SURFACE_HANDOFF_BREAKDOWN } from '../../test-game-factories';
import { STEPS_PER_SECOND } from '../../lib/GameLoop';

const noop = (): void => {};

function timeToCrushSteps(level: (typeof TUNNEL_LEVEL_CONFIG)[number]): number {
  return (level.startHeadroomFrac - CRUSH_HEADROOM_FRAC) / level.driftPerStep;
}

function makeTunnelGame(
  canvas: HTMLCanvasElement,
  breakdown = SURFACE_HANDOFF_BREAKDOWN,
  callbacks: { onGameOver?: (breakdown: ScoreBreakdown) => void; onComplete?: (breakdown: ScoreBreakdown) => void } = {},
) {
  const game = new TunnelGame(
    canvas,
    breakdown,
    callbacks.onGameOver ?? noop,
    callbacks.onComplete ?? noop,
  );
  game.startGame();
  return game;
}

/** Drops the ceiling so the next step crosses the kill line. */
function armCrush(game: TunnelGame): void {
  game.ceilingFrac = FLOOR_FRAC - CRUSH_HEADROOM_FRAC - 1e-9;
}

beforeAll(() => {
  stubAnimationFrame();
});

describe('TunnelGame — per-level tunables (solvability invariants)', () => {
  it('levels 1–2 cannot crush within the countdown budget', () => {
    const budgetSteps = TUNNEL_TIME_BUDGET_S * STEPS_PER_SECOND;
    expect(timeToCrushSteps(TUNNEL_LEVEL_CONFIG[0])).toBeGreaterThan(budgetSteps);
    expect(timeToCrushSteps(TUNNEL_LEVEL_CONFIG[1])).toBeGreaterThan(budgetSteps);
  });

  it('level 3 can crush within the budget, but no sooner than ~30 s (sped up per playtest)', () => {
    const budgetSteps = TUNNEL_TIME_BUDGET_S * STEPS_PER_SECOND;
    const level3Config = timeToCrushSteps(TUNNEL_LEVEL_CONFIG[2]);
    expect(level3Config).toBeLessThan(budgetSteps);
    expect(level3Config).toBeGreaterThanOrEqual(30 * STEPS_PER_SECOND);
  });

  it('the bomb count escalates per level and level 1 needs more than one', () => {
    expect(TUNNEL_LEVEL_CONFIG[0].bombs).toBeGreaterThan(1);
    expect(TUNNEL_LEVEL_CONFIG[1].bombs).toBeGreaterThan(TUNNEL_LEVEL_CONFIG[0].bombs);
    expect(TUNNEL_LEVEL_CONFIG[2].bombs).toBeGreaterThan(TUNNEL_LEVEL_CONFIG[1].bombs);
  });

  it('escalation follows the ratified curve: lower starts each level, faster drift only at level 3', () => {
    expect(TUNNEL_LEVEL_CONFIG[1].startHeadroomFrac).toBeLessThan(TUNNEL_LEVEL_CONFIG[0].startHeadroomFrac);
    expect(TUNNEL_LEVEL_CONFIG[2].startHeadroomFrac).toBeLessThan(TUNNEL_LEVEL_CONFIG[1].startHeadroomFrac);
    expect(TUNNEL_LEVEL_CONFIG[1].driftPerStep).toBe(TUNNEL_LEVEL_CONFIG[0].driftPerStep);
    expect(TUNNEL_LEVEL_CONFIG[2].driftPerStep).toBeGreaterThan(TUNNEL_LEVEL_CONFIG[1].driftPerStep);
  });

});

describe('TunnelGame — skeleton and countdown', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => { canvas = makeCanvas(); });
  afterEach(() => { document.body.innerHTML = ''; });

  it('starts in explore with 3 lives at the cycle-1 ceiling', () => {
    const game = makeTunnelGame(canvas);
    expect(game.state).toBe('explore');
    expect(game.player?.lives).toBe(3);
    expect(game.headroomFrac()).toBeCloseTo(
      TUNNEL_LEVEL_CONFIG[0].startHeadroomFrac - TUNNEL_LEVEL_CONFIG[0].driftPerStep, 6,
    );
  });

  it('counts down from the budget by step counting and floors at 0', () => {
    const game = makeTunnelGame(canvas);
    expect(game.secondsLeft()).toBe(TUNNEL_TIME_BUDGET_S);
    for (let i = 0; i < STEPS_PER_SECOND; i++) game.step();
    expect(game.secondsLeft()).toBe(TUNNEL_TIME_BUDGET_S - 1);
    game.stepCount = (TUNNEL_TIME_BUDGET_S + 5) * STEPS_PER_SECOND;
    expect(game.secondsLeft()).toBe(0);
    expect(game.isOver).toBe(false); // the countdown never kills
  });

  it('pause early-returns the step: no drift, no countdown', () => {
    const game = makeTunnelGame(canvas);
    game.paused = true;
    const ceiling = game.ceilingFrac;
    const steps = game.stepCount;
    expect(game.step()).toBe(true);
    expect(game.ceilingFrac).toBe(ceiling);
    expect(game.stepCount).toBe(steps);
  });

  it('the ceiling drifts down every unpaused step at the level velocity', () => {
    const game = makeTunnelGame(canvas);
    const before = game.ceilingFrac;
    for (let i = 0; i < 100; i++) game.step();
    expect(game.ceilingFrac).toBeCloseTo(before + 100 * TUNNEL_LEVEL_CONFIG[0].driftPerStep, 9);
  });
});

describe('TunnelGame — mechanic state machine', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => { canvas = makeCanvas(); });
  afterEach(() => { document.body.innerHTML = ''; });

  function placePlayerAt(game: TunnelGame, xFrac: number): void {
    game.player!.dx = xFrac * canvas.width - game.player!.dWidth / 2;
  }

  function atCrackFrac(game: TunnelGame): number {
    return game.crackXFrac;
  }

  it('carries every bomb to the floor crack, then three lights arm the fuse', () => {
    const game = makeTunnelGame(canvas);
    const required = TUNNEL_LEVEL_CONFIG[0].bombs;

    for (let i = 0; i < required; i++) {
      placePlayerAt(game, game.floorBombs[0]);
      game.action();
      expect(game.state).toBe('carry');

      placePlayerAt(game, atCrackFrac(game));
      game.action();
      /* More bombs send the lemming back out; the full stack unlocks lighting */
      expect(game.state).toBe(i + 1 < required ? 'explore' : 'placed');
    }
    expect(game.placedCount).toBe(required);
    expect(game.floorBombs).toHaveLength(0);

    game.action();
    game.action();
    expect(game.state).toBe('placed');
    game.action();
    expect(game.state).toBe('armed');
    expect(game.fuseStepsLeft).toBeGreaterThan(0);
  });

  it('placing requires standing at the floor crack', () => {
    const game = makeTunnelGame(canvas);
    placePlayerAt(game, game.floorBombs[0]);
    game.action();
    expect(game.state).toBe('carry');
    /* Stand well away from the crack's x (pinned, not a hardcoded mid-point) */
    placePlayerAt(game, game.crackXFrac > 0.5 ? 0.05 : 0.95);
    game.action();
    expect(game.state).toBe('carry');
    expect(game.placedCount).toBe(0);
  });

  it('action away from every bomb does nothing in explore', () => {
    const game = makeTunnelGame(canvas);
    game.floorBombs = [0.2];
    placePlayerAt(game, 0.6);
    game.action();
    expect(game.state).toBe('explore');
  });

  it('action is inert while paused', () => {
    const game = makeTunnelGame(canvas);
    placePlayerAt(game, game.floorBombs[0]);
    game.paused = true;
    game.action();
    expect(game.state).toBe('explore');
  });

  it('each light press strikes the scrape; the third ignites the fuse loop', () => {
    const game = makeTunnelGame(canvas);
    const scrape = vi.spyOn(game.sfx.get('scrape')!, 'play').mockResolvedValue(undefined);
    const fuse = vi.spyOn(game.sfx.get('fuse')!, 'play').mockResolvedValue(undefined);
    game.state = 'placed';
    placePlayerAt(game, game.crackXFrac); // he must stand on the charge to light it
    game.action();
    game.action();
    expect(scrape).toHaveBeenCalledTimes(2);
    expect(fuse).not.toHaveBeenCalled();
    game.action();
    expect(scrape).toHaveBeenCalledTimes(3);
    expect(fuse).toHaveBeenCalledTimes(1);
  });

  it('fuse expiry banks a share + the cycle award and starts the breach sequence', () => {
    const game = makeTunnelGame(canvas);
    game.state = 'armed';
    game.fuseStepsLeft = 1;
    game.step();
    expect(game.cyclesCleared).toBe(1);
    /* First breakout banks a third of the unbanked remaining seconds */
    expect(game.bankedSeconds).toBe(Math.floor(game.secondsLeft() / TOTAL_CYCLES));
    expect(game.state).toBe('breach');
  });

  it('breach pans into the next chamber, announces the level, then the ceiling drops', () => {
    const game = makeTunnelGame(canvas);
    const frozen = game.secondsLeft();
    game.state = 'armed';
    game.fuseStepsLeft = 1;
    game.step();

    for (let i = 0; i < BREACH_PAN_END_STEPS; i++) game.step();
    expect(game.state).toBe('event'); // announcement fired, ceiling drop running
    expect(game.secondsLeft()).toBe(frozen); // the cinematic froze the countdown

    /* Run out the shake + staged drop until gameplay resumes */
    for (let i = 0; i < 200 && (game.state as string) !== 'explore'; i++) game.step();
    expect(game.cycle).toBe(1);
    expect(game.state).toBe('explore');
    expect(game.floorBombs).toHaveLength(TUNNEL_LEVEL_CONFIG[1].bombs);
    expect(game.ceilingFrac).toBeCloseTo(FLOOR_FRAC - TUNNEL_LEVEL_CONFIG[1].startHeadroomFrac, 9);
  });

  it('the breach drops the lemming straight down from where he lit, no teleport', () => {
    const game = makeTunnelGame(canvas);
    placePlayerAt(game, game.crackXFrac); // he lit on the charge and stays committed
    const pitX = game.crackXFrac;
    game.state = 'armed';
    game.fuseStepsLeft = 1;
    game.step();
    for (let i = 0; i < BREACH_PAN_END_STEPS; i++) game.step();
    const center = (game.player!.dx + game.player!.dWidth / 2) / canvas.width;
    expect(center).toBeCloseTo(pitX, 5);     // fell straight through the pit, never moved
    expect(game.player!.direction).toBe(0);  // a fall, not a walk
  });

  it('lighting requires standing at the crack; pressing away from it does nothing', () => {
    const game = makeTunnelGame(canvas);
    game.state = 'placed';
    placePlayerAt(game, game.crackXFrac > 0.5 ? 0.05 : 0.95); // away from the crack
    game.action();
    game.action();
    game.action();
    expect(game.state).toBe('placed');       // never ignites from afar
    expect(game['padNudgeSteps']).toBeGreaterThan(0); // the pad beckons him back instead
    placePlayerAt(game, game.crackXFrac);    // back on the charge
    game.action();
    game.action();
    game.action();
    expect(game.state).toBe('armed');
  });

  it('the lemming is frozen on the charge through the lit fuse (no walk-off)', () => {
    const game = makeTunnelGame(canvas);
    placePlayerAt(game, game.crackXFrac);
    game.state = 'armed';
    game.fuseStepsLeft = 60;
    game.player!.direction = 1;              // try to walk away
    const initialDx = game.player!.dx;
    for (let i = 0; i < 30; i++) game.step();
    expect(game.player!.dx).toBe(initialDx);        // committed: didn't move while armed
    expect(game.state).toBe('armed');        // fuse still burning
  });

  it('the crack sits on the floor within the band, off the bombs, every cycle (no special last cycle)', () => {
    for (let i = 0; i < 15; i++) {
      const game = makeTunnelGame(makeCanvas());
      const check = () => {
        expect(game.crackXFrac).toBeGreaterThanOrEqual(CRACK_MIN_X_FRAC);
        expect(game.crackXFrac).toBeLessThanOrEqual(CRACK_MAX_X_FRAC);
        /* Crack stays off the bombs (loosened bound tolerates the rare fallback) */
        for (const b of game.bombSpawns) {
          expect(Math.abs(b - game.crackXFrac)).toBeGreaterThanOrEqual(0.05);
        }
      };
      check();
      game['beginCycle'](2); // the final cycle is just another floor crack, not forced anywhere
      check();
    }
  });

  it('bombs spawn apart from each other in the middle band', () => {
    const game = makeTunnelGame(canvas);
    game['beginCycle'](2); // the most bombs
    const bombs = [...game.floorBombs].sort((a, b) => a - b);
    for (let i = 1; i < bombs.length; i++) {
      expect(bombs[i] - bombs[i - 1]).toBeGreaterThanOrEqual(0.12);
    }
  });
});

describe('TunnelGame — crush death and respawn (D10)', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => { canvas = makeCanvas(); });
  afterEach(() => { document.body.innerHTML = ''; });

  it('crush consumes a life and restarts the cycle from its start height with the remaining time', () => {
    const game = makeTunnelGame(canvas);
    game.stepCount = 20 * STEPS_PER_SECOND; // 40 s left
    armCrush(game);
    game.step();
    expect(game.player?.lives).toBe(2);
    expect(game.secondsLeft()).toBe(40);          // countdown survives the death
    expect(game.cycle).toBe(0);                   // same level, same crack appearance
    expect(game.state).toBe('explore');
    expect(game.ceilingFrac).toBeCloseTo(FLOOR_FRAC - TUNNEL_LEVEL_CONFIG[0].startHeadroomFrac, 9);
  });

  it('no second crush is possible within one step of respawn', () => {
    const game = makeTunnelGame(canvas);
    armCrush(game);
    game.step();
    expect(game.player?.lives).toBe(2);
    /* hit-stop holds the world briefly, then drift resumes from the start height */
    for (let i = 0; i < 60; i++) game.step();
    expect(game.player?.lives).toBe(2);
  });

  it('crush mid-fuse cancels the armed state, stops the tick, and restores the bomb layout', () => {
    const game = makeTunnelGame(canvas);
    const stopTick = vi.spyOn(game.sfx.get('fuse')!, 'pause');
    game.placedCount = TUNNEL_LEVEL_CONFIG[0].bombs;
    game.floorBombs = [];
    game.state = 'armed';
    game.fuseStepsLeft = 500;
    armCrush(game);
    game.step();
    expect(game.state).toBe('explore');
    expect(game.fuseStepsLeft).toBe(0);
    expect(stopTick).toHaveBeenCalled();
    /* Placed bombs are removed with the old crack; the spawn layout returns */
    expect(game.placedCount).toBe(0);
    expect(game.floorBombs).toEqual(game.bombSpawns);
  });

  it('a muted crush plays nothing through the channel helper', () => {
    const game = makeTunnelGame(canvas);
    game.muted = true;
    const play = vi.spyOn(game.sfx.get('crush')!, 'play');
    armCrush(game);
    game.step();
    expect(game.player?.lives).toBe(2); // the crush itself still happens
    expect(play).not.toHaveBeenCalled();
  });

  it('an unmuted crush plays the squash exactly once', () => {
    const game = makeTunnelGame(canvas);
    game.muted = false;
    const play = vi.spyOn(game.sfx.get('crush')!, 'play').mockResolvedValue(undefined);
    armCrush(game);
    game.step();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('the third crush ends the run once, with the banked-only breakdown', () => {
    const onGameOver = vi.fn();
    const onComplete = vi.fn();
    const game = makeTunnelGame(canvas, SURFACE_HANDOFF_BREAKDOWN, { onGameOver, onComplete });
    game.player!.lives = 1;
    game.bankedSeconds = 25;
    game.cyclesCleared = 1;
    game.state = 'armed'; // death, not bank, resolves this cycle
    armCrush(game);
    game.step();
    expect(game.player!.lives).toBe(0);
    expect(game.isOver).toBe(false);              // the death-beat freeze plays first
    /* The hit-stop freeze elapses, then the run ends */
    for (let i = 0; i < 60 && !game.isOver; i++) game.step();
    expect(game.isOver).toBe(true);

    game['host']['frame']();
    game['host']['frame']();
    expect(onGameOver).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    /* Levels sum: 3 surface (base 15) + 1 tunnel cycle cleared × 5 = 20 */
    expect(onGameOver).toHaveBeenCalledWith(
      makeBreakdown({ surfaceTime: 42, tunnelTime: 25, levelsBonus: 20 }),
    );
  });
});

describe('TunnelGame — completion routing', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => { canvas = makeCanvas(); });
  afterEach(() => { document.body.innerHTML = ''; });

  it('the third breach banks the rest and completes exactly once', () => {
    const onGameOver = vi.fn();
    const onComplete = vi.fn();
    const game = makeTunnelGame(canvas, SURFACE_HANDOFF_BREAKDOWN, { onGameOver, onComplete });
    game.stepCount = 10 * STEPS_PER_SECOND; // 50 s left
    game.bankedSeconds = 30;
    game.cyclesCleared = 2;
    game.cycle = 2;
    game.state = 'armed';
    game.fuseStepsLeft = 1;
    game.step();
    /* Opens the pit, then ends the run for the Abyss handoff */
    expect(game.state).toBe('breach');
    const frozen = game.secondsLeft();
    for (let i = 0; i < 300 && !game.isOver; i++) game.step();
    expect(game.isOver).toBe(true);
    expect(game.secondsLeft()).toBe(frozen); // the countdown froze with the bank

    game['host']['frame']();
    game['host']['frame']();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onGameOver).not.toHaveBeenCalled();

    /* Banks all unbanked seconds (50 − 30 = 20 → 50 total); levels sum:
       3 surface (base 15) + 3 tunnel cycles cleared × 5 = 30 */
    const breakdown = onComplete.mock.calls[0][0];
    expect(breakdown).toEqual(
      makeBreakdown({ surfaceTime: 42, tunnelTime: 50, levelsBonus: 30 }),
    );
    expect(breakdown.total).toBe(
      breakdown.surfaceTime + breakdown.tunnelTime + breakdown.levelsBonus,
    );
  });

  it('no crush can resolve after the completion bank (drift suspended through the final breach)', () => {
    const game = makeTunnelGame(canvas);
    game.cyclesCleared = 2;
    game.cycle = 2;
    game.state = 'armed';
    game.fuseStepsLeft = 1;
    armCrush(game); // ceiling practically at the kill line as the fuse resolves
    game.ceilingFrac -= TUNNEL_LEVEL_CONFIG[2].driftPerStep * 2; // breach wins the race this step
    game.step();
    expect(game.state).toBe('breach');
    const lives = game.player!.lives;
    const ceiling = game.ceilingFrac;
    for (let i = 0; i < 300 && !game.isOver; i++) game.step();
    expect(game.isOver).toBe(true);
    expect(game.player!.lives).toBe(lives);      // no crush through the final breach
    expect(game.ceilingFrac).toBe(ceiling);      // drift stayed suspended
    expect(game.step()).toBe(false);             // halted after the drop
  });
});
