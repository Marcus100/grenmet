import { APIError } from "payload";
import { nextIssueSlot } from "./issue-slots";

/** The live-post kind that is the duty forecaster's note. */
export const NOTE_KIND = "note";
export const NOTE_TITLE = "Duty forecaster's note";
const TEXT_LIMIT = 280;

interface NoteFields {
  expiresAt?: unknown;
  kind?: unknown;
  publishedAt?: unknown;
  status?: unknown;
  text?: unknown;
  title?: unknown;
}

const trimmed = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/**
 * A note is signed and timed when it is posted: its time is the moment of the
 * change, and it expires at the next forecast issue (07:00, 12:00 or 18:00)
 * unless the forecaster sets a later time. Editing the words posts it again.
 * Other kinds of live post are left alone. Reads the saved value wherever an
 * update leaves a field out.
 */
export function stampDutyNote<T extends NoteFields>(
  data: T,
  original: NoteFields | undefined,
  now: Date = new Date()
): T {
  const value = (key: keyof NoteFields) =>
    data[key] === undefined ? original?.[key] : data[key];
  if (value("kind") !== NOTE_KIND) return data;
  if (!trimmed(value("title"))) data.title = NOTE_TITLE;
  const text = trimmed(value("text"));
  if (text.length > TEXT_LIMIT)
    throw new APIError(`The note is at most ${TEXT_LIMIT} characters.`, 400);
  if (value("status") !== "published") return data;
  if (!text) throw new APIError("Write the note before posting it.", 400);
  const wasPublished = original?.status === "published";
  const changed = !wasPublished || text !== trimmed(original?.text);
  if (!changed) {
    if (!value("expiresAt")) data.expiresAt = nextIssueSlot(now).toISOString();
    return data;
  }
  const requested =
    typeof data.expiresAt === "string" ? new Date(data.expiresAt) : null;
  const keepRequested =
    requested !== null &&
    requested.getTime() > now.getTime() &&
    requested.toISOString() !== original?.expiresAt;
  data.publishedAt = now.toISOString();
  data.expiresAt = keepRequested
    ? requested.toISOString()
    : nextIssueSlot(now).toISOString();
  return data;
}

/** Whether a document (or an update's kind) is the duty forecaster's note. */
export function isNoteScope(data: { kind?: unknown } | undefined): boolean {
  return data?.kind === NOTE_KIND;
}
