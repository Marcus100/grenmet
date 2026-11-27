import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// Typed details are kept in sessionStorage (per business, per tab). Each test
// starts with an empty tab, so one test's typing never reaches the next.
afterEach(() => {
  window.sessionStorage.clear();
});
