// Required devDependencies (not yet in package.json):
//   @testing-library/react
//   @testing-library/jest-dom
//   jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingWizard } from "./OnboardingWizard";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetchSuccess() {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    status: 200,
  });
}

function mockFetchError(errorMessage: string) {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: false,
    status: 400,
    json: () => Promise.resolve({ error: errorMessage }),
  });
}

function mockFetchPending() {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
    new Promise(() => {
      /* never resolves */
    })
  );
}

describe("OnboardingWizard", () => {
  it("renders step 1 with input and Pair button", () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);

    expect(screen.getByPlaceholderText("homelan://pair?token=...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pair" })).toBeInTheDocument();
    expect(screen.getByText("Pair with Home Server")).toBeInTheDocument();
  });

  it("Pair button is not disabled when input is empty (guard is in handlePair)", () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);

    // The button itself is not disabled — the handlePair function guards on empty input.
    // This matches the implementation: disabled={state === "pairing"}
    const button = screen.getByRole("button", { name: "Pair" });
    expect(button).not.toBeDisabled();
  });

  it("clicking Pair with empty input does not call fetch", async () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Pair" }));

    // handlePair returns early for empty/whitespace input
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("entering URL and clicking Pair calls fetch with the URL", async () => {
    mockFetchSuccess();
    const user = userEvent.setup();

    render(<OnboardingWizard onComplete={vi.fn()} />);

    const input = screen.getByPlaceholderText("homelan://pair?token=...");
    await user.type(input, "homelan://pair?token=abc123");
    await user.click(screen.getByRole("button", { name: "Pair" }));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:30001/pair",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ inviteUrl: "homelan://pair?token=abc123" }),
      })
    );
  });

  it("after successful pair, shows step 2 with success message", async () => {
    mockFetchSuccess();
    const user = userEvent.setup();

    render(<OnboardingWizard onComplete={vi.fn()} />);

    const input = screen.getByPlaceholderText("homelan://pair?token=...");
    await user.type(input, "homelan://pair?token=abc123");
    await user.click(screen.getByRole("button", { name: "Pair" }));

    await waitFor(() => {
      expect(screen.getByText("Paired Successfully")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/now connected to your home network/i)
    ).toBeInTheDocument();
  });

  it("step 2 shows Get Started button", async () => {
    mockFetchSuccess();
    const user = userEvent.setup();

    render(<OnboardingWizard onComplete={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText("homelan://pair?token=..."),
      "homelan://pair?token=abc123"
    );
    await user.click(screen.getByRole("button", { name: "Pair" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Get Started" })).toBeInTheDocument();
    });
  });

  it("clicking Get Started calls onComplete", async () => {
    mockFetchSuccess();
    const onComplete = vi.fn();
    const user = userEvent.setup();

    render(<OnboardingWizard onComplete={onComplete} />);

    await user.type(
      screen.getByPlaceholderText("homelan://pair?token=..."),
      "homelan://pair?token=abc123"
    );
    await user.click(screen.getByRole("button", { name: "Pair" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Get Started" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Get Started" }));
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("error state shows error message", async () => {
    mockFetchError("Token expired");
    const user = userEvent.setup();

    render(<OnboardingWizard onComplete={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText("homelan://pair?token=..."),
      "homelan://pair?token=expired"
    );
    await user.click(screen.getByRole("button", { name: "Pair" }));

    await waitFor(() => {
      expect(screen.getByText("Token expired")).toBeInTheDocument();
    });

    // Should still be on step 1 (not step 2)
    expect(screen.getByPlaceholderText("homelan://pair?token=...")).toBeInTheDocument();
  });

  it("loading state shows 'Pairing...' text and disables button", async () => {
    mockFetchPending();
    const user = userEvent.setup();

    render(<OnboardingWizard onComplete={vi.fn()} />);

    await user.type(
      screen.getByPlaceholderText("homelan://pair?token=..."),
      "homelan://pair?token=abc123"
    );
    await user.click(screen.getByRole("button", { name: "Pair" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Pairing..." })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Pairing..." })).toBeDisabled();
    });
  });
});
