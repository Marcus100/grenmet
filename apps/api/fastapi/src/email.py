import logging
import smtplib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

import jwt
from jinja2 import Template
from jwt.exceptions import InvalidTokenError

from src.auth.config import auth_settings
from src.config import settings
from src.email_config import email_settings

logging.basicConfig(level=logging.INFO)
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
    """Send email using SMTP or Resend API."""
    assert email_settings.emails_enabled, "no provided configuration for email variables"

    # Debug logging for email send
    logger.info(f"[EMAIL_DEBUG] Sending email to: {email_to}")
    logger.info(f"[EMAIL_DEBUG] Subject: {subject}")
    logger.info(
        f"[EMAIL_DEBUG] Provider: {'resend' if email_settings.RESEND_API_KEY else 'smtp'}"
    )
    logger.info(f"[EMAIL_DEBUG] EMAILS_FROM_EMAIL: {email_settings.EMAILS_FROM_EMAIL}")
    logger.info(f"[EMAIL_DEBUG] HTML content length: {len(html_content)}")

    # Prefer Resend if configured
    if email_settings.RESEND_API_KEY:
        try:
            import resend  # type: ignore[import-not-found]  # lazy import

            resend.api_key = email_settings.RESEND_API_KEY

            params: resend.Emails.SendParams = {
                "from": f"{email_settings.EMAILS_FROM_NAME} <{email_settings.EMAILS_FROM_EMAIL}>",
                "to": [email_to],
                "subject": subject,
                "html": html_content,
            }
            logger.info("[EMAIL_DEBUG] Sending via Resend API")
            result = resend.Emails.send(params)
            logger.info(f"[EMAIL_DEBUG] Resend send result: {result}")
            return
        except Exception as e:  # pragma: no cover - log and fallback
            logger.error(f"[EMAIL_DEBUG] Resend send failed, falling back to SMTP: {e}")
            # Continue to SMTP fallback below

    # SMTP fallback (MailCatcher/local or real SMTP)
    try:
        # Create message
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{email_settings.EMAILS_FROM_NAME} <{email_settings.EMAILS_FROM_EMAIL}>"
        msg["To"] = email_to

        # Add HTML content
        html_part = MIMEText(html_content, "html")
        msg.attach(html_part)

        logger.info(
            f"[EMAIL_DEBUG] Created message with {len(html_content)} chars HTML"
        )

        # Connect to SMTP server
        if not email_settings.SMTP_HOST or not email_settings.SMTP_PORT:
            raise ValueError("SMTP_HOST and SMTP_PORT must be configured")
        logger.info(
            f"[EMAIL_DEBUG] Connecting to {email_settings.SMTP_HOST}:{email_settings.SMTP_PORT}"
        )
        server = smtplib.SMTP(email_settings.SMTP_HOST, email_settings.SMTP_PORT)

        # Enable debug output
        server.set_debuglevel(1)

        # Handle TLS/SSL
        if email_settings.SMTP_TLS:
            logger.info("[EMAIL_DEBUG] Starting TLS")
            server.starttls()
        elif email_settings.SMTP_SSL:
            logger.info("[EMAIL_DEBUG] Using SSL connection")
            if not email_settings.SMTP_HOST or not email_settings.SMTP_PORT:
                raise ValueError("SMTP_HOST and SMTP_PORT must be configured for SSL")
            server = smtplib.SMTP_SSL(email_settings.SMTP_HOST, email_settings.SMTP_PORT)

        # Login if credentials provided
        if (
            email_settings.SMTP_USER
            and email_settings.SMTP_PASSWORD
            and email_settings.SMTP_HOST != "mailcatcher"
        ):
            logger.info(f"[EMAIL_DEBUG] Logging in as {email_settings.SMTP_USER}")
            server.login(email_settings.SMTP_USER, email_settings.SMTP_PASSWORD)
        else:
            logger.info(
                "[EMAIL_DEBUG] Skipping SMTP auth (not required for MailCatcher)"
            )

        # Send email
        logger.info(
            f"[EMAIL_DEBUG] Sending email from {email_settings.EMAILS_FROM_EMAIL} to {email_to}"
        )
        result = server.send_message(msg)
        server.quit()

        logger.info(f"[EMAIL_DEBUG] Send successful - Result: {result}")
        logger.info("[EMAIL_DEBUG] Email sent successfully using smtplib")

    except Exception as e:
        logger.error(f"[EMAIL_DEBUG] Send failed with exception: {e}")
        logger.error(f"[EMAIL_DEBUG] Exception type: {type(e)}")
        raise


def render_email_template(*, template_name: str, context: dict[str, Any]) -> str:
    """Render email template."""
    template_str = (
        Path(__file__).parent.parent / "email-templates" / "build" / template_name
    ).read_text()
    html_content = Template(template_str).render(context)
    return html_content


def generate_password_reset_token(email: str) -> str:
    """Generate password reset token."""
    ALGORITHM = "HS256"
    delta = timedelta(hours=email_settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS)
    now = datetime.now(timezone.utc)
    expires = now + delta
    exp = expires.timestamp()
    encoded_jwt = jwt.encode(
        {"exp": exp, "nbf": now, "sub": email},
        auth_settings.SECRET_KEY,
        algorithm=ALGORITHM,
    )
    return encoded_jwt


def verify_password_reset_token(token: str) -> str | None:
    """Verify password reset token."""
    ALGORITHM = "HS256"
    try:
        decoded_token = jwt.decode(token, auth_settings.SECRET_KEY, algorithms=[ALGORITHM])
        return str(decoded_token["sub"])
    except InvalidTokenError:
        return None


def generate_test_email(email_to: str) -> EmailData:
    """Generate test email."""
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Test email"
    html_content = render_email_template(
        template_name="test_email.html",
        context={"project_name": settings.PROJECT_NAME, "email": email_to},
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_reset_password_email(email_to: str, email: str, token: str) -> EmailData:
    """Generate password reset email."""
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Password recovery for user {email}"
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
    """Generate new account email."""
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - New account for user {username}"
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
