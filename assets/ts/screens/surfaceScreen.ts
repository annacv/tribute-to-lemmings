import { isMuted } from '../lib/audio';
import { SurfaceGame } from '../worlds/surface/SurfaceGame';
import { preloadLeaderboard } from '../lib/leaderboard';
import { buildPlayScreen } from '../lib/playScreen';
import { SURFACE_MODAL, showInfoModal } from '../lib/infoModal';
import type { AppContext, ScreenRoutes } from '../lib/appContext';

export function createGameScreen(ctx: AppContext, routes: ScreenRoutes): void {
  preloadLeaderboard();

  const { canvas, wireMovement, wireMute } = buildPlayScreen(ctx.root, {
    canvasClass: 'game-canvas',
    canvasAriaLabel: 'Game area — dodge the falling bombs',
    secondsStart: 0,
    withAction: false,
  });

  const game = new SurfaceGame(
    canvas,
    routes.createGameOverScreen,
    (breakdown) => routes.createTransitionScreen({ breakdown }),
  );

  game.gameSong.muted = isMuted();
  wireMute((muted) => { game.gameSong.muted = muted; game.muted = muted; });
  wireMovement(() => game.player, game.runSignal);

  game.startSong();

  canvas.focus();
  showInfoModal(SURFACE_MODAL, () => {
    canvas.focus();
    game.startGame();
  });
}
