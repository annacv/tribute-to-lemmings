# play-screen

## Purpose

The structural and control contract every play screen (surface, tunnel, abyss) guarantees: a viewport-sized square game canvas, a HUD showing lives/seconds/level (with score-gain "+N" feedback on breakdown events — see `run-scoring`), a mute control, on-screen left/right movement controls mirrored by the arrow keys, and an optional action control (on-screen button + Space) for worlds that need an action verb. Input listeners are scoped to the world's run so they release when the run ends. Implemented by the shared `buildPlayScreen` scaffold (`assets/ts/lib/playScreen.ts`), which renders the markup, sizes the canvas, and exposes per-world wiring helpers; the mute control is wired via `assets/ts/lib/muteButton.ts`. Each world keeps its own game, audio, info modal, and startup sequencing.

## Requirements

### Requirement: A play screen is built from the shared scaffold
Every play screen (surface, tunnel, abyss) SHALL be built from a single shared scaffold rather than each screen hand-rolling its own markup, canvas sizing, and input wiring. The scaffold SHALL render the play-screen structure — a game stage containing the game canvas, a level-up banner, the HUD, a mute control, and the on-screen touch controls — and size the canvas as a square to the current viewport.

#### Scenario: Building a play screen yields the shared structure
- **WHEN** a world builds its play screen through the scaffold
- **THEN** the resulting DOM contains the game canvas, the level-up banner, the HUD (lives, seconds, level), the mute control, and the touch controls

#### Scenario: The canvas is sized square to the viewport
- **WHEN** a play screen is built
- **THEN** the canvas width and height are set to the same viewport-derived size used by the rest of the game

### Requirement: Per-world differences are parameterized
The scaffold SHALL accept the per-world differences as parameters: the canvas CSS class and accessible label, the starting value shown in the seconds slot, and whether an action control is present. All other play-screen structure SHALL be identical across worlds.

#### Scenario: Surface omits the action control
- **WHEN** the surface play screen is built without an action control
- **THEN** the touch controls contain only left and right movement controls, and the seconds slot starts at the surface's starting value

#### Scenario: Tunnel includes the action control
- **WHEN** the tunnel play screen is built with an action control
- **THEN** the touch controls include the action button alongside left and right, and the seconds slot starts at the tunnel's starting value

### Requirement: Movement and action input is wired and run-scoped
The scaffold SHALL wire left/right movement from both the on-screen touch buttons and the arrow keys, and, when an action control is present, wire the action from both the on-screen button and the Space key. Keyboard listeners SHALL be attached with the world's run signal so they are released when the run ends and never act on a finished run.

#### Scenario: Arrow keys and touch buttons both steer the active run
- **WHEN** the player presses an arrow key or the corresponding touch button on an active play screen
- **THEN** the world's player is steered in that direction

#### Scenario: Action input triggers the world's action verb
- **WHEN** a play screen has an action control and the player presses the action button or the Space key
- **THEN** the world's action is invoked once (auto-repeat from a held key is ignored)

#### Scenario: Input is released when the run ends
- **WHEN** the run has ended
- **THEN** the keyboard listeners no longer steer or trigger actions, because they were attached with the run signal

### Requirement: The mute control is wired per world
The scaffold SHALL wire the mute control to reflect and toggle the persisted mute state, invoking a world-supplied callback so each world applies mute to its own audio. The mute control's labelling SHALL reflect the current muted state.

#### Scenario: Toggling mute invokes the world's mute handler
- **WHEN** the player activates the mute control on a play screen
- **THEN** the persisted mute state flips and the world's mute callback runs so the world's audio follows the new state
