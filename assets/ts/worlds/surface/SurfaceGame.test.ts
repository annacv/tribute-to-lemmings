import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SurfaceGame } from './SurfaceGame';
import { Bomb } from '../../entities/Bomb';
import { makeBreakdown, LEVEL_POINTS } from '../../lib/score';
import { makeCanvas, makeRafQueue, setDocumentHidden } from '../../test-helpers';
import { dropGroundBomb, makeSurfaceGame } from '../../test-game-factories';

const noop = (): void => {};

// --- helpers ---

function placeBomb(game: SurfaceGame, dx: number, dy = 390): Bomb {
  const bomb = new Bomb(dx);
  bomb.dy = dy;
  game.bombs.push(bomb);
  game.checkCollisions();
  return bomb;
}

function placeHitBomb(game: SurfaceGame, dx = 50): Bomb {
  return placeBomb(game, dx);
}

function runFrames(game: SurfaceGame, frames = 6): void {
  for (let i = 0; i < frames; i++) game.update();
}

function setupHud(iconCount = 3): void {
  const icons = Array.from({ length: iconCount }, () => '<img class="life-icon" alt="" />').join('\n        ');
  document.body.innerHTML = `
    <div class="lives-icons">${icons}</div>
    <span class="hud-item lives-item">
      <span class="hud-label">lives</span>
      <span class="hud-value lives-value"></span>
    </span>
  `;
}

// --- tests ---

describe('SurfaceGame', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = makeCanvas();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps exploding bombs visible until removal', () => {
    const game = makeSurfaceGame(canvas);
    const bomb = placeHitBomb(game);

    expect(bomb.isExploding).toBe(true);
    expect(bomb.explosionStepsLeft).toBe(6);
    expect(game.bombs).toHaveLength(1);
    expect(game.player?.lives).toBe(3);

    runFrames(game, 5);
    expect(game.bombs).toHaveLength(1);
    expect(game.player?.lives).toBe(3);

    game.update();
    expect(game.bombs).toHaveLength(0);
    expect(game.player?.lives).toBe(2);
  });

  it('registers all overlapping bomb hits in the same frame', () => {
    const game = makeSurfaceGame(canvas);
    placeHitBomb(game, 50);
    placeHitBomb(game, 60);

    runFrames(game);

    expect(game.player?.lives).toBe(1);
    expect(game.bombs).toHaveLength(0);
  });

  it('wires checkCollisions to bombHitsPlayer at the hurtbox edges', () => {
    const game = makeSurfaceGame(canvas);
    expect(placeBomb(game, 82, 390).isExploding).toBe(true);
    expect(placeBomb(game, 83, 390).isExploding).toBe(false);
  });

  it('collision outcome is independent of facing direction', () => {
    for (const direction of [1, -1]) {
      const game = makeSurfaceGame(canvas);
      game.player?.setDirection(direction);
      expect(placeBomb(game, 82).isExploding).toBe(true);
      expect(placeBomb(game, 83).isExploding).toBe(false);
    }
  });

  it('sets isOver when last life is lost', () => {
    const game = makeSurfaceGame(canvas);
    game.player!.lives = 1;
    placeHitBomb(game);

    runFrames(game);

    expect(game.player?.lives).toBe(0);
    expect(game.isOver).toBe(true);
  });

  it('a surface death scores only completed levels, never the level died on', () => {
    const onGameOver = vi.fn();
    const game = makeSurfaceGame(canvas, { onGameOver });
    game.score = 40;
    game.currentLevel = 2;
    game.player!.lives = 1;

    placeHitBomb(game);
    runFrames(game);
    expect(game.isOver).toBe(true);

    game['host']['frame']();
    game['host']['frame']();

    expect(onGameOver).toHaveBeenCalledWith(
      makeBreakdown({ surfaceTime: 40, levelsBonus: 2 * LEVEL_POINTS }),
    );
  });

  it('uses pre-loop lives color when multiple bombs expire in one frame', () => {
    const game = makeSurfaceGame(canvas);
    placeHitBomb(game, 50);
    placeHitBomb(game, 60);

    runFrames(game);

    expect(game.player?.blinkColor).toBe('#FFFFFF');
    expect(game.player?.blinkStepsLeft).toBe(30);
  });

  it('displayLives does not throw when lives drop below zero', () => {
    const game = makeSurfaceGame(canvas);
    game.player!.lives = -1;
    setupHud();

    expect(() => game.displayLives()).not.toThrow();
    expect(document.querySelectorAll('.life-losing')).toHaveLength(3);
  });

  it('does not play bombHit when audio is muted', () => {
    const game = makeSurfaceGame(canvas);
    const bombHit = game.sfx.get('bombHit')!;
    const playSpy = vi.fn().mockResolvedValue(undefined);
    bombHit.play = playSpy;
    game.muted = true;

    placeHitBomb(game);

    expect(playSpy).not.toHaveBeenCalled();
  });

  it('removes all excess life icons when multiple lives are lost at once', () => {
    const game = makeSurfaceGame(canvas);
    game.player!.lives = 1;
    setupHud();

    game.displayLives();

    expect(document.querySelectorAll('.life-losing')).toHaveLength(2);
  });
});

