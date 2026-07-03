import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import {
  AbyssGame, ABYSS_LEVEL_CONFIG, ABYSS_TIME_BUDGET_S, THROW_FLIGHT_STEPS,
} from './AbyssGame';
import { Stalactite, STALACTITE_COST } from '../../entities/Stalactite';
import { Bomb } from '../../entities/Bomb';
import { makeBreakdown } from '../../lib/score';
import { makeCanvas, stubAnimationFrame, stepUntil, TEST_CANVAS_SIZE } from '../../test-helpers';
import { makeAbyssGame } from '../../test-game-factories';
import { STEPS_PER_SECOND } from '../../lib/GameLoop';

const noop = (): void => {};

/** Survive falling bombs so a long run can reach a time/level milestone. */
function invincible(game: AbyssGame): AbyssGame {
  if (game.player) game.player.lives = Number.MAX_SAFE_INTEGER;
  return game;
}

/** Drops a stalactite of `size` directly over the lemming and arms `carried` bombs. */
function setOverhead(game: AbyssGame, size: 'small' | 'medium' | 'large', carried: number): Stalactite {
  const stalactite = new Stalactite(size, game.playerWorldX);
  game.stalactites = [stalactite];
  game.carried = carried;
  return stalactite;
}

beforeAll(() => {
  stubAnimationFrame();
});

describe('AbyssGame — per-level tunables (escalation)', () => {
  it('shortens the bomb interval and speeds bombs up each level', () => {
    expect(ABYSS_LEVEL_CONFIG[1].spawnIntervalFrames).toBeLessThan(ABYSS_LEVEL_CONFIG[0].spawnIntervalFrames);
    expect(ABYSS_LEVEL_CONFIG[2].spawnIntervalFrames).toBeLessThan(ABYSS_LEVEL_CONFIG[1].spawnIntervalFrames);
    expect(ABYSS_LEVEL_CONFIG[1].bombSpeed).toBeGreaterThan(ABYSS_LEVEL_CONFIG[0].bombSpeed);
    expect(ABYSS_LEVEL_CONFIG[2].bombSpeed).toBeGreaterThan(ABYSS_LEVEL_CONFIG[1].bombSpeed);
  });

  it('adds one larger size per level, each needing one more hit', () => {
    expect(ABYSS_LEVEL_CONFIG[0].sizes).toEqual(['small']);
    expect(ABYSS_LEVEL_CONFIG[1].sizes).toEqual(['small', 'medium']);
    expect(ABYSS_LEVEL_CONFIG[2].sizes).toEqual(['small', 'medium', 'large']);
    expect(STALACTITE_COST.small).toBe(1);
    expect(STALACTITE_COST.medium).toBe(2);
    expect(STALACTITE_COST.large).toBe(3);
  });

});

describe('AbyssGame — Player-driven camera', () => {
  it('spawns the lemming below the ceiling door and does not auto-scroll while idle', () => {
    const game = makeAbyssGame(makeCanvas());
    if (game.player) game.player.direction = 0;
    const cam = game.cameraX;
    const worldX = game.playerWorldX;
    expect(game.playerScreenX()).toBeCloseTo(game.entranceWorldX - (game.player?.dWidth ?? 0) / 2, 5); // centered under the door
    stepUntil(game, 30);
    expect(game.cameraX).toBe(cam);                          // no constant scroll
    expect(game.playerWorldX).toBe(worldX);                  // stays put — can stand on a bomb
  });

  it('moves the lemming rightward and the camera follows it past the follow line', () => {
    const game = makeAbyssGame(makeCanvas());
    if (game.player) game.player.direction = 1;
    stepUntil(game, 200);
    expect(game.cameraX).toBeGreaterThan(0);                 // camera pulled forward by the lemming
    expect(game.playerScreenX()).toBeCloseTo(TEST_CANVAS_SIZE * 0.5, 5);    // pinned at the follow line on screen
  });

  it('never walks onto the left framing column and never scrolls back (one-way)', () => {
    const game = makeAbyssGame(makeCanvas());
    if (game.player) game.player.direction = 1;
    stepUntil(game, 200);
    const advanced = game.cameraX;
    expect(advanced).toBeGreaterThan(0);
    if (game.player) game.player.direction = -1;
    stepUntil(game, 600);
    expect(game.cameraX).toBe(advanced);                                  // no scroll-back
    expect(game.playerWorldX).toBeGreaterThanOrEqual(TEST_CANVAS_SIZE * 0.34 - 1e-9);    // off the start column
  });
});

