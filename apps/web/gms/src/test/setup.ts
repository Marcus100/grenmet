import "@testing-library/jest-dom/vitest";

import { vi } from "vitest";

// Keep telemetry outside component tests and avoid loading its Node bundler hooks.
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
