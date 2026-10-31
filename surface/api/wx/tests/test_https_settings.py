import importlib
import os
from unittest import mock

from django.conf import settings
from django.test import SimpleTestCase, TestCase

settings_module = importlib.import_module("tempestas_api.settings")

LOGIN_URL = "/accounts/login/"


class HttpsDefaultsTests(SimpleTestCase):
    """#904: production defaults are Secure cookies and a short HSTS max-age."""

    def test_cookies_are_secure_by_default(self):
        self.assertTrue(settings.SESSION_COOKIE_SECURE)
        self.assertTrue(settings.CSRF_COOKIE_SECURE)

    def test_hsts_starts_at_one_hour_for_this_host_only(self):
        self.assertEqual(settings.SECURE_HSTS_SECONDS, 3600)
        self.assertFalse(settings.SECURE_HSTS_INCLUDE_SUBDOMAINS)
        self.assertFalse(settings.SECURE_HSTS_PRELOAD)

    def test_proxy_header_marks_requests_secure(self):
        self.assertEqual(
            settings.SECURE_PROXY_SSL_HEADER, ("HTTP_X_FORWARDED_PROTO", "https")
        )


class EnvFlagTests(SimpleTestCase):
    def test_plain_http_stacks_can_turn_secure_cookies_off(self):
        for value in ("False", "false", "0", "no", "off", ""):
            with mock.patch.dict(os.environ, {"SURFACE_SECURE_COOKIES": value}):
                self.assertFalse(
                    settings_module._env_flag("SURFACE_SECURE_COOKIES", True), value
                )

    def test_true_values_and_the_default(self):
        for value in ("True", "true", "1", "yes", "on", " TRUE "):
            with mock.patch.dict(os.environ, {"SURFACE_SECURE_COOKIES": value}):
                self.assertTrue(
                    settings_module._env_flag("SURFACE_SECURE_COOKIES", False), value
                )
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertTrue(settings_module._env_flag("SURFACE_SECURE_COOKIES", True))


class HttpsResponseTests(TestCase):
    def test_hsts_header_on_https_through_the_proxy(self):
        response = self.client.get(LOGIN_URL, HTTP_X_FORWARDED_PROTO="https")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Strict-Transport-Security"], "max-age=3600")

    def test_no_hsts_header_on_plain_http(self):
        response = self.client.get(LOGIN_URL)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("Strict-Transport-Security", response)

    def test_csrf_cookie_is_secure(self):
        response = self.client.get(LOGIN_URL, secure=True)
        self.assertTrue(response.cookies["csrftoken"]["secure"])
