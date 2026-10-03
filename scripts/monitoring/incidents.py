"""Sanitized per-target incidents; uncertain creates are reconciled, never blindly retried."""

import json
import os
import re
import urllib.error
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(method, path, body=None):
    if not re.fullmatch(
        r"incidents(?:\?page=[0-9]+&per_page=100|/[0-9]+(?:/resolve)?)?", path
    ):
        raise ValueError("Invalid incident endpoint")
    req = urllib.request.Request(
        "https://incidents.betterstack.com/api/v3/" + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": "Bearer " + os.environ["BETTERSTACK_API_TOKEN"],
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=5) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        if method == "POST" and path.endswith("/resolve") and error.code == 409:
            return {}
        raise


def reconcile(state, environment, app, persist, api=request):
    """Persist before side effects. Return False when delivery is unknown or failed."""
    title = f"{environment} · {app} · availability · {state['episode']}"
    if state.get("delivery") == "creating":
        # A create may have succeeded before a timeout/crash. Find its unique title.
        found = None
        for page in range(1, 11):
            rows = api("GET", f"incidents?page={page}&per_page=100")["data"]
            found = next(
                (row for row in rows if row["attributes"].get("name") == title), None
            )
            if found or len(rows) < 100:
                break
        if not found:
            return False  # Never duplicate an uncertain incident; requires operator review.
        state.update(providerId=str(found["id"]), delivery="opened")
        persist()
    if state["incident"] and not state.get("providerId"):
        state["delivery"] = "creating"
        persist()
        response = api(
            "POST",
            "incidents",
            {
                "name": title,
                "summary": f"{environment}/{app}: repeated availability check failures",
                "requester_email": "euginegnd@gmail.com",
                "email": True,
                "call": False,
                "sms": False,
                "push": False,
                "critical_alert": False,
            },
        )
        identity = str(response["data"]["id"])
        if not identity.isdigit():
            raise ValueError("Invalid incident response")
        state.update(providerId=identity, delivery="opened")
        persist()
    if (
        not state["incident"]
        and state.get("providerId")
        and state.get("delivery") != "resolved"
    ):
        api(
            "POST",
            f"incidents/{state['providerId']}/resolve",
            {"resolved_by": "scheduled-availability-probe"},
        )
        state["delivery"] = "resolved"
        persist()
    return True
