"""Regression checks for the audit's path matching boundaries."""

import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "coverage_audit", Path(__file__).with_name("api-ui-coverage.py")
)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class PathMatchingTests(unittest.TestCase):
    def test_proxy_and_query(self):
        pattern = audit.path_pattern("/api/v1/wxproducts/observations")
        self.assertIsNotNone(pattern.search('"/_backend/wxproducts/observations?limit=10"'))

    def test_parameter_template(self):
        pattern = audit.path_pattern("/api/v1/items/{id}")
        self.assertIsNotNone(pattern.search('`/api/v1/items/${item.id}`'))

    def test_weather_proxy_alias(self):
        pattern = audit.path_pattern("/api/v1/wxproducts/products/{id}/history")
        self.assertIsNotNone(pattern.search('`/_backend/weather/products/${id}/history`'))

    def test_child_route_is_not_parent_reference(self):
        pattern = audit.path_pattern("/api/v1/items")
        self.assertIsNone(pattern.search('"/api/v1/items/import"'))
        self.assertIsNone(pattern.search('"/api/v1/items-extra"'))

    def test_parameter_does_not_consume_descendant(self):
        pattern = audit.path_pattern("/api/v1/items/{id}")
        self.assertIsNone(pattern.search('"/api/v1/items/123/history"'))


if __name__ == "__main__":
    unittest.main()
