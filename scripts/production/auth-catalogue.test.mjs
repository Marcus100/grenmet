import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

for (const environment of ["staging", "production"]) {
  for (const fails of [false, true]) {
    test(`${environment} requires auth catalogue without account bootstrap (failure=${fails})`, () => {
      const root = mkdtempSync(join(tmpdir(), "auth-catalogue-"));
      try {
        writeFileSync(
          join(root, "python"),
          `#!/bin/bash
echo "$1" >> "$CALLS"
if [[ "$1" == scripts/seed_auth_catalogue.py && "$FAIL_SEED" == 1 ]]; then exit 1; fi
`,
          { mode: 0o700 }
        );
        writeFileSync(join(root, "alembic"), "#!/bin/bash\nexit 0\n", {
          mode: 0o700,
        });
        const result = spawnSync(
          "bash",
          [
            new URL(
              "../../apps/api/fastapi/scripts/prestart.sh",
              import.meta.url
            ).pathname,
          ],
          {
            env: {
              ...process.env,
              PATH: `${root}:${process.env.PATH}`,
              ENVIRONMENT: environment,
              PRESTART_SYNC: "0",
              WXPRODUCTS_DATABASE_URL: "configured",
              WXWATCH_DATABASE_URL: "configured",
              EREGISTER_DATABASE_URL: "configured",
              JANITORIAL_DATABASE_URL: "configured",
              TRANSPORT_DATABASE_URL: "configured",
              EVENTS_DATABASE_URL: "configured",
              CALLS: join(root, "calls"),
              FAIL_SEED: fails ? "1" : "0",
            },
            encoding: "utf8",
            timeout: 10_000,
          }
        );
        const calls = readFileSync(join(root, "calls"), "utf8").split("\n");
        assert.equal(result.status, fails ? 1 : 0, result.stderr);
        assert.ok(calls.includes("scripts/seed_auth_catalogue.py"));
        assert.equal(calls.includes("scripts/initial_data.py"), false);
        assert.equal(calls.includes("scripts/seed_events_demo.py"), false);
        assert.equal(calls.includes("scripts/check_onboarding.py"), !fails);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
}
