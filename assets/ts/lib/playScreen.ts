import { ICON_ARROW_LEFT_SVG, ICON_ARROW_RIGHT_SVG } from '../assets';
import { getCanvasSize } from './geometry';
import { setupMuteButton } from './muteButton';

export type Mover = { setDirection(direction: number): void };

export type PlayScreenConfig = {
  canvasClass: string;
  canvasAriaLabel: string;
  secondsStart: number;
  withAction: boolean;
};

export type PlayScreen = {
  screen: HTMLElement;
  canvas: HTMLCanvasElement;
  /* Left/right from touch buttons + arrow keys; keys are run-scoped via `signal`.
     `isBlocked` mirrors a world's pause gate (e.g. while an info modal is open). */
  wireMovement(getMover: () => Mover | null, signal: AbortSignal, isBlocked?: () => boolean): void;
  /* Action verb from the on-screen button + Space (auto-repeat ignored); only
     meaningful when the screen was built `withAction`. */
  wireAction(onAction: () => void, signal: AbortSignal, isBlocked?: () => boolean): void;
  wireMute(onToggle: (muted: boolean) => void): void;
};

/* Builds the play-screen scaffold shared by every world: the section markup, HUD,
   mute button, and touch controls, mounted into `host`, with the square canvas
   sized to the viewport. Per-world bits (canvas label, starting seconds, the action
   control) are parameterized; the caller keeps its own game, audio, modal, and startup. */
export function buildPlayScreen(host: HTMLElement, config: PlayScreenConfig): PlayScreen {
  const { canvasClass, canvasAriaLabel, secondsStart, withAction } = config;
  const actionButton = withAction
    ? '<button class="touch-space" aria-label="Action">SPACE</button>'
    : '';
  host.innerHTML = `
    <section class="section-container play">
      <div class="game-stage">
        <canvas class="${canvasClass}" role="img" aria-label="${canvasAriaLabel}"></canvas>
        <p class="level-up-banner"></p>
        <div class="game-hud">
          <div class="hud-lives">
            <span class="hud-item lives-item">
              <span class="hud-label">lives</span>
              <span class="hud-value lives-value">3</span>
            </span>
            <div class="lives-icons"></div>
          </div>
          <div class="hud-score">
            <span class="hud-item">
              <span class="hud-value seconds-value">${secondsStart}</span>
              <span class="hud-label">sec</span>
            </span>
            <span class="hud-item level-item">
              <span class="hud-label">level</span>
              <span class="hud-value level-value">1</span>
            </span>
          </div>
        </div>
        <button class="mute-btn" aria-label="Mute sound"></button>
      </div>
      <div class="touch-controls">
        <button class="touch-left" aria-label="Move left">${ICON_ARROW_LEFT_SVG}</button>
        ${actionButton}
        <button class="touch-right" aria-label="Move right">${ICON_ARROW_RIGHT_SVG}</button>
      </div>
    </section>
  `;
  const screen = host;

  /* Measure after mounting: only then is the splash gone and the header visible,
     so getCanvasSize reads the real header/footer heights. */
  const canvas = screen.querySelector('canvas') as HTMLCanvasElement;
  const size = getCanvasSize();
  canvas.width = size;
  canvas.height = size;
  /* Screen swaps blow away the focused element; the aria-hidden canvas can hold
     focus so keyboard and screen-reader users aren't dropped to <body> */
  canvas.tabIndex = -1;

  return {
    screen,
    canvas,
    wireMovement(getMover, signal, isBlocked) {
      const applyDirection = (direction: number): void => {
        if (!isBlocked?.()) getMover()?.setDirection(direction);
      };

      const bindDirection = (el: HTMLElement, direction: number): void => {
        el.addEventListener('touchstart', (e) => {
          e.preventDefault();
          applyDirection(direction);
        }, { passive: false });
        el.addEventListener('click', () => applyDirection(direction));
      };

      bindDirection(screen.querySelector('.touch-right') as HTMLElement, 1);
      bindDirection(screen.querySelector('.touch-left') as HTMLElement, -1);
      /* Dies with the run (signal aborts at halt), so listeners don't stack up
         across play-again cycles */
      document.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'ArrowRight') applyDirection(1);
        else if (event.key === 'ArrowLeft') applyDirection(-1);
      }, { signal });
    },
    wireAction(onAction, signal, isBlocked) {
      const actionBtn = screen.querySelector('.touch-space') as HTMLButtonElement | null;
      const fireAction = (): void => { if (!isBlocked?.()) onAction(); };
      actionBtn?.addEventListener('touchstart', (e) => {
        e.preventDefault();
        fireAction();
      }, { passive: false });
      actionBtn?.addEventListener('click', fireAction);
      /* One verb: Space (or the action button) fires once; auto-repeat is ignored
         and the gate keeps a focused control / open modal from triggering it */
      document.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key !== ' ' || isBlocked?.()) return;
        event.preventDefault();
        if (event.repeat) return;
        onAction();
      }, { signal });
    },
    wireMute(onToggle) {
      setupMuteButton(screen.querySelector('.mute-btn') as HTMLButtonElement, onToggle);
    },
  };
}
