import logging
import smtplib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

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


def send_email(
    *,
    email_to: str,
    subject: str = "",
    html_content: str = "",
) -> None:
    """Send an email via Resend (primary) or SMTP fallback (local dev).

    Resend is used when ``RESEND_API_KEY`` is configured.
    SMTP is the fallback for local development with MailCatcher.
    """
    assert email_settings.emails_enabled, (
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

    # ── SMTP fallback (local dev / MailCatcher) ─────────────────────────────────
    if not email_settings.SMTP_HOST or not email_settings.SMTP_PORT:
        raise ValueError("No email provider configured: set RESEND_API_KEY or SMTP_HOST")

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


def render_email_template(*, template_name: str, context: dict[str, Any]) -> str:
    """Render a Jinja2 HTML email template from the email-templates/build directory."""
    template_str = (
        Path(__file__).parent.parent / "email-templates" / "build" / template_name
    ).read_text()
    return Template(template_str).render(context)


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


def generate_test_email(email_to: str) -> EmailData:
    """Generate a test email payload."""
    subject = f"{settings.PROJECT_NAME} - Test email"
    html_content = render_email_template(
        template_name="test_email.html",
        context={"project_name": settings.PROJECT_NAME, "email": email_to},
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_reset_password_email(email_to: str, email: str, token: str) -> EmailData:
    """Generate a password reset email payload."""
    subject = f"{settings.PROJECT_NAME} - Password recovery for user {email}"
    base = settings.FRONTEND_HOST or ""
    link = f"{base.rstrip('/')}/reset-password?token={token}" if base else ""
    html_content = render_email_template(
        template_name="reset_password.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": email,
            "email": email_to,
            "valid_hours": email_settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS,
            "link": link,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_new_account_email(
    email_to: str, username: str, password: str
) -> EmailData:
    """Generate a new account welcome email payload."""
    subject = f"{settings.PROJECT_NAME} - New account for user {username}"
    base = settings.FRONTEND_HOST or ""
    html_content = render_email_template(
        template_name="new_account.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": username,
            "password": password,
            "email": email_to,
            "link": base.rstrip("/") if base else "",
        },
    )
    return EmailData(html_content=html_content, subject=subject)
