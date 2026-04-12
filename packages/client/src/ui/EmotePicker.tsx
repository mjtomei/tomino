import { useEffect, useRef } from "react";
import type { EmoteKind } from "@tetris/shared";

interface EmotePickerProps {
  onEmote: (emote: EmoteKind) => void;
  /** When true, ignores keyboard shortcuts (e.g. game not active). */
  disabled?: boolean;
}

interface EmoteDef {
  kind: EmoteKind;
  label: string;
  color: string;
  glyph: (size: number) => JSX.Element;
}

const size = 22;

const EMOTES: EmoteDef[] = [
  {
    kind: "thumbsUp",
    label: "Thumbs up",
    color: "#4ade80",
    glyph: (s) => (
      <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden>
        <path
          d="M4 10h3v10H4zM9 10l4-7c1.2 0 2 1 2 2l-1 5h5c1.1 0 2 .9 2 2l-1.5 6c-.3 1-1.2 2-2.5 2H9V10z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    kind: "fire",
    label: "Fire",
    color: "#ff6b35",
    glyph: (s) => (
      <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden>
        <path
          d="M12 2s5 4 5 10a5 5 0 1 1-10 0c0-2 1-3 1-5 0 2 1 3 2 3 1-2 0-5 2-8z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    kind: "wave",
    label: "Wave",
    color: "#60a5fa",
    glyph: (s) => (
      <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden>
        <path
          d="M2 14c3-4 5-4 8 0s5 4 8 0 3-4 4-2v4c-1-2-2-2-4 2s-5 4-8 0-5-4-8 0v-4z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    kind: "gg",
    label: "Good game",
    color: "#a78bfa",
    glyph: (s) => (
      <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden>
        <path
          d="M4 8a4 4 0 0 1 7-2v2H8v3h3v3a4 4 0 0 1-7-2V8zM14 8a4 4 0 0 1 7-2v2h-3v3h3v3a4 4 0 0 1-7-2V8z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
    ),
  },
];

export function EmotePicker({ onEmote, disabled }: EmotePickerProps): JSX.Element {
  const onEmoteRef = useRef(onEmote);
  onEmoteRef.current = onEmote;

  useEffect(() => {
    if (disabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const idx = ["1", "2", "3", "4"].indexOf(e.key);
      if (idx < 0) return;
      const def = EMOTES[idx];
      if (!def) return;
      onEmoteRef.current(def.kind);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled]);

  return (
    <div
      data-testid="emote-picker"
      style={{
        display: "flex",
        gap: 6,
        padding: 6,
        background: "rgba(0,0,0,0.5)",
        borderRadius: 6,
      }}
    >
      {EMOTES.map((def, idx) => (
        <button
          key={def.kind}
          type="button"
          aria-label={def.label}
          data-testid={`emote-button-${def.kind}`}
          onClick={() => onEmote(def.kind)}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: 38,
            height: 42,
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 4,
            background: "rgba(255,255,255,0.05)",
            color: def.color,
            cursor: "pointer",
          }}
        >
          {def.glyph(size)}
          <span style={{ fontSize: 9, color: "#888", marginTop: 1 }}>{idx + 1}</span>
        </button>
      ))}
    </div>
  );
}
