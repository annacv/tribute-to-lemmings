import { drawLemmingShape, LEMMING_GRID } from '../entities/Player';
import { prefersReducedMotion } from '../lib/fx';
import { isMuted, safePlay } from '../lib/audio';
import { getCanvasSize, LEMMING_SIZE_FRAC, TRANSITION_GEOMETRY } from '../lib/geometry';
import { loadImage, whenImagesSettled } from '../lib/images';
import { FALLING_SFX, TUNNEL_CEILING_SVG, UNDERGROUND_BACKGROUND_SVG } from '../assets';
import type { ScoreBreakdown } from '../lib/score';
import type { AppContext, ScreenRoutes } from '../lib/appContext';

const TRANSITION_FALL_DURATION_MS = 500;
const TRANSITION_SCROLL_DURATION_MS = 1700;
const TRANSITION_CEILING_DURATION_MS = 600;
const TRANSITION_REST_FADE_MS = 500;
const TRANSITION_TOTAL_MS =
  TRANSITION_FALL_DURATION_MS + TRANSITION_SCROLL_DURATION_MS + TRANSITION_CEILING_DURATION_MS;
const TRANSITION_BREATH_MS = 800;
export const TRANSITION_MESSAGE_AT_REST = 1;
export const TRANSITION_MESSAGE_FROM_START = 0.0125;
export const TUNNEL_CEILING_HANG_FRAC = 0.24;
export const ABYSS_CEILING_HANG_FRAC = 0.5;

export type TransitionConfig = {
  breakdown: ScoreBreakdown;
  stingerHtml?: string;
  onArrive?: (breakdown: ScoreBreakdown) => void;
  backgroundSvg?: string;
  messageScrollT?: number;
  ceilingSvg?: string;
  ceilingHangFrac?: number;
};

const REVEAL_FLOOR_TOP_SVG = 2688;
const EASE_OUT_BACK_C1 = 1.70158;
const EASE_OUT_BACK_C3 = EASE_OUT_BACK_C1 + 1;

/* The collapse-shaft fall transition. Default: surface→tunnel (lands in the
   tunnel). Reused for tunnel→Abyss by passing the warm stinger, the descent art
   that reddens into the Abyss, and the win-screen arrival (see the tunnel
   completion callback). */
