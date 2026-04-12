# Implementation Spec: Room Settings and Handicap UI E2E Tests

## Overview

New E2E test file `e2e/room-settings.spec.ts` covering the two settings panels
in the waiting room (`HandicapSettings` and `TargetingSettingsPanel`) that only
the host can modify. Non-host players see these controls as disabled.

---

## 1. Requirements

### R1: Handicap Settings — Host Controls

**Source:** `packages/client/src/ui/HandicapSettings.tsx`

The host can interact with all six controls in the `HandicapSettings` panel:

| Control | Selector | Type | Options/Range |
|---------|----------|------|---------------|
| Intensity | `#handicap-intensity` | `<select>` | off / light / standard / heavy |
| Mode | `#handicap-mode` | `<select>` | boost / symmetric |
| Targeting Bias | `#handicap-bias` | `<input type="range">` | 0–1, step 0.05 |
| Delay Modifier | `#handicap-delay` | `<input type="checkbox">` | checked/unchecked |
| Messiness Modifier | `#handicap-messiness` | `<input type="checkbox">` | checked/unchecked |
| Show Ratings | `#handicap-rating-visible` | `<input type="checkbox">` | checked/unchecked |

**Tests needed:**
- Host can change intensity from "off" to each active value.
- Host can change mode when handicap is active.
- Host can move the targeting bias slider.
- Host can toggle delay and messiness checkboxes.
- Host can toggle the show ratings checkbox.

### R2: Handicap Settings — Conditional Disable (Intensity "off")

**Source:** `HandicapSettings.tsx:40,75,101,123,139` — `disabled={disabled || !handicapActive}`

When intensity is "off", mode/bias/delay/messiness are disabled even for the host.
Show Ratings (`#handicap-rating-visible`) is only gated by `disabled` (i.e. host/non-host),
NOT by `handicapActive` (line 157: `disabled={disabled}`).

**Tests needed:**
- With intensity "off": mode, bias, delay, messiness are disabled. Intensity and show ratings are enabled.
- After switching intensity to an active value: all controls become enabled.

### R3: Targeting Settings — Host Controls

**Source:** `packages/client/src/ui/TargetingSettingsPanel.tsx`

The targeting panel has:
- 4 strategy checkboxes: Random, Attackers, KOs, Manual (from `ALL_TARGETING_STRATEGIES`)
- 1 default strategy dropdown showing only enabled strategies

**Selectors:** No HTML IDs exist. Use label-based selectors:
- Checkboxes: `page.getByLabel("Random")`, `page.getByLabel("Attackers")`, etc.
- Default strategy dropdown: `page.getByLabel("Default Strategy")` or locate by section context.

**Tests needed:**
- Host can toggle each strategy checkbox.
- Host can change the default strategy dropdown.

### R4: Targeting Settings — Validation Logic

**Source:** `TargetingSettingsPanel.tsx:24-45`

- Cannot disable the last remaining strategy (line 29: `if (settings.enabledStrategies.length <= 1) return`).
- If the current default strategy is disabled, auto-switches to first enabled (line 36-38).
- Default dropdown only shows enabled strategies (line 74).

**Tests needed:**
- Disabling a non-default strategy removes it from default dropdown.
- Disabling the default strategy auto-switches default to first remaining.
- Cannot uncheck the last strategy checkbox (remains checked).

### R5: Non-Host Controls Disabled

**Source:** `WaitingRoom.tsx:75,81` — `disabled={!isHost}`

Non-host players receive `disabled={true}` on both `HandicapSettings` and
`TargetingSettingsPanel`. All form controls within both panels must be disabled.

**Tests needed:**
- All 6 handicap controls are disabled for non-host.
- All 4 targeting strategy checkboxes are disabled for non-host.
- The default strategy dropdown is disabled for non-host.

### R6: Settings Sync to Non-Host

**Source:** `packages/client/src/net/lobby-client.ts:258-267`

When the host changes settings, the client sends `updateRoomSettings` to the
server. The server broadcasts the room update. Non-host players sync settings
from `msg.room.handicapSettings` and `msg.room.targetingSettings`.

**Tests needed:**
- Host changes handicap intensity; non-host's intensity dropdown reflects new value.
- Host toggles a targeting strategy; non-host sees the updated checkbox state.

---

## 2. Implicit Requirements

### IR1: Two-Player Room Setup

Every test requires at least a host and guest in the waiting room. Follow the
existing pattern from `multiplayer-lobby.spec.ts`:
1. `createPlayerContext(browser, "Alice")` → `createRoom(host.page)` → host
2. `createPlayerContext(browser, "Bob")` → `joinRoom(guest.page, roomId)` → guest

