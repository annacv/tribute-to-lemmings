import { Player } from '../../entities/Player';
import { Bomb } from '../../entities/Bomb';
import { Stalactite } from '../../entities/Stalactite';
import { isMuted } from '../../lib/audio';
import { prefersReducedMotion } from '../../lib/fx';
import { RunHost } from '../../lib/RunHost';
import { Hud } from '../../lib/Hud';
import { AbyssRenderer } from './AbyssRenderer';
import { SoundEffectBank } from '../../lib/SoundEffectBank';
import { bombHitsPlayer, PICKUP_RANGE_FRAC } from '../../lib/geometry';
import { STEPS_PER_SECOND } from '../../lib/GameLoop';
import {
  makeBreakdown, LEVEL_POINTS, LEVEL_THRESHOLDS_S,
  type ScoreBreakdown, type StalactiteSize, type StalactiteBreaks,
} from '../../lib/score';
import {
  SPRITES, EXPLODE_SFX, MANTRAP_SFX, THUD_SFX, DOOR_SFX, LETSGO_SFX, FALLING_SFX, FIRE_SFX, YIPPEE_SFX,
} from '../../assets';

export const ABYSS_TIME_BUDGET_S = 72;

export const ABYSS_LEVEL_CONFIG = [
  { spawnIntervalFrames: 60, bombSpeed: 1.2, stalactiteGapFrac: 0.55, sizes: ['small'] },
  { spawnIntervalFrames: 42, bombSpeed: 1.5, stalactiteGapFrac: 0.46, sizes: ['small', 'medium'] },
  { spawnIntervalFrames: 30, bombSpeed: 1.8, stalactiteGapFrac: 0.38, sizes: ['small', 'medium', 'large'] },
] as const;

/* World geometry as canvas fractions, so nothing jumps when the canvas resizes. */
export const ABYSS_FLOOR_FRAC = 0.82;   // walkable line (ground starts damaged)
export const ABYSS_CEILING_FRAC = 0.30; // ceiling band the stalactites hang from

/* Player-driven scroll: the lemming moves at the shared player speed and
   the camera follows it rightward only. */
const CAMERA_FOLLOW_FRAC = 0.5;         // camera trails the lemming once it passes mid-screen
const SCREEN_LEFT_MARGIN_FRAC = 0.04;   // nearest the lemming gets to the canvas's left edge
const CORRIDOR_START_FRAC = 0.34;       // inner face of the left framing column; the lemming starts right of it
const SPAWN_AHEAD_FRAC = 1.2;           // stalactites seeded just past the right edge
const CULL_BEHIND_FRAC = 1.0;           // drop hazards this far behind the camera

const CARRY_CAP = 3;                    // max. number of bombs the lemming can carry
export const THROW_RANGE_FRAC = 0.18;   // "near a stalactite" — wide enough to throw without standing dead-centre
export const THROW_FLIGHT_STEPS = 10;   // frames a thrown bomb takes to fly up to the stalactite
const BOMB_SPAWN_MAX_FRAC = 0.88;       // right edge of the bomb-spawn band

/* Stalactite feedback durations (render-only). */
const SHAKE_STEPS = 12;
const BOOM_STEPS = 14;
const SHATTER_STEPS = 36;
const FALL_SPEED_FRAC = 0.02;

/* Cold-open and exit-door cinematics. Elapsed-time tweens on rAF timestamps. */
const COLD_OPEN_SETTLE_MS = 600;   // the lemming waits on the ledge
const COLD_OPEN_DOOR_MS = 500;     // DOOR.WAV + the hatch tweens open
const COLD_OPEN_HALF_BEAT_MS = 300; // half a beat after the door opens
const COLD_OPEN_FALL_MS = 450;     // the lemming drops into the corridor
const COLD_OPEN_FALL_START_MS = COLD_OPEN_SETTLE_MS + COLD_OPEN_DOOR_MS + COLD_OPEN_HALF_BEAT_MS; // the lemming starts falling
const COLD_OPEN_TOTAL_MS = COLD_OPEN_FALL_START_MS + COLD_OPEN_FALL_MS; // the lemming lands on the corridor floor
const COLD_OPEN_LEDGE_FRAC = 0.12; // the ledge sits just below the hatch
const EXIT_WALK_MS = 700;          // the lemming walks into the demon-mouth
const EXIT_VANISH_MS = 300;        // a breath after it disappears
const EXIT_TOTAL_MS = EXIT_WALK_MS + EXIT_VANISH_MS; // the lemming disappears

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const easeInQuad = (progress: number): number => progress * progress; // gravity-ish fall

