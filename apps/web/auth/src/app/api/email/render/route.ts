import { renderTemplate, type TemplateName } from "@grenmet/email-templates";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

/**
 * POST /api/email/render
 *
 * Internal endpoint called by FastAPI to render React Email templates to HTML.
 * Protected by the EMAIL_RENDER_SECRET shared secret in the X-Email-Render-Secret header.
 * Never expose this route to the public internet.
 *
 * Request body: { template: TemplateName, props: Record<string, unknown> }
 * Response:     { html: string, subject: string }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const secret = request.headers.get("x-email-render-secret");

  if (!env.EMAIL_RENDER_SECRET || secret !== env.EMAIL_RENDER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let template: string;
  let props: Record<string, unknown>;

  try {
    const body = (await request.json()) as {
      template?: unknown;
      props?: unknown;
    };
    if (typeof body.template !== "string" || !body.template) {
      return NextResponse.json(
        { error: "Missing or invalid 'template' field" },
        { status: 400 }
      );
    }
    template = body.template;
    props = (body.props as Record<string, unknown>) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  try {
    const result = await renderTemplate(template as TemplateName, props);
    return NextResponse.json(result);
  } catch (error) {
    console.error(
      "[email/render] Failed to render template %s:",
      template,
      error
    );
    return NextResponse.json({ error: "Render failed" }, { status: 500 });
  }
}
