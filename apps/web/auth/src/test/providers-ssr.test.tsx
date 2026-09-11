import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { Providers } from "@/app/providers";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

it("includes the sign-in form in server HTML before analytics initializes", () => {
  const html = renderToString(
    <Providers apiHost="https://example.test" apiKey="">
      <form>
        <input name="email" />
        <button type="submit">Sign in</button>
      </form>
    </Providers>
  );
  expect(html).toContain("<form");
  expect(html).toContain('name="email"');
  expect(html).toContain("Sign in");
});
