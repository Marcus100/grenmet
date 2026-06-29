import "@testing-library/jest-dom";
import { vi } from "vitest";

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
