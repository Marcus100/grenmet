import importlib.util
import os
import warnings
from unittest import mock

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, TestCase

LOGIN_URL = "/accounts/login/"
SETTINGS_FILE = os.path.join(settings.BASE_DIR, "tempestas_api", "settings.py")


def load_settings(**env):
    """Run the real settings file as a fresh module with the environment
    patched. SURFACE_SECURE_COOKIES and SURFACE_HSTS_SECONDS are removed first,
    so only the values passed here are set. The cached module and
    django.conf.settings are untouched."""
    with mock.patch.dict(os.environ, env):
        for name in ("SURFACE_SECURE_COOKIES", "SURFACE_HSTS_SECONDS"):
            if name not in env:
                os.environ.pop(name, None)
        spec = importlib.util.spec_from_file_location("surface_settings_probe", SETTINGS_FILE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    return module


class SecureCookieSettingTests(SimpleTestCase):
    """#904: Secure cookies are the default; only an explicit false turns them off."""

    def assert_secure(self, module, value):
        self.assertTrue(module.SESSION_COOKIE_SECURE, repr(value))
        self.assertTrue(module.CSRF_COOKIE_SECURE, repr(value))

    def test_unset_is_secure(self):
        module = load_settings()
        self.assert_secure(module, None)

    def test_explicit_false_values_turn_it_off(self):
        for value in ("0", "false", "False", "FALSE", "no", "No", "off", "OFF", " false "):
            module = load_settings(SURFACE_SECURE_COOKIES=value)
            self.assertFalse(module.SESSION_COOKIE_SECURE, repr(value))
            self.assertFalse(module.CSRF_COOKIE_SECURE, repr(value))

    def test_true_values_are_secure_without_a_warning(self):
        for value in ("1", "true", "True", "yes", "on"):
            with warnings.catch_warnings():
                warnings.simplefilter("error")
                module = load_settings(SURFACE_SECURE_COOKIES=value)
            self.assert_secure(module, value)

    def test_empty_and_unrecognised_values_stay_secure_and_warn(self):
        for value in ("", "   ", "ture", "flase", "disabled", "2", "n"):
            with self.assertWarns(RuntimeWarning):
                module = load_settings(SURFACE_SECURE_COOKIES=value)
            self.assert_secure(module, value)

    def test_the_running_configuration_is_secure(self):
        # The test environment does not set the variable.
        self.assertTrue(settings.SESSION_COOKIE_SECURE)
        self.assertTrue(settings.CSRF_COOKIE_SECURE)


class HstsSettingTests(SimpleTestCase):
    def test_default_is_one_hour_for_this_host_only(self):
        module = load_settings()
        self.assertEqual(module.SECURE_HSTS_SECONDS, 3600)
        self.assertFalse(module.SECURE_HSTS_INCLUDE_SUBDOMAINS)
        self.assertFalse(module.SECURE_HSTS_PRELOAD)

    def test_configured_value_is_used(self):
        for value, expected in (("604800", 604800), ("31536000", 31536000), ("0", 0), (" 60 ", 60)):
            module = load_settings(SURFACE_HSTS_SECONDS=value)
            self.assertEqual(module.SECURE_HSTS_SECONDS, expected, value)

    def test_negative_or_malformed_values_stop_startup(self):
        for value in ("-1", "-3600", "", "one hour", "3600s", "1.5"):
            with self.assertRaisesMessage(ImproperlyConfigured, "SURFACE_HSTS_SECONDS"):
                load_settings(SURFACE_HSTS_SECONDS=value)

    def test_running_value_matches_the_environment(self):
        configured = os.environ.get("SURFACE_HSTS_SECONDS", "3600")
        self.assertEqual(settings.SECURE_HSTS_SECONDS, int(configured))

    def test_proxy_header_marks_requests_secure(self):
        self.assertEqual(settings.SECURE_PROXY_SSL_HEADER, ("HTTP_X_FORWARDED_PROTO", "https"))


class HttpsResponseTests(TestCase):
    def test_hsts_header_on_https_through_the_proxy(self):
        response = self.client.get(LOGIN_URL, HTTP_X_FORWARDED_PROTO="https")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Strict-Transport-Security"], f"max-age={settings.SECURE_HSTS_SECONDS}")

    def test_no_hsts_header_on_plain_http(self):
        response = self.client.get(LOGIN_URL)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("Strict-Transport-Security", response)

    def test_csrf_cookie_is_secure(self):
        response = self.client.get(LOGIN_URL, secure=True)
        self.assertTrue(response.cookies["csrftoken"]["secure"])

    def test_sign_in_session_cookie_is_secure(self):
        get_user_model().objects.create_user("secure-cookie-user", password="correct-horse-1")
        response = self.client.post(
            LOGIN_URL,
            {"username": "secure-cookie-user", "password": "correct-horse-1"},
            secure=True,
        )
        self.assertEqual(response.status_code, 302)
        cookie = response.cookies["sessionid"]
        self.assertTrue(cookie["secure"])
        self.assertTrue(cookie["httponly"])
