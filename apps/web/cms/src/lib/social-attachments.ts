import type { PayloadHandler } from "payload";
import { getEnv } from "../env";
import {
  ATTACHMENT_KINDS,
  type AttachmentKind,
} from "./social-attachments-view";

const FILE_SUFFIX: Record<AttachmentKind, string> = {
  social: "-social.png",
  pdf: ".pdf",
  map: "-map.png",
};
const TIMEOUT_MS = 15_000;
const MAX_IDENTIFIER = 200;
const UNSAFE_FILENAME = /[^A-Za-z0-9._-]+/g;
const EDGE_PUNCTUATION = /^[-.]+|[-.]+$/g;

const isKind = (value: string | null): value is AttachmentKind =>
  ATTACHMENT_KINDS.some((kind) => kind === value);

/** "GMS-2026-10-27-001-social.png": a readable, safe download name. */
export function attachmentFilename(
  identifier: string,
  kind: AttachmentKind
): string {
  const base = identifier
    .replace(UNSAFE_FILENAME, "-")
    .replace(EDGE_PUNCTUATION, "");
  return `${base || "warning"}${FILE_SUFFIX[kind]}`;
}

/**
 * `GET /api/social-attachment?identifier=&kind=`: staff only. Fetches one
 * generated file of a published warning (social image, PDF or map) from the
 * warning system and hands it back as a download. The CMS never stores the
 * file, and the browser needs no API address.
 */
export const socialAttachmentEndpoint: PayloadHandler = async (req) => {
  if (!req.user) return Response.json({ error: "Sign in" }, { status: 401 });
  const params = new URL(req.url ?? "http://localhost").searchParams;
  const identifier = params.get("identifier")?.trim() ?? "";
  const kind = params.get("kind");
  if (!identifier || identifier.length > MAX_IDENTIFIER || !isKind(kind))
    return Response.json(
      { error: "Name a warning and a file: social, pdf or map." },
      { status: 400 }
    );
  try {
    const upstream = await fetch(
      new URL(
        `/api/cap/alerts/${encodeURIComponent(identifier)}/attachments/${kind}`,
        getEnv().AUTH_API_URL
      ),
      {
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    if (upstream.status === 404)
      return Response.json(
        {
          error:
            "That warning has no such file. Only published, actual warnings have them.",
        },
        { status: 404 }
      );
    if (!(upstream.ok && upstream.body))
      throw new Error(`CAP attachment responded ${upstream.status}`);
    return new Response(upstream.body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${attachmentFilename(identifier, kind)}"`,
        "Content-Type":
          upstream.headers.get("content-type") ??
          (kind === "pdf" ? "application/pdf" : "image/png"),
      },
    });
  } catch (error) {
    // Lazy: the config also loads outside Next.js (migrations, type generation).
    const { reportError } = await import("./report-error");
    reportError(error, "cms-social-attachment");
    return Response.json(
      { error: "The warning's files can't be loaded right now." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
};
