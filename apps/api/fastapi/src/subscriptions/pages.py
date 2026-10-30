"""Plain HTML for the unsubscribe confirmation, so no state changes on a GET.

Served by the API, so every mailing list (GMS, Signal, Barrels) gets the same page
without a page in each product. Every value is escaped; pages are not indexed.
"""

from html import escape


def _document(title: str, body: str) -> str:
    return (
        "<!doctype html>"
        '<html lang="en"><head><meta charset="utf-8">'
        '<meta name="robots" content="noindex">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>{escape(title)}</title>"
        "<style>body{font-family:Arial,Helvetica,sans-serif;max-width:36rem;"
        "margin:3rem auto;padding:0 1rem;color:#0b132b;line-height:1.5}"
        "button{font:inherit;padding:.6rem 1.2rem;border:0;border-radius:6px;"
        "background:#0b63ee;color:#fff;cursor:pointer}</style>"
        f"</head><body>{body}</body></html>"
    )


def confirm_unsubscribe(*, list_name: str, action_url: str) -> str:
    body = (
        f"<h1>Stop receiving {escape(list_name)}?</h1>"
        "<p>We will stop sending you this list. You can sign up again at any time.</p>"
        f'<form method="post" action="{escape(action_url, quote=True)}">'
        '<button type="submit">Unsubscribe</button></form>'
    )
    return _document(f"Unsubscribe from {list_name}", body)


def unsubscribed(*, list_name: str) -> str:
    body = (
        "<h1>Unsubscribed</h1>"
        f"<p>You are unsubscribed from {escape(list_name)}. "
        "No more emails will be sent to this address for this list.</p>"
    )
    return _document("Unsubscribed", body)


def invalid() -> str:
    body = (
        "<h1>This link is not valid</h1>"
        "<p>It may have expired or already been used. If you still want to stop an "
        "email, use the unsubscribe link in the most recent message.</p>"
    )
    return _document("Link not valid", body)
