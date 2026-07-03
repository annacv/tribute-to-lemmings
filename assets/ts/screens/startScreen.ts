import { drawLemmingMascot, LEMMING_GRID } from '../entities/Player';
import { consumeDebugScreen } from '../lib/debugScreen';
import { prefersReducedMotion } from '../lib/fx';
import type { AppContext, ScreenRoutes } from '../lib/appContext';

export function generateGuestHandle(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const id = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `Lemming #${id}`;
}

function startMascotAnimation(canvas: HTMLCanvasElement): () => void {
  canvas.width = LEMMING_GRID;
  canvas.height = LEMMING_GRID;
  const ctx = canvas.getContext('2d')!;

  if (prefersReducedMotion()) {
    drawLemmingMascot(ctx, LEMMING_GRID, 0);
    return () => {};
  }

  let frame = 0;
  let rafId = requestAnimationFrame(function tick() {
    drawLemmingMascot(ctx, LEMMING_GRID, frame++);
    rafId = requestAnimationFrame(tick);
  });

  return () => cancelAnimationFrame(rafId);
}

export function createStartScreen(ctx: AppContext, routes: ScreenRoutes): void {
  ctx.buildDom(`
      <section class="splash-hero">
        <canvas class="splash-mascot" role="img" aria-label="Lemming mascot"></canvas>
        <h1 class="splash-title">Tribute to Lemmings</h1>
        <p class="splash-tagline">&gt; skip and escape. stay alive!</p>
        <form class="splash-form">
          <div class="splash-name-wrap">
            <input
              id="splash-name-input"
              class="splash-name-input"
              type="text"
              maxlength="27"
              placeholder="Enter your name"
              aria-label="Your nickname"
              autocomplete="off"
              spellcheck="false"
            >
            <p class="splash-name-notice">&gt; your nickname &amp; score will be saved to a public leaderboard.</p>
          </div>
          <button class="splash-start" type="submit">Start</button>
        </form>
      </section>
    `);

  const stopMascot = startMascotAnimation(ctx.root.querySelector('.splash-mascot') as HTMLCanvasElement);

  const nameInput = ctx.root.querySelector('.splash-name-input') as HTMLInputElement;
  const startBtn = ctx.root.querySelector('.splash-start') as HTMLButtonElement;

  if (ctx.getPlayerName()) {
    nameInput.value = ctx.getPlayerName();
    startBtn.focus();
  }

  const form = ctx.root.querySelector('.splash-form') as HTMLFormElement;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    stopMascot();
    ctx.setPlayerName(nameInput.value.trim() || generateGuestHandle());
    consumeDebugScreen();
    routes.createGameScreen();
  });
}
