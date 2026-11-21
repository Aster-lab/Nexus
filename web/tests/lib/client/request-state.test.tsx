import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState, ErrorState, LoadingState, UnavailableState } from "../../../src/components/ui/request-state";

describe("WP9 reusable request states", () => {
  it("announces loading content accessibly", () => {
    const markup = renderToStaticMarkup(<LoadingState label="Loading loan details" />);
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Loading loan details");
  });

  it("announces request errors without requiring implementation-specific styling", () => {
    const markup = renderToStaticMarkup(<ErrorState title="Could not load portfolio" message="Try again shortly." />);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Could not load portfolio");
    expect(markup).toContain("Try again shortly.");
  });

  it("renders a clear empty state and optional next action", () => {
    const markup = renderToStaticMarkup(<EmptyState
      title="No investments yet"
      description="Available opportunities will appear here."
      action={{ href: "/marketplace", label: "Explore marketplace" }}
    />);
    expect(markup).toContain("No investments yet");
    expect(markup).toContain('href="/marketplace"');
    expect(markup).toContain("Explore marketplace");
  });

  it("can clearly present unavailable product capabilities", () => {
    const markup = renderToStaticMarkup(<UnavailableState
      title="Prediction unavailable"
      description="An administrator will review this application."
    />);
    expect(markup).toContain('data-state="unavailable"');
    expect(markup).toContain("Prediction unavailable");
    expect(markup).toContain("An administrator will review this application.");
  });
});
