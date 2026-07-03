# Tribute to Lemmings

**[▶ Play the game](https://annacv.github.io/tribute-to-lemmings/)** · [LinkedIn](https://www.linkedin.com/in/anna-condal-vela/)

![Tribute to Lemmings](public/og-image.png)

<p>
  <img src="https://cdn.simpleicons.org/typescript" height="20" alt="" /> TypeScript ·
  <img src="https://cdn.simpleicons.org/html5" height="20" alt="" /> Canvas 2D ·
  <img src="https://cdn.simpleicons.org/vite" height="20" alt="" /> Vite ·
  <img src="https://cdn.simpleicons.org/vitest" height="20" alt="" /> Vitest ·
  <img src="https://cdn.simpleicons.org/firebase" height="20" alt="" /> Firebase ·
  <img src="https://cdn.simpleicons.org/markdown" height="20" alt="" /> OpenSpec
</p>

> A retro pixel-art browser game where you skip and escape, stay alive, and climb the leaderboard.

## Description

A loving tribute to DMA Design's classic 1991 *Lemmings* — built as if its bonus screen grew into a game of its own. Guide a single lemming through an escalating run: **skip and escape**, **stay alive** as the world turns against you, and **climb the leaderboard** against everyone else who tried.

It's a tribute first and a score-chase second. Each world reinterprets the original's mood — the Surface, the Tunnel, the Abyss — and ties back to the iconography fans remember: the explosions, the doors, the balloon.

## Highlights

- **Fixed-timestep game loop** — 60 Hz simulation decoupled from display refresh (`GameLoop.ts`)
- **Canvas 2D rendering** — characters, hazards, and worlds drawn directly; per-world renderers, no game engine
- **Modular screen routing** — splash → three playable worlds → finale → ranking, with shared run/score lifecycle
- **Accessibility** — `aria-live` score announcements and reduced-motion paths for cinematics and HUD
- **Test coverage** — Vitest on game logic, screen flows, and render helpers
- **CI** — GitHub Actions on PRs (test + lint)

## The three-world arc

The run is a continuous journey across linked worlds, with score banking across the whole arc.


| World              | Status      | What you do                                                                                                                                                                       |
| ------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🟩 **The Surface** | ✅ Playable  | Dodge falling bombs with ← → as levels escalate. The ground cracks and erodes until it collapses beneath you.                                                                     |
| 🟫 **The Tunnel**  | ✅ Playable  | Trapped underground. Pick up unexploded bombs, find the crack in the wall, light the fuse, and breach your way out across three cycles — before the lowering ceiling crushes you. |
| 🟥 **The Abyss**    | ✅ Playable  | A horizontal escape through a hazard-lined corridor — gather fallen bombs and hurl them up to bring down stalactites — bookended by the door cold-open and the exit-door close.    |
| 🎬 **The End**     | ✅ Playable  | A dedicated finale screen — the balloon-escape cinematic, a credits crawl, and the win payoff before the leaderboard.                                                              |


Death routes to **Game Over** with your banked score; a successful escape carries you onward to the **Ranking** (global top-10 leaderboard).

## Tech stack


| Area        | Choice                                                             |
| ----------- | ------------------------------------------------------------------ |
| Language    | TypeScript (strict)                                                |
| Rendering   | Canvas 2D                                                          |
| Build       | Vite                                                               |
| Tests       | Vitest (+ jsdom)                                                   |
| Leaderboard | Firebase (Firestore free tier)                                     |
| Lint        | `tsc --noEmit` + ESLint + Prettier                                 |
| Workflow    | Iterative delivery (OpenSpec)                                        |


## Project structure

```
assets/
  ts/
    main.ts                      # Boot + screen routing (ScreenRoutes)
    assets.ts                    # Audio/image path exports
    entities/
      Player.ts  Bomb.ts  Stalactite.ts
    screens/
      startScreen.ts             # Splash + name input
      surfaceScreen.ts           # Surface play screen
      transitionScreen.ts        # Fall transitions between worlds
      tunnelScreen.ts  abyssScreen.ts
      gameOverScreen.ts  theEndScreen.ts  rankingScreen.ts
    worlds/
      surface/  SurfaceGame.ts  SurfaceRenderer.ts
      tunnel/   TunnelGame.ts   TunnelRenderer.ts
      abyss/    AbyssGame.ts    AbyssRenderer.ts
      theEnd/   TheEndScene.ts  TheEndRenderer.ts
    lib/
      appContext.ts              # App shell + shared screen context
      GameLoop.ts                # Fixed-timestep loop
      RunHost.ts                 # Shared run/score lifecycle
      playScreen.ts              # buildPlayScreen scaffold
      score.ts  Hud.ts           # Scoring + HUD
      audio.ts  SoundEffectBank.ts  attachWorldLoop.ts
      liveRegion.ts              # aria-live results announcer
      firebase.ts  leaderboard.ts
      infoModal.ts  muteButton.ts  debugScreen.ts
      fx.ts  geometry.ts  footingPad.ts  images.ts
  css/  fonts/  images/  sounds/
openspec/                        # Iteration specs (OpenSpec)
.github/workflows/               # CI + GitHub Pages deploy
index.html                       # Shell: header, <main> mount, footer
public/                          # og-image, manifest, sitemap, robots.txt
```

## Roadmap

Built in seven iterations and some code enhancements; the full arc is playable end to end.

**Shipped — Iterations I–VII**


| #   | Iteration                           | Delivered                                                                                                                                                                                                                                              |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I   | Visual Foundations & Brand Identity | Layered SVG backgrounds, branded splash hero, CRT bezel, responsive canvas, canvas-drawn lemming with per-health color, blink-on-hit, hair animation, directional flip, lives icons.                                                                   |
| II  | Global Leaderboard                  | Optional name input (guest fallback), Firestore writes on game over, global top-10 Ranking screen with the player's row/position highlighted, data notice.                                                                                             |
| III | Sound & Music                       | Bomb-hit SFX, game-over sting, ranking ambient, all gated by the existing mute preference; assets from the Lemmings DOS OST.                                                                                                                           |
| IV  | Level Progression & Ground Erosion  | Three-level difficulty ramp, level-transition UI/audio, level-gated ground erosion (cracks → holes → collapse), last-level earthquake warning, cumulative time-based scoring, collapse transition into the Tunnel.                                     |
| V   | Tunnel Escape Puzzle                | Underground screen with info modal, bomb pickup + crack-finding + fuse-lighting across three cycles, lowering-ceiling crush death + respawn, Tunnel→Abyss collapse transition, full both-worlds scoring breakdown, distinct background loop + SFX set. |
| VI  | The Abyss: Horizontal Escape        | Camera-following side-scroll corridor with a door cold-open (settle → door opens → fall-in) and exit-door close, gather-and-throw mechanic (pick up fallen bombs, hurl them up to smash three stalactite sizes), time-gated three-level ramp, full three-world scoring, driving `Awesome.ogg` loop + new SFX. Plus a pre-VII hardening pass: win-canvas fix, an `aria-live` results layer, reduced-motion + contrast completeness. |
| VII | The End                             | The win-path finale: after the win score, a balloon-escape cinematic (the lemming boards, then ascends with the camera following up into the sky, to `Tim_2.ogg`) with an optional no-fail "press to lift off" beat, a skippable credits crawl, then onward to the Ranking. Reduced-motion/skip paths and the leaderboard submission unchanged. |


## Development

### Prerequisites

Node 24 and npm 10+.

### Setup

```bash
npm install
```

### Commands


| Command         | Description                                          |
| --------------- | ---------------------------------------------------- |
| `npm run dev`   | Start the Vite dev server at `http://localhost:5173` |
| `npm run build` | Bundle for production into `dist/`                   |
| `npm test`      | Run the Vitest test suite                            |
| `npm run lint`  | Type-check with `tsc` and lint with ESLint           |


> **Note:** Open the game via `npm run dev`, not by double-clicking `index.html` — the file must be served through Vite for ES modules and asset paths to resolve correctly.

## Credits

Audio comes from two fan-tribute sources, both chosen for tonal and legal consistency with the tribute concept:

- The original **Lemmings DOS OST** — the music loops and the `.WAV` SFX set.
- A set of **modern Lemmings voices** — the two `intro-` cues, cut from the *"Lemmings Voice Evolution! (1991–2021)"* compilation and distributed via [101soundboards](https://www.101soundboards.com/boards/76128-lemmings-soundboard) / [Voicy](https://www.voicy.network/official-soundboards/games/lemmings).

**Music & loops**


| File                                                 | Used for                       |
| ---------------------------------------------------- | ------------------------------ |
| `03_-_Lemmings_-_DOS_-_Lemming_2.ogg`                | Surface background music       |
| `113_-_Lemmings_-_DOS_-_Tim_5.ogg`                   | Tunnel / underground cave loop |
| `121_-_Lemmings_-_DOS_-_Awesome.ogg`                 | Abyss escape corridor loop      |
| `109_-_Lemmings_-_DOS_-_Tim_2.ogg`                   | The End finale screen           |
| `14_-_Lemmings_-_DOS_-_Dance_of_the_Reed-Flutes.ogg` | Ranking (Hall of Fame) screen  |


**Sound effects (DOS SFX set)**


| File           | Used for                                                         |
| -------------- | ---------------------------------------------------------------- |
| `FIRE.WAV`     | Surface bomb hit · Tunnel fuse burn                              |
| `YIPPEE.WAV`   | Surface level-up cue                                             |
| `ELECTRIC.WAV` | Surface last-level warning (ground-vulnerable / earthquake beat) |
| `BANG.WAV`     | Bomb breaks earth — Surface ground crack · Tunnel breach         |
| `TENTON.WAV`   | Earth comes down — Surface collapse sting · Tunnel ceiling crush |
| `DIE.WAV`      | Death Game Over sting                                            |
| `EXPLODE.WAV`  | Tunnel bomb pickup · Abyss gather/throw                          |
| `SCRAPE.WAV`   | Tunnel match-strike (fuse-light press)                           |
| `CHAIN.WAV`    | Tunnel ceiling-lower grinding rumble                             |
| `MANTRAP.WAV`  | Abyss stalactite hit (impact flash + shake)                      |
| `THUD.WAV`     | Abyss stalactite destroyed (detach + shatter)                   |
| `DOOR.WAV`     | Abyss entrance-door cold-open                                    |
| `LETSGO.WAV`   | Abyss exit-door close (win)                                      |
| `TING.WAV`     | Game Over score-tally tick                                       |
| `MOUSEPRE.WAV` | Game Over score-total chime                                      |


**Modern Lemmings voices** (101soundboards / Voicy — *not* DOS OST)


| File                             | Used for                                                |
| -------------------------------- | ------------------------------------------------------- |
| `intro-falling-sound-effect.mp3` | World-boundary fall cue (Surface→Tunnel · Tunnel→Abyss) |
| `intro-balloon-sound-effect.mp3` | The End balloon-escape cinematic (plays at ascent start) |


All audio respects the in-game mute toggle and pauses when the tab is hidden.

## Author

Anna Condal — [LinkedIn](https://www.linkedin.com/in/anna-condal-vela/) · [Play the game](https://annacv.github.io/tribute-to-lemmings/)

