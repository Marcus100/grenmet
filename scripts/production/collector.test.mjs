import { execFileSync } from "node:child_process";
import test from "node:test";

test("collector validation rejects disabled, mutable, public and missing-output configurations", () => {
  execFileSync("python3", [
    "-c",
    `
import importlib.util
import tempfile
from pathlib import Path
spec = importlib.util.spec_from_file_location("collector", "scripts/production/collector.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as directory:
    env = Path(directory) / ".env.local"
    env.write_text("DB_HOST=10.10.0.5\\nDB_NAME=wxwatch_staging\\nDB_USER=wxwatch\\nDB_PASSWORD=test\\nSTORAGE_ENDPOINT_URL=https://example.test\\nSTORAGE_BUCKET=staging\\nSTORAGE_ACCESS_KEY_ID=test\\nSTORAGE_SECRET_ACCESS_KEY=test\\n")
    env.chmod(0o600)
    good = dict(enabled=True, image="ghcr.io/example/wxwatch@sha256:" + "a" * 64, env_file=str(env), kind="wxwatch", args=["goes19"])
    prefix, image, args = module.command("goes19", good)
    assert args == ["goes19"] and "--cap-drop=ALL" in prefix
    for changes in [dict(kind="geonetcast", args=["/app/geonetcast/GOES/script.py"], mounts=[dict(source=directory, target="/data/output", readonly=False)]), dict(enabled=False), dict(image="ghcr.io/example/wxwatch:latest"), dict(args=["all"]), dict(kind="gms-ingest", args=["collect", "--output-dir", "/data/nhc"], mounts=[])]:
        try:
            module.command("goes19", good | changes)
        except ValueError:
            pass
        else:
            raise AssertionError("unsafe/unconfigured job accepted")
    env.write_text(env.read_text().replace("10.10.0.5", "167.71.24.42"))
    try:
        module.command("goes19", good)
    except ValueError:
        pass
    else:
        raise AssertionError("public database accepted")
`,
  ]);
});