// ── Iteration IV: Level Progression & Ground Erosion ──────────────────────────

describe('SurfaceGame — level system', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => { canvas = makeCanvas(); });

  it.each([
    { from: 0, score: 17, to: 0 },   // below threshold → no advance
    { from: 0, score: 18, to: 1 },   // reaches level 2
    { from: 1, score: 36, to: 2 },   // reaches level 3
    { from: 2, score: 9999, to: 2 }, // never past level 3
  ])('checkLevelUp: level $from at score $score → level $to', ({ from, score, to }) => {
    const game = new SurfaceGame(canvas, noop, noop);
    game.currentLevel = from;
    game.score = score;
    game['checkLevelUp']();
    expect(game.currentLevel).toBe(to);
  });

  it('resets lastSpawnFrame on level-up', () => {
    const game = new SurfaceGame(canvas, noop, noop);
    game.count = 1080;
    game.lastSpawnFrame = 960;
    game.score = 18;
    game['checkLevelUp']();
    expect(game.lastSpawnFrame).toBe(1080);
  });

});

describe('SurfaceGame — ground erosion', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => { canvas = makeCanvas(); });

  it('activates ground erosion when level 3 starts', () => {
    const game = makeSurfaceGame(canvas);
    game.currentLevel = 1;
    game.score = 36;
    game['checkLevelUp']();
    expect(game.groundErosionActive).toBe(true);
  });

  it('does nothing to the ground while erosion is inactive (levels 1-2)', () => {
    const game = makeSurfaceGame(canvas);
    dropGroundBomb(game, canvas);
    expect(game.erosionCounter).toBe(0);
    expect(game['renderer']['crackStamps']).toHaveLength(0);
    expect(game['renderer']['holeStamps']).toHaveLength(0);
  });

  it('increments erosionCounter each time a bomb exits at level 3', () => {
    const game = makeSurfaceGame(canvas, { muted: true, erosion: true });
    dropGroundBomb(game, canvas);
    expect(game.erosionCounter).toBe(1);
  });

});

describe('SurfaceGame — per-hit ground feedback (cracks, holes, shake)', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => { canvas = makeCanvas(); });

  it('adds a crack stamp for each bomb that hits the ground', () => {
    const game = makeSurfaceGame(canvas, { muted: true, erosion: true });
    dropGroundBomb(game, canvas);
    expect(game['renderer']['crackStamps']).toHaveLength(1);
    dropGroundBomb(game, canvas);
    expect(game['renderer']['crackStamps']).toHaveLength(2);
  });

  it('progresses from cracks to holes as misses accumulate', () => {
    const game = makeSurfaceGame(canvas, { muted: true, erosion: true });
    // Below the hole threshold (LATE_CRACK_MISSES = 14): cracks only, no holes.
    for (let i = 0; i < 14; i++) dropGroundBomb(game, canvas);
    expect(game['renderer']['crackStamps']).toHaveLength(14);
    expect(game['renderer']['holeStamps']).toHaveLength(0);
    // Past it: holes begin landing while a crack still stamps every miss.
    for (let i = 0; i < 5; i++) dropGroundBomb(game, canvas);
    expect(game['renderer']['crackStamps']).toHaveLength(19);
    expect(game['renderer']['holeStamps']).toHaveLength(5);
  });

});

