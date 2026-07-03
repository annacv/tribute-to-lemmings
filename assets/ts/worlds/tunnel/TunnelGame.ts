import { Player } from '../../entities/Player';
import { RunHost } from '../../lib/RunHost';
import { STEPS_PER_SECOND } from '../../lib/GameLoop';
import { PICKUP_RANGE_FRAC } from '../../lib/geometry';
import { Hud } from '../../lib/Hud';
import { prefersReducedMotion, restartAnimation } from '../../lib/fx';
import { TunnelRenderer } from './TunnelRenderer';
import * as audio from '../../lib/audio';
import { SoundEffectBank } from '../../lib/SoundEffectBank';
import {
  makeBreakdown, LEVEL_POINTS, type ScoreBreakdown,
} from '../../lib/score';
import {
  SPRITES, FIRE_SFX, BANG_SFX, TENTON_SFX, EXPLODE_SFX, CHAIN_SFX, SCRAPE_SFX, FALLING_SFX,
} from '../../assets';

export const TUNNEL_TIME_BUDGET_S = 60;
export const TOTAL_CYCLES = 3;

/* World geometry is stored as canvas fractions, not pixels, so nothing jumps
   when the canvas resizes (280–580 px). The numbers come from the artwork. */
export const FLOOR_FRAC = 690 / 800; // walkable line in background-tunnel.svg

/* Kill line and warning band, both as floor-to-ceiling headroom.
   The rule: the warning must always show before the crush can fire. */
export const CRUSH_HEADROOM_FRAC = 0.09;
const WARNING_HEADROOM_FRAC = 0.17;

const CRUSH_HITSTOP_STEPS = 15; // ~250 ms freeze so the death beat lands

export const TUNNEL_LEVEL_CONFIG = [
  { startHeadroomFrac: 0.62, driftPerStep: 0.00009, crackMark: 2, bombs: 2 },
  { startHeadroomFrac: 0.48, driftPerStep: 0.00009, crackMark: 0, bombs: 3 },
  { startHeadroomFrac: 0.34, driftPerStep: 0.00013, crackMark: 1, bombs: 4 },
] as const;

const EVENT_SHAKE_STEPS = 18;     // ~300 ms ground-shake warning before the ceiling falls
const STAGED_EVENT_STEPS = 48;    // ~800 ms ceiling drop opening each new level
const MIN_EVENT_DROP_FRAC = 0.05; // the drop must read even if drift already passed the next start
const FUSE_STEPS = 120;           // ~2 s lit fuse before the explosion

/* Breach sequence between cycles: the booom blasts a floor pit open (frames
   0→3), then the camera drops into the next-deeper chamber, which arrives clean
   (the pit scrolled up and away) for the level announce and ceiling drop. */
export const BREACH_BOOM_STEPS = 42; // ~0.7 s booom.svg + pit blasting open
export const BREACH_PAN_STEPS = 72;  // ~1.2 s camera drop into the next chamber
export const BREACH_PAN_END_STEPS = BREACH_BOOM_STEPS + BREACH_PAN_STEPS;  // arrival beat: breach ends here

const LIGHT_PRESSES = 3;
export const CRACK_RANGE_FRAC = 0.1; // how close "at the floor crack" is
const PLAYER_SPAWN_X_FRAC = 0.08;

/* Inner faces of the cave's side-wall columns, as fractions of the 800-wide
   artwork. The lemming's sprite box is bounded inside there to stop at the walls
   instead of clipping the rock bumps. */
const WALL_LEFT_FRAC = 66 / 800;
const WALL_RIGHT_FRAC = 734 / 800;
const BOMB_MIN_X_FRAC = 0.18;
const BOMB_MAX_X_FRAC = 0.82;
const BOMB_MIN_GAP_FRAC = 0.12;

/* The crack sits at a random floor x, off the spawn point and this cycle's bombs */
export const CRACK_MIN_X_FRAC = 0.18;
export const CRACK_MAX_X_FRAC = 0.82;

/* Footing-pad one-shots: snap when he reaches the charge, beckon when he strays */
const PAD_ARRIVE_STEPS = 6;
const PAD_NUDGE_STEPS = 10;

