# run-scoring

## Purpose

The cumulative run-scoring model spanning the surface, tunnel, and abyss worlds: a breakdown
object threaded through every screen handoff, the surface/tunnel/abyss time and levels
components, underground per-cycle banking, gameplay score-gain HUD feedback on every play
screen, the Game Over tally presentation, and the leaderboard display/fetch behavior.

## Requirements

### Requirement: Cumulative score formula
A run's total score SHALL be computed as:
`TOTAL = surface seconds + tunnel seconds left (banked per cycle) + abyss seconds survived
+ per-size stalactite bonuses (small/medium/large, weighted by size)
+ 5 × levels completed (surface levels completed + tunnel cycles cleared + abyss levels completed)`.
Lives SHALL NOT contribute to the score (see "Lives are a continue resource only").
No other scoring sources SHALL exist (no perfect bonus, no speed thresholds, no style
bonuses, no multipliers beyond the documented per-size stalactite weights).

#### Scenario: Total equals the sum of its parts
- **WHEN** any run ends and a score breakdown is produced
- **THEN** `breakdown.total` SHALL equal the sum of all breakdown components (enforced by
  an automated test)

#### Scenario: No time accrual underground
- **WHEN** the player idles in the tunnel
- **THEN** the total SHALL NOT increase; only the countdown decreases

#### Scenario: Abyss adds time, stalactite, and level components
- **WHEN** an Abyss run ends
- **THEN** the breakdown SHALL include the Abyss survival seconds, the per-size stalactite
  bonus, and 5 × Abyss levels completed, and `breakdown.total` SHALL include them

### Requirement: Score breakdown object replaces the bare score in handoffs
The score passed between screens SHALL be a breakdown object carrying each component and
the running total (through `onTunnelWorld`, `onGameOver`, the interstitial, Game Over,
and submission).
`submitScore` SHALL send only the total — the Firestore schema is unchanged and the
breakdown stays client-side.

#### Scenario: Breakdown threads through every hop
- **WHEN** a run crosses from the surface through the interstitial into the tunnel and
  ends
- **THEN** each screen SHALL receive and extend the same breakdown object, and the value
  submitted to the leaderboard SHALL equal `breakdown.total`

#### Scenario: Full three-world run accumulates the total end to end
- **WHEN** a run is driven through every handoff — surface completion → tunnel completion
  → Abyss completion (the win) — through the real screen transitions
- **THEN** the final win breakdown's `total` SHALL equal the sum of all three worlds'
  components (surface time + tunnel time + abyss time + per-size stalactite bonuses +
  5 × total levels completed), with no component dropped at any handoff (enforced by an
  automated end-to-end test)

#### Scenario: Debug seam uses the breakdown
- **WHEN** a screen is launched directly via the `?screen=` debug seam
- **THEN** it SHALL receive a well-formed breakdown object (no bare numbers remain)

### Requirement: Lives are a continue resource only
Each screen SHALL start with 3 lives, which reset per screen and never carry over. Lives
SHALL NOT convert to points at any transition or ending — they govern only whether the
run continues, never the score (survival is already paid by surface seconds and tunnel
time, so a lives bonus would double-count it).

#### Scenario: Lives never appear in the score
- **WHEN** any run ends with any number of lives remaining
- **THEN** the breakdown SHALL contain no lives component and the total SHALL be
  unaffected by the lives count

### Requirement: Levels score across both worlds
Levels completed SHALL score at 5 points each and SHALL sum across all worlds reached
(surface, tunnel, abyss). A level counts only when actually completed — never the level the
run ends on:
- Surface: dying at Level N scores `5 × (N − 1)`; escaping to the tunnel completes the final
  surface level too, so the surface contribution is `5 × (total surface levels)`.
- Tunnel: each cycle cleared (breached) counts; the cycle a death occurs in is unbanked and
  never counts.
- Abyss: each Abyss level advanced past counts; the level a death occurs in is excluded, and
  completing the run through the exit door counts every Abyss level.
Each world's contribution SHALL be carried in the breakdown at its handoff, and the next
world SHALL add its completed levels on top.

#### Scenario: Surface death excludes the level died on
- **WHEN** the player dies on the surface at Level N without reaching the tunnel
- **THEN** the breakdown's levels component SHALL be `5 × (N − 1)`

#### Scenario: Reaching the tunnel completes every surface level
- **WHEN** the surface game transitions to the tunnel
- **THEN** the breakdown's levels component SHALL be `5 × (total surface levels)`

#### Scenario: Tunnel death excludes the cycle died on
- **WHEN** the player dies in the tunnel after clearing C cycles, having entered with a
  surface contribution of S levels
