import { fetchTopScores, getPlayerRank } from '../lib/leaderboard';
import { announce } from '../lib/liveRegion';
import { setupMuteButton } from '../lib/muteButton';
import { getCanvasSize } from '../lib/geometry';
import type { AppContext, ScreenRoutes, SubmissionResult } from '../lib/appContext';

const SUBMISSION_TIMEOUT_MS = 2500;

function withFallback<T>(p: Promise<T>, ms: number, fallback: () => T): Promise<T> {
  return Promise.race([p, new Promise<T>(resolve => setTimeout(() => resolve(fallback()), ms))]);
}

function withDeadline<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);
}

function appendRankingRow(
  parent: Element,
  rank: number,
  name: string,
  score: number,
  current: boolean,
): void {
  const row = document.createElement(parent.tagName === 'OL' ? 'li' : 'div');
  row.className = `ranking-row${current ? ' ranking-row--current' : ''}`;

  const rankEl = document.createElement('span');
  rankEl.className = 'ranking-rank';
  rankEl.textContent = `${rank}.`;

  const nameEl = document.createElement('span');
  nameEl.className = 'ranking-name';
  nameEl.textContent = name;

  const scoreEl = document.createElement('span');
  scoreEl.className = 'ranking-score';
  scoreEl.textContent = String(score);

  row.append(rankEl, nameEl, scoreEl);
  parent.appendChild(row);
}

function isRankingMounted(root: HTMLElement): boolean {
  return !!root.querySelector('.ranking-list');
}

function renderRankingError(
  list: Element,
  onRetry: () => void,
): void {
  list.innerHTML = `
      <p class="ranking-error">&gt; could not load rankings.</p>
      <a class="ranking-retry" href="#">try again</a>
    `;
  list.querySelector('.ranking-retry')?.addEventListener('click', (e) => {
    e.preventDefault();
    list.innerHTML = '<p class="ranking-loading">&gt; loading...</p>';
    onRetry();
  });
}

type RowLike = { id: string; name: string; score: number };

function renderTopScores(
  list: Element,
  scores: readonly RowLike[],
  isPlayerRow: (s: RowLike) => boolean,
): { playerRank: number | null; playerInTop10: boolean } {
  const playerInTop10 = scores.some(isPlayerRow);

  list.replaceChildren();
  const table = document.createElement('ol');
  table.className = 'ranking-table';
  list.appendChild(table);

  let displayRank = 1;
  let playerRank: number | null = null;

  scores.forEach((s, i) => {
    if (i > 0 && s.score < scores[i - 1].score) displayRank = i + 1;
    const isCurrent = isPlayerRow(s);
    if (isCurrent) playerRank = displayRank;
    appendRankingRow(table, displayRank, s.name, s.score, isCurrent);
  });

  return { playerRank, playerInTop10 };
}

function appendNotTop10Row(
  list: Element,
  rank: number,
  playerName: string,
  score: number,
): void {
  const divider = document.createElement('hr');
  divider.className = 'ranking-divider';
  list.appendChild(divider);
  if (rank > 10) {
    const note = document.createElement('p');
    note.className = 'ranking-not-top10';
    note.textContent = '> you are still not in the top 10';
    list.appendChild(note);
  }
  appendRankingRow(list, rank, playerName, score, true);
}

/** The leaderboard keeps one record per name (the personal best), so a name
    match means this row IS the player's entry — highlight it in place and
    never append a duplicate row with this run's lower score below */
async function renderRankingSuccess(
  ctx: AppContext,
  list: Element,
  scores: readonly RowLike[],
  submission: SubmissionResult,
  currentScore: number,
): Promise<void> {
  if (scores.length === 0) {
    list.innerHTML = '<p class="ranking-empty">&gt; no scores yet — be the first!</p>';
    return;
  }
  const playerName = ctx.getPlayerName();
  const { docId: submittedDocId, bestScore } = submission;
  const isPlayerRow = (s: RowLike): boolean =>
    (submittedDocId !== null && s.id === submittedDocId)
    || (playerName !== '' && s.name === playerName);

  const { playerInTop10, playerRank: top10Rank } = renderTopScores(list, scores, isPlayerRow);
  let playerRank = top10Rank;

  if (!playerInTop10) {
    const effectiveScore = bestScore ?? currentScore;
    const rank = await getPlayerRank(effectiveScore).catch(() => null);
    if (!isRankingMounted(ctx.root)) return;
    if (rank !== null) {
      playerRank = rank;
      appendNotTop10Row(list, rank, playerName, effectiveScore);
    }
  }
  /* Announce the settled rank once, after the list renders (both the in-top-10
     row and the appended below-top-10 row are covered) */
  if (playerRank !== null) announce(`Rank ${playerRank}`);
}

