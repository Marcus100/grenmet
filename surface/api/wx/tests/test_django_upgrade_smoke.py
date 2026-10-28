from io import StringIO

import django
from django.apps import apps
from django.core.management import call_command
from django.db.migrations.autodetector import MigrationAutodetector
from django.db.migrations.loader import MigrationLoader
from django.db.migrations.state import ProjectState
from django.test import SimpleTestCase


class DjangoUpgradeSmokeTests(SimpleTestCase):
    """
    Guards the Django upgrade path. None of these tests need a database:
    `check` skips database checks unless asked, and the migration test
    compares model state with the migration files on disk.
    """

    def test_django_is_the_4_2_series(self):
        # Step 2 of #722 (Django 5.2) must update this expected version, not
        # delete the test.
        self.assertEqual(django.VERSION[:2], (4, 2))

    def test_system_check_passes(self):
        call_command("check", stdout=StringIO(), stderr=StringIO())

    def test_no_model_changes_without_a_migration(self):
        # Same comparison `makemigrations --check` makes, without its
        # migration-history query, so no database connection is opened.
        loader = MigrationLoader(None, ignore_no_migrations=True)
        autodetector = MigrationAutodetector(
            loader.project_state(),
            ProjectState.from_apps(apps),
        )
        changes = autodetector.changes(graph=loader.graph)
        self.assertEqual(
            changes,
            {},
            "Models differ from migrations: run makemigrations and commit the result",
        )
