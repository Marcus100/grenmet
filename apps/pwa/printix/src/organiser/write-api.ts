// The organiser's write calls (ADR-0060 amendment, slices 4 and 5). Each answer
// must match the generated schema before a screen shows it. The organisation is
// named in X-Barrels-Organisation on every call.

import {
  type PrintixEventPublic,
  type PrintixImportReport,
  type PrintixPairingCreated,
  type PrintixPairingPublic,
  type PrintixTicketPage,
  type PrintixTicketPublic,
  printixCloseOrgEvent,
  printixCloseOrgEventResponseSchema,
  printixCreateOrgEvent,
  printixCreateOrgEventResponseSchema,
  printixCreateOrgPairing,
  printixCreateOrgPairingResponseSchema,
  printixImportOrgTickets,
  printixImportOrgTicketsResponseSchema,
  printixListOrgPairings,
  printixListOrgPairingsResponseSchema,
  printixListOrgTickets,
  printixListOrgTicketsResponseSchema,
  printixRevokeOrgPairing,
  printixRevokeOrgPairingResponseSchema,
  printixUnvoidOrgTicket,
  printixUnvoidOrgTicketResponseSchema,
  printixVoidOrgTicket,
  printixVoidOrgTicketResponseSchema,
} from "@barrelsgd/api-client";
import { failed, invalidResponse, type Outcome } from "@/organiser/errors";
import type { OrganiserSession } from "@/organiser/session";

const REQUEST_TIMEOUT_MS = 20_000;
/** Tickets per page on the event page. */
export const TICKETS_PAGE_SIZE = 50;

interface Parser<T> {
  safeParse: (
    data: unknown
  ) =>
    | { readonly success: true; readonly data: T }
    | { readonly success: false };
}

/** Runs one call inside the session, then checks its answer against the schema. */
export async function settle<T>(
  session: OrganiserSession,
  area: string,
  request: () => Promise<{ readonly data: unknown }>,
  parser: Parser<T>
): Promise<Outcome<T>> {
  try {
    const data = await session.call(async () => (await request()).data);
    const parsed = parser.safeParse(data);
    if (!parsed.success) {
      throw invalidResponse();
    }
    return { ok: true, value: parsed.data };
  } catch (error) {
    return failed(error, area);
  }
}

function organisationHeader(organisationId: string): Record<string, string> {
  return { "X-Barrels-Organisation": organisationId };
}

/** The organiser's create-event form, sent as the caller's organisation's event. */
export function createEvent(
  session: OrganiserSession,
  organisationId: string,
  body: {
    readonly name: string;
    readonly eventDate: string;
    readonly closesAt: string;
  }
): Promise<Outcome<PrintixEventPublic>> {
  return settle(
    session,
    "organiser-create-event",
    () =>
      printixCreateOrgEvent({
        body: {
          name: body.name,
          event_date: body.eventDate,
          closes_at: body.closesAt,
        },
        headers: organisationHeader(organisationId),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    printixCreateOrgEventResponseSchema
  );
}

export function closeEvent(
  session: OrganiserSession,
  organisationId: string,
  eventId: string
): Promise<Outcome<PrintixEventPublic>> {
  return settle(
    session,
    "organiser-close-event",
    () =>
      printixCloseOrgEvent({
        path: { event_id: eventId },
        headers: organisationHeader(organisationId),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    printixCloseOrgEventResponseSchema
  );
}

export function listTickets(
  session: OrganiserSession,
  organisationId: string,
  eventId: string,
  page: number
): Promise<Outcome<PrintixTicketPage>> {
  return settle(
    session,
    "organiser-tickets",
    () =>
      printixListOrgTickets({
        path: { event_id: eventId },
        query: { page, size: TICKETS_PAGE_SIZE },
        headers: organisationHeader(organisationId),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    printixListOrgTicketsResponseSchema
  );
}

/** Voids a valid ticket (refused once the event is closed or the ticket is in). */
export function voidTicket(
  session: OrganiserSession,
  organisationId: string,
  ticketId: string
): Promise<Outcome<PrintixTicketPublic>> {
  return settle(
    session,
    "organiser-void",
    () =>
      printixVoidOrgTicket({
        path: { ticket_id: ticketId },
        headers: organisationHeader(organisationId),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    printixVoidOrgTicketResponseSchema
  );
}

export function restoreTicket(
  session: OrganiserSession,
  organisationId: string,
  ticketId: string
): Promise<Outcome<PrintixTicketPublic>> {
  return settle(
    session,
    "organiser-restore",
    () =>
      printixUnvoidOrgTicket({
        path: { ticket_id: ticketId },
        headers: organisationHeader(organisationId),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    printixUnvoidOrgTicketResponseSchema
  );
}

/**
 * Uploads the ticket list. `dryRun` checks it and writes nothing. The file is
 * sent once and not kept: the caller holds the File only while it is on screen.
 */
export function importTickets(
  session: OrganiserSession,
  organisationId: string,
  eventId: string,
  file: File,
  dryRun: boolean
): Promise<Outcome<PrintixImportReport>> {
  return settle(
    session,
    "organiser-import",
    () =>
      printixImportOrgTickets({
        path: { event_id: eventId },
        query: { dry_run: dryRun },
        body: { file },
        headers: organisationHeader(organisationId),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    printixImportOrgTicketsResponseSchema
  );
}

export function listGateCodes(
  session: OrganiserSession,
  organisationId: string,
  eventId: string
): Promise<Outcome<PrintixPairingPublic[]>> {
  return settle(
    session,
    "organiser-gate-codes",
    () =>
      printixListOrgPairings({
        path: { event_id: eventId },
        headers: organisationHeader(organisationId),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    printixListOrgPairingsResponseSchema
  );
}

export interface NewGateCode {
  readonly allowTypedNumbers: boolean;
  /** ISO time with an offset, or undefined for the server's default. */
  readonly expiresAt: string | undefined;
  readonly gate: string;
}

/** Makes a gate code. The secret in the answer is shown once by the caller, then dropped. */
export function createGateCode(
  session: OrganiserSession,
  organisationId: string,
  eventId: string,
  code: NewGateCode
): Promise<Outcome<PrintixPairingCreated>> {
  return settle(
    session,
    "organiser-gate-code-create",
    () =>
      printixCreateOrgPairing({
        path: { event_id: eventId },
        body: {
          gate: code.gate,
          expires_at: code.expiresAt,
          allow_typed_numbers: code.allowTypedNumbers,
        },
        headers: organisationHeader(organisationId),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    printixCreateOrgPairingResponseSchema
  );
}

export function cancelGateCode(
  session: OrganiserSession,
  organisationId: string,
  pairingId: string
): Promise<Outcome<PrintixPairingPublic>> {
  return settle(
    session,
    "organiser-gate-code-cancel",
    () =>
      printixRevokeOrgPairing({
        path: { pairing_id: pairingId },
        headers: organisationHeader(organisationId),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }),
    printixRevokeOrgPairingResponseSchema
  );
}
