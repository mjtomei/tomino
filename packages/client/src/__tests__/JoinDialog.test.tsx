import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JoinDialog } from "../ui/JoinDialog";

describe("JoinDialog", () => {
  it("renders the dialog with room code input", () => {
    render(<JoinDialog error={null} onJoin={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Join Room" })).toBeInTheDocument();
    expect(screen.getByLabelText("Room Code")).toBeInTheDocument();
  });

  it("disables Join button when input is empty", () => {
    render(<JoinDialog error={null} onJoin={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Join" })).toBeDisabled();
  });

  it("calls onJoin with trimmed room code", async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn();
    render(<JoinDialog error={null} onJoin={onJoin} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText("Room Code"), " abc123 ");
    await user.click(screen.getByRole("button", { name: "Join" }));
    expect(onJoin).toHaveBeenCalledWith("abc123");
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<JoinDialog error={null} onJoin={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("displays error message", () => {
    render(
      <JoinDialog error="Room not found" onJoin={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Room not found");
  });
});
