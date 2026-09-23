/** Groups dotted permission keys ("hr.leave.approve") by their first segment. */
export function groupPermissions(
  keys: readonly string[]
): ReadonlyArray<readonly [string, readonly string[]]> {
  const groups = new Map<string, string[]>();
  for (const key of [...keys].sort()) {
    const area = key.split(".")[0] ?? key;
    const list = groups.get(area) ?? [];
    list.push(key);
    groups.set(area, list);
  }
  return [...groups.entries()];
}
