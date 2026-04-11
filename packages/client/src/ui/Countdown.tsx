interface CountdownProps {
  count: number;
}

export function Countdown({ count }: CountdownProps) {
  const label = count > 0 ? String(count) : "Go!";

  return (
    <div style={styles.overlay}>
      <div style={styles.count} key={count}>
        {label}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    zIndex: 1000,
  },
  count: {
    fontSize: "8rem",
    fontWeight: "bold" as const,
    color: "#fff",
    fontFamily: "system-ui, sans-serif",
    textShadow: "0 0 40px rgba(255, 255, 255, 0.5)",
    animation: "countdown-pulse 0.8s ease-out",
  },
};
