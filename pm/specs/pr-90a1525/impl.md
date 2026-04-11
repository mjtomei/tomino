# Implementation Spec: Stats Screen with Match History and Skill Progression

## PR: pr-90a1525
## Dependencies: pr-4601342 (SkillStore — MERGED), pr-a1cfec0 (Scaffolding — MERGED)

---

## 1. Requirements

### R1: Stats REST Endpoint (`GET /api/stats/:username`)

**Grounded in:** `packages/server/src/index.ts` (Express app), `packages/server/src/skill-store.ts` (JsonSkillStore)

Create a new route file `packages/server/src/stats-routes.ts` that:
- Exports a function to register routes on the Express app (or returns an Express Router)
- `GET /api/stats/:username` returns a JSON response shaped as:
  ```typescript
  {
    player: PlayerProfile | null;
    rankLabel: "Beginner" | "Intermediate" | "Advanced" | "Expert";
    matchHistory: MatchResult[];  // last 20
    ratingHistory: { timestamp: number; rating: number }[];
  }
  ```
- Fetches player via `SkillStore.getPlayer(username)`
- Fetches match history via `SkillStore.getMatchHistory(username, 20)`
- Derives `ratingHistory` from match results' `ratingChanges` field
- Derives `rankLabel` from the player's current rating using thresholds

**Wire into server:** Import and register routes in `packages/server/src/index.ts`, passing the SkillStore instance. This requires instantiating `JsonSkillStore` in the server entry point (currently not instantiated).

### R2: Rank Label Thresholds

**Grounded in:** `packages/server/src/rating-config.ts` (GLICKO_CONFIG — initial rating 1500)

Map rating to rank label:
| Rating Range | Label |
|---|---|
| < 1200 | Beginner |
| 1200–1499 | Intermediate |
| 1500–1799 | Advanced |
| >= 1800 | Expert |

Rationale: Initial rating is 1500, so a new player with 0 games defaults to "Advanced" until calibration games adjust their rating. This matches Glicko-2 semantics where initial rating is the population mean and deviation narrows with play.

### R3: StatsScreen Component

**Grounded in:** `packages/client/src/App.tsx` (current placeholder app)

Create `packages/client/src/ui/StatsScreen.tsx`:
- Fetches data from `GET /api/stats/:username` on mount
- Displays:
  - Current rating (numeric) and rank label badge
  - Rating deviation (to indicate confidence)
  - Games played count
- Match history table with columns: opponent, result (Win/Loss), rating change (+/-), date
- Sparkline chart showing rating over time
- Loading state while fetching
- Empty state for new players (no matches)

### R4: StatsScreen Styling

Create `packages/client/src/ui/StatsScreen.css`:
- Match existing dark theme: `#1a1a2e` background, `#e0e0e0` text, `system-ui` font
- Table styling for match history
- Responsive layout

### R5: Sparkline Component

Create `packages/client/src/ui/Sparkline.tsx`:
- Pure SVG-based sparkline (no external chart library needed for a simple line chart)
- Props: array of `{ timestamp: number; rating: number }` data points
- Renders an SVG polyline scaled to the data range
- Handles edge cases: 0 points (empty), 1 point (dot), 2+ points (line)

### R6: Navigation / Routing

**Grounded in:** `packages/client/src/App.tsx` (no routing currently), `packages/client/package.json` (no router dependency)

Two options for navigation:
- **Option A (chosen):** Simple state-based routing within App.tsx using `useState` for the current screen. No external router dependency needed for 2-3 screens.
- Add a "Stats" button to the main menu (current App.tsx placeholder)
- The task mentions "post-game results" navigation — add a prop/callback pattern for navigating to stats from future game-over screen

### R7: Tests

**Grounded in:** `packages/client/src/__tests__/App.test.tsx` (React Testing Library patterns), `packages/server/src/__tests__/skill-store.test.ts` (server test patterns)

Client tests (`packages/client/src/__tests__/StatsScreen.test.tsx`):
- Stats component renders with mock data (player profile, match history, sparkline)
- Empty state for new players (null player, empty match history)
- Match history displays correct number of rows
- Loading state renders

Server tests (`packages/server/src/__tests__/stats-routes.test.ts`):
- Endpoint returns correct data shape for existing player
- Endpoint returns empty/default state for unknown player
- Endpoint returns 400 for missing username (implicit from route param)

Sparkline tests (`packages/client/src/__tests__/Sparkline.test.tsx`):
- Renders SVG with correct number of points
- Handles empty data
- Handles single data point

---

