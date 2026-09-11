import assert from "node:assert/strict";
import test from "node:test";
import { catalogueState, seedMode } from "./baseline-state.mjs";
import { verifyHistory } from "./migrate-domain.mjs";

function clientWith(results) {
  const statements = [];
  return {
    statements,
    query(sql) {
      statements.push(sql);
      const result = results.shift();
      assert.ok(result);
      return result;
    },
  };
}
test("catalogue preview never creates a marker or changes data", async () => {
  const client = clientWith([{ rows: [{ name: null }] }, { rowCount: 0 }]);
  assert.equal(
    await catalogueState(client, "transport-v1", ["routes"]),
    "empty"
  );
  assert.ok(client.statements.every((sql) => sql.startsWith("SELECT")));
  assert.equal(seedMode([]), false);
  assert.equal(seedMode(["--apply"]), true);
  assert.throws(() => seedMode(["--apply", "--preview"]));
});
test("unmarked catalogue data is a conflict, completed seeds preserve edits", async () => {
  assert.equal(
    await catalogueState(
      clientWith([{ rows: [{ name: null }] }, { rowCount: 1 }]),
      "transport-v1",
      ["routes"]
    ),
    "conflict"
  );
  const completed = clientWith([
    { rows: [{ name: "baseline_step" }] },
    { rowCount: 1 },
  ]);
  assert.equal(
    await catalogueState(completed, "transport-v1", ["routes"]),
    "initialised"
  );
  assert.equal(completed.statements.length, 2);
});
test("migrations accept only the exact applied prefix", () => {
  const committed = [
    { hash: "a", folderMillis: 1 },
    { hash: "b", folderMillis: 2 },
  ];
  verifyHistory([{ hash: "a", created_at: "1" }], committed);
  verifyHistory([], committed);
  assert.throws(() =>
    verifyHistory([{ hash: "changed", created_at: 1 }], committed)
  );
  assert.throws(() => verifyHistory([{ hash: "a", created_at: 9 }], committed));
  assert.throws(() => verifyHistory([{ hash: "a", created_at: 1 }], []));
});
