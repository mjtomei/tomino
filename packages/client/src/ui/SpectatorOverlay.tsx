export interface SpectatorOverlayProps {
  placement: number;
}

function placementLabel(place: number): string {
  switch (place) {
    case 1: return "1st";
    case 2: return "2nd";
    case 3: return "3rd";
    default: return `${place}th`;
  }
}

export function SpectatorOverlay({ placement }: SpectatorOverlayProps) {
  return (
    <div className="overlay" data-testid="spectator-overlay">
      <div className="overlay-content">
        <h2 className="overlay-title">ELIMINATED</h2>
        <p style={{ color: "#aaa", margin: "0 0 1rem", fontSize: "1rem" }}>
          You placed {placementLabel(placement)}
        </p>
        <p style={{ color: "#666", margin: 0, fontSize: "0.8rem" }}>
          Spectating remaining players...
        </p>
      </div>
    </div>
  );
}
