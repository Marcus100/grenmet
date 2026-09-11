import type { StaffSetup } from "@barrelsgd/api-client";

type Person = Pick<
  StaffSetup,
  "user_id" | "name" | "department_id" | "supervisor_id" | "status"
>;

// Flatten the hierarchy so corrupt or unusually deep reporting chains cannot overflow rendering.
export function chartRows(staff: Person[]) {
  const people = new Map(staff.map((person) => [person.user_id, person]));
  const children = new Map<string, Person[]>();
  for (const person of staff) {
    if (person.supervisor_id && people.has(person.supervisor_id)) {
      const siblings = children.get(person.supervisor_id) ?? [];
      siblings.push(person);
      children.set(person.supervisor_id, siblings);
    }
  }
  const rows: { person: Person; depth: number; issue?: string }[] = [];
  const visited = new Set<string>();
  function walk(root: Person, issue?: string) {
    const stack = [{ person: root, depth: 0, issue }];
    while (stack.length) {
      const row = stack.pop();
      if (!row || visited.has(row.person.user_id)) continue;
      visited.add(row.person.user_id);
      rows.push(row);
      for (const child of [
        ...(children.get(row.person.user_id) ?? []),
      ].reverse()) {
        if (!visited.has(child.user_id))
          stack.push({ person: child, depth: row.depth + 1, issue: undefined });
      }
    }
  }
  for (const person of staff) {
    if (!person.supervisor_id) walk(person, "No supervisor assigned");
    else if (!people.has(person.supervisor_id))
      walk(person, "Supervisor unavailable in this view");
  }
  for (const person of staff) {
    if (visited.has(person.user_id)) continue;
    let root = person;
    const chain = new Set<string>();
    while (!chain.has(root.user_id)) {
      chain.add(root.user_id);
      const supervisor = root.supervisor_id
        ? people.get(root.supervisor_id)
        : undefined;
      if (!supervisor) break;
      root = supervisor;
    }
    walk(root, "Reporting cycle — review supervisor assignments");
  }
  return rows;
}

export function OrganisationChart({ staff }: { staff: Person[] }) {
  const rows = chartRows(staff);
  const names = new Map(staff.map((person) => [person.user_id, person.name]));
  return (
    <section
      aria-label="Organisation chart"
      className="space-y-3 rounded-lg border border-border p-4"
    >
      <h2 className="font-semibold text-xl">Organisation chart</h2>
      <p className="text-muted-foreground text-sm">
        Read-only reporting relationships from staff setup. Unassigned
        supervisors and reporting cycles are shown for review.
      </p>
      {!rows.length && <p>No staff records available.</p>}
      <ol className="space-y-2">
        {rows.map(({ person, depth, issue }) => (
          <li className="rounded border border-border p-3" key={person.user_id}>
            <p className="font-medium">
              {depth > 0 && <span aria-hidden="true">↳ </span>}
              {person.name}
            </p>
            <p className="text-muted-foreground text-sm">
              {person.department_id || "Department not assigned"} ·{" "}
              {person.status}
            </p>
            {person.supervisor_id && names.has(person.supervisor_id) && (
              <p className="text-sm">
                Reports to {names.get(person.supervisor_id)} · Level {depth + 1}
              </p>
            )}
            {issue && <p className="text-sm">{issue}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