export interface ThrownBomb {
  readonly target: Stalactite;
  readonly originWorldX: number;
  stepsLeft: number;
}

/** The read-only slice of abyss state the renderer draws from each frame. */
export interface AbyssView {
  readonly cameraX: number;
  readonly stalactites: readonly Stalactite[];
  readonly fallingBombs: readonly Bomb[];
  readonly thrownBombs: readonly ThrownBomb[];
  readonly floorBombs: readonly number[];
  readonly carried: number;
  readonly carryCap: number;
  readonly availableSizes: readonly StalactiteSize[];
  readonly breaks: Readonly<StalactiteBreaks>;
  readonly currentLevel: number;
  readonly player: Player | null;
  readonly stepCount: number;
  readonly reduceMotion: boolean;
  readonly entranceWorldX: number;
  readonly entranceOpenFrac: number;
  readonly exitWorldX: number;
  readonly exitOpenFrac: number;
  worldToScreenX(worldX: number): number;
  playerScreenX(): number;
}

export class AbyssGame implements AbyssView {
  player: Player | null = null;
  isOver = false;
  paused = false;
  canvas: HTMLCanvasElement;
  stepCount = 0;
  cameraX = 0;
  playerWorldX = 0;
  currentLevel = 0;
  carried = 0;
  breaks: StalactiteBreaks = { small: 0, medium: 0, large: 0 };
  stalactites: Stalactite[] = [];
  fallingBombs: Bomb[] = [];
  thrownBombs: ThrownBomb[] = [];
  floorBombs: number[] = [];
  entranceOpenFrac = 1;
  exitOpenFrac = 0;
  exitWorldX = Number.MAX_SAFE_INTEGER;
  readonly reduceMotion: boolean;
  abyssLoop: HTMLAudioElement | null = null;
  muted: boolean;
  sfx: SoundEffectBank;
  private outcome: 'death' | 'complete' = 'death';
  private readonly base: ScoreBreakdown;
  private readonly onGameOver: (breakdown: ScoreBreakdown) => void;
  private readonly onComplete: (breakdown: ScoreBreakdown) => void;
  private lastBombSpawn = 0;
  private nextStalactiteWorldX = 0;
  private stalactiteSeq = 0;
  private hud: Hud;
  private host: RunHost;
  private renderer: AbyssRenderer;

  constructor(
    canvas: HTMLCanvasElement,
    baseBreakdown: ScoreBreakdown,
    onGameOver: (breakdown: ScoreBreakdown) => void,
    onComplete: (breakdown: ScoreBreakdown) => void,
  ) {
    this.onGameOver = onGameOver;
    this.onComplete = onComplete;
    this.canvas = canvas;
    this.base = baseBreakdown;
    this.reduceMotion = prefersReducedMotion();
    this.muted = isMuted();
    this.hud = new Hud();
    this.sfx = new SoundEffectBank({
      pickup: EXPLODE_SFX,
      mantrap: MANTRAP_SFX,
      thud: THUD_SFX,
      door: DOOR_SFX,
      letsgo: LETSGO_SFX,
      falling: FALLING_SFX,
      bombHit: FIRE_SFX,
      levelUp: YIPPEE_SFX,
    }, () => this.muted);
    this.renderer = new AbyssRenderer(canvas);
    this.host = new RunHost({
      step: () => this.step(),
      render: () => this.renderer.render(this),
      isOver: () => this.isOver,
      onEnd: () => this.endRun(),
    });
  }

  get runSignal(): AbortSignal {
    return this.host.runSignal;
  }

  startGame(): void {
    const canvasWidth = this.canvas.width;
    this.player = new Player(this.canvas);
    this.player.dy = this.canvas.height * ABYSS_FLOOR_FRAC - this.player.dHeight;
    this.playerWorldX = this.entranceWorldX - this.player.dWidth / 2; // land below the opened ceiling door
    this.player.dx = this.playerScreenX();
    this.hud.initLivesIcons(this.player.lives, SPRITES.lemming);
    this.hud.setLivesValue(this.player.lives);
    this.hud.setScore(0);
    this.hud.setLevel('1');
    this.nextStalactiteWorldX = canvasWidth * 0.8;
    this.spawnStalactitesAhead();
    this.updateHint();
    this.host.start();
  }