describe('AbyssGame — gather (pickup + cap)', () => {
  it('picks up a floor bomb underfoot and plays the pickup cue', () => {
    const game = makeAbyssGame(makeCanvas());
    const play = vi.spyOn(game.sfx, 'play');
    game.floorBombs = [game.playerWorldX];
    game.carried = 0;
    game.action();
    expect(game.carried).toBe(1);
    expect(game.floorBombs).toHaveLength(0);
    expect(play).toHaveBeenCalledWith('pickup');
  });

  it('will not pick up past the carry cap', () => {
    const game = makeAbyssGame(makeCanvas());
    game.carried = game.carryCap;
    game.floorBombs = [game.playerWorldX];
    game.action();
    expect(game.carried).toBe(game.carryCap);
    expect(game.floorBombs).toHaveLength(1);
  });
});

describe('AbyssGame — bomb spawning', () => {
  it('keeps bombs inside the walkable corridor (off the left framing column)', () => {
    const game = invincible(makeAbyssGame(makeCanvas()));
    if (game.player) game.player.direction = 0; // idle: camera stays at the corridor start
    stepUntil(game, 300);
    const minX = TEST_CANVAS_SIZE * 0.34 - 1e-9; // CORRIDOR_START_FRAC
    for (const bomb of game.fallingBombs) expect(bomb.dx).toBeGreaterThanOrEqual(minX);
    for (const x of game.floorBombs) expect(x).toBeGreaterThanOrEqual(minX);
    expect(game.fallingBombs.length + game.floorBombs.length).toBeGreaterThan(0);
  });

  it('plays the bomb-hit cue and drops a life when a bomb strikes the lemming', () => {
    const game = makeAbyssGame(makeCanvas());
    const play = vi.spyOn(game.sfx, 'play');
    const before = game.player!.lives;
    const bomb = new Bomb(game.playerWorldX, 1.2);
    bomb.dy = game.player!.dy - 5; // overlapping the lemming, above the floor line
    game.fallingBombs = [bomb];
    game.step();
    expect(game.player!.lives).toBe(before - 1);
    expect(play).toHaveBeenCalledWith('bombHit');
  });
});

describe('AbyssGame — throw (smash stalactites)', () => {
  it('does nothing empty-handed', () => {
    const game = makeAbyssGame(makeCanvas());
    const stalactite = setOverhead(game, 'small', 0);
    game.action();
    expect(stalactite.hitsRemaining).toBe(1);
    expect(game.carried).toBe(0);
  });

  it('smashes a small stalactite in one hit and scores it', () => {
    const game = makeAbyssGame(makeCanvas());
    const play = vi.spyOn(game.sfx, 'play');
    const stalactite = setOverhead(game, 'small', 1);
    game.action();
    expect(game.carried).toBe(0);
    expect(play).toHaveBeenCalledWith('pickup'); // throw cue at release
    expect(game.thrownBombs).toHaveLength(1);    // a bomb is in flight…
    expect(stalactite.destroyed).toBe(false);            // …and hasn't struck yet
    stepUntil(game, THROW_FLIGHT_STEPS);           // let it land
    expect(stalactite.destroyed).toBe(true);
    expect(game.breaks.small).toBe(1);
    expect(play).toHaveBeenCalledWith('mantrap');
    expect(play).toHaveBeenCalledWith('thud');
  });

  it('needs the size-scaled hit count: a medium takes two throws', () => {
    const game = makeAbyssGame(makeCanvas());
    const stalactite = setOverhead(game, 'medium', 2);
    game.action();
    stepUntil(game, THROW_FLIGHT_STEPS);
    expect(stalactite.destroyed).toBe(false);
    expect(stalactite.hitsRemaining).toBe(1);
    expect(game.breaks.medium).toBe(0);
    game.action();
    stepUntil(game, THROW_FLIGHT_STEPS);
    expect(stalactite.destroyed).toBe(true);
    expect(game.breaks.medium).toBe(1);
    expect(game.carried).toBe(0);
  });

});

