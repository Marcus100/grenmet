/** Forecast issue times in Grenada (AST, UTC−4 all year). */
const ISSUE_HOURS = [7, 12, 18];
const AST_OFFSET_HOURS = 4;

/** The next 07:00, 12:00 or 18:00 AST strictly after `now`. */
export function nextIssueSlot(now: Date = new Date()): Date {
  const local = new Date(now.getTime() - AST_OFFSET_HOURS * 3_600_000);
  for (let day = 0; day < 2; day += 1) {
    for (const hour of ISSUE_HOURS) {
      const slot = new Date(
        Date.UTC(
          local.getUTCFullYear(),
          local.getUTCMonth(),
          local.getUTCDate() + day,
          hour + AST_OFFSET_HOURS
        )
      );
      if (slot.getTime() > now.getTime()) return slot;
    }
  }
  throw new Error("unreachable");
}
