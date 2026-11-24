import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emailRenderSecretSchema } from "@/lib/email-render-secret";

const SECRET = "s".repeat(32);

const state = vi.hoisted(() => ({
  env: { EMAIL_RENDER_SECRET: undefined as string | undefined },
}));
const renderTemplate = vi.hoisted(() => vi.fn());
const captureException = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({ env: state.env }));
vi.mock("@barrelsgd/email-templates", () => ({ renderTemplate }));
vi.mock("@sentry/nextjs", () => ({ captureException }));

import { POST } from "./route";

const ROUTE_URL = "https://auth.barrels.gd/api/email/render";

function call(
  body: string,
  headers: Record<string, string> = { "x-email-render-secret": SECRET }
): Promise<Response> {
  return POST(new NextRequest(ROUTE_URL, { method: "POST", body, headers }));
}

const card = JSON.stringify({ template: "card", props: { title: "T" } });

beforeEach(() => {
  state.env.EMAIL_RENDER_SECRET = SECRET;
  renderTemplate.mockResolvedValue({
    html: "<p>x</p>",
    subject: "S",
    text: "x",
  });
});

afterEach(() => vi.clearAllMocks());

describe("the shared secret", () => {
  it("renders when the secret matches", async () => {
    const response = await call(card);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      html: "<p>x</p>",
      subject: "S",
      text: "x",
    });
    expect(renderTemplate).toHaveBeenCalledWith("card", { title: "T" });
  });

  it("answers 503 and never renders when no usable secret is configured", async () => {
    state.env.EMAIL_RENDER_SECRET = undefined;
    const response = await call(card);
    expect(response.status).toBe(503);
    expect(renderTemplate).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a wrong secret of the same length",
      { "x-email-render-secret": "t".repeat(32) },
    ],
    ["a shorter secret", { "x-email-render-secret": "s".repeat(31) }],
    ["a longer secret", { "x-email-render-secret": `${SECRET}s` }],
    ["no secret", {}],
  ])("refuses %s with 401", async (_name, headers) => {
    const response = await call(card, headers);
    expect(response.status).toBe(401);
    expect(renderTemplate).not.toHaveBeenCalled();
  });
});

describe("the request body", () => {
  it("refuses a body over 256 KB with 413 without rendering", async () => {
    const big = JSON.stringify({
      template: "card",
      props: { title: "x".repeat(256 * 1024) },
    });
    const response = await call(big);
    expect(response.status).toBe(413);
    expect(renderTemplate).not.toHaveBeenCalled();
  });

  it("refuses a declared length over the cap before reading", async () => {
    const response = await call(card, {
      "x-email-render-secret": SECRET,
      "content-length": String(256 * 1024 + 1),
    });
    expect(response.status).toBe(413);
    expect(renderTemplate).not.toHaveBeenCalled();
  });

  it("accepts a body just under the cap", async () => {
    const filler = 256 * 1024 - 64;
    const body = JSON.stringify({
      template: "card",
      props: { title: "x".repeat(filler) },
    });
    expect(Buffer.byteLength(body)).toBeLessThanOrEqual(256 * 1024);
    const response = await call(body);
    expect(response.status).toBe(200);
  });

  it.each([
    ["broken JSON", "{"],
    ["a JSON list", "[]"],
    ["a missing template", JSON.stringify({ props: {} })],
    [
      "props that are not an object",
      JSON.stringify({ template: "card", props: [] }),
    ],
  ])("refuses %s with 400", async (_name, body) => {
    const response = await call(body);
    expect(response.status).toBe(400);
    expect(renderTemplate).not.toHaveBeenCalled();
  });

  it("answers 500 and reports when the template rejects the props", async () => {
    renderTemplate.mockRejectedValueOnce(new Error("card requires subject"));
    const response = await call(card);
    expect(response.status).toBe(500);
    expect(captureException).toHaveBeenCalledOnce();
  });
});

describe("EMAIL_RENDER_SECRET in the env schema", () => {
  it("keeps a secret of 32 or more characters", () => {
    expect(emailRenderSecretSchema.parse(SECRET)).toBe(SECRET);
    expect(emailRenderSecretSchema.parse(`${SECRET}more`)).toBe(
      `${SECRET}more`
    );
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["31 characters", "s".repeat(31)],
  ])("treats %s as not configured", (_name, value) => {
    expect(emailRenderSecretSchema.parse(value)).toBeUndefined();
  });
});