describe('AbyssGame — time-gated level progression', () => {
  it('advances to L2 at 18 s and L3 at 36 s, by time alone', () => {
    const game = invincible(makeAbyssGame(makeCanvas()));
    expect(game.currentLevel).toBe(0);
    stepUntil(game, 18 * STEPS_PER_SECOND);
    expect(game.currentLevel).toBe(1);
    stepUntil(game, 18 * STEPS_PER_SECOND);
    expect(game.currentLevel).toBe(2);
  });

  it('plays the level-up cue on a time-gated level change', () => {
    const game = invincible(makeAbyssGame(makeCanvas()));
    const play = vi.spyOn(game.sfx, 'play');
    stepUntil(game, 18 * STEPS_PER_SECOND);
    expect(game.currentLevel).toBe(1);
    expect(play).toHaveBeenCalledWith('levelUp');
  });

  it('breaking stalactites does not gate progression', () => {
    const game = invincible(makeAbyssGame(makeCanvas()));
    const stalactite = setOverhead(game, 'small', 3);
    game.action(); // a break well before 18 s
    stepUntil(game, 5 * STEPS_PER_SECOND);
    expect(stalactite.destroyed).toBe(true); // the thrown bomb landed
    expect(game.currentLevel).toBe(0); // still L1 — time, not breaks, advances
  });

  it('ends the run at the L3 time budget and routes as a completion', () => {
    const game = invincible(makeAbyssGame(makeCanvas()));
    stepUntil(game, ABYSS_TIME_BUDGET_S * STEPS_PER_SECOND);
    expect(game.isOver).toBe(true);
    const breakdown = game.currentBreakdown();
    expect(breakdown.abyssTime).toBe(ABYSS_TIME_BUDGET_S);
    // full completion counts all three abyss levels on top of the base
    expect(breakdown.levelsBonus).toBe(30 + 3 * 5);
  });
});

describe('AbyssGame — scoring (levels exclude the one died on)', () => {
  it('on death, counts only abyss levels fully passed', () => {
    const game = invincible(makeAbyssGame(makeCanvas()));
    stepUntil(game, 18 * STEPS_PER_SECOND); // now in L2 (index 1)
    expect(game.currentLevel).toBe(1);
    // death keeps the default 'death' outcome → L2 (the level died on) excluded
    const breakdown = game.currentBreakdown();
    expect(breakdown.levelsBonus).toBe(30 + 1 * 5);
  });
});

describe('AbyssGame — cold-open and exit-door beats', () => {
  const reducedMotion = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    stubAnimationFrame(); // restore noop rAF after unstubAllGlobals
  });

  it('cold-open holds the closed hatch, plays DOOR.WAV, then hands off to play', () => {
    vi.useFakeTimers();
    const game = new AbyssGame(makeCanvas(), makeBreakdown({}), noop, noop);
    const play = vi.spyOn(game.sfx, 'play');
    const onDone = vi.fn();
    game.coldOpen(onDone);
    expect(game.entranceOpenFrac).toBe(0); // closed on arrival
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(650);
    expect(play).toHaveBeenCalledWith('door'); // the cue precedes the drop
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1300);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith('falling', { playbackRate: 2, volume: 0.5 });
    expect(play).toHaveBeenCalledWith('thud'); // lands on the corridor floor
  });

  it('reduced motion resolves the cold-open straight to the grounded, door-open state', () => {
    vi.stubGlobal('matchMedia', reducedMotion);
    const game = new AbyssGame(makeCanvas(), makeBreakdown({}), noop, noop);
    const play = vi.spyOn(game.sfx, 'play');
    const onDone = vi.fn();
    game.coldOpen(onDone);
    expect(game.entranceOpenFrac).toBe(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith('thud'); // lands at once
  });

  it('reduced-motion exit close plays LETSGO and routes the completion at once', () => {
    vi.stubGlobal('matchMedia', reducedMotion);
    const onComplete = vi.fn();
    const game = new AbyssGame(makeCanvas(), makeBreakdown({ levelsBonus: 30 }), noop, onComplete);
    game.startGame();
    invincible(game);
    const play = vi.spyOn(game.sfx, 'play');
    game.stepCount = ABYSS_TIME_BUDGET_S * STEPS_PER_SECOND - 1;
    game.step(); // crosses the L3 budget → reachDoor (completion)
    game['endRun']();
    expect(play).toHaveBeenCalledWith('letsgo');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(game.player).toBeNull(); // vanished into the door
  });
});
