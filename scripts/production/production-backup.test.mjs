import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const EREGISTER_UPLOAD = /aws s3 cp .*eregister_/;
const EVENTS_UPLOAD = /aws s3 cp .*events_/;

const workflow = readFileSync(
  new URL("../../.github/workflows/backup-database.yml", import.meta.url),
  "utf8"
);
const steps = workflow
  .split("      - name: ")
  .slice(1)
  .map((block) => {
    const [name] = block.split("\n");
    const script = block
      .split("        run: |\n")[1]
      .split("\n")
      .filter((line) => line.startsWith("          ") || !line.trim())
      .map((line) => line.slice(10))
      .join("\n");
    return { name, script };
  });

for (const scenario of [
  "without CMS",
  "with CMS",
  "CMS dump failure",
  "eRegister dump failure",
  "Events dump failure",
  "restore failure",
]) {
  test(`established production backup: ${scenario}`, () => {
    const root = mkdtempSync(join(tmpdir(), "production-backup-"));
    try {
      const bin = join(root, "bin");
      mkdirSync(bin);
      const backup = join(root, "backups");
      const log = join(root, "calls");
      const envFile = join(root, "env");
      writeFileSync(envFile, "");
      writeFileSync(
        join(bin, "docker"),
        `#!/bin/bash
printf '%s\\n' "$*" >> "$TEST_LOG"
if [[ "$*" == *"pg_dump"* && "$*" == *"gms_cms"* && "$TEST_SCENARIO" == "CMS dump failure" ]]; then exit 1; fi
if [[ "$*" == *"pg_dump"* && "$*" == *"eregister"* && "$TEST_SCENARIO" == "eRegister dump failure" ]]; then exit 1; fi
if [[ "$*" == *"pg_dump"* && "$*" == *"-d events"* && "$TEST_SCENARIO" == "Events dump failure" ]]; then exit 1; fi
if [[ "$*" == *"pg_restore"* && "$TEST_SCENARIO" == "restore failure" ]]; then exit 1; fi
if [[ "$1" == cp && "$2" == grenmet-db-1:/tmp/backup.dump ]]; then echo dump > "$3"; fi
if [[ "$*" == *"SELECT COUNT"* ]]; then echo 3; fi
`,
        { mode: 0o700 }
      );
      writeFileSync(
        join(bin, "aws"),
        '#!/bin/bash\nprintf "aws %s\\n" "$*" >> "$TEST_LOG"\n',
        { mode: 0o700 }
      );
      const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        BACKUP_DIR: backup,
        BACKUP_RETENTION_DAYS: "30",
        POSTGRES_USER: "test",
        AWS_ACCESS_KEY_ID: "test",
        AWS_SECRET_ACCESS_KEY: "test",
        AWS_DEFAULT_REGION: "nyc3",
        DO_SPACES_BUCKET: "existing-backups",
        DO_SPACES_ENDPOINT: "https://example.test",
        GITHUB_ENV: envFile,
        TEST_LOG: log,
        TEST_SCENARIO: scenario,
        CMS_BACKUP_PATH: "",
      };
      let status = 0;
      for (const step of steps) {
        if (scenario === "without CMS" && step.name.includes("gms_cms"))
          continue;
        const result = spawnSync("bash", ["-c", step.script], {
          env,
          encoding: "utf8",
          timeout: 10_000,
        });
        status = result.status;
        if (status !== 0) break;
        for (const line of readFileSync(envFile, "utf8").trim().split("\n")) {
          const index = line.indexOf("=");
          if (index > 0) env[line.slice(0, index)] = line.slice(index + 1);
        }
      }
      const calls = readFileSync(log, "utf8");
      const fails = scenario.endsWith("failure");
      const databaseCount = scenario === "without CMS" ? 7 : 8;
      assert.equal(status === 0, !fails);
      assert.equal(
        (calls.match(/aws s3 cp/g) || []).length,
        fails ? 0 : databaseCount
      );
      if (!fails) {
        assert.ok(calls.includes("-d eregister"));
        assert.match(calls, EREGISTER_UPLOAD);
        assert.ok(calls.includes("-d events"));
        assert.match(calls, EVENTS_UPLOAD);
        assert.equal((calls.match(/pg_restore/g) || []).length, databaseCount);
        assert.ok(calls.includes("s3://existing-backups/production/"));
        assert.ok(calls.lastIndexOf("pg_restore") < calls.indexOf("aws s3 cp"));
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