## 2. Implicit Requirements

### I1: SkillStore Instantiation in Server
The server entry point (`packages/server/src/index.ts`) does not currently instantiate a `JsonSkillStore`. The stats routes need a store instance. Must create one with a default file path (e.g., `data/ratings.json`) and pass it to the route handler.

### I2: Rating History Derivation
`MatchResult.ratingChanges` is optional (`ratingChanges?: Record<string, { before: number; after: number }>`). The rating history for the sparkline must be derived by iterating through match history chronologically and extracting the user's `after` rating from each match's `ratingChanges`. Matches without `ratingChanges` should be skipped.

### I3: CORS Configuration
The client (Vite dev server, port 5173) and server (Express, port 3001) run on different ports. The stats endpoint needs CORS headers or Vite proxy config. Use Vite proxy (`vite.config.ts`) to proxy `/api/*` to the server — avoids adding cors middleware.

### I4: Express JSON Middleware
The server currently only has a GET `/health` endpoint. The stats endpoint returns JSON. Express `res.json()` handles serialization, but if we later need request body parsing, `express.json()` middleware should be added. For now, only GET is needed so this is not blocking.

### I5: Date Formatting
`MatchResult.timestamp` is a Unix epoch number. The UI needs to format this as a human-readable date. Use `toLocaleDateString()` for display.

---

## 3. Ambiguities

### A1: Username Source (Resolved)
**Q:** Where does the client get the username to fetch stats for?
**Resolution:** For now, use a hardcoded default or a simple text input. There's no auth system yet. The component will accept `username` as a prop, and App.tsx will manage the current username via state (with a simple input field or default value).

### A2: File Locations vs. Task Description (Resolved)
**Q:** Task says `src/ui/StatsScreen.tsx` and `server/routes/stats-routes.ts`, but the monorepo structure uses `packages/client/src/` and `packages/server/src/`.
**Resolution:** Map to actual monorepo paths:
- `src/ui/StatsScreen.tsx` → `packages/client/src/ui/StatsScreen.tsx`
- `src/ui/StatsScreen.css` → `packages/client/src/ui/StatsScreen.css`
- `src/ui/Sparkline.tsx` → `packages/client/src/ui/Sparkline.tsx`
- `server/routes/stats-routes.ts` → `packages/server/src/stats-routes.ts`
- `src/ui/App.tsx` → `packages/client/src/App.tsx`

### A3: Chart Library (Resolved)
**Q:** No chart library is installed. Should we add one?
**Resolution:** Use a hand-rolled SVG sparkline. A sparkline is a simple polyline — no need for recharts/chart.js for this. Keeps dependencies minimal and bundle small.

### A4: Rank Thresholds Not Specified (Resolved)
**Q:** The task says "Beginner/Intermediate/Advanced/Expert based on rating thresholds" but doesn't specify the thresholds.
**Resolution:** Use thresholds centered around the initial rating of 1500 (see R2). These can be defined as constants in a shared location or in the stats route.

### A5: "Post-game results" Navigation (Resolved)
**Q:** How should stats be accessible from post-game results when there's no game yet?
**Resolution:** Wire up the navigation pattern (callback/state) so that when a game-over screen is added later, it can navigate to stats. For now, only the main menu button is functional.

---

## 4. Edge Cases

### E1: New Player (No Profile)
`getPlayer()` returns `null`. The endpoint should return a default response with `rankLabel: "Intermediate"` (initial 1500 maps to Advanced, but a null player hasn't played — use the initial rating for label computation, or show a "No data yet" state). **Decision:** Return `player: null`, `rankLabel: "Beginner"`, empty arrays. The client shows an empty state.

Actually, reconsider: a player with no profile has never played. They have no rating. "Beginner" is the most appropriate default for an unknown player.

### E2: Matches Without Rating Changes
Early matches (or matches from before the rating system was integrated) may have `ratingChanges: undefined`. The sparkline should gracefully skip these. The match history table should show "—" for rating change.

### E3: Rating History Ordering
Match history from `getMatchHistory()` returns most-recent-first. For the sparkline, data needs to be chronological (oldest first). Reverse the array before passing to the sparkline.

### E4: Opponent Name Extraction
A `MatchResult` has `winner` and `loser` fields. For the current user, the opponent is whichever field is NOT the current username. The result (Win/Loss) is determined by whether the user is the `winner` or `loser`.

### E5: Large Rating Changes Display
Rating changes should show sign: `+15` or `-23`. Use conditional formatting (green for positive, red for negative) to make trends scannable.
