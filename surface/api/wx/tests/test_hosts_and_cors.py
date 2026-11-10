import importlib.util
import os
from unittest import mock

from django.conf import settings
from django.test import SimpleTestCase, TestCase, override_settings

LOGIN_URL = "/accounts/login/"
SETTINGS_FILE = os.path.join(settings.BASE_DIR, "tempestas_api", "settings.py")
SURFACE_HOST = "surface.barrels.gd"
SURFACE_ORIGIN = f"https://{SURFACE_HOST}"


def load_settings(**env):
    """Run the real settings file as a fresh module with SURFACE_ALLOWED_HOSTS
    and SURFACE_CORS_ALLOWED_ORIGINS set only from the values passed here."""
    with mock.patch.dict(os.environ, env):
        for name in ("SURFACE_ALLOWED_HOSTS", "SURFACE_CORS_ALLOWED_ORIGINS"):
            if name not in env:
                os.environ.pop(name, None)
        spec = importlib.util.spec_from_file_location("surface_hosts_probe", SETTINGS_FILE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    return module


class HostAndCorsSettingTests(SimpleTestCase):
    """#946, #947: hosts and CORS origins come from the environment."""

    def test_default_hosts_are_local_only(self):
        self.assertEqual(load_settings().ALLOWED_HOSTS, ["localhost", "127.0.0.1"])

    def test_hosts_from_the_environment(self):
        module = load_settings(SURFACE_ALLOWED_HOSTS=f" {SURFACE_HOST} , localhost,,127.0.0.1 ")
        self.assertEqual(module.ALLOWED_HOSTS, [SURFACE_HOST, "localhost", "127.0.0.1"])

    def test_forwarded_host_is_ignored(self):
        self.assertFalse(load_settings().USE_X_FORWARDED_HOST)

    def test_no_cross_origin_access_by_default(self):
        module = load_settings()
        self.assertFalse(module.CORS_ALLOW_ALL_ORIGINS)
        self.assertEqual(module.CORS_ALLOWED_ORIGINS, [])

    def test_cors_origins_from_the_environment(self):
        module = load_settings(SURFACE_CORS_ALLOWED_ORIGINS=SURFACE_ORIGIN)
        self.assertFalse(module.CORS_ALLOW_ALL_ORIGINS)
        self.assertEqual(module.CORS_ALLOWED_ORIGINS, [SURFACE_ORIGIN])


@override_settings(ALLOWED_HOSTS=[SURFACE_HOST, "localhost", "127.0.0.1"])
class HostHeaderTests(TestCase):
    def test_listed_host_is_served(self):
        response = self.client.get(LOGIN_URL, HTTP_HOST=SURFACE_HOST)
        self.assertEqual(response.status_code, 200)

    def test_unlisted_host_is_refused(self):
        response = self.client.get(LOGIN_URL, HTTP_HOST="evil.example.com")
        self.assertEqual(response.status_code, 400)

    def test_forwarded_host_cannot_replace_the_host(self):
        response = self.client.get(
            LOGIN_URL,
            HTTP_HOST=SURFACE_HOST,
            HTTP_X_FORWARDED_HOST="evil.example.com",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.wsgi_request.get_host(), SURFACE_HOST)


@override_settings(
    ALLOWED_HOSTS=[SURFACE_HOST],
    CORS_ALLOW_ALL_ORIGINS=False,
    CORS_ALLOWED_ORIGINS=[SURFACE_ORIGIN],
    CORS_ALLOW_CREDENTIALS=True,
)
class CorsResponseTests(TestCase):
    def get(self, origin):
        return self.client.get(LOGIN_URL, HTTP_HOST=SURFACE_HOST, HTTP_ORIGIN=origin)

    def test_listed_origin_gets_credentials(self):
        response = self.get(SURFACE_ORIGIN)
        self.assertEqual(response["Access-Control-Allow-Origin"], SURFACE_ORIGIN)
        self.assertEqual(response["Access-Control-Allow-Credentials"], "true")

    def test_unlisted_origin_gets_no_cors_headers(self):
        response = self.get("https://evil.example.com")
        self.assertNotIn("Access-Control-Allow-Origin", response)
        self.assertNotIn("Access-Control-Allow-Credentials", response)
