"""Event catalogue. Modules register what they can notify about; HR Setup tunes it.

Titles and bodies are Jinja templates rendered in a sandbox with the variables an
event documents. Keep them to a summary: emails leave the portal, so reasons,
medical details and approver comments must never be template variables.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from jinja2 import TemplateSyntaxError
from jinja2.sandbox import SandboxedEnvironment
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class EventDef:
    key: str
    label: str
    description: str
    # Who is told, in words, for the settings screen (the code decides who).
    audience: str
    title: str
    body: str
    variables: tuple[str, ...]
    # False for events a person must not silence (e.g. "approval waiting").
    email_mutable: bool = True
    # Extra roles HR may add or remove, e.g. ("hr-admin",).
    default_roles: tuple[str, ...] = ()
    # Tunable numbers shown in HR Setup, e.g. {"remind_after_days": 2}.
    default_params: dict[str, Any] = field(default_factory=dict)


Sweep = Callable[[AsyncSession], Awaitable[int]]

_events: dict[str, EventDef] = {}
_sweeps: list[Sweep] = []
_environment = SandboxedEnvironment(autoescape=False)


def register(event: EventDef) -> None:
    _events[event.key] = event


def register_sweep(sweep: Sweep) -> None:
    """Add a daily reminder job (expiries, overdue approvals, ...)."""
    if sweep not in _sweeps:
        _sweeps.append(sweep)


def get(key: str) -> EventDef:
    return _events[key]


def all_events() -> list[EventDef]:
    return list(_events.values())


def sweeps() -> list[Sweep]:
    return list(_sweeps)


def render(template: str, context: dict[str, Any]) -> str:
    return _environment.from_string(template).render(**context).strip()


def validate_template(template: str, variables: tuple[str, ...]) -> str | None:
    """Return an error message when an HR-edited template cannot render."""
    try:
        render(template, {name: f"<{name}>" for name in variables})
    except TemplateSyntaxError as exc:
        return f"Template error on line {exc.lineno}: {exc.message}"
    except Exception as exc:  # noqa: BLE001 - sandbox raises SecurityError and others
        return f"Template error: {exc}"
    return None