export type TunnelState = 'explore' | 'carry' | 'placed' | 'armed' | 'breach' | 'event';

/** The read-only slice of tunnel state the renderer draws from each frame. */
export interface TunnelView {
  readonly state: TunnelState;
  readonly cycle: number;
  readonly ceilingFrac: number;
  readonly crackXFrac: number;
  readonly floorBombs: readonly number[];
  readonly placedCount: number;
  readonly breachStep: number;
  readonly stepCount: number;
  readonly fuseStepsLeft: number;
  readonly player: Player | null;
  readonly crushFlash: number;
  readonly padArriveSteps: number;
  readonly padNudgeSteps: number;
  readonly padNudgeDir: number;
  readonly reduceMotion: boolean;
  playerCenterFrac(): number;
}

export class TunnelGame implements TunnelView {
  player: Player | null = null;
  isOver = false;
  paused = false;
  canvas: HTMLCanvasElement;
  state: TunnelState = 'explore';
  cycle = 0;
  ceilingFrac = FLOOR_FRAC - TUNNEL_LEVEL_CONFIG[0].startHeadroomFrac;
  crackXFrac = 0.5;
  floorBombs: number[] = [];
  bombSpawns: number[] = [];
  placedCount = 0;
  lightPresses = 0;
  fuseStepsLeft = 0;
  stepCount = 0;
  bankedSeconds = 0;
  cyclesCleared = 0;
  caveLoop: HTMLAudioElement | null = null;
  sfx: SoundEffectBank;
  muted: boolean;
  breachStep = 0;
  private readonly baseBreakdown: ScoreBreakdown;
  private readonly onGameOver: (breakdown: ScoreBreakdown) => void;
  private readonly onComplete: (breakdown: ScoreBreakdown) => void;
  /* Crush feedback: ~250 ms input/world freeze + the white flash overlay */
  private crush = { hitstop: 0, flash: 0 };
  /* Ceiling-drop choreography between cycles: hold while the ground shakes,
     then tween the ceiling from→target over stepsLeft */
  private drop = { stepsLeft: 0, shakeLeft: 0, fromFrac: 0, targetFrac: 0 };
  private warningArmed = true;
  readonly reduceMotion: boolean;
  private hud = new Hud();
  private host: RunHost;
  private renderer: TunnelRenderer;
  padArriveSteps = 0;
  padNudgeSteps = 0;
  padNudgeDir = 1;
  private wasAtCrack = false;

  /** Live flash level for the renderer's crush overlay. */
  get crushFlash(): number {
    return this.crush.flash;
  }

  constructor(
    canvas: HTMLCanvasElement,
    baseBreakdown: ScoreBreakdown,
    onGameOver: (breakdown: ScoreBreakdown) => void,
    onComplete: (breakdown: ScoreBreakdown) => void,
  ) {
    this.onGameOver = onGameOver;
    this.onComplete = onComplete;
    this.canvas = canvas;
    this.baseBreakdown = baseBreakdown;
    this.reduceMotion = prefersReducedMotion();
    this.muted = audio.isMuted();
    this.sfx = new SoundEffectBank({
      pickup: EXPLODE_SFX,
      scrape: SCRAPE_SFX,
      fuse: FIRE_SFX,
      crush: TENTON_SFX,
      breach: BANG_SFX,
      rumble: CHAIN_SFX,
      falling: FALLING_SFX,
    }, () => this.muted);
    this.renderer = new TunnelRenderer(canvas);
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
    this.player = new Player(this.canvas);
    this.player.dx = this.canvas.width * PLAYER_SPAWN_X_FRAC;
    this.player.dy = this.canvas.height * FLOOR_FRAC - this.player.dHeight;
    this.player.minX = this.canvas.width * WALL_LEFT_FRAC;
    this.player.maxX = this.canvas.width * WALL_RIGHT_FRAC - this.player.dWidth;
    this.hud.initLivesIcons(this.player.lives, SPRITES.lemming);
    this.hud.setLivesValue(this.player.lives);
    /* The score slot now counts down */
    this.hud.setScore(this.secondsLeft());
    this.hud.blinkHudScore();
    this.beginCycle(0);
    this.host.start();
  }

