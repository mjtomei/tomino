import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayerNameInput } from "../ui/PlayerNameInput";

describe("PlayerNameInput", () => {
  it("renders the name input and continue button", () => {
    render(<PlayerNameInput initialName="" onConfirm={vi.fn()} />);
    expect(screen.getByLabelText("Enter your name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  });

  it("disables continue when name is empty", () => {
    render(<PlayerNameInput initialName="" onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("enables continue when name is entered", () => {
    render(<PlayerNameInput initialName="Alice" onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("calls onConfirm with trimmed name on submit", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<PlayerNameInput initialName="" onConfirm={onConfirm} />);

    const input = screen.getByLabelText("Enter your name");
    await user.type(input, "  Bob  ");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(onConfirm).toHaveBeenCalledWith("Bob");
  });

  it("shows initial name in input", () => {
    render(<PlayerNameInput initialName="Carol" onConfirm={vi.fn()} />);
    expect(screen.getByDisplayValue("Carol")).toBeInTheDocument();
  });
});
