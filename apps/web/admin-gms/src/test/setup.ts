import "@testing-library/jest-dom";
import { configure } from "@testing-library/react";
import { vi } from "vitest";

// Default findBy*/waitFor timeout is 1s, which flakes when the full suite runs
// in parallel and workers contend for CPU (e.g. shift-exchange-editor's
// findByRole). 5s changes nothing for passing tests — they resolve as soon as
// the element appears — it only widens the deadline under load.
configure({ asyncUtilTimeout: 5000 });

// jsdom does not implement these APIs, but Base UI primitives (Popover, etc.)
// and react-day-picker touch them on mount. Stub them so component tests render.
class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

globalThis.ResizeObserver ??=
  ResizeObserverStub as unknown as typeof ResizeObserver;

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
})) as unknown as typeof window.matchMedia;
