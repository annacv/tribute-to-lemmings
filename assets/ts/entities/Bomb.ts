import { BOMB_WIDTH, BOMB_HEIGHT } from '../lib/geometry';

export class Bomb {
  dx: number;
  dy: number;
  readonly dWidth: number;
  readonly dHeight: number;
  speed: number;
  isExploding: boolean;
  explosionStepsLeft: number;

  constructor(randomX: number, speed: number = 1.5) {
    this.dx = randomX;
    this.dy = -45;
    this.dWidth = BOMB_WIDTH;
    this.dHeight = BOMB_HEIGHT;
    this.speed = speed;
    this.isExploding = false;
    this.explosionStepsLeft = 0;
  }
}