### IR2: Default Handicap State

**Source:** `HandicapSettings.tsx:26-33`

On room creation, defaults are:
- intensity: "off", mode: "boost", targetingBiasStrength: 0.7
- delayEnabled: false, messinessEnabled: false, ratingVisible: true

Tests should verify these defaults before making changes.

### IR3: Default Targeting State

**Source:** `TargetingSettingsPanel.tsx` re-exports `DEFAULT_TARGETING_SETTINGS` from shared.

Defaults: all 4 strategies enabled, defaultStrategy: "random".

### IR4: Proper Cleanup

Each test must close browser contexts in a `finally` block, matching the
pattern in existing specs.

### IR5: TargetingSettingsPanel Lacks IDs

The targeting panel checkboxes and dropdown have no HTML IDs. Tests must use
Playwright's semantic locators (`getByLabel`, `getByRole`) rather than CSS
selectors. The checkboxes use `<label>` wrapping the `<input>`, so
`page.getByLabel("Random")` should work. The default strategy `<select>` has no
`id` or associated `<label>` with `htmlFor`, so we'll need to locate it
contextually — likely `page.locator('select')` scoped within the targeting
section, or by the "Default Strategy" text label.

---

## 3. Ambiguities

### A1: Slider Interaction in Playwright — **[RESOLVED]**

Playwright doesn't have native slider drag support via `selectOption`. Use
`page.locator('#handicap-bias').fill('0.50')` for range inputs, which sets the
value directly. Alternatively, use `inputValue()` to read and verify.

### A2: Targeting Default Strategy Selector — **[RESOLVED]**

The `<select>` for default strategy has no `id` or `htmlFor` label. The "Default
Strategy" text is a `<span>` sibling, not a `<label>`. Resolution: Locate it as
the `<select>` element within the targeting section. Since `HandicapSettings`
uses `<select>` elements with known IDs, we can use
`page.locator('.handicap-settings ~ div select')` or more robustly locate the
section by its "Targeting" heading and find the select within it.

### A3: Sync Verification Timing — **[RESOLVED]**

Settings sync is async (WebSocket round-trip). Use Playwright's auto-retrying
`expect()` assertions with appropriate timeouts to handle eventual consistency.

---

## 4. Edge Cases

### E1: Rapid Intensity Toggle

Switching intensity from "off" → "standard" → "off" rapidly. The dependent
controls should correctly re-disable. Test with a sequence assertion.

### E2: Strategy Checkbox — Last One Standing

With all strategies unchecked except one, clicking the last checkbox should
have no effect (the checkbox stays checked). Verify the checkbox remains
checked after click.

### E3: Default Strategy Auto-Switch on Disable

If "random" is the default and the user unchecks "random", the default should
auto-switch to the first remaining enabled strategy. Verify both the checkbox
state and the dropdown value.

### E4: Show Ratings Independence

`#handicap-rating-visible` is NOT gated by `handicapActive`. It should be
enabled for the host even when intensity is "off". Verify explicitly.

---

## 5. Test Structure

```
e2e/room-settings.spec.ts
└── test.describe("room settings")
    ├── test.describe("handicap settings — host")
    │   ├── "shows default handicap values"
    │   ├── "host can change intensity"
    │   ├── "dependent controls disabled when intensity is off"
    │   ├── "dependent controls enabled when intensity is active"
    │   ├── "host can change mode"
    │   ├── "host can adjust targeting bias slider"
    │   ├── "host can toggle delay and messiness checkboxes"
    │   └── "host can toggle show ratings independently"
    ├── test.describe("targeting settings — host")
    │   ├── "shows default targeting values"
    │   ├── "host can toggle strategy checkboxes"
    │   ├── "cannot disable last strategy"
    │   ├── "disabling default strategy auto-switches default"
    │   └── "host can change default strategy"
    ├── test.describe("non-host controls")
    │   ├── "all handicap controls disabled for non-host"
    │   └── "all targeting controls disabled for non-host"
    └── test.describe("settings sync")
        ├── "handicap changes sync to non-host"
        └── "targeting changes sync to non-host"
```

## 6. Implementation Notes

- Import from `./helpers`: `createPlayerContext`, `createRoom`, `joinRoom`
- Use `test.describe` blocks for logical grouping
- Each describe block can share room setup via `test.beforeEach` or inline setup
- The targeting panel's `<select>` must be located contextually since it lacks an ID
- For slider tests, use `fill()` on the range input and verify via `inputValue()`
- All sync tests use Playwright's auto-retrying `expect().toHaveValue()` assertions
