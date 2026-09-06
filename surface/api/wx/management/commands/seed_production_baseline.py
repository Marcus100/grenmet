"""Load reviewed reference fixtures once, preserving subsequent online edits."""
import json
from pathlib import Path

from django.apps import apps
from django.core.management import BaseCommand, CommandError, call_command
from django.db import connection, transaction


class Command(BaseCommand):
    help = "Preview SURFACE reference data; use --apply only after reviewing the preview"

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true")
        parser.add_argument("--fixtures", type=Path, default=Path(__file__).resolve().parents[3] / "fixtures")

    def handle(self, *args, **options):
        root = options["fixtures"]
        # Publishers and station bindings require operational review, never activate from a fixture.
        excluded = {"wx_wis2publishoffset.json", "wx.stationcommunication.json"}
        files = sorted(p for p in root.glob("*.json") if p.name not in excluded)
        if not files:
            raise CommandError("No reference fixtures found")
        models = set()
        for path in files:
            rows = json.loads(path.read_text())
            for row in rows:
                model = row["model"]
                if model == "auth.user" or any(word in model for word in ("rawdata", "raw_data", "summary", "publishlog")):
                    raise CommandError(f"Operational or identity records are not allowed in reference fixtures: {model}")
                models.add(model)
            self.stdout.write(f"{path.name}: {len(rows)} reference records")
        if not options["apply"]:
            self.stdout.write("Preview only. Review station metadata and publishing configuration separately.")
            return
        with transaction.atomic():
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_xact_lock(73190506)")
                cursor.execute("CREATE TABLE IF NOT EXISTS baseline_step (key text PRIMARY KEY, completed_at timestamptz NOT NULL DEFAULT now())")
                cursor.execute("SELECT 1 FROM baseline_step WHERE key = %s", ["surface-reference-v1"])
                if cursor.fetchone():
                    self.stdout.write("Already initialised; online edits preserved")
                    return
                # An unmarked populated installation must be reviewed, never overwritten.
                for model in models:
                    if apps.get_model(model).objects.exists():
                        raise CommandError(f"Existing {model} records require review before initialisation")
                call_command("loaddata", *[str(path) for path in files], verbosity=1)
                cursor.execute("INSERT INTO baseline_step(key) VALUES (%s)", ["surface-reference-v1"])
        self.stdout.write("Reference baseline installed. Configure real stations and publishers online.")
