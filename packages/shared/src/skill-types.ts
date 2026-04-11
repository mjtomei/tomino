/** Glicko-2-inspired player profile, keyed by username. */
export interface PlayerProfile {
  username: string;
  rating: number;
  ratingDeviation: number;
  volatility: number;
  gamesPlayed: number;
}

/** Per-player performance metrics snapshot from a single game. */
export interface PerformanceMetrics {
  /** Actions per minute */
  apm: number;
  /** Pieces per second */
  pps: number;
  linesCleared: number;
  tSpins: number;
  /** Highest combo achieved in the game */
  maxCombo: number;
}

/** Result of a single match (one winner/loser pair).
 *  A 3+ player game produces multiple MatchResults — one per loser. */
export interface MatchResult {
  /** Unique identifier correlating results from the same game. */
  gameId: string;
  winner: string;
  loser: string;
  /** Performance metrics snapshot per player (keyed by username). */
  metrics: Record<string, PerformanceMetrics>;
  timestamp: number;
  /** Rating changes per player, populated after Glicko-2 update. */
  ratingChanges?: Record<string, { before: number; after: number }>;
}

/** Async storage interface for player ratings and match history.
 *  MVP: JSON file. Future: SQLite. */
export interface SkillStore {
  getPlayer(username: string): Promise<PlayerProfile | null>;
  upsertPlayer(profile: PlayerProfile): Promise<void>;
  getLeaderboard(): Promise<PlayerProfile[]>;
  getMatchHistory(username: string, limit: number): Promise<MatchResult[]>;
  saveMatchResult(result: MatchResult): Promise<void>;
}
