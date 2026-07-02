import { prefersReducedMotion } from '../lib/fx';
import { isMuted, safePlay } from '../lib/audio';
import { getDebugScreen } from '../lib/debugScreen';
import { announce } from '../lib/liveRegion';
import { submitScore } from '../lib/leaderboard';
import { breakdownLines, type ScoreBreakdown } from '../lib/score';
import { COUNT_CHIME_SFX, COUNT_TICK_SFX, DIE_SFX } from '../assets';
import type { AppContext, ScreenRoutes, SubmissionResult } from '../lib/appContext';

const GAME_OVER_TRANSITION_MS = 2000;
const GAME_OVER_COUNT_HOLD_MS = 5000;

const COUNT_LINE_START_MS = 300; // initial delay (ms) before the first line appears
const COUNT_LINE_STAGGER_MS = 250; // time between each line (ms)
const COUNT_ROLL_MS = 500; // duration of score roll-up (ms)
const COUNT_ROLL_TICK_MS = 40; // time between each roll tick (ms)

type CountLine = ReturnType<typeof breakdownLines>[number];

function renderCountLines(countList: Element, lines: readonly CountLine[]): HTMLLIElement[] {
  return lines.map(({ label, rule, value }) => {
    const li = document.createElement('li');
    li.className = 'go-count-line';
    li.innerHTML = `<span class="go-count-label">${label}</span><span class="go-count-rule">${rule}</span><span class="go-count-value">${value}</span>`;
    countList.appendChild(li);
    return li;
  });
}

function showReducedMotionCount(lineEls: readonly HTMLLIElement[], score: Element, total: number): void {
  lineEls.forEach((li) => li.classList.add('show'));
  score.textContent = String(total);
  announce(`Score: ${total}`);
}

function showStaticScore(score: Element, total: number): void {
  score.textContent = String(total);
  announce(`Score: ${total}`);
}

function animateCountSequence(
  ctx: AppContext,
  score: Element,
  lineEls: readonly HTMLLIElement[],
  total: number,
  playOptionalSfx: (src: string) => void,
): void {
  score.textContent = '0';

  // add each line with a delay based on its index (stagger)
  lineEls.forEach((li, i) => setTimeout(() => {
    li.classList.add('show');
    playOptionalSfx(COUNT_TICK_SFX);
  }, COUNT_LINE_START_MS + i * COUNT_LINE_STAGGER_MS));

  const rollStartMs = COUNT_LINE_START_MS + lineEls.length * COUNT_LINE_STAGGER_MS;
  const rollStep = Math.ceil(total / (COUNT_ROLL_MS / COUNT_ROLL_TICK_MS));

  // start the roll when the lines are all shown
  setTimeout(() => {
    playOptionalSfx(COUNT_CHIME_SFX);

    const rollTimer = setInterval(() => {
      if (!ctx.root.contains(score)) { clearInterval(rollTimer); return; }
      const next = Math.min(total, Number(score.textContent) + rollStep);
      score.textContent = String(next);

      // stop the roll when the score reaches the total
      if (next >= total) {
        clearInterval(rollTimer);
        announce(`Score: ${total}`);
      }
    }, COUNT_ROLL_TICK_MS);
  }, rollStartMs);
}

export function createGameOverScreen(
  ctx: AppContext,
  routes: ScreenRoutes,
  breakdown: ScoreBreakdown,
  variant: 'death' | 'win' = 'death',
): void {
  const reduceMotion = prefersReducedMotion();
  const countLines = breakdownLines(breakdown).filter((line) => line.value > 0);
  const hasCount = breakdown.tunnelTime + breakdown.abyssTime + breakdown.stalactiteBonus + breakdown.levelsBonus > 0;
  const isWin = variant === 'win';

  const backgroundHtml = isWin
    ? '<div class="win-bg" aria-hidden="true"></div>'
    : '<div class="game-over-bg" aria-hidden="true"></div>';

  const headingHtml = isWin
    ? '<p class="go-boom">CONGRATS!!!</p><h1 class="go-title">&gt; You made it!</h1>'
    : '<p class="go-boom">BOOOM!!!</p><h1 class="go-title">GAME OVER</h1>';

  const screen = ctx.buildDom(`
      <section class="section-container game-over-screen">
        <div class="game-stage">
          ${backgroundHtml}
          <div class="game-over-overlay">
            ${headingHtml}
            ${hasCount ? '<ul class="go-count"></ul>' : ''}
            <p class="go-score">score <span class="go-score-value"></span></p>
          </div>
        </div>
      </section>
    `);

  const title = screen.querySelector('.go-title') as HTMLElement;
  title.tabIndex = -1;
  title.focus();

  const startRankingMusic = (): void => {
    ctx.rankingMusic.startOnGameOver(ctx.root);
  };

  ctx.rankingMusic.stop(); // defensive reset

  const muted = isMuted();
  const playOptionalSfx = (src: string): void => {
    if (!muted) safePlay(new Audio(src));
  };

  const score = screen.querySelector('.go-score-value');
  const countList = screen.querySelector('.go-count');

  if (score) {
    if (hasCount && countList) {
      const lineEls = renderCountLines(countList, countLines);
      if (reduceMotion) showReducedMotionCount(lineEls, score, breakdown.total);
      else animateCountSequence(ctx, score, lineEls, breakdown.total, playOptionalSfx);
    } else {
      showStaticScore(score, breakdown.total);
    }
  }

  if (variant === 'death' && !muted) {
    const dieSfx = new Audio(DIE_SFX);
    dieSfx.addEventListener('ended', startRankingMusic);
    safePlay(dieSfx);
  } else if (variant === 'death') {
    startRankingMusic();
  }

  /* Only the total reaches the leaderboard; the breakdown stays client-side */
  const submission: Promise<SubmissionResult> = getDebugScreen()
    ? Promise.resolve({ error: false, docId: null, bestScore: null })
    : submitScore(ctx.getPlayerName(), breakdown.total)
      .then(({ docId, bestScore }) => ({ error: false, docId, bestScore }))
      .catch(() => ({ error: true, docId: null, bestScore: null }));

  /* Hold the breakdown long enough to read it; surface-only deaths (no count) keep today's short beat. */
  const holdMs = hasCount && !reduceMotion ? GAME_OVER_COUNT_HOLD_MS : GAME_OVER_TRANSITION_MS;
  setTimeout(() => {
    if (isWin) routes.createTheEndScreen(breakdown, submission);
    else routes.createRankingScreen(breakdown.total, submission);
  }, holdMs);
}
