import { renderTemplate, type TemplateName } from "@barrelsgd/email-templates";
import { captureException } from "@sentry/nextjs";
import { type NextRequest, NextResponse } from "next/server";
import { renderSecretMatches } from "@/lib/email-render-auth";
import { env } from "@/lib/env";

/** Largest request body accepted, in bytes. A card or newsletter is a few KB. */
const MAX_BODY_BYTES = 256 * 1024;

/**
 * POST /api/email/render
 *
 * Internal endpoint called by FastAPI to render React Email templates to HTML.
 * Protected by the EMAIL_RENDER_SECRET shared secret (32+ characters) in the
 * X-Email-Render-Secret header, compared in constant time. With no usable
 * secret configured the route answers 503 and never renders.
 * Never expose this route to the public internet.
 *
 * Request body: { template: TemplateName, props: Record<string, unknown> },
 * at most 256 KB (413 above that).
 * Response:     { html: string, text: string, subject: string }
 * The card template ("card") takes the props FastAPI builds (email_layout.to_props).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const expected = env.EMAIL_RENDER_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "Email rendering is not configured" },
      { status: 503 }
    );
  }
  const presented = request.headers.get("x-email-render-secret");
  if (!renderSecretMatches(presented, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Read the body, capped ───────────────────────────────────────────────────
  const raw = await readCapped(request, MAX_BODY_BYTES);
  if (raw === null) {
    return NextResponse.json(
      { error: "Request body too large" },
      { status: 413 }
    );
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { template, props } = body;
  if (typeof template !== "string" || !template) {
    return NextResponse.json(
      { error: "Missing or invalid 'template' field" },
      { status: 400 }
    );
  }
  if (props !== undefined && props !== null && !isRecord(props)) {
    return NextResponse.json(
      { error: "Invalid 'props' field" },
      { status: 400 }
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  try {
    const result = await renderTemplate(template as TemplateName, props ?? {});
    return NextResponse.json(result);
  } catch (error) {
    captureException(error, { tags: { area: `email-render-${template}` } });
    return NextResponse.json({ error: "Render failed" }, { status: 500 });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The request body as text, or null when it is larger than `limit` bytes. A
 * declared Content-Length over the limit is refused before reading; otherwise
 * the stream is read and abandoned as soon as it passes the limit.
 */
async function readCapped(
  request: NextRequest,
  limit: number
): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > limit) {
    return null;
  }
  if (!request.body) {
    return "";
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
