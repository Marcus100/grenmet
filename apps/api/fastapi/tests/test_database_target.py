"""Run without DB bootstrap: python -m unittest tests.test_database_target."""

import unittest

from tests.database_target import (
    configure_database,
    database_target,
    require_owned_database,
)


class DatabaseTargetTests(unittest.TestCase):
    def test_runs_and_workers_are_distinct(self):
        names = {
            database_target("app", run, worker)
            for run in ("a" * 32, "b" * 32)
            for worker in ("", "gw0", "gw1")
        }
        self.assertEqual(len(names), 6)
        self.assertTrue(all(len(name) <= 63 for name in names))

    def test_worker_inherits_base_without_appending_twice(self):
        env = {"POSTGRES_DB": "app"}
        controller = configure_database(env)
        worker_env = {**env, "PYTEST_XDIST_WORKER": "gw0"}
        worker = configure_database(worker_env)
        self.assertEqual(worker, controller + "_gw0")
        self.assertEqual(configure_database(worker_env), worker)
        require_owned_database(worker, worker_env)
        with self.assertRaises(RuntimeError):
            require_owned_database(controller, worker_env)

    def test_rejects_other_targets(self):
        env = {"POSTGRES_DB": "app"}
        owned = configure_database(env)
        for target in ("app", "app_prod", "app_staging", "app_test", owned + "_backup"):
            with self.subTest(target=target), self.assertRaises(RuntimeError):
                require_owned_database(target, env)

    def test_rejects_unsafe_identifiers(self):
        for base, run, worker in (
            ("bad-name", "a" * 32, ""),
            ("app", "invalid", ""),
            ("app", "a" * 32, "gw0_prod"),
        ):
            with (
                self.subTest(base=base, run=run, worker=worker),
                self.assertRaises(ValueError),
            ):
                database_target(base, run, worker)