export function createTransitionScreen(
  ctx: AppContext,
  routes: ScreenRoutes,
  config: TransitionConfig,
): void {
  const {
    breakdown,
    stingerHtml = '&gt; somewhere underground...',
    onArrive = routes.createTunnelScreen,
    backgroundSvg = UNDERGROUND_BACKGROUND_SVG,
    messageScrollT = TRANSITION_MESSAGE_AT_REST,
    ceilingSvg = TUNNEL_CEILING_SVG,
    ceilingHangFrac = TUNNEL_CEILING_HANG_FRAC,
  } = config;
  const size = getCanvasSize();
  const screen = ctx.buildDom(`
      <section class="section-container to-be-continued-screen">
        <div class="game-stage">
          <canvas class="transition-canvas" aria-hidden="true"></canvas>
          <div class="transition-overlay">
            <p class="transition-line">${stingerHtml}</p>
          </div>
        </div>
      </section>
    `);

  const canvas = screen.querySelector('.transition-canvas') as HTMLCanvasElement;
  canvas.width = size;
  canvas.height = size;

  /* Focus visible content, never the aria-hidden canvas */
  const overlay = screen.querySelector('.transition-overlay') as HTMLElement;
  overlay.tabIndex = -1;
  overlay.focus();
  const ctx2d = canvas.getContext('2d')!;
  const reduceMotion = prefersReducedMotion();

  const undergroundImg = loadImage(backgroundSvg);
  const ceilingImg = loadImage(ceilingSvg);

  if (!isMuted()) {
    safePlay(new Audio(FALLING_SFX));
  }

  const lemmingSize = size * LEMMING_SIZE_FRAC;
  const bgSize = size * TRANSITION_GEOMETRY.BG_ZOOM;
  const surfaceBottomY = bgSize * (1 - TRANSITION_GEOMETRY.BG_CROP_TOP_FRAC);
  /* Mirrors the shaft geometry baked into background-underground.svg so the
     lemming lands in row 0's hole */
  const erosionFrameW = size * TRANSITION_GEOMETRY.EROSION_SLOT_WIDTH_FRAC;
  const erosionFrameH = erosionFrameW * TRANSITION_GEOMETRY.GROUND_EROSION_ASPECT;
  const erosionStackTop = size * TRANSITION_GEOMETRY.EROSION_STACK_TOP_FRAC;
  const SCROLL_DISTANCE = surfaceBottomY + 2 * size;
  const holeCenterY = erosionStackTop + erosionFrameH * TRANSITION_GEOMETRY.HOLE_CENTER_Y_FRAC;
  const holeX = size * 0.5 - lemmingSize / 2;
  const holeY = holeCenterY - lemmingSize / 2;
  /* Where the chamber floor lands on screen once the camera has fully scrolled,
     and the lemming's resting Y so its feet sit on it (no longer suspended). */
  const drawYAtFullScroll = surfaceBottomY - size * 0.5 - SCROLL_DISTANCE;
  const floorScreenY = REVEAL_FLOOR_TOP_SVG * (size / 800) + drawYAtFullScroll;
  const landY = floorScreenY - lemmingSize;

  /* Debris anchored in world space below the ground; streams past during the
     scroll but never comes to rest inside the final dark frame */
  const specks = Array.from({ length: 26 }, () => ({
    x: Math.random() * size,
    y: size * 1.05 + Math.random() * (SCROLL_DISTANCE - size * 1.6),
    w: 2 + Math.random() * 3,
    h: 6 + Math.random() * 8,
  }));

  function drawScene(
    lemmingY: number, scrollY: number, veilAlpha: number, hairLevel: number, ceilingDrop: number,
  ): void {
    ctx2d.clearRect(0, 0, size, size);
    if (undergroundImg.complete && undergroundImg.naturalWidth > 0) {
      ctx2d.drawImage(undergroundImg, 0, surfaceBottomY - size * 0.5 - scrollY, size, size * 3.5);
    }
    if (scrollY > 0) {
      ctx2d.fillStyle = '#3a3426';
      for (const speck of specks) {
        const speckY = speck.y - scrollY;
        if (speckY > -speck.h && speckY < size) ctx2d.fillRect(speck.x, speckY, speck.w, speck.h);
      }
    }
    /* Rest-beat veil: lifts after the camera settles so the hint fragments breathe in */
    if (veilAlpha > 0) {
      ctx2d.globalAlpha = veilAlpha;
      ctx2d.fillStyle = '#0d062b';
      ctx2d.fillRect(0, 0, size, size);
      ctx2d.globalAlpha = 1;
    }
    ctx2d.save();
    ctx2d.translate(holeX, lemmingY);
    ctx2d.scale(lemmingSize / LEMMING_GRID, lemmingSize / LEMMING_GRID);
    drawLemmingShape(ctx2d, '#FFFFFF', hairLevel);
    ctx2d.restore();
    /* The ceiling slams down from above the frame to seal the lemming in. Drawn
       last so it reads as closing over the scene; the mass stays off-screen and
       only the lip and teeth hang into the top. */
    if (ceilingDrop > 0 && ceilingImg.complete && ceilingImg.naturalWidth > 0) {
      const ceilingH = size * (ceilingImg.naturalHeight / ceilingImg.naturalWidth);
      const bottomEdge = ceilingHangFrac * size * ceilingDrop;
      ctx2d.drawImage(ceilingImg, 0, bottomEdge - ceilingH, size, ceilingH);
    }
  }

  const scrollStart = TRANSITION_FALL_DURATION_MS;
  const ceilingStart = scrollStart + TRANSITION_SCROLL_DURATION_MS;
  const animEnd = ceilingStart + TRANSITION_CEILING_DURATION_MS;

  function animate(startTime: number, now: number): void {
    const elapsed = now - startTime;
    const fallT = Math.min(elapsed / TRANSITION_FALL_DURATION_MS, 1);
    const scrollT = Math.min(Math.max(elapsed - scrollStart, 0) / TRANSITION_SCROLL_DURATION_MS, 1);

    const eased = scrollT < 0.5
      ? 8 * scrollT ** 4
      : 1 - (-2 * scrollT + 2) ** 4 / 2;

    const scrollY = eased * SCROLL_DISTANCE;
    /* The lemming drops into the hole, then keeps falling
       descending with the camera and easing onto the chamber floor exactly as
       the reveal settles */
    const descend = 1 - (1 - scrollT) ** 2;

    const lemmingY = fallT < 1
      ? -lemmingSize + fallT * (holeY + lemmingSize)
      : holeY + descend * (landY - holeY);
    /* Ceiling: easeOutBack so it slams past the rest point then settles */
    const ceilingT = Math.min(Math.max(elapsed - ceilingStart, 0) / TRANSITION_CEILING_DURATION_MS, 1);
    const overshoot = ceilingT - 1;
    const ceilingDrop = ceilingT <= 0 ? 0 : 1 + EASE_OUT_BACK_C3 * overshoot ** 3 + EASE_OUT_BACK_C1 * overshoot ** 2;
    const restT = Math.min(Math.max(elapsed - ceilingStart, 0) / TRANSITION_REST_FADE_MS, 1);
    /* Arrive in pure dark, then let the hint fragments emerge (easeOutQuad) */
    const veilAlpha = scrollT < 1 ? 0 : 0.8 * (1 - restT * (2 - restT));
    /* Wild hair through the airborne descent; calms once grounded */
    const hairLevel = scrollY > 0 && scrollT < 1 ? 4 : 0;

    drawScene(lemmingY, scrollY, veilAlpha, hairLevel, ceilingDrop);
    /* The stinger fades in at its reveal point: at rest for surface→tunnel (no
       mid-scroll cliffhanger), early for the Abyss handoff (before the reveal) */
    if (scrollT >= messageScrollT) overlay.classList.add('show');
    if (elapsed < animEnd) requestAnimationFrame((n) => animate(startTime, n));
  }

  /* The handoff arms only once the animation starts, so a slow image load
     can't tear the screen down mid-scroll (whenImagesSettled fires start once) */
  const start = (): void => {
    /* Reduced motion: jump straight to the final frame — lemming grounded,
       ceiling closed, veil already lifted */
    const skipMs = reduceMotion ? animEnd : 0;
    requestAnimationFrame((now) => animate(now - skipMs, now));
    /* The arrival routes into the tunnel after a short breath; the breakdown
       passes onward unchanged (surface + surface levels bonus already applied) */
    setTimeout(() => onArrive(breakdown), TRANSITION_TOTAL_MS + TRANSITION_BREATH_MS);
  };

  whenImagesSettled([undergroundImg, ceilingImg], start);
}
