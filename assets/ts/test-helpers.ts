import { vi } from 'vitest';

export const TEST_CANVAS_SIZE = 468;

export function stubAnimationFrame(): void {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 0));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
}

/** Captures rAF callbacks so tests drive loops with chosen timestamps. */
export function makeRafQueue() {
  const callbacks: FrameRequestCallback[] = [];
  const raf = vi.fn((frameCallback: FrameRequestCallback) => {
    callbacks.push(frameCallback);
    return callbacks.length;
  });
  const caf = vi.fn();
  vi.stubGlobal('requestAnimationFrame', raf);
  vi.stubGlobal('cancelAnimationFrame', caf);
  return {
    raf,
    caf,
    pump(timestamp: number): void {
      const frameCallback = callbacks.shift();
      if (!frameCallback) throw new Error('no rAF callback pending');
      frameCallback(timestamp);
    },
    get pending(): number {
      return callbacks.length;
    },
  };
}

export function mockPendingImage(): HTMLImageElement {
  return { complete: false, naturalWidth: 0, naturalHeight: 0 } as HTMLImageElement;
}

export function mockReadyImage(width: number, height: number): HTMLImageElement {
  return { complete: true, naturalWidth: width, naturalHeight: height } as HTMLImageElement;
}

/** Default lemming box on the test canvas (matches Player constructor placement). */
export function defaultPlayerHitbox(canvas?: HTMLCanvasElement) {
  const height = canvas?.height ?? TEST_CANVAS_SIZE;
  const size = 50;
  return { x: 40, y: height - size - 38, w: size, h: size };
}

export interface SteppableGame {
  step(): void;
  isOver: boolean;
}

export function stepUntil(game: SteppableGame, steps: number): void {
  for (let i = 0; i < steps && !game.isOver; i++) game.step();
}

export function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Stub matchMedia; returns a restore function. */
export function stubMatchMedia(predicate: (query: string) => boolean): () => void {
  const real = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: predicate(query),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return () => { window.matchMedia = real; };
}

export function makeCtx(canvas?: HTMLCanvasElement) {
  const fills: string[] = [];
  const ctx = {
    canvas,
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    font: '',
    textAlign: 'start' as CanvasTextAlign,
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    ellipse: vi.fn(),
    strokeStyle: '' as string | CanvasGradient | CanvasPattern,
    lineWidth: 1,
    fillStyle: '' as string | CanvasGradient | CanvasPattern,
    fill: vi.fn().mockImplementation(() => { fills.push(ctx.fillStyle as string); }),
    _fills: fills,
  };
  return ctx;
}

export function makeCanvas(width = TEST_CANVAS_SIZE, height = TEST_CANVAS_SIZE) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext = vi.fn().mockReturnValue(makeCtx(canvas)) as typeof canvas.getContext;
  return canvas;
}

export function mountPlayHudDom(secondsStart = 0): void {
  document.body.innerHTML = `
    <div class="lives-icons"></div>
    <span class="hud-item lives-item"><span class="hud-value lives-value"></span></span>
    <div class="hud-score">
      <span class="hud-item"><span class="hud-value seconds-value">${secondsStart}</span></span>
      <span class="hud-item level-item"><span class="hud-value level-value"></span></span>
    </div>
    <p class="level-up-banner"></p>
  `;
}
