export interface HandicapIndicatorData {
  /** Effective incoming garbage multiplier (e.g. 0.6 for protection). */
  incomingMultiplier: number;
  /** Effective outgoing garbage multiplier (symmetric mode only). */
  outgoingMultiplier?: number;
}

/** Color for protected multiplier (< 1.0). */
const HANDICAP_GREEN = "#4CAF50";
/** Color for neutral multiplier (= 1.0). */
const HANDICAP_GRAY = "#888888";

function multiplierColor(multiplier: number): string {
  return multiplier < 1.0 - 1e-6 ? HANDICAP_GREEN : HANDICAP_GRAY;
}

export interface HandicapIndicatorProps {
  handicap: HandicapIndicatorData;
}

/**
 * DOM-based handicap indicator for the GameShell left panel.
 * Shows incoming garbage multiplier (with shield icon for protection)
 * and optional outgoing multiplier in symmetric mode.
 */
export function HandicapIndicator({ handicap }: HandicapIndicatorProps) {
  const inColor = multiplierColor(handicap.incomingMultiplier);
  const isProtected = handicap.incomingMultiplier < 1.0 - 1e-6;

  return (
    <div className="handicap-indicator" data-testid="handicap-indicator">
      <div className="panel-label">Handicap</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
        {isProtected && (
          <svg width="14" height="16" viewBox="0 0 14 16" data-testid="shield-icon">
            <path
              d="M7 0 L13 3 L13 8 Q13 13 7 16 Q1 13 1 8 L1 3 Z"
              fill={inColor}
              opacity={0.8}
            />
          </svg>
        )}
        <span style={{ color: inColor, fontWeight: "bold", fontSize: "0.95rem" }}>
          {handicap.incomingMultiplier.toFixed(1)}x
        </span>
      </div>
      {handicap.outgoingMultiplier != null && (
        <div
          style={{
            color: multiplierColor(handicap.outgoingMultiplier),
            fontSize: "0.8rem",
            marginTop: "2px",
            textAlign: "center",
          }}
        >
          Out: {handicap.outgoingMultiplier.toFixed(1)}x
        </div>
      )}
    </div>
  );
}
