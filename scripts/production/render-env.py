#!/usr/bin/env python3
"""Create a private runner-only .env.local. Never executes dotenv content."""
import base64
import binascii
import importlib.util
import ipaddress
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import quote, urlparse


def _sibling(name):
    """Load scripts/production/<name>.py, wherever this script is run or loaded from."""
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().with_name(f"{name}.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


load_cloudflare_ranges = _sibling("cloudflare_ranges").load


def read_config(path):
    result = {}
    for line in Path(path).read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            raise ValueError("Invalid non-secret configuration entry")
        result[key] = value
    return result


# Secrets the deployment cannot start without; the CI preflight reads this list.
REQUIRED_SECRETS = ["POSTGRES_USER", "POSTGRES_PASSWORD", "FASTAPI_DB_PASSWORD", "SECRET_KEY", "FIRST_SUPERUSER", "FIRST_SUPERUSER_PASSWORD", "RESEND_API_KEY", "EMAIL", "USERNAME", "HASHED_PASSWORD", "PAYLOAD_SECRET", "GAA_ADMIN_SSO_CLIENT_SECRET", "CMS_SSO_CLIENT_SECRET", "TRUSTED_WEB_SECRET"]
REQUIRED_SECRETS += [f"{domain}_DB_PASSWORD" for domain in ["WXWATCH", "WXPRODUCTS", "EREGISTER", "TRANSPORT", "JANITORIAL", "CMS"]]
# Traefik basic-auth user lists (htpasswd bcrypt lines, comma-separated) that only
# staging uses: the whole-site gate on staging web hosts, and Adminer. Production
# never receives them, so a staging credential cannot open anything there.
STAGING_ONLY_SECRETS = ["STAGING_BASIC_AUTH_USERS", "ADMINER_BASIC_AUTH_USERS"]
HTPASSWD_BCRYPT = re.compile(r"[^\s:,$]+:\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}")


def fernet_keys(environment, name):
    """A JSON array of Fernet keys (current key first). The error never echoes values."""
    try:
        keys = json.loads(environment.get(name, "") or "[]")
        if not isinstance(keys, list) or any(not isinstance(key, str) for key in keys):
            raise ValueError
        if any(len(base64.b64decode(key.encode("ascii"), altchars=b"-_", validate=True)) != 32 for key in keys):
            raise ValueError
    except (ValueError, UnicodeError, binascii.Error):
        raise ValueError(f"{name} must be a JSON array of Fernet keys") from None
    return keys


# Edge settings for CLOUDFLARE_PROXY_ENABLED (docs/operations/cloudflare-proxy.md).
# Off is Traefik's own default (forwarded headers trusted from nobody) and the
# existing TLS challenge, so an unset switch changes nothing. On, all four move
# together: Traefik trusts forwarded headers only from Cloudflare's ranges, the
# per-client cap and the visitor address skip Cloudflare's hop (2 = Cloudflare
# then Traefik), and certificates renew over HTTP because Cloudflare terminates
# TLS in front of the origin.
#
# On also turns on the origin gate: a connection from a Cloudflare address
# without the zone's secret header (CLOUDFLARE_ORIGIN_SECRET, set on every
# request by a Cloudflare Transform Rule, scripts/production/cloudflare-origin-header.py)
# is refused with 403 before any router sees it. Cloudflare's addresses are
# shared by every Cloudflare customer, so without this anyone's Worker could
# connect to the droplet and choose its own X-Forwarded-For. Direct connections
# from elsewhere are not matched: Traefik never trusts their forwarded headers.
# CLOUDFLARE_ORIGIN_SECRET_PREVIOUS is also accepted while a rotation is applied.
ORIGIN_HEADER = "X-Barrels-Origin"
# Off: a rule no request can match (no TCP client has the broadcast address).
ORIGIN_GATE_OFF = "ClientIP(`255.255.255.255/32`)"
ORIGIN_SECRET = re.compile(r"[A-Za-z0-9_-]{32,128}")
EDGE_OFF = {
    "VISITOR_IP_PROXY_HOPS": "1",
    "TRAEFIK_FORWARDED_HEADERS": "insecure=false",
    "TRAEFIK_CLIENT_IP_DEPTH": "0",
    "TRAEFIK_ACME_CHALLENGE": "tlschallenge=true",
    "TRAEFIK_ORIGIN_GATE_RULE": ORIGIN_GATE_OFF,
}


def origin_gate_rule(ranges, secrets):
    sources = " || ".join(f"ClientIP(`{network}`)" for network in ranges)
    accepted = " && ".join(f"!Header(`{ORIGIN_HEADER}`, `{secret}`)" for secret in secrets)
    return f"({sources}) && {accepted}"


def origin_secrets(environment, values):
    """The accepted origin secrets (current first). Errors never echo values."""
    current = environment.get("CLOUDFLARE_ORIGIN_SECRET", "")
    previous = environment.get("CLOUDFLARE_ORIGIN_SECRET_PREVIOUS", "")
    if not current:
        raise ValueError("CLOUDFLARE_ORIGIN_SECRET is required when CLOUDFLARE_PROXY_ENABLED is true")
    for name, value in (("CLOUDFLARE_ORIGIN_SECRET", current), ("CLOUDFLARE_ORIGIN_SECRET_PREVIOUS", previous)):
        if value and not ORIGIN_SECRET.fullmatch(value):
            raise ValueError(f"{name} must be 32 to 128 letters, digits, '-' or '_' (openssl rand -hex 32)")
    if previous == current:
        previous = ""
    others = {
        value
        for key, value in values.items()
        if value and (key.endswith(("_SECRET", "_PASSWORD", "_KEY", "_TOKEN")) or key == "EMAIL_HASH_PEPPER")
    }
    if current in others or previous in others:
        raise ValueError("CLOUDFLARE_ORIGIN_SECRET must differ from every other deployment secret")
    return [current, previous] if previous else [current]


def cloudflare_edge(environment, values):
    switch = environment.get("CLOUDFLARE_PROXY_ENABLED", "")
    if switch not in {"", "true", "false"}:
        raise ValueError("CLOUDFLARE_PROXY_ENABLED must be true or false")
    if switch != "true":
        return {"CLOUDFLARE_PROXY_ENABLED": "false", **EDGE_OFF}
    ranges = load_cloudflare_ranges()
    return {
        "CLOUDFLARE_PROXY_ENABLED": "true",
        "VISITOR_IP_PROXY_HOPS": "2",
        "TRAEFIK_FORWARDED_HEADERS": "trustedIPs=" + ",".join(ranges),
        "TRAEFIK_CLIENT_IP_DEPTH": "1",
        "TRAEFIK_ACME_CHALLENGE": "httpchallenge.entrypoint=web",
        "TRAEFIK_ORIGIN_GATE_RULE": origin_gate_rule(ranges, origin_secrets(environment, values)),
    }


def render(config, environment):
    required = REQUIRED_SECRETS
    values = {}
    for key in required:
        if not environment.get(key):
            raise ValueError(f"{key} is required")
        values[key] = environment[key]
    if len(values["PAYLOAD_SECRET"]) < 32:
        raise ValueError("PAYLOAD_SECRET must contain at least 32 characters")
    # Shared by the API and every web host that forwards the visitor address; the
    # API ignores a shorter value, which silently pools all visitors in one bucket.
    if len(values["TRUSTED_WEB_SECRET"]) < 32:
        raise ValueError("TRUSTED_WEB_SECRET must contain at least 32 characters")
    for key in ['WXWATCH_INGEST_TOKEN', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SENTRY_DSN', 'STORAGE_ENDPOINT_URL', 'STORAGE_REGION', 'STORAGE_BUCKET', 'STORAGE_ACCESS_KEY_ID', 'STORAGE_SECRET_ACCESS_KEY', 'STORAGE_PUBLIC_BASE_URL', 'BILLING_STRIPE_SECRET_KEY', 'BILLING_STRIPE_WEBHOOK_SECRET', 'BILLING_STRIPE_PRICE_ID', 'BILLING_CHECKOUT_SUCCESS_URL', 'BILLING_CHECKOUT_CANCEL_URL', 'RESEND_WEBHOOK_SECRET', 'EMAIL_RENDER_SECRET', 'NEXT_PUBLIC_POSTHOG_KEY', 'NEXT_PUBLIC_POSTHOG_HOST', 'CAP_SIGNING_CERT', 'CAP_SIGNING_KEY', 'CAP_SIGNING_KEY_REF', 'EVENTS_SSO_CLIENT_SECRET', 'WEATHER_SSO_CLIENT_SECRET', 'MBIA_SSO_CLIENT_SECRET', 'SIGNAL_SSO_CLIENT_SECRET', 'DOCS_SSO_CLIENT_SECRET', 'ELECTIONS_SSO_CLIENT_SECRET', 'MBIA_CONTACT_RECIPIENT', 'BARRELS_CONTACT_RECIPIENT', 'GMS_DATA_REQUEST_RECIPIENT', 'TURNSTILE_ENABLED', 'TURNSTILE_SECRET_KEY', 'EMAIL_HASH_PEPPER', 'EREGISTER_OBS_RECIPIENTS', 'EREGISTER_SEND_REQUIRE_ACCEPTED', 'WIS2BOX_S3_ENDPOINT_URL', 'WIS2BOX_S3_BUCKET', 'WIS2BOX_TOPIC_HIERARCHY', 'FLIGHTS_OPENSKY_ENABLED', 'WIS2BOX_S3_ACCESS_KEY_ID', 'WIS2BOX_S3_SECRET_ACCESS_KEY', 'OPENSKY_CLIENT_ID', 'OPENSKY_CLIENT_SECRET', 'COPERNICUSMARINE_SERVICE_USERNAME', 'COPERNICUSMARINE_SERVICE_PASSWORD', 'CDSAPI_URL', 'CDSAPI_KEY', 'WEBPUSH_VAPID_PUBLIC_KEY', 'WEBPUSH_VAPID_PRIVATE_KEY', 'WEBPUSH_CONTACT', 'GMSDASH_SSO_CLIENT_SECRET', 'BOOKINGS_SSO_CLIENT_SECRET', 'BARRELS_ADMIN_SSO_CLIENT_SECRET', 'CAP_SSO_CLIENT_SECRET', 'PAYMENTS_STRIPE_SECRET_KEY', 'PAYMENTS_STRIPE_WEBHOOK_SECRET', 'PAYMENTS_STRIPE_SUCCESS_URL', 'PAYMENTS_STRIPE_CANCEL_URL', 'META_PAGE_ID', 'META_INSTAGRAM_ACCOUNT_ID', 'META_PAGE_ACCESS_TOKEN', 'SOCIAL_LINK_HOSTS', 'SOCIAL_IMAGE_HOSTS', 'CMS_DISTRIBUTION_SECRET']:
        values[key] = environment.get(key, "")
    # Single sign-on (ADR-0017): staff apps can't sign in without theirs;
    # Events stays off until its secret is set.
    for key in ["GAA_ADMIN_SSO_CLIENT_SECRET", "CMS_SSO_CLIENT_SECRET", "EVENTS_SSO_CLIENT_SECRET", "WEATHER_SSO_CLIENT_SECRET", "MBIA_SSO_CLIENT_SECRET", "SIGNAL_SSO_CLIENT_SECRET", "DOCS_SSO_CLIENT_SECRET", "ELECTIONS_SSO_CLIENT_SECRET", "GMSDASH_SSO_CLIENT_SECRET", "BOOKINGS_SSO_CLIENT_SECRET", "BARRELS_ADMIN_SSO_CLIENT_SECRET", "CAP_SSO_CLIENT_SECRET"]:
        if values[key] and len(values[key]) < 32:
            raise ValueError(f"{key} must contain at least 32 characters")
    # One secret per app: a leaked or shared value must not sign in to another app.
    set_secrets = [key for key in values if key.endswith("_SSO_CLIENT_SECRET") and values[key]]
    if len({values[key] for key in set_secrets}) != len(set_secrets):
        raise ValueError("Each *_SSO_CLIENT_SECRET must be different per app")
    if values["TRUSTED_WEB_SECRET"] in {values[key] for key in set_secrets} | {values["SECRET_KEY"]}:
        raise ValueError("TRUSTED_WEB_SECRET must differ from SECRET_KEY and every *_SSO_CLIENT_SECRET")
    mode = environment.get("AUTH_PRIVILEGED_MFA_MODE", "") or "disabled"
    if mode not in {"disabled", "enforce"}:
        raise ValueError("AUTH_PRIVILEGED_MFA_MODE must be disabled or enforce")
    keys = fernet_keys(environment, "AUTH_TOTP_ENCRYPTION_KEYS")
    if mode == "enforce" and not keys:
        raise ValueError("AUTH_TOTP_ENCRYPTION_KEYS is required for enforced privileged MFA")
    values["AUTH_PRIVILEGED_MFA_MODE"] = mode
    values["AUTH_TOTP_ENCRYPTION_KEYS"] = json.dumps(keys, separators=(",", ":"))
    # Secrets organisations store on the platform (public-site Turnstile secrets,
    # venue check-in secrets, webhook signing secrets). Dedicated keys, never the
    # TOTP ones. Empty is allowed: saving such a secret then answers 503.
    values["ORG_SECRET_ENCRYPTION_KEYS"] = json.dumps(
        fernet_keys(environment, "ORG_SECRET_ENCRYPTION_KEYS"), separators=(",", ":")
    )
    # The payments core runs in Stripe TEST mode only (ADR-0027): a live key must
    # never reach a deployment until the owner approves a live rail.
    stripe_key = values["PAYMENTS_STRIPE_SECRET_KEY"]
    if stripe_key and not stripe_key.startswith("sk_test_"):
        raise ValueError("PAYMENTS_STRIPE_SECRET_KEY must be a Stripe test key (sk_test_...)")
    # Half-set Stripe settings make Checkout fail at the first paid order, so the
    # four settings the adapter needs are set together or not at all, and the
    # return pages must be HTTPS.
    stripe_names = [
        "PAYMENTS_STRIPE_SECRET_KEY",
        "PAYMENTS_STRIPE_WEBHOOK_SECRET",
        "PAYMENTS_STRIPE_SUCCESS_URL",
        "PAYMENTS_STRIPE_CANCEL_URL",
    ]
    stripe_set = [name for name in stripe_names if values[name]]
    if stripe_set and len(stripe_set) != len(stripe_names):
        missing = ", ".join(name for name in stripe_names if not values[name])
        raise ValueError(f"PAYMENTS_STRIPE_* settings must be set together; missing: {missing}")
    for name in ("PAYMENTS_STRIPE_SUCCESS_URL", "PAYMENTS_STRIPE_CANCEL_URL"):
        if values[name] and not values[name].startswith("https://"):
            raise ValueError(f"{name} must be an https:// URL")
    # Shared by the API and the CMS (X-CMS-Secret). Both refuse a shorter value at start-up,
    # so the deploy preflight refuses it first, without echoing the value.
    if values["CMS_DISTRIBUTION_SECRET"] and len(values["CMS_DISTRIBUTION_SECRET"]) < 32:
        raise ValueError("CMS_DISTRIBUTION_SECRET must contain at least 32 characters")
    # Meta account ids become URL path segments in the worker, and the worker
    # refuses to start on a malformed one, so the deploy preflight refuses it first.
    for name in ("META_PAGE_ID", "META_INSTAGRAM_ACCOUNT_ID"):
        if values[name] and not re.fullmatch(r"[0-9]{1,32}", values[name]):
            raise ValueError(f"{name} must contain numbers only")
    telemetry_enabled = environment.get("TELEMETRY_ENABLED", "")
    if telemetry_enabled not in {"", "true", "false"}:
        raise ValueError("TELEMETRY_ENABLED must be true or false")
    values["TELEMETRY_ENABLED"] = "true" if telemetry_enabled == "true" else "false"
    values.update(cloudflare_edge(environment, values))
    values["TELEMETRY_WORKER_HEARTBEAT_URL"] = environment.get("TELEMETRY_WORKER_HEARTBEAT_URL", "")
    heartbeat = values["TELEMETRY_WORKER_HEARTBEAT_URL"]
    if heartbeat:
        try:
            url = urlparse(heartbeat)
            port = url.port
        except ValueError:
            raise ValueError("TELEMETRY_WORKER_HEARTBEAT_URL must be a Better Stack heartbeat endpoint") from None
        if (
            url.scheme != "https"
            or url.hostname not in {"uptime.betterstack.com", "incidents.betterstack.com"}
            or not url.path.startswith("/api/v1/heartbeat/")
            or not url.path.removeprefix("/api/v1/heartbeat/")
            or url.username or url.password or url.query or url.fragment
            or port not in {None, 443}
        ):
            raise ValueError("TELEMETRY_WORKER_HEARTBEAT_URL must be a Better Stack heartbeat endpoint")
    catalogue_path = Path(__file__).resolve().parents[2] / "packages/ui/src/lib/service-catalogue.json"
    catalogue = json.loads(catalogue_path.read_text())
    for service in catalogue["services"]:
        app = service["id"].upper().replace("-", "_")
        entry = service["environments"].get(config.get("ENVIRONMENT"), {})
        sentry = entry.get("sentry", {})
        secret_ref = sentry.get("secretRef")
        if secret_ref and (service["id"] not in {"elections", "auth", "gaa-admin", "docs", "gms", "cap", "gmsdash", "signal", "mbia", "events", "bookings", "cms", "api", "worker"} or config.get("ENVIRONMENT") not in {"staging", "production"} or secret_ref != f"SENTRY_DSN_{config['ENVIRONMENT'].upper()}" or sentry.get("project") != f"grenmet-{config['ENVIRONMENT']}" or sentry.get("dsn")):
            raise ValueError("Invalid shared Sentry routing")
        values[f"SENTRY_DSN_{app}"] = environment.get(secret_ref, "") if secret_ref else sentry.get("dsn") or ""
    for domain in ["WXWATCH", "WXPRODUCTS", "EREGISTER", "TRANSPORT", "JANITORIAL", "CMS"]:
        user = quote(config[f"{domain}_DB_USER"], safe="")
        password = quote(values[f"{domain}_DB_PASSWORD"], safe="")
        name = quote(config[f"{domain}_DB_NAME"], safe="")
        key = (
            "CMS_DATABASE_URL"
            if domain == "CMS"
            else "EREGISTER_DATABASE_URL"
            if domain == "EREGISTER"
            else f"{domain}_DB_URL"
        )
        values[key] = f"postgresql://{user}:{password}@db:5432/{name}"
    runtime_user = config.get("FASTAPI_DB_USER", "")
    if not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", runtime_user) or runtime_user in {values["POSTGRES_USER"], "postgres", "app", "gms_cms", "wxwatch", "wxproducts", "transport", "janitorial"}:
        raise ValueError("FASTAPI_DB_USER must be a dedicated non-administrator role")
    image = environment.get("CORE_POSTGRES_IMAGE", "")
    if not re.fullmatch(r"(?:postgres:17|postgis/postgis:17-3\.5)@sha256:[0-9a-f]{64}", image):
        raise ValueError("CORE_POSTGRES_IMAGE must pin an approved PostgreSQL 17 image digest")
    if image.startswith("postgis/") and environment.get("POSTGIS_RESTORE_VERIFIED") != "true":
        raise ValueError("PostGIS rollout requires an operator-recorded isolated restore verification")
    redis_image = environment.get("CORE_REDIS_IMAGE", "")
    if not re.fullmatch(r"redis:7-alpine@sha256:[0-9a-f]{64}", redis_image):
        raise ValueError("CORE_REDIS_IMAGE must pin an approved Redis 7 image digest")
    values["CORE_REDIS_IMAGE"] = redis_image
    address = ipaddress.ip_address(environment.get("CORE_PRIVATE_IP", ""))
    if not any(address in ipaddress.ip_network(network) for network in ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]):
        raise ValueError("CORE_PRIVATE_IP must be an RFC1918 private address")
    values.update(CORE_POSTGRES_IMAGE=image, CORE_PRIVATE_IP=str(address))
    tag = environment.get("DEPLOY_IMAGE_TAG", "")
    if not re.fullmatch(r"sha-[0-9a-f]{40}", tag):
        raise ValueError("DEPLOY_IMAGE_TAG must be sha- followed by a full commit SHA")
    deployment_environment = config.get("ENVIRONMENT")
    if deployment_environment not in {"staging", "production"}:
        raise ValueError("ENVIRONMENT must be staging or production")
    for key in STAGING_ONLY_SECRETS:
        users = environment.get(key, "") if deployment_environment == "staging" else ""
        if deployment_environment == "staging" and not users:
            raise ValueError(f"{key} is required")
        if users and not all(HTPASSWD_BCRYPT.fullmatch(entry) for entry in users.split(",")):
            raise ValueError(f"{key} must be comma-separated htpasswd bcrypt entries (htpasswd -nbB)")
        values[key] = users
    notification_domains = environment.get("NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS", "").strip()
    if not notification_domains and deployment_environment == "staging":
        notification_domains = "barrels.gd"
    domains = [domain.strip().lower() for domain in notification_domains.split(",")]
    if notification_domains and any(
        not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+", domain)
        for domain in domains
    ):
        raise ValueError("NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS must contain comma-separated domain names")
    values["NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS"] = ",".join(domains)
    values["SENTRY_RELEASE"] = tag.removeprefix("sha-")
    values.update(TAG=f"{deployment_environment}-{tag}", WEB_TAG=f"{deployment_environment}-{tag}")
    for keys in [
        ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
        ["CAP_SIGNING_CERT", "CAP_SIGNING_KEY"],
        ["STORAGE_BUCKET", "STORAGE_ACCESS_KEY_ID", "STORAGE_SECRET_ACCESS_KEY"],
        ["BILLING_STRIPE_SECRET_KEY", "BILLING_STRIPE_WEBHOOK_SECRET", "BILLING_STRIPE_PRICE_ID", "BILLING_CHECKOUT_SUCCESS_URL", "BILLING_CHECKOUT_CANCEL_URL"],
    ]:
        if any(values.get(key) for key in keys) and not all(values.get(key) for key in keys):
            raise ValueError("Incomplete integration configuration: " + ", ".join(keys))
    stripe_key = values.get("BILLING_STRIPE_SECRET_KEY", "")
    if stripe_key:
        prefix = "sk_test_" if deployment_environment == "staging" else "sk_live_"
        if not stripe_key.startswith(prefix):
            raise ValueError("BILLING_STRIPE_SECRET_KEY must match the deployment environment")
        for key in ["BILLING_CHECKOUT_SUCCESS_URL", "BILLING_CHECKOUT_CANCEL_URL"]:
            url = urlparse(values[key])
            if url.scheme != "https" or not url.hostname or url.username or url.password:
                raise ValueError(key + " must be an HTTPS return URL")
    for key in ["SENTRY_DSN", "NEXT_PUBLIC_POSTHOG_HOST", "STORAGE_ENDPOINT_URL", "STORAGE_PUBLIC_BASE_URL"]:
        if values.get(key):
            url = urlparse(values[key])
            if url.scheme != "https" or not url.hostname or url.hostname in {"localhost", "127.0.0.1", "::1"}:
                raise ValueError(key + " must use a deployed HTTPS endpoint")
    values["EMAIL_RENDER_URL"] = "http://web-auth:3000" if values["EMAIL_RENDER_SECRET"] else ""
    lines = []
    for key, value in values.items():
        if any(char in value for char in ("\r\x00" if key in {"CAP_SIGNING_CERT", "CAP_SIGNING_KEY"} else "\r\n\x00")):
            raise ValueError(f"{key} must be a single line")
        # JSON string escaping matches Compose double-quoted dotenv syntax.
        # $$ prevents Compose interpolation of literal dollars in credentials.
        lines.append(f"{key}=" + json.dumps(value.replace("$", "$$"), ensure_ascii=False))
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    try:
        content = render(read_config(sys.argv[1]), os.environ)
        destination = Path(sys.argv[2])
        destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as output:
            output.write(content)
    except (ValueError, KeyError, OSError) as error:
        # Messages contain variable names or paths only, never environment values.
        print(f"Deployment configuration rejected: {error}", file=sys.stderr)
        sys.exit(1)