  action(): void {
    if (this.paused || this.isOver || this.crush.hitstop > 0) return;
    switch (this.state) {
      case 'explore': {
        const i = this.nearBombIndex();
        if (i < 0) return;
        this.floorBombs.splice(i, 1);
        this.state = 'carry';
        this.sfx.play('pickup');
        break;
      }
      case 'carry':
        if (!this.atCrack()) break;
        this.placedCount++;
        this.sfx.play('pickup');
        this.state = this.placedCount >= TUNNEL_LEVEL_CONFIG[this.cycle].bombs ? 'placed' : 'explore';
        this.lightPresses = 0;
        break;
      case 'placed':
        if (this.atCrack()) {
          this.lightPresses++;
          this.sfx.play('scrape', { volume: 1 });
          if (this.lightPresses >= LIGHT_PRESSES) {
            this.state = 'armed';
            this.fuseStepsLeft = FUSE_STEPS;
            if (this.player) this.player.direction = 0;
            this.sfx.loop('fuse');
          }
        } else {
          this.padNudgeSteps = PAD_NUDGE_STEPS;
          this.padNudgeDir = Math.sign(this.playerCenterFrac() - this.crackXFrac) || 1;
          this.sfx.play('scrape', { volume: 0.3 });
        }
        break;
    }
  }

  secondsLeft(): number {
    return Math.max(0, TUNNEL_TIME_BUDGET_S - Math.floor(this.stepCount / STEPS_PER_SECOND));
  }

  headroomFrac(): number {
    return FLOOR_FRAC - this.ceilingFrac;
  }

  currentBreakdown(): ScoreBreakdown {
    return makeBreakdown({
      surfaceTime: this.baseBreakdown.surfaceTime,
      tunnelTime: this.bankedSeconds,
      levelsBonus: this.baseBreakdown.levelsBonus + this.cyclesCleared * LEVEL_POINTS,
    });
  }

  private cycleStartCeilingFrac(cycle: number): number {
    return FLOOR_FRAC - TUNNEL_LEVEL_CONFIG[cycle].startHeadroomFrac;
  }

  playerCenterFrac(): number {
    return this.player ? (this.player.dx + this.player.dWidth / 2) / this.canvas.width : 0.5;
  }

  private nearBombIndex(): number {
    if (!this.player) return -1;
    const center = this.playerCenterFrac();
    return this.floorBombs.findIndex((x) => Math.abs(center - x) <= PICKUP_RANGE_FRAC);
  }

  private atCrack(): boolean {
    if (!this.player) return false;
    return Math.abs(this.playerCenterFrac() - this.crackXFrac) <= CRACK_RANGE_FRAC;
  }

  /** Random floor x for the crack, clear of the spawn and the cycle's bombs;
      re-rolled per cycle and per crush respawn. */
  private rollCrack(): void {
    const blocked = [PLAYER_SPAWN_X_FRAC, ...this.bombSpawns];
    const clearOf = (x: number) => Math.min(...blocked.map((b) => Math.abs(b - x)));

    for (let i = 0; i < 30; i++) {
      const x = CRACK_MIN_X_FRAC + Math.random() * (CRACK_MAX_X_FRAC - CRACK_MIN_X_FRAC);
      if (clearOf(x) >= BOMB_MIN_GAP_FRAC) { this.crackXFrac = x; return; }
    }
    /* Fallback: midpoint of the widest gap — the roomiest spot, always exists */
    const stops = [
      CRACK_MIN_X_FRAC,
      ...this.bombSpawns.filter((b) => b > CRACK_MIN_X_FRAC && b < CRACK_MAX_X_FRAC).sort((a, b) => a - b),
      CRACK_MAX_X_FRAC,
    ];
    let best = (CRACK_MIN_X_FRAC + CRACK_MAX_X_FRAC) / 2;
    let bestGap = -1;
    for (let i = 1; i < stops.length; i++) {
      const gap = stops[i] - stops[i - 1];
      if (gap > bestGap) { bestGap = gap; best = (stops[i] + stops[i - 1]) / 2; }
    }
    this.crackXFrac = best;
  }

