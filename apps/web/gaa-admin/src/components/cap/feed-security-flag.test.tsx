import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeedSecurityFlag } from "@/components/cap/feed-security-flag";

describe("FeedSecurityFlag", () => {
  it("tells staff when a plain-http feed will stop being fetched", () => {
    render(
      <FeedSecurityFlag
        feed={{
          insecure_since: "2026-11-03T08:00:00Z",
          grace_ends_at: "2026-11-17T08:00:00Z",
          grace_expired: false,
        }}
      />
    );
    expect(screen.getByText(/switch to https by 2026-11-17/)).toBeVisible();
  });

  it("says plainly that an expired feed is no longer fetched", () => {
    render(
      <FeedSecurityFlag
        feed={{
          insecure_since: "2026-10-01T08:00:00Z",
          grace_ends_at: "2026-10-15T08:00:00Z",
          grace_expired: true,
        }}
      />
    );
    expect(
      screen.getByText(/no longer fetched since 2026-10-15/)
    ).toBeVisible();
  });

  it("shows nothing for an https feed", () => {
    const { container } = render(
      <FeedSecurityFlag
        feed={{ insecure_since: null, grace_ends_at: null, grace_expired: false }}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