describe('SurfaceGame — tunnel world transition', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => { canvas = makeCanvas(); });

  it('collapse sets isOver and records the complete outcome (teardown skips onGameOver)', () => {
    const game = makeSurfaceGame(canvas, { muted: true, erosion: true });
    game['renderer']['coveredCells'].fill(true); // full coverage; next miss collapses it
    dropGroundBomb(game, canvas);
    expect(game.isOver).toBe(true);
    expect(game['outcome']).toBe('complete');
  });

  it('fires onComplete callback (not onGameOver) after the muted hold elapses', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const onGameOver = vi.fn();
    const game = makeSurfaceGame(canvas, { muted: true, erosion: true, onComplete, onGameOver });
    game['renderer']['coveredCells'].fill(true); // ground already at full coverage; next miss collapses it
    dropGroundBomb(game, canvas);

    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(onComplete).toHaveBeenCalledWith(
      makeBreakdown({ surfaceTime: game.score, levelsBonus: (game.currentLevel + 1) * LEVEL_POINTS }),
    );
    expect(onGameOver).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('collapses at 23/24 covered cells, not before', () => {
    const below = makeSurfaceGame(canvas, { muted: true, erosion: true });
    below['renderer']['coveredCells'].fill(true);
    below['renderer']['coveredCells'][0] = false;
    below['renderer']['coveredCells'][1] = false; // 22/24 ≈ 0.917 < 0.95
    dropGroundBomb(below, canvas);
    expect(below.isOver).toBe(false);

    const game = makeSurfaceGame(canvas, { muted: true, erosion: true });
    game['renderer']['coveredCells'].fill(true);
    game['renderer']['coveredCells'][0] = false; // 23/24 ≈ 0.958 >= 0.95
    dropGroundBomb(game, canvas);
    expect(game.isOver).toBe(true);
  });
});

describe('SurfaceGame — unmuted sting exit routes (seam-test gate)', () => {
  let canvas: HTMLCanvasElement;

  /* Unmuted: triggerTunnelWorld holds on the collapse sting and exits via
     whichever of ended/error/watchdog/play-rejection resolves first */
  function collapseUnmuted() {
    const onComplete = vi.fn();
    const game = makeSurfaceGame(canvas, { erosion: true, onComplete });
    game.gameSong.muted = false;
    game['renderer']['coveredCells'].fill(true);
    dropGroundBomb(game, canvas);
    return { game, onComplete };
  }

  beforeEach(() => {
    canvas = makeCanvas();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires the callback exactly once when the sting ends', () => {
    const { game, onComplete } = collapseUnmuted();
    game.tentonSfx.dispatchEvent(new Event('ended'));
    game.tentonSfx.dispatchEvent(new Event('ended'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('fires the callback exactly once via the watchdog when no media event arrives', () => {
    const { game, onComplete } = collapseUnmuted();
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4000);
    expect(onComplete).toHaveBeenCalledTimes(1);
    /* A late 'ended' after the watchdog must not double-fire */
    game.tentonSfx.dispatchEvent(new Event('ended'));
    vi.advanceTimersByTime(4000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('SurfaceGame — fixed-timestep score', () => {
  function makeHarness() {
    const queue = makeRafQueue();
    const game = new SurfaceGame(makeCanvas(), noop, noop);
    game.gameSong.muted = true;
    game.startGame(); // synchronous first step → count is already 1 here
    return { game, pump: queue.pump };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /* Cadences sit a hair above the exact refresh period so the 60th-step float
     boundary is decisively crossed instead of flaking at ulp precision */

  it('120 Hz: one real second yields exactly score +1 (~60 steps)', () => {
    const h = makeHarness();
    h.pump(1000); // anchors the clock, zero steps
    for (let i = 1; i <= 120; i++) h.pump(1000 + i * 8.34);
    expect(h.game.score).toBe(1);
    expect(h.game.count).toBe(61); // 1 synchronous + 60 stepped
  });
});

describe('SurfaceGame — background-tab audio', () => {
  let canvas: HTMLCanvasElement;
  let queue: ReturnType<typeof makeRafQueue>;

  beforeEach(() => {
    canvas = makeCanvas();
    queue = makeRafQueue();
  });

  afterEach(() => {
    setDocumentHidden(false);
    vi.unstubAllGlobals();
  });

  function startGameWithSpies() {
    const game = new SurfaceGame(canvas, noop, noop);
    game.gameSong.muted = true;
    const playSpy = vi.fn().mockResolvedValue(undefined);
    const pauseSpy = vi.fn();
    game.gameSong.play = playSpy;
    game.gameSong.pause = pauseSpy;
    game.startSong();
    game.startGame();
    playSpy.mockClear();
    pauseSpy.mockClear();
    return { game, playSpy, pauseSpy };
  }

  it('pauses the game song when the tab hides and resumes on return', () => {
    const { playSpy, pauseSpy } = startGameWithSpies();
    setDocumentHidden(true);
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    setDocumentHidden(false);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('does not resume the song once the run has ended (dead instance stays silent)', () => {
    const { game, playSpy } = startGameWithSpies();
    game.isOver = true;
    queue.pump(1000); // the halting render runs the teardown
    playSpy.mockClear();
    setDocumentHidden(true);
    setDocumentHidden(false);
    expect(playSpy).not.toHaveBeenCalled();
  });
});
