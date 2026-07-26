from src.email import generate_new_account_email
from src.email_config import email_settings


async def test_new_account_email_has_no_password_interface_or_content(
    monkeypatch,
) -> None:
    monkeypatch.setattr(email_settings, "EMAIL_RENDER_URL", None)

    email_data = await generate_new_account_email(
        email_to="ada@example.com",
        username="ada",
        first_name="Ada",
    )

    assert "password" not in email_data.html_content.lower()
    assert "ada" in email_data.html_content.lower()
