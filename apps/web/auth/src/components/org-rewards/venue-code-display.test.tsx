// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/security/qr-code", () => ({
  QrCode: ({ label, value }: { label?: string; value: string }) => (
    <p>
      {label} :: {value}
    </p>
  ),
}));

import { REFRESH_SECONDS, VenueCodeDisplay } from "./venue-code-display";

const URL = "/api/organisations/org_1/rewards/venues/v1/qr-token";
const fetchMock = vi.fn();

function answer(token: string, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        refresh_after_seconds: 30,
        token,
        window_seconds: 60,
      }),
      { headers: { "Content-Type": "application/json" }, status }
    )
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("VenueCodeDisplay", () => {
  it("shows the first code large as text, with a QR for the same value", () => {
    render(
      <VenueCodeDisplay
        initial={{ refreshAfterSeconds: 30, token: "v1.abc.1.def" }}
        refreshUrl={URL}
        venueName="Market"
      />
    );
    expect(screen.getByTestId("venue-code").textContent).toBe("v1.abc.1.def");
    expect(
      screen.getByText(
        "QR code with the check-in code for Market :: v1.abc.1.def"
      )
    ).toBeTruthy();
    expect(
      screen.getByText((text) =>
        text.includes("A printed QR can encode this value")
      )
    ).toBeTruthy();
  });

  it("fetches a new code every 30 seconds without caching", async () => {
    answer("v1.second.2.zzz");
    render(
      <VenueCodeDisplay
        initial={{ refreshAfterSeconds: 30, token: "v1.first.1.aaa" }}
        refreshUrl={URL}
        venueName="Market"
      />
    );
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_SECONDS * 1000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL);
    expect(init.cache).toBe("no-store");
    expect(screen.getByTestId("venue-code").textContent).toBe(
      "v1.second.2.zzz"
    );
  });

  it("warns, and keeps retrying, when a refresh fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 502 }));
    answer("v1.third.3.bbb");
    render(
      <VenueCodeDisplay
        initial={{ refreshAfterSeconds: 30, token: "v1.first.1.aaa" }}
        refreshUrl={URL}
        venueName="Market"
      />
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "Couldn't refresh the code"
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("venue-code").textContent).toBe("v1.third.3.bbb");
  });

  it("says so when the session ends or the venue is gone", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    render(
      <VenueCodeDisplay
        initial={{ refreshAfterSeconds: 30, token: "v1.first.1.aaa" }}
        refreshUrl={URL}
        venueName="Market"
      />
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByRole("alert").textContent).toContain("Sign in again");
  });

  it("fetches straight away when the server couldn't get a first code", async () => {
    answer("v1.first.1.aaa");
    render(
      <VenueCodeDisplay initial={null} refreshUrl={URL} venueName="Market" />
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("venue-code").textContent).toBe("v1.first.1.aaa");
  });
});
