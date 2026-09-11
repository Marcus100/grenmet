import { execFileSync } from "node:child_process";
import test from "node:test";

test("weather snapshot failure resumes previously running writers without publishing success", () => {
  execFileSync("python3", [
    "-c",
    `
import importlib.util
import json
import os
import tempfile
from types import SimpleNamespace
from unittest.mock import patch
spec = importlib.util.spec_from_file_location("backup", "scripts/production/weather-backup.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
calls = []
def run(args, **kwargs):
    calls.append(args)
    if "get-bucket-lifecycle-configuration" in args:
        return SimpleNamespace(stdout=json.dumps({"Rules": [{"Status": "Enabled", "Expiration": {"Days": 30}}]}))
    if args[:2] == ["docker", "ps"]:
        if "label=com.docker.compose.service=elasticsearch" in args:
            return SimpleNamespace(stdout="es\\n")
        if "label=com.docker.compose.service=postgres" in args:
            return SimpleNamespace(stdout="pg\\n")
        return SimpleNamespace(stdout="writer\\n")
    return SimpleNamespace(stdout="")
def inspect(container):
    project, service = ("wis", "elasticsearch") if container == "es" else ("surface", "postgres") if container == "pg" else ("wis", "wis2box-management")
    return {"State": {"Running": True}, "Config": {"Labels": {"com.docker.compose.project": project, "com.docker.compose.service": service}}}
def es(container, method, path, data=None):
    if "wait_for_completion" in path:
        return {"snapshot": {"state": "PARTIAL"}}
    return {}
with tempfile.TemporaryDirectory() as directory:
    archives = {name: {"type": "bind", "source": directory, "include": ["media"]} for name in ["surface-files", "wis2box-config", "wis2box-auth", "mosquitto-config", "grafana", "prometheus", "loki"]}
    config = dict(environment="staging", elasticsearch_container="es", surface_postgres_container="pg", wis2box_project="wis", surface_project="surface", archive_image="example@sha256:" + "a" * 64, archives=archives)
    with patch.object(module, "run", run), patch.object(module, "inspect", inspect), patch.object(module, "es_request", es), patch.dict(os.environ, {"DO_SPACES_BUCKET": "test", "DO_SPACES_ENDPOINT": "https://example.test"}):
        try:
            module.backup(config, lock_held=True)
        except ValueError:
            pass
        else:
            raise AssertionError("Partial Elasticsearch snapshot accepted")
    assert any(call[:2] == ["docker", "start"] for call in calls)
    assert not any("s3" in call and ("sync" in call or "cp" in call) for call in calls)
`,
  ]);
});
