import Dexie, { type Table } from "dexie";

/**
 * What the phone keeps for checking tickets with no signal, in its own
 * database (IndexedDB through Dexie): the event's ticket list as keyed hashes,
 * the admissions made offline that still have to be sent, and the conflicts
 * the server reported. The pairing secret stays in localStorage, never here.
 */

type TicketState = "valid" | "void" | "admitted";

export interface StoredTicket {
  readonly admittedAt: string | null;
  readonly admittedGate: string | null;
  /** Admitted on this phone with no signal; the server has not confirmed it. */
  readonly admittedHere: boolean;
  readonly hash: string;
  readonly printedNumber: string;
  readonly state: TicketState;
}

export interface ListMeta {
  /** The scheduled close; no one is admitted offline at or after it. */
  readonly closesAt: string;
  readonly eventId: string;
  readonly eventName: string;
  /** "open" or "closed", as the server said when the list was made. */
  readonly eventStatus: string;
  /** When this phone downloaded the list. */
  readonly fetchedAt: string;
  /** When the server made the list; admissions after it are not in it. */
  readonly generatedAt: string;
  readonly hashKey: string;
  readonly pairingTag: string;
}

export interface QueuedAdmission {
  readonly clientRef: string;
  readonly hash: string;
  readonly pairingTag: string;
  readonly printedNumber: string;
  readonly scannedAt: string;
  /** The scanned barcode, which the server needs; only kept until it is sent. */
  readonly value: string;
}

/** A ticket let in offline that the server did not record as this admission. */
export interface Conflict {
  readonly admittedAt: string | null;
  readonly admittedGate: string | null;
  readonly clientRef: string;
  readonly outcome: string;
  readonly printedNumber: string;
  readonly scannedAt: string;
}

/** An answer from the server for one queued admission. */
export interface Settled {
  readonly clientRef: string;
  /** Absent when the server recorded the admission (no conflict). */
  readonly conflict?: Conflict;
}

export interface OfflineSnapshot {
  readonly conflicts: readonly Conflict[];
  readonly meta: ListMeta | null;
  readonly pending: number;
}

export interface LoadResult {
  /**
   * Admissions queued under another pairing that were removed unsent: the
   * server will not take them with this pairing. Shown to staff, never hidden.
   */
  readonly lost: number;
  readonly snapshot: OfflineSnapshot;
}

export interface OfflineStore {
  /**
   * Records an offline admission: the ticket is marked and the entry queued,
   * in one step. False, and nothing written, when the ticket is no longer
   * valid (another read admitted it first).
   */
  admit: (entry: QueuedAdmission) => Promise<boolean>;
  /** Forgets everything, for example when the phone is unpaired. */
  clear: () => Promise<void>;
  /** Forgets the conflicts once staff have read them. */
  clearConflicts: () => Promise<OfflineSnapshot>;
  /** Closes the database connection. */
  close: () => void;
  find: (hash: string) => Promise<StoredTicket | undefined>;
  /**
   * What is saved for this pairing. Data saved for another pairing is removed
   * first: it must never be checked against or sent with this one.
   */
  load: (pairingTag: string) => Promise<LoadResult>;
  /**
   * Marks a ticket the server just admitted live, so a copy scanned later with
   * no signal is refused even before the next list arrives.
   */
  markAdmitted: (
    hash: string,
    admittedAt: string,
    admittedGate: string | null
  ) => Promise<void>;
  /** The oldest queued admissions, at most `limit`. */
  pending: (limit: number) => Promise<QueuedAdmission[]>;
  /**
   * Replaces the ticket list with a fresh download. Tickets still queued stay
   * admitted (the server does not know them yet), and so do tickets this phone
   * saw admitted after the server made the list.
   */
  replaceList: (
    meta: ListMeta,
    tickets: readonly StoredTicket[]
  ) => Promise<OfflineSnapshot>;
  /** Removes answered admissions and keeps their conflicts. */
  settle: (answers: readonly Settled[]) => Promise<OfflineSnapshot>;
  snapshot: () => Promise<OfflineSnapshot>;
}

const META_KEY = "list";
const DATABASE_NAME = "printix-offline";

interface MetaRow extends ListMeta {
  readonly key: string;
}

class OfflineDatabase extends Dexie {
  conflicts!: Table<Conflict, string>;
  meta!: Table<MetaRow, string>;
  queue!: Table<QueuedAdmission, string>;
  tickets!: Table<StoredTicket, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      meta: "key",
      tickets: "hash",
      queue: "clientRef, scannedAt",
      conflicts: "clientRef, scannedAt",
    });
  }
}

function withoutKey({ key: _key, ...meta }: MetaRow): ListMeta {
  return meta;
}

/** A time in milliseconds, or null for a missing or unreadable one. */
function timeOf(iso: string | null): number | null {
  if (!iso) {
    return null;
  }
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : time;
}

