import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SignIn from "./page";

async function markup(signIn?: string): Promise<string> {
  const element = await SignIn({
    searchParams: Promise.resolve(signIn ? { sign_in: signIn } : {}),
  });
  return renderToStaticMarkup(element);
}

describe("CMS sign-in page", () => {
  it("names the Barrels account and starts single sign-on back to the editor", async () => {
    const html = await markup();
    expect(html).toContain("Sign in with your Barrels account");
    expect(html).toContain('href="/auth/start?returnTo=%2Fadmin"');
    expect(html).not.toContain("Sign in with GMS");
    expect(html).not.toContain('role="alert"');
  });

  it("explains an expired sign-in link and offers to try again", async () => {
    const html = await markup("expired");
    expect(html).toContain('role="alert"');
    expect(html).toContain("That sign-in link expired or was refused.");
  });
});