export function createRankingScreen(
  ctx: AppContext,
  routes: ScreenRoutes,
  currentScore: number,
  submission: Promise<SubmissionResult>,
): void {
  const size = getCanvasSize();
  ctx.buildDom(`
      <section class="section-container ranking-screen">
        <div class="game-stage">
          <canvas class="ranking-canvas" aria-hidden="true"></canvas>
          <div class="ranking-overlay">
            <h1 class="ranking-title">Hall of Fame</h1>
            <div class="ranking-list">
              <p class="ranking-loading">&gt; loading...</p>
            </div>
            <button class="splash-start ranking-play-again">Play again</button>
          </div>
          <button class="mute-btn" aria-label="Mute sound"></button>
        </div>
      </section>
    `);

  const canvas = ctx.root.querySelector('.ranking-canvas') as HTMLCanvasElement;
  canvas.width = size;
  canvas.height = size;

  /* The 6:1 background strip fills the canvas height, so one tile spans 6× the
     rendered height. Feed that to the scroll keyframe so the loop is seamless
     at any canvas size (square on desktop, taller box on mobile). */
  const tileObserver = new ResizeObserver(() => {
    canvas.style.setProperty('--ranking-tile-w', `${canvas.clientHeight * 6}px`);
  });
  tileObserver.observe(canvas);

  ctx.rankingMusic.ensureOnRankingMount();

  setupMuteButton(
    ctx.root.querySelector('.mute-btn') as HTMLButtonElement,
    (muted) => { ctx.rankingMusic.setMuted(muted); },
  );

  const playAgainBtn = ctx.root.querySelector('.ranking-play-again') as HTMLButtonElement;
  playAgainBtn.focus();
  playAgainBtn.addEventListener('click', () => {
    tileObserver.disconnect();
    ctx.rankingMusic.disposeForPlayAgain();
    routes.createStartScreen();
  });

  loadRanking(ctx, currentScore, submission);
}

async function loadRanking(
  ctx: AppContext,
  currentScore: number,
  submission: Promise<SubmissionResult>,
): Promise<void> {
  const list = ctx.root.querySelector('.ranking-list');
  if (!list) return;

  const submissionResult = withFallback(
    submission,
    SUBMISSION_TIMEOUT_MS,
    () => ({ error: true, docId: null, bestScore: null }),
  );

  function showSaveErrorBanner(): void {
    if (ctx.root.querySelector('.ranking-save-error')) return;
    const overlay = ctx.root.querySelector('.ranking-overlay');
    const title = overlay?.querySelector('.ranking-title');
    if (!overlay || !title) return;
    const banner = document.createElement('p');
    banner.className = 'ranking-save-error';
    banner.textContent = '> score could not be saved.';
    overlay.insertBefore(banner, title);
  }

  try {
    const scores = await withDeadline(
      fetchTopScores(10),
      SUBMISSION_TIMEOUT_MS,
      'leaderboard fetch timeout',
    );
    if (!isRankingMounted(ctx.root)) return; // navigated away

    const submissionData = await submissionResult;
    if (!isRankingMounted(ctx.root)) return;
    if (submissionData.error) showSaveErrorBanner();

    await renderRankingSuccess(ctx, list, scores, submissionData, currentScore);
  } catch {
    if (!isRankingMounted(ctx.root)) return;
    const { error: submissionError } = await submissionResult;
    if (!isRankingMounted(ctx.root)) return;
    if (submissionError) showSaveErrorBanner();
    renderRankingError(list, () => loadRanking(ctx, currentScore, submission));
  }
}
