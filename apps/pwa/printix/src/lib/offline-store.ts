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

export interface OfflineStore {
  /** Records an offline admission: the ticket is marked and the entry queued. */
  admit: (entry: QueuedAdmission) => Promise<void>;
  /** Forgets everything, for example when the phone is unpaired. */
  clear: () => Promise<void>;
  find: (hash: string) => Promise<StoredTicket | undefined>;
  /**
   * What is saved for this pairing. Data saved for another pairing is removed
   * first: it must never be checked against or sent with this one.
   */
  load: (pairingTag: string) => Promise<OfflineSnapshot>;
  /** The oldest queued admissions, at most `limit`. */
  pending: (limit: number) => Promise<QueuedAdmission[]>;
  /**
   * Replaces the ticket list with a fresh download. Tickets admitted here and
   * still queued stay admitted: the server does not know about them yet.
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

/** The store on the phone's database. `name` is only changed by tests. */
export function createOfflineStore(name = "printix-offline"): OfflineStore {
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

    async load(tag) {
      const meta = await db.meta.get(META_KEY);
      const queued = await db.queue.toArray();
      const foreign =
        (meta && meta.pairingTag !== tag) ||
        queued.some((entry) => entry.pairingTag !== tag);
      if (foreign) {
        await clear();
      }
      return snapshot();
    },

    find: (hash) => db.tickets.get(hash),

    async admit(entry) {
      await db.transaction("rw", [db.tickets, db.queue], async () => {
        await db.tickets.update(entry.hash, {
          state: "admitted",
          admittedAt: entry.scannedAt,
          admittedGate: null,
          admittedHere: true,
        });
        await db.queue.put(entry);
      });
    },

    pending: (limit) => db.queue.orderBy("scannedAt").limit(limit).toArray(),

    async replaceList(meta, tickets) {
      await db.transaction("rw", [db.meta, db.tickets, db.queue], async () => {
        const queued = new Map(
          (await db.queue.toArray()).map((entry) => [entry.hash, entry])
        );
        const merged = tickets.map((ticket): StoredTicket => {
          const local = queued.get(ticket.hash);
          return local
            ? {
                ...ticket,
                state: "admitted",
                admittedAt: local.scannedAt,
                admittedGate: null,
                admittedHere: true,
              }
            : ticket;
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
  };
}