- **THEN** the breakdown's levels component SHALL equal `5 × (S + C)`

#### Scenario: Abyss death excludes the level died on
- **WHEN** the player dies in the Abyss at Level M, having entered with a prior contribution
  of `S + C` levels
- **THEN** the breakdown's levels component SHALL equal `5 × (S + C + (M − 1))`

#### Scenario: Full completion counts every level
- **WHEN** the run completes the Abyss through the exit door
- **THEN** the breakdown's levels component SHALL equal `5 × (surface levels + tunnel cycles
  + abyss levels)`

### Requirement: Underground countdown with per-cycle banking
Each underground screen SHALL run a visible countdown starting from a tunable budget
(tunnel seed: 60 seconds for 3 cycles), derived from fixed simulation steps. The
countdown SHALL floor at 0 and SHALL NOT kill the player or end the run — the lethal
threat underground is physical (the ceiling, spec'd in `tunnel-escape`). The budget SHALL
be playtest-tuned so players normally complete cycles with seconds left to bank (the
design goal is ending with some score to sum). The countdown SHALL survive deaths: a
crush respawn continues from the remaining time at the moment of death (it never resets
or refills). At each cycle breakout, that cycle's share of remaining seconds plus the +5
cycle award SHALL be banked into the breakdown immediately. The countdown time share SHALL
be banked silently — it SHALL NOT appear in the gameplay "+N" pop (see "Score-gain HUD
feedback on every play screen"); only the +5 cycle award is surfaced during play.

#### Scenario: Countdown floors at zero
- **WHEN** the countdown reaches 0 with the run still active
- **THEN** play SHALL continue normally; subsequent breakouts SHALL bank +5 per cycle
  with a 0 time bonus

#### Scenario: Banking at breakout
- **WHEN** a cycle completes
- **THEN** the cycle's time share and +5 award SHALL be added to the breakdown at that
  moment; the gameplay "+N" pop SHALL show only the +5 cycle award

### Requirement: Score-gain HUD feedback on every play screen
Every play screen (surface, tunnel, abyss) SHALL show immediate score-gain feedback when
the player earns breakdown points during gameplay. The shared `Hud` controller
(`assets/ts/lib/Hud.ts`) SHALL float a self-removing "+N" pop (`.bank-pop`) over the score
slot and briefly blink the score slot. The value N SHALL be the points earned in that
moment only — never a cumulative total and never components reserved for the end-of-run
tally (e.g. banked tunnel countdown seconds, survival seconds ticking in the HUD).

Triggers by world:
- **Surface:** level advance → +5 (`LEVEL_POINTS`)
- **Tunnel:** cycle breach → +5 (`LEVEL_POINTS`); banked countdown seconds are added to
  the breakdown silently
- **Abyss:** level advance → +5; stalactite fully destroyed → per-size bonus (small 5,
  medium 10, large 15)

The Game Over / win tally screens SHALL present the full breakdown, including components
not shown during play (tunnel time banked per cycle, survival seconds, etc.).

#### Scenario: Surface level-up shows the cycle award
- **WHEN** the surface level advances
- **THEN** a "+5" pop SHALL appear over the HUD score slot and the score slot SHALL blink

#### Scenario: Tunnel breach shows only the cycle award
- **WHEN** a tunnel cycle completes
- **THEN** a "+5" pop SHALL appear over the HUD score slot; the pop SHALL NOT include the
  banked countdown seconds for that cycle

#### Scenario: Abyss level-up shows the level award
- **WHEN** the Abyss advances to a new level by time
- **THEN** a "+5" pop SHALL appear over the HUD score slot

#### Scenario: Abyss stalactite smash shows the size bonus
- **WHEN** a stalactite is fully destroyed
- **THEN** a "+N" pop SHALL appear where N equals that size's stalactite bonus (5, 10, or
  15)

#### Scenario: End-of-run tally includes silent components
- **WHEN** a run that banked tunnel countdown seconds ends
- **THEN** the Game Over tally SHALL list the tunnel time component even though those
  seconds were not shown in gameplay "+N" pops

#### Scenario: Hidden tab freezes the countdown
- **WHEN** the tab is hidden during a tunnel run
- **THEN** the countdown SHALL not advance while no simulation steps execute

#### Scenario: Death loses only the unbanked remainder
- **WHEN** the player loses the last life mid-cycle
- **THEN** all previously banked values SHALL remain in the breakdown and the current
  cycle's unbanked share SHALL be discarded

#### Scenario: Crush respawn keeps the remaining countdown
- **WHEN** the player is crushed mid-cycle with lives remaining (e.g. 40 seconds left)
- **THEN** the restarted cycle SHALL continue the countdown from that remaining time
  (40 s), and previously banked values SHALL be unaffected

### Requirement: Score tally on the Game Over screen
The Game Over screen SHALL present the score arithmetic as a line-by-line tally inside its
existing hold (extended to ~4–4.5 s): one named line per non-zero breakdown component
(~250 ms stagger, tick SFX per line), each line showing the rule behind its points (e.g.
`levels completed 9 × 5`), ending with a fast count-up roll to the total. Zero-value lines
SHALL be skipped; a degenerate breakdown with no tunnel time, no abyss components, and no
levels SHALL fall back to the single-score presentation. Under `prefers-reduced-motion` all
lines SHALL render instantly with no roll. Tally SFX SHALL degrade silently when assets are
absent. The screen SHALL accept an end **variant** (`death` | `win`) driving headline,
sub-line, and arrival SFX: `death` renders `GAME OVER` with the `BOOOM!!!` sub-line and
plays `DIE.WAV` (today's behavior); `win` (the **Abyss** completed) renders the headline
`> You made it!` / `For now...` (two lines, no separate sub-line) and SHALL NOT play
`DIE.WAV`.

On the **win** path, when the tally completes the Game Over screen SHALL hand off to the
**The End** finale screen (see the `the-end` capability) — it SHALL NOT route directly to
the ranking. The ranking still follows, after the finale. The win tally SHALL NO LONGER
start the ranking music from its own completion; the ranking music SHALL start when the
ranking screen mounts (as on the death path), and the finale owns its own loop in between.
The `win` variant's canvas SHALL remain sized to the viewport (the same sizing the `death`
variant receives), with its class name matching across the emitted markup, the JS sizing
query, and the CSS fill rules (no orphaned selector).

The `THE END` variant is implemented by the `the-end` capability: it plays on the **win**
path, **after** the win tally completes and **before** the Hall of Fame ranking screen (the
ranking still follows; `THE END` does not replace it). It SHALL consume the same
`ScoreBreakdown` every screen receives (total plus components, never a bare number).
Inserting `THE END` SHALL NOT change what reaches the leaderboard — `submitScore` SHALL
still send `breakdown.total` exactly once on the win path.

#### Scenario: Underground run shows the tally
- **WHEN** a run that reached the tunnel ends
- **THEN** the Game Over screen SHALL list each non-zero component (Surface time, Tunnel
  time, Abyss time, stalactites, Levels completed), each with the rule behind its points,
  before rolling up the total, then route onward (death → ranking; win → The End → ranking)

#### Scenario: Win hands off to The End, then the ranking
- **WHEN** the win Game Over tally completes
- **THEN** the screen SHALL route to The End finale (not directly to the ranking), and the
  ranking SHALL follow the finale

#### Scenario: Ranking music starts on the ranking, not the win tally
- **WHEN** a win run plays the tally and the finale
- **THEN** the ranking music SHALL NOT start from the win tally's completion; it SHALL start
  when the ranking screen mounts, after the finale's own loop has stopped

#### Scenario: Surface-only death itemizes surface time and levels
- **WHEN** a run ends on the surface (never reached the tunnel) having completed at least
  one level
- **THEN** the Game Over screen SHALL list Surface time and Levels completed (5 × levels
  completed, excluding the level died on) before rolling up the total

#### Scenario: Win submission is unchanged by the finale
- **WHEN** a win run passes through the tally, the finale, and into the ranking
- **THEN** `submitScore` SHALL have been called exactly once with `breakdown.total`, and the
  finale SHALL forward the existing submission promise to the ranking without a new write

### Requirement: Leaderboard displays totals without a seconds suffix
Ranking rows SHALL display the score as a plain number. The `s` (seconds) suffix SHALL be
removed in the same change that introduces non-second scoring components.

#### Scenario: No stale unit suffix
- **WHEN** the ranking screen renders any entry
- **THEN** no `s` suffix SHALL appear after the score value

### Requirement: Leaderboard fetch fails visibly when Firestore is unreachable
The ranking screen's top-scores fetch SHALL be bounded by a timeout (mirroring the
existing submission timeout pattern). On timeout or rejection the existing error/retry UI
SHALL be shown instead of an indefinite loading state.

#### Scenario: Unreachable backend shows retry
- **WHEN** Firestore is unreachable and the fetch exceeds the timeout
- **THEN** the loading indicator SHALL be replaced by the error/retry UI
