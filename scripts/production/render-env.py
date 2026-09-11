#!/usr/bin/env python3
"""Create a private runner-only .env.local. Never executes dotenv content."""
import os
import json
import ipaddress
import re
import sys
from pathlib import Path
from urllib.parse import quote, urlparse


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


def render(config, environment):
    required = ["POSTGRES_USER", "POSTGRES_PASSWORD", "FASTAPI_DB_PASSWORD", "SECRET_KEY", "FIRST_SUPERUSER", "FIRST_SUPERUSER_PASSWORD", "SESSION_COOKIE_NAME", "RESEND_API_KEY", "EMAIL", "USERNAME", "HASHED_PASSWORD", "PAYLOAD_SECRET"]
    required += [f"{domain}_DB_PASSWORD" for domain in ["WXWATCH", "WXPRODUCTS", "TRANSPORT", "JANITORIAL", "CMS"]]
    values = {}
    for key in required:
        if not environment.get(key):
            raise ValueError(f"{key} is required")
        values[key] = environment[key]
    if len(values["PAYLOAD_SECRET"]) < 32:
        raise ValueError("PAYLOAD_SECRET must contain at least 32 characters")
    for key in ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SENTRY_DSN", "STORAGE_ENDPOINT_URL", "STORAGE_REGION", "STORAGE_BUCKET", "STORAGE_ACCESS_KEY_ID", "STORAGE_SECRET_ACCESS_KEY", "STORAGE_PUBLIC_BASE_URL", "WXPRODUCTS_API_URL", 'BILLING_STRIPE_SECRET_KEY', 'BILLING_STRIPE_WEBHOOK_SECRET', 'BILLING_STRIPE_PRICE_ID', 'BILLING_CHECKOUT_SUCCESS_URL', 'BILLING_CHECKOUT_CANCEL_URL', 'RESEND_WEBHOOK_SECRET', 'EMAIL_RENDER_SECRET', 'NEXT_PUBLIC_POSTHOG_KEY', 'NEXT_PUBLIC_POSTHOG_HOST', 'CAP_SIGNING_CERT', 'CAP_SIGNING_KEY', 'CAP_SIGNING_KEY_REF']:
        values[key] = environment.get(key, "")
    for domain in ["WXWATCH", "WXPRODUCTS", "TRANSPORT", "JANITORIAL", "CMS"]:
        user = quote(config[f"{domain}_DB_USER"], safe="")
        password = quote(values[f"{domain}_DB_PASSWORD"], safe="")
        name = quote(config[f"{domain}_DB_NAME"], safe="")
        key = "CMS_DATABASE_URL" if domain == "CMS" else f"{domain}_DB_URL"
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