  private rollBombs(count: number): number[] {
    const bombs: number[] = [];
    while (bombs.length < count) {
      const x = BOMB_MIN_X_FRAC + Math.random() * (BOMB_MAX_X_FRAC - BOMB_MIN_X_FRAC);
      if (bombs.every((b) => Math.abs(b - x) >= BOMB_MIN_GAP_FRAC)) bombs.push(x);
    }
    return bombs;
  }

  /** Clear in-progress carry/place/light/fuse and restore the floor bombs from
      this cycle's spawn layout. Shared by cycle setup and crush respawn. */
  private resetCycleProgress(): void {
    this.placedCount = 0;
    this.lightPresses = 0;
    this.fuseStepsLeft = 0;
    this.floorBombs = [...this.bombSpawns];
  }

  /** Lay out a cycle's crack + bombs without changing state, so a transition
      can stage them before gameplay resumes. */
  private setupCycle(cycle: number): void {
    this.cycle = cycle;
    this.bombSpawns = this.rollBombs(TUNNEL_LEVEL_CONFIG[cycle].bombs);
    this.resetCycleProgress();
    this.rollCrack();
    this.hud.setLevel(String(cycle + 1));
  }

  private beginCycle(cycle: number): void {
    this.setupCycle(cycle);
    this.state = 'explore';
  }

  private bankShare(): number {
    const unbanked = Math.max(0, this.secondsLeft() - this.bankedSeconds);
    const cyclesLeft = TOTAL_CYCLES - this.cyclesCleared;
    return cyclesLeft > 1 ? Math.floor(unbanked / cyclesLeft) : unbanked;
  }

  private breach(): void {
    this.sfx.stopLoop('fuse');
    this.sfx.play('breach');
    const share = this.bankShare();
    this.bankedSeconds += share;
    this.cyclesCleared++;
    this.hud.setScore(this.secondsLeft());
    this.hud.scoreGain(LEVEL_POINTS);
    this.hud.showLevelUpEffect(`Level ${this.cyclesCleared}`);
    restartAnimation(this.canvas, 'shake-light');

    /* Every cycle — including the last — opens the floor pit; the final breach
       hands off to the Abyss transition screen (main.ts) via the completion latch */
    this.state = 'breach';
    this.breachStep = 0;
  }

  private handleCrush(): void {
    if (!this.player) return;
    this.player.lives--;
    this.hud.displayLives(this.player.lives);
    this.sfx.stopLoop('fuse');
    this.sfx.play('crush');
    this.crush.hitstop = CRUSH_HITSTOP_STEPS;
    this.crush.flash = CRUSH_HITSTOP_STEPS;

    if (this.player.lives < 1) return;

    this.ceilingFrac = this.cycleStartCeilingFrac(this.cycle);
    this.warningArmed = true;
    this.player.dx = this.canvas.width * PLAYER_SPAWN_X_FRAC;
    this.player.direction = 0;
    this.state = 'explore';
    this.resetCycleProgress();
    this.rollCrack();
  }

