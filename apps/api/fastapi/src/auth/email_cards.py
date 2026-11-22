"""Sign-in setup courtesy notices as cards (``src.email_layout``). Pure. No link is
ever carried: the notice says what happened and what to do if it was not expected."""

from src import email_layout as layout

ISSUED_SUBJECT = "A sign-in link was set up for your account"
COMPLETED_SUBJECT = "Your sign-in password was set up"


def link_issued() -> layout.EmailCard:
    """Sent to the address on file when an administrator issues a sign-in link."""
    card = layout.EmailCard(
        title=ISSUED_SUBJECT,
        paragraphs=("If you did not expect this, contact your administrator.",),
        footer=(
            "You are getting this email because a sign-in was set up for your "
            "account. If this was not you, contact your administrator."
        ),
    )
    return layout.with_subject(ISSUED_SUBJECT, card)


def setup_completed() -> layout.EmailCard:
    """Sent to the address on file when the password is set through the link."""
    card = layout.EmailCard(
        title=COMPLETED_SUBJECT,
        paragraphs=("If this was not you, contact your administrator straight away.",),
        footer=(
            "You are getting this email because a sign-in password was set up for "
            "your account. If this was not you, contact your administrator."
        ),
    )
    return layout.with_subject(COMPLETED_SUBJECT, card)
