import logging
import smtplib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

import httpx
import jwt
import resend
from jinja2 import Template
from jwt.exceptions import InvalidTokenError

from src.auth.config import auth_settings
from src.config import settings
from src.email_config import email_settings

logger = logging.getLogger(__name__)


@dataclass
class EmailData:
    html_content: str
    subject: str


# ── Sending ───────────────────────────────────────────────────────────────────


def send_email(
    *,
    email_to: str,
    subject: str = "",
    html_content: str = "",
) -> None:
    """Send an email via Resend (primary) or SMTP fallback (local dev / Mailpit).

    Resend is used when ``RESEND_API_KEY`` is configured.
    SMTP is the fallback for local development with Mailpit.
    """
    if not email_settings.emails_enabled:
        raise RuntimeError(
            "Email is not configured: set RESEND_API_KEY or SMTP_HOST + EMAILS_FROM_EMAIL"
        )

    from_address = (
        f"{email_settings.EMAILS_FROM_NAME} <{email_settings.EMAILS_FROM_EMAIL}>"
    )

    # ── Resend (production / staging) ──────────────────────────────────────────
    if email_settings.RESEND_API_KEY:
        resend.api_key = email_settings.RESEND_API_KEY
        params: resend.Emails.SendParams = {
            "from": from_address,
            "to": [email_to],
            "subject": subject,
            "html": html_content,
        }
        result = resend.Emails.send(params)
        logger.info("Email sent via Resend to %s (id=%s)", email_to, result.get("id"))
        return

    # ── SMTP fallback (local dev / Mailpit) ────────────────────────────────────
    if not email_settings.SMTP_HOST or not email_settings.SMTP_PORT:
        raise ValueError(
            "No email provider configured: set RESEND_API_KEY or SMTP_HOST"
        )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_address
    msg["To"] = email_to
    msg.attach(MIMEText(html_content, "html"))

    if email_settings.SMTP_SSL:
        server: smtplib.SMTP = smtplib.SMTP_SSL(
            email_settings.SMTP_HOST, email_settings.SMTP_PORT
        )
    else:
        server = smtplib.SMTP(email_settings.SMTP_HOST, email_settings.SMTP_PORT)
        if email_settings.SMTP_TLS:
            server.starttls()

    if (
        email_settings.SMTP_USER
        and email_settings.SMTP_PASSWORD
        and email_settings.SMTP_HOST != "mailcatcher"
    ):
        server.login(email_settings.SMTP_USER, email_settings.SMTP_PASSWORD)

    server.send_message(msg)
    server.quit()
    logger.info("Email sent via SMTP to %s", email_to)


# ── React Email remote rendering ──────────────────────────────────────────────


async def _render_remote(template: str, props: dict[str, Any]) -> EmailData:
    """Call the web-auth Next.js render endpoint to get React Email HTML.

    Raises httpx.HTTPStatusError on non-2xx responses.
    """
    if not email_settings.EMAIL_RENDER_URL:
        raise RuntimeError("EMAIL_RENDER_URL is not configured")

    url = f"{email_settings.EMAIL_RENDER_URL.rstrip('/')}/api/email/render"
    headers = {"x-email-render-secret": email_settings.EMAIL_RENDER_SECRET or ""}

    async with httpx.AsyncClient() as client:
        response = await client.post(
            url,
            json={"template": template, "props": props},
            headers=headers,
            timeout=10.0,
        )
        response.raise_for_status()

    data = response.json()
    return EmailData(html_content=data["html"], subject=data["subject"])


# ── Jinja2 fallback ───────────────────────────────────────────────────────────


def _render_jinja2(*, template_name: str, context: dict[str, Any]) -> str:
    """Render a Jinja2 HTML email template from the email-templates/build directory."""
    template_str = (
        Path(__file__).parent.parent / "email-templates" / "build" / template_name
    ).read_text()
    return Template(template_str).render(context)


# Keep the old name available for any code that imports it directly.
render_email_template = _render_jinja2


# ── Token helpers ─────────────────────────────────────────────────────────────


def generate_password_reset_token(email: str) -> str:
    """Generate a signed JWT for password reset."""
    delta = timedelta(hours=email_settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS)
    now = datetime.now(timezone.utc)
    expires = now + delta
    return jwt.encode(
        {"exp": expires.timestamp(), "nbf": now, "sub": email},
        auth_settings.SECRET_KEY,
        algorithm="HS256",
    )


def verify_password_reset_token(token: str) -> str | None:
    """Verify a password-reset JWT and return the email subject, or None if invalid."""
    try:
        decoded_token = jwt.decode(
            token, auth_settings.SECRET_KEY, algorithms=["HS256"]
        )
        return str(decoded_token["sub"])
    except InvalidTokenError:
        return None


# ── Email generators ──────────────────────────────────────────────────────────


def generate_test_email(email_to: str) -> EmailData:
    """Generate a test email payload (always uses Jinja2)."""
    subject = f"{settings.PROJECT_NAME} - Test email"
    html_content = _render_jinja2(
        template_name="test_email.html",
        context={"project_name": settings.PROJECT_NAME, "email": email_to},
    )
    return EmailData(html_content=html_content, subject=subject)


async def generate_reset_password_email(
    email_to: str, email: str, token: str
) -> EmailData:
    """Generate a password reset email.

    Uses React Email (via the web-auth render endpoint) when EMAIL_RENDER_URL is
    configured; falls back to the Jinja2 template for local dev without the
    render service.
    """
    base = settings.FRONTEND_HOST or ""
    reset_link = f"{base.rstrip('/')}/reset-password?token={token}" if base else ""

    if email_settings.EMAIL_RENDER_URL:
        try:
            return await _render_remote(
                "reset-password",
                {
                    "projectName": settings.PROJECT_NAME,
                    "username": email,
                    "resetLink": reset_link,
                    "validHours": email_settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS,
                },
            )
        except Exception:
            logger.exception(
                "React Email render failed for reset-password, falling back to Jinja2"
            )

    # Jinja2 fallback
    subject = f"{settings.PROJECT_NAME} - Password recovery for user {email}"
    html_content = _render_jinja2(
        template_name="reset_password.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": email,
            "email": email_to,
            "valid_hours": email_settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS,
            "link": reset_link,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


async def generate_new_account_email(
    email_to: str, username: str, password: str, first_name: str = ""
) -> EmailData:
    """Generate a welcome / new-account email.

    Uses React Email when EMAIL_RENDER_URL is configured; falls back to Jinja2.
    ``first_name`` is used in the React Email greeting; it defaults to ``username``
    when not supplied (e.g. when called from the superuser-only create-user endpoint).
    """
    base = settings.FRONTEND_HOST or ""
    sign_in_link = base.rstrip("/") if base else ""

    if email_settings.EMAIL_RENDER_URL:
        try:
            return await _render_remote(
                "welcome",
                {
                    "projectName": settings.PROJECT_NAME,
                    "firstName": first_name or username,
                    "username": username,
                    "email": email_to,
                    "signInLink": sign_in_link,
                },
            )
        except Exception:
            logger.exception(
                "React Email render failed for welcome, falling back to Jinja2"
            )

    # Jinja2 fallback
    subject = f"{settings.PROJECT_NAME} - New account for user {username}"
    html_content = _render_jinja2(
        template_name="new_account.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": username,
            "password": password,
            "email": email_to,
            "link": sign_in_link,
        },
    )
    return EmailData(html_content=html_content, subject=subject)
