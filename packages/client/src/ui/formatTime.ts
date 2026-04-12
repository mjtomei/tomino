/** Format a 1-indexed placement as an ordinal string (1st, 2nd, 3rd, …). */
export function placementLabel(place: number): string {
  switch (place) {
    case 1: return "1st";
    case 2: return "2nd";
    case 3: return "3rd";
    default: return `${place}th`;
  }
}

/** Format milliseconds as M:SS.cc (clamped to 0). */
export function formatTime(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centis = Math.floor((clamped % 1000) / 10);
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${centis.toString().padStart(2, "0")}`;
}