  step(): boolean {
    if (this.isOver) return false;
    if (this.paused) return true;
    if (this.crush.hitstop > 0) {
      this.crush.hitstop--;
      /* A lethal crush plays its full death beat too: the run ends only once the
         freeze elapses, so the squash + white flash land before the game-over screen */
      if (this.crush.hitstop === 0 && this.player && this.player.lives < 1) {
        this.isOver = true;
        return false;
      }
      return true;
    }
    if (this.crush.flash > 0) this.crush.flash--;

    /* The breach beat and the inter-cycle ceiling drop are both non-interactive:
       freeze the countdown and the world through them (no stepCount tick) */
    if (this.state === 'breach') {
      this.stepBreach();
      return true;
    }

    if (this.state === 'event') {
      /* Hold the ceiling while the ground shakes (rumble fired on entry) */
      if (this.drop.shakeLeft > 0) {
        this.drop.shakeLeft--;
        return true;
      }

      /* Staged drop into the new level, readable even if drift overshot the start */
      this.drop.stepsLeft--;
      const t = 1 - this.drop.stepsLeft / STAGED_EVENT_STEPS;
      this.ceilingFrac = this.drop.fromFrac + (this.drop.targetFrac - this.drop.fromFrac) * t;

      if (this.drop.stepsLeft <= 0) {
        this.ceilingFrac = this.drop.targetFrac;
        this.warningArmed = true;
        /* The cycle was already laid out on entry; just resume gameplay */
        this.state = 'explore';
      }
      return true;
    }

    this.stepCount++;
    if (this.hud.setScore(this.secondsLeft())) {
      /* ≤10 s warning: color + pulse (reduced motion keeps color only) */
      this.hud.setTimeWarning(this.secondsLeft() <= 10);
    }

    /* Continuous drift: reduced motion never stops it — it's gameplay, not decoration */
    this.ceilingFrac += TUNNEL_LEVEL_CONFIG[this.cycle].driftPerStep;

    if (this.warningArmed && this.inWarningBand()) {
      this.warningArmed = false;
      this.sfx.play('rumble');
    }

    if (this.headroomFrac() <= CRUSH_HEADROOM_FRAC) {
      this.handleCrush();
      return true;
    }

    /* Frozen on the charge during the lit fuse: he committed, he stays put */
    if (this.state !== 'armed') this.player?.move();

    /* Tick the pad one-shots; snap on first arrival at the charge while placed */
    if (this.padArriveSteps > 0) this.padArriveSteps--;
    if (this.padNudgeSteps > 0) this.padNudgeSteps--;

    if (this.state === 'placed') {
      const at = this.atCrack();
      if (at && !this.wasAtCrack) this.padArriveSteps = PAD_ARRIVE_STEPS;
      this.wasAtCrack = at;
    } else {
      this.wasAtCrack = false;
    }

    if (this.state === 'armed') {
      this.fuseStepsLeft--;
      if (this.fuseStepsLeft <= 0) this.breach();
    }
    return true;
  }

  /** Advances the breach beat one step at a time (see the BREACH_* constants). */
  private stepBreach(): void {
    this.breachStep++;
    if (this.player) this.player.direction = 0; // falls, no walk cycle
    const isFinal = this.cyclesCleared >= TOTAL_CYCLES;
    if (isFinal) {
      /* Final breach: the run ends the instant the pit opens — no in-tunnel pan
         (it reads as falling into another tunnel). main.ts plays the fall on the
         Abyss screen instead, mirroring the surface→tunnel handoff. */
      if (this.breachStep >= BREACH_BOOM_STEPS) this.isOver = true;
      return;
    }
    if (this.breachStep === BREACH_BOOM_STEPS + 1) {
      /* Collapse cue at 2× so it reads shorter than the final world-boundary
         fall (which plays on the Abyss screen) */
      this.sfx.play('falling', { playbackRate: 2 });
    }
    if (this.breachStep >= BREACH_PAN_END_STEPS) {
      /* Landed in the new chamber; announce the level */
      this.hud.showLevelBanner(`Level ${this.cyclesCleared + 1}`);
      this.state = 'event';
      /* Stage the new level now so it's in place as the chamber arrives */
      this.setupCycle(this.cyclesCleared);
      /* Warn before the drop: a ground shake + grinding rumble fire now */
      this.drop.shakeLeft = EVENT_SHAKE_STEPS;
      this.drop.stepsLeft = STAGED_EVENT_STEPS;
      this.drop.fromFrac = this.ceilingFrac;
      this.drop.targetFrac = Math.max(
        this.cycleStartCeilingFrac(this.cyclesCleared),
        this.ceilingFrac + MIN_EVENT_DROP_FRAC,
      );
      this.sfx.play('rumble');
      restartAnimation(this.canvas, 'shake-light');
    }
  }

  private endRun(): void {
    if (this.caveLoop) audio.stopLoop(this.caveLoop);
    this.sfx.stopLoop('fuse');
    const finish = this.cyclesCleared >= TOTAL_CYCLES ? this.onComplete : this.onGameOver;
    finish(this.currentBreakdown());
  }

  /** Near-crush warning: rumble before the kill line. */
  inWarningBand(): boolean {
    return this.headroomFrac() <= WARNING_HEADROOM_FRAC;
  }
}
