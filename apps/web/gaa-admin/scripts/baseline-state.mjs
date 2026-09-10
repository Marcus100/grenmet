// Table identifiers come only from the fixed source-controlled seed lists.
const TABLE_NAME = /^[a-z_]+$/;

// Read the catalogue state before any schema or data mutation.
export async function catalogueState(client, key, tables) {
  const marker = await client.query(
    "SELECT to_regclass('public.baseline_step') AS name"
  );
  if (marker.rows[0].name) {
    const done = await client.query(
      "SELECT 1 FROM baseline_step WHERE key = $1",
      [key]
    );
    if (done.rowCount) return "initialised";
  }
  if (tables.some((name) => !TABLE_NAME.test(name)))
    throw new Error("Invalid catalogue table");
  const existing = await client.query(
    tables.map((name) => `SELECT 1 FROM "${name}"`).join(" UNION ALL ") +
      " LIMIT 1"
  );
  return existing.rowCount ? "conflict" : "empty";
}

export function seedMode(args = process.argv.slice(2)) {
  if (
    args.some((arg) => !["--apply", "--preview"].includes(arg)) ||
    (args.includes("--apply") && args.includes("--preview"))
  ) {
    throw new Error("Use --preview (default) or --apply");
  }
  return args.includes("--apply");
}
