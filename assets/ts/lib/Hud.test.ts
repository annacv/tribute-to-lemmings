import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { SurfaceGame } from '../worlds/surface/SurfaceGame';
import { TunnelGame } from '../worlds/tunnel/TunnelGame';
import { AbyssGame, THROW_FLIGHT_STEPS } from '../worlds/abyss/AbyssGame';
import { Stalactite, STALACTITE_COST } from '../entities/Stalactite';
import { LEVEL_POINTS, STALACTITE_POINTS, makeBreakdown } from './score';
import { STEPS_PER_SECOND } from './GameLoop';
import { makeCanvas, mountPlayHudDom, stepUntil, stubAnimationFrame } from '../test-helpers';
import { makeAbyssGame } from '../test-game-factories';

const noop = (): void => {};

function setOverhead(game: AbyssGame, size: 'small' | 'medium' | 'large', carried: number): void {
  game.stalactites = [new Stalactite(size, game.playerWorldX)];
  game.carried = carried;
}

function smashStalactite(game: AbyssGame, size: 'small' | 'medium' | 'large'): void {
  setOverhead(game, size, STALACTITE_COST[size]);
  for (let hit = 0; hit < STALACTITE_COST[size]; hit++) {
    game.action();
    stepUntil(game, THROW_FLIGHT_STEPS);
  }
}

beforeAll(() => {
  stubAnimationFrame();
});

describe('Hud — score gain feedback', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = makeCanvas();
    mountPlayHudDom();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('surface level-up shows a bank-pop with level points', () => {
    const game = new SurfaceGame(canvas, noop, noop);
    game.currentLevel = 0;
    game.score = 18;
    game['checkLevelUp']();
    expect(document.querySelector('.bank-pop')?.textContent).toBe(`+${LEVEL_POINTS}`);
  });

  it('tunnel cycle breach shows a bank-pop with level points', () => {
    const game = new TunnelGame(canvas, makeBreakdown(), noop, noop);
    game.startGame();
    game.state = 'armed';
    game.fuseStepsLeft = 1;
    game.step();
    expect(document.querySelector('.bank-pop')?.textContent).toBe(`+${LEVEL_POINTS}`);
  });

  it('abyss level-up shows a bank-pop with level points', () => {
    const game = makeAbyssGame(canvas);
    game.stepCount = 18 * STEPS_PER_SECOND;
    game['checkLevelUp']();
    expect(document.querySelector('.bank-pop')?.textContent).toBe(`+${LEVEL_POINTS}`);
  });

  it.each([
    ['small', STALACTITE_POINTS.small],
    ['medium', STALACTITE_POINTS.medium],
    ['large', STALACTITE_POINTS.large],
  ] as const)('stalactite smash (%s) shows a bank-pop with size points', (size, points) => {
    const game = makeAbyssGame(canvas);
    smashStalactite(game, size);
    expect(document.querySelector('.bank-pop')?.textContent).toBe(`+${points}`);
  });
});