  /** Door cold-open: the lemming waits on the ledge by the closed hatch, the door
      opens (DOOR.WAV), holds a half-beat, then it drops into the corridor — all on
      the Abyss screen, no second transition. Non-interactive; the screen keeps the
      run paused until `onDone` hands off to the modal + `startGame`. Reduced motion
      resolves straight to the grounded, door-open state. */
  coldOpen(onDone: () => void): void {
    const canvasHeight = this.canvas.height;
    this.player = new Player(this.canvas);
    this.cameraX = 0;
    this.playerWorldX = this.entranceWorldX - this.player.dWidth / 2;
    this.player.dx = this.playerScreenX();
    const ledgeY = canvasHeight * COLD_OPEN_LEDGE_FRAC;
    const groundY = canvasHeight * ABYSS_FLOOR_FRAC - this.player.dHeight;

    if (this.reduceMotion) {
      this.entranceOpenFrac = 1;
      this.player.dy = groundY;
      this.sfx.play('thud'); // lands on the corridor floor at once
      this.renderer.render(this);
      onDone();
      return;
    }

    this.entranceOpenFrac = 0;
    this.player.dy = ledgeY;
    let startTs: number | null = null;
    const tick = (now: number): void => {
      if (startTs === null) startTs = now;
      const elapsed = now - startTs;
      this.entranceOpenFrac = clamp01((elapsed - COLD_OPEN_SETTLE_MS) / COLD_OPEN_DOOR_MS);
      const fallProgress = clamp01((elapsed - COLD_OPEN_FALL_START_MS) / COLD_OPEN_FALL_MS);
      if (this.player) this.player.dy = ledgeY + easeInQuad(fallProgress) * (groundY - ledgeY);
      this.renderer.render(this);
      if (elapsed < COLD_OPEN_TOTAL_MS) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setTimeout(() => this.sfx.play('door'), COLD_OPEN_SETTLE_MS);
    setTimeout(() => this.sfx.play('falling', { playbackRate: 2, volume: 0.5 }), COLD_OPEN_FALL_START_MS);
    setTimeout(() => this.sfx.play('thud'), COLD_OPEN_TOTAL_MS); // lands on the corridor floor
    setTimeout(onDone, COLD_OPEN_TOTAL_MS);
  }

  /** The single action verb: pick up a floor bomb underfoot, else throw a carried
      bomb up at the stalactite overhead. */
  action(): void {
    if (this.paused || this.isOver || !this.player) return;
    const floorIndex = this.floorBombUnderPlayer();
    if (floorIndex >= 0 && this.carried < CARRY_CAP) {
      this.floorBombs.splice(floorIndex, 1);
      this.carried++;
      this.sfx.play('pickup');
      return;
    }
    if (this.carried > 0) {
      const target = this.nearbyStalactite();
      if (target) {
        this.carried--;
        this.sfx.play('pickup'); // the throw — the hit lands when the bomb arrives
        this.thrownBombs.push({ target, originWorldX: this.playerWorldX, stepsLeft: THROW_FLIGHT_STEPS });
      }
    }
  }

  /** Advance bombs in flight; each lands its hit on the target stalactite on arrival. */
  private tickThrownBombs(): void {
    for (let i = this.thrownBombs.length - 1; i >= 0; i--) {
      const thrown = this.thrownBombs[i];
      thrown.stepsLeft--;
      if (thrown.stepsLeft > 0) continue;
      this.thrownBombs.splice(i, 1);
      if (!thrown.target.destroyed && this.stalactites.includes(thrown.target)) this.hitStalactite(thrown.target);
    }
  }

  survivedSeconds(): number {
    return Math.min(ABYSS_TIME_BUDGET_S, Math.floor(this.stepCount / STEPS_PER_SECOND));
  }

  get carryCap(): number {
    return CARRY_CAP;
  }

  get availableSizes(): readonly StalactiteSize[] {
    return ABYSS_LEVEL_CONFIG[this.currentLevel].sizes;
  }

  worldToScreenX(worldX: number): number {
    return worldX - this.cameraX;
  }

  playerScreenX(): number {
    return this.playerWorldX - this.cameraX;
  }

  get entranceWorldX(): number {
    return this.canvas.width * 0.5;
  }

  currentBreakdown(): ScoreBreakdown {
    const abyssLevels = this.outcome === 'complete' ? ABYSS_LEVEL_CONFIG.length : this.currentLevel;
    return makeBreakdown({
      surfaceTime: this.base.surfaceTime,
      tunnelTime: this.base.tunnelTime,
      abyssTime: this.survivedSeconds(),
      stalactites: { ...this.breaks },
      levelsBonus: this.base.levelsBonus + abyssLevels * LEVEL_POINTS,
    });
  }

  step(): boolean {
    if (this.isOver) return false;
    if (this.paused) return true;

    this.stepCount++;
    this.updateLevelByTime();

    if (this.hud.setScore(this.survivedSeconds())) {
      this.hud.setTimeWarning(ABYSS_TIME_BUDGET_S - this.survivedSeconds() <= 10);
    }

    if (this.survivedSeconds() >= ABYSS_TIME_BUDGET_S) {
      this.reachDoor();
      return false;
    }

    this.movePlayer();
    this.player?.tickBlink();
    this.maybeSpawnBomb();
    this.spawnStalactitesAhead();
    this.updateBombs();
    this.tickThrownBombs();
    this.tickStalactites();
    this.cull();
    if (this.player) this.hud.displayLives(this.player.lives);
    this.updateHint();
    return !this.isOver;
  }

  private updateHint(): void {
    this.hud.setAbyssBombs(this.carried, CARRY_CAP);
    this.hud.updateAbyssStalactites(this.breaks, this.availableSizes);
  }

  /** Player-driven, the lemming moves at full control speed; the camera
      follows it rightward only and never scrolls back; the screen's left edge is a
      soft wall, so the lemming can stop anywhere. */
  private movePlayer(): void {
    if (!this.player) return;
    const canvasWidth = this.canvas.width;
    this.playerWorldX += this.player.direction * this.player.speed;
    // Left bound: the screen's left margin, but never left of the start column's inner face.
    const leftBound = Math.max(this.cameraX + canvasWidth * SCREEN_LEFT_MARGIN_FRAC, canvasWidth * CORRIDOR_START_FRAC);
    if (this.playerWorldX < leftBound) this.playerWorldX = leftBound;
    const followLine = canvasWidth * CAMERA_FOLLOW_FRAC;
    if (this.playerScreenX() > followLine) this.cameraX = this.playerWorldX - followLine;
    this.player.dx = this.playerScreenX();
  }

  private updateLevelByTime(): void {
    const secs = this.survivedSeconds();
    // Thresholds start at 0 and secs >= 0, so the count is always >= 1 (level >= 0).
    const level = LEVEL_THRESHOLDS_S.filter((threshold) => secs >= threshold).length - 1;
    if (level !== this.currentLevel) {
      this.currentLevel = level;
      this.hud.setLevel(String(level + 1));
      this.hud.showLevelBanner(`Level ${level + 1}`);
      this.sfx.play('levelUp');
    }
  }

  private maybeSpawnBomb(): void {
    const level = ABYSS_LEVEL_CONFIG[this.currentLevel];
    if (this.stepCount - this.lastBombSpawn < level.spawnIntervalFrames) return;
    const canvasWidth = this.canvas.width;
    // Keep bombs inside the walkable corridor: never on the left framing column, never past the visible floor.
    const minWorldX = Math.max(this.cameraX + canvasWidth * SCREEN_LEFT_MARGIN_FRAC, canvasWidth * CORRIDOR_START_FRAC);
    const maxWorldX = this.cameraX + canvasWidth * BOMB_SPAWN_MAX_FRAC;
    const worldX = minWorldX + Math.random() * (maxWorldX - minWorldX);
    const bomb = new Bomb(worldX, level.bombSpeed);
    bomb.dy = this.canvas.height * ABYSS_CEILING_FRAC;
    this.fallingBombs.push(bomb);
    this.lastBombSpawn = this.stepCount;
  }

  private spawnStalactitesAhead(): void {
    const canvasWidth = this.canvas.width;
    const limit = this.cameraX + canvasWidth * SPAWN_AHEAD_FRAC;
    while (this.nextStalactiteWorldX < limit) {
      const level = ABYSS_LEVEL_CONFIG[this.currentLevel];
      this.stalactites.push(new Stalactite(this.nextSize(level.sizes), this.nextStalactiteWorldX));
      this.nextStalactiteWorldX += canvasWidth * level.stalactiteGapFrac;
      this.stalactiteSeq++;
    }
  }

  /** Fixed S/M/L cycle through the level's available sizes. */
  private nextSize(sizes: readonly StalactiteSize[]): StalactiteSize {
    return sizes[this.stalactiteSeq % sizes.length];
  }

  private updateBombs(): void {
    const floorY = this.canvas.height * ABYSS_FLOOR_FRAC;
    const preLives = this.player?.lives;
    for (let i = this.fallingBombs.length - 1; i >= 0; i--) {
      const bomb = this.fallingBombs[i];
      bomb.dy += bomb.speed;
      if (bomb.dy + bomb.dHeight >= floorY) {
        this.fallingBombs.splice(i, 1);
        this.floorBombs.push(bomb.dx);
        continue;
      }
      if (this.player && bombHitsPlayer(
        this.playerScreenX(), this.player.dy, this.player.dWidth, this.player.dHeight,
        this.worldToScreenX(bomb.dx), bomb.dy,
      )) {
        this.fallingBombs.splice(i, 1);
        this.player.lives--;
        this.sfx.play('bombHit');
        if (this.player.lives < 1) this.isOver = true;
      }
    }
    if (this.player && preLives !== undefined && this.player.lives < preLives) {
      this.player.triggerBlink(preLives);
    }
  }

  private floorBombUnderPlayer(): number {
    const range = this.canvas.width * PICKUP_RANGE_FRAC;
    return this.floorBombs.findIndex((worldX) => Math.abs(worldX - this.playerWorldX) <= range);
  }

  /** The nearest breakable stalactite within throw range of the lemming (not just overhead). */
  private nearbyStalactite(): Stalactite | null {
    const range = this.canvas.width * THROW_RANGE_FRAC;
    let nearest: Stalactite | null = null;
    let nearestDist = Infinity;
    for (const stalactite of this.stalactites) {
      if (stalactite.destroyed) continue;
      const dist = Math.abs(stalactite.worldX - this.playerWorldX);
      if (dist <= range && dist < nearestDist) { nearest = stalactite; nearestDist = dist; }
    }
    return nearest;
  }

  private hitStalactite(stalactite: Stalactite): void {
    stalactite.shakeStepsLeft = SHAKE_STEPS;
    stalactite.boomStepsLeft = BOOM_STEPS;
    this.sfx.play('mantrap');
    stalactite.hitsRemaining--;
    if (stalactite.hitsRemaining <= 0) {
      stalactite.destroyed = true;
      stalactite.shatterStepsLeft = SHATTER_STEPS;
      this.breaks[stalactite.size]++;
      this.sfx.play('thud');
    }
  }

  private tickStalactites(): void {
    const fallSpeed = this.canvas.height * FALL_SPEED_FRAC;
    for (let i = this.stalactites.length - 1; i >= 0; i--) {
      const stalactite = this.stalactites[i];
      if (stalactite.shakeStepsLeft > 0) stalactite.shakeStepsLeft--;
      if (stalactite.boomStepsLeft > 0) stalactite.boomStepsLeft--;
      if (stalactite.destroyed) {
        stalactite.fallY += fallSpeed;
        stalactite.shatterStepsLeft--;
        if (stalactite.shatterStepsLeft <= 0) this.stalactites.splice(i, 1);
      }
    }
  }

  private cull(): void {
    const behind = this.cameraX - this.canvas.width * CULL_BEHIND_FRAC;
    this.stalactites = this.stalactites.filter((stalactite) => stalactite.destroyed || stalactite.worldX >= behind);
    this.floorBombs = this.floorBombs.filter((worldX) => worldX >= behind);
  }

  private reachDoor(): void {
    this.outcome = 'complete';
    this.isOver = true;
    // Camera is player-driven, so the exit has no fixed world X — place it beside the
    // lemming (right of screen) for the close tween.
    this.exitWorldX = this.cameraX + this.canvas.width * 0.8;
  }

  private endRun(): void {
    if (this.abyssLoop) this.abyssLoop.pause();
    if (this.outcome === 'complete') {
      this.exitClose(() => this.onComplete(this.currentBreakdown()));
    } else {
      this.onGameOver(this.currentBreakdown());
    }
  }

  /** Exit-door close: the demon-mouth opens, the lemming walks in and vanishes,
      then `onDone` hands off to the win counter. */
  private exitClose(onDone: () => void): void {
    if (this.reduceMotion || !this.player) {
      this.exitOpenFrac = 1;
      this.player = null;
      this.sfx.play('letsgo');
      this.renderer.render(this);
      onDone();
      return;
    }
    const startX = this.player.dx;
    const targetX = this.worldToScreenX(this.exitWorldX) - this.player.dWidth / 2;
    this.player.direction = 1;
    let startTs: number | null = null;
    const tick = (now: number): void => {
      if (startTs === null) startTs = now;
      const elapsed = now - startTs;
      const walkProgress = clamp01(elapsed / EXIT_WALK_MS);
      this.exitOpenFrac = walkProgress;
      if (this.player) {
        this.player.dx = startX + walkProgress * (targetX - startX);
        if (walkProgress >= 1) this.player = null; // vanished into the door
      }
      this.renderer.render(this);
      if (elapsed < EXIT_TOTAL_MS) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setTimeout(() => this.sfx.play('letsgo'), EXIT_WALK_MS);
    setTimeout(onDone, EXIT_TOTAL_MS);
  }
}