/** True when this phone knows of an admission the server's list is older than. */
function admittedSinceList(
  local: StoredTicket | undefined,
  generatedAt: string
): local is StoredTicket {
  if (local?.state !== "admitted") {
    return false;
  }
  const admitted = timeOf(local.admittedAt);
  const generated = timeOf(generatedAt);
  return admitted !== null && generated !== null && admitted >= generated;
}

/** The store on the phone's database. `name` is only changed by tests. */
export function createOfflineStore(name = DATABASE_NAME): OfflineStore {
  const db = new OfflineDatabase(name);

  const snapshot = async (): Promise<OfflineSnapshot> => {
    const [meta, pending, conflicts] = await Promise.all([
      db.meta.get(META_KEY),
      db.queue.count(),
      db.conflicts.orderBy("scannedAt").reverse().toArray(),
    ]);
    return { meta: meta ? withoutKey(meta) : null, pending, conflicts };
  };

  const clear = () =>
    db.transaction("rw", [db.meta, db.tickets, db.queue, db.conflicts], () =>
      Promise.all([
        db.meta.clear(),
        db.tickets.clear(),
        db.queue.clear(),
        db.conflicts.clear(),
      ]).then(() => undefined)
    );

  return {
    snapshot,
    clear,
    close: () => db.close(),

    async load(tag) {
      const meta = await db.meta.get(META_KEY);
      const queued = await db.queue.toArray();
      const foreign = queued.filter((entry) => entry.pairingTag !== tag);
      if ((meta && meta.pairingTag !== tag) || foreign.length > 0) {
        await clear();
      }
      return { lost: foreign.length, snapshot: await snapshot() };
    },

    find: (hash) => db.tickets.get(hash),

    admit: (entry) =>
      db.transaction("rw", [db.tickets, db.queue], async () => {
        const ticket = await db.tickets.get(entry.hash);
        if (ticket?.state !== "valid") {
          return false;
        }
        await db.tickets.put({
          ...ticket,
          state: "admitted",
          admittedAt: entry.scannedAt,
          admittedGate: null,
          admittedHere: true,
        });
        await db.queue.put(entry);
        return true;
      }),

    async markAdmitted(hash, admittedAt, admittedGate) {
      await db.transaction("rw", [db.tickets], async () => {
        const ticket = await db.tickets.get(hash);
        if (ticket && ticket.state !== "admitted") {
          await db.tickets.put({
            ...ticket,
            state: "admitted",
            admittedAt,
            admittedGate,
            admittedHere: false,
          });
        }
      });
    },

    pending: (limit) => db.queue.orderBy("scannedAt").limit(limit).toArray(),

    async replaceList(meta, tickets) {
      await db.transaction("rw", [db.meta, db.tickets, db.queue], async () => {
        const queued = new Map(
          (await db.queue.toArray()).map((entry) => [entry.hash, entry])
        );
        const existing = new Map(
          (await db.tickets.toArray()).map((ticket) => [ticket.hash, ticket])
        );
        const merged = tickets.map((ticket): StoredTicket => {
          const waiting = queued.get(ticket.hash);
          if (waiting) {
            return {
              ...ticket,
              state: "admitted",
              admittedAt: waiting.scannedAt,
              admittedGate: null,
              admittedHere: true,
            };
          }
          const local = existing.get(ticket.hash);
          if (
            ticket.state !== "admitted" &&
            admittedSinceList(local, meta.generatedAt)
          ) {
            return { ...ticket, ...local, printedNumber: ticket.printedNumber };
          }
          return ticket;
        });
        await db.tickets.clear();
        await db.tickets.bulkPut(merged);
        await db.meta.put({ key: META_KEY, ...meta });
      });
      return snapshot();
    },

    async settle(answers) {
      await db.transaction("rw", [db.queue, db.conflicts], async () => {
        await db.queue.bulkDelete(answers.map((answer) => answer.clientRef));
        const conflicts = answers.flatMap((answer) =>
          answer.conflict ? [answer.conflict] : []
        );
        if (conflicts.length > 0) {
          await db.conflicts.bulkPut(conflicts);
        }
      });
      return snapshot();
    },

    async clearConflicts() {
      await db.conflicts.clear();
      return snapshot();
    },
  };
}

/**
 * Deletes everything saved for offline checking, from a screen that has no
 * open offline store (the pairing-problem screen).
 */
export async function forgetOfflineData(name = DATABASE_NAME): Promise<void> {
  const store = createOfflineStore(name);
  try {
    await store.clear();
  } finally {
    store.close();
  }
}

/** How many admissions made with no signal have not been sent. */
export async function unsentCount(name = DATABASE_NAME): Promise<number> {
  const store = createOfflineStore(name);
  try {
    return (await store.snapshot()).pending;
  } finally {
    store.close();
  }
}
