import { describe, it, expect, vi } from 'vitest';
import { bombHitsPlayer, getCanvasSize } from './geometry';
import { defaultPlayerHitbox } from '../test-helpers';

const { x: PLAYER_X, y: PLAYER_Y, w: PLAYER_W, h: PLAYER_H } = defaultPlayerHitbox();

describe('getCanvasSize', () => {
  it('subtracts header and footer from the viewport height cap', () => {
    document.body.innerHTML = '<header class="site-header"></header><footer class="site-footer"></footer>';
    const header = document.querySelector('.site-header')!;
    const footer = document.querySelector('.site-footer')!;
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue({ height: 60 } as DOMRect);
    vi.spyOn(footer, 'getBoundingClientRect').mockReturnValue({ height: 40 } as DOMRect);
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(500);

    expect(getCanvasSize()).toBe(400);
  });
});

describe('bombHitsPlayer', () => {
  it.each([
    { dx: 83, dy: 390, hit: false, note: 'body just past the hurtbox right edge (82)' },
    { dx: 25, dy: 390, hit: false, note: 'only the trimmed spark zone (47–53) reaches the player' },
    { dx: 50, dy: 352, hit: false, note: 'bomb bottom (384) just above the hurtbox top (385)' },
    { dx: 82, dy: 390, hit: true,  note: 'body left edge touches hurtbox right edge' },
    { dx: 26, dy: 390, hit: true,  note: 'body right edge (48) touches hurtbox left edge' },
  ])('hurtbox boundary: bomb at ($dx,$dy) → hit=$hit ($note)', ({ dx, dy, hit }) => {
    expect(bombHitsPlayer(PLAYER_X, PLAYER_Y, PLAYER_W, PLAYER_H, dx, dy)).toBe(hit);
  });
});
