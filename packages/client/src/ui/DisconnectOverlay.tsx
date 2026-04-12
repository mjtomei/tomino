/**
 * Overlay shown when the local player (or a peer) is in a reconnect grace
 * window. Displays a countdown derived from the server-provided timeout.
 */

import { useEffect, useState } from "react";

export interface DisconnectOverlayProps {
  /** Label text: usually "Reconnecting…" (self) or "<name> disconnected" (peer). */
  label: string;
  /** Total reconnect window in ms, as reported by the server. */
  timeoutMs: number;
  /** Timestamp (ms, from Date.now()) when the disconnect started. */
  startedAt: number;
  /** Optional callback fired when the countdown reaches zero. */
  onExpire?: () => void;
}

export function DisconnectOverlay({
  label,
  timeoutMs,
  startedAt,
  onExpire,
}: DisconnectOverlayProps) {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, timeoutMs - (Date.now() - startedAt)),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, timeoutMs - (Date.now() - startedAt));
      setRemainingMs(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        onExpire?.();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [timeoutMs, startedAt, onExpire]);

  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div className="disconnect-overlay" data-testid="disconnect-overlay">
      <div className="disconnect-overlay-panel">
        <div className="disconnect-overlay-label">{label}</div>
        <div className="disconnect-overlay-countdown">{seconds}s</div>
      </div>
    </div>
  );
}
