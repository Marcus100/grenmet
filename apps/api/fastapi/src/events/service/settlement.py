"""Settlement report (E4): issued vs claimed vs admitted vs cancelled, by channel.

Counts come straight from the ticket rows, joined to their order for the channel
(``online`` free claims, ``outlet_cash`` staff sales) and to ``admissions``.
Cash comes from the till sessions: each till expects its opening float plus the
cash it took minus the cash it refunded, and a closed till is compared with the
counted cash. Anything that does not add up is listed under ``discrepancies``
rather than netted away: a short or over till, a till left open after the event.
"""

import csv
import io
import uuid
from collections import defaultdict
from typing import Literal

from pydantic import TypeAdapter
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.utils.datetime import utc_now

from .. import schemas
from ..models import (
    Admission,
    Listing,
    Order,
    OrderItem,
    Organiser,
    Refund,
    Ticket,
    TicketTier,
    TillSession,
)
from .admission import _door_listing
from .common import _naive_utc
from .organiser_admin import _my_organiser
from .outlet import money, refund_views, till_views

_STATUS = TypeAdapter(Literal["draft", "published", "cancelled"])
_CURRENCY = TypeAdapter(Literal["XCD", "USD"])
_CHANNELS: tuple[tuple[Literal["online", "outlet_cash"], str], ...] = (
    ("online", "online"),
    ("outlet_cash", "outlet"),
)
SUMMARY_LIMIT = 50


class _Group:
    """Ticket counts for one slice (a channel, or everything)."""

    def __init__(self) -> None:
        self.issued = 0
        self.valid = 0
        self.cancelled = 0
        self.refunded = 0
        self.admitted = 0
        self.admitted_valid = 0
        self.value = 0

    def add(self, status: str, admitted: bool, count: int, value: int) -> None:
        self.issued += count
        if status == "valid":
            self.valid += count
            self.value += value
        elif status == "refunded":
            self.refunded += count
        else:
            self.cancelled += count
        if admitted:
            self.admitted += count
            if status == "valid":
                self.admitted_valid += count

    def counts(self) -> dict[str, int]:
        return {
            "issued": self.issued,
            "claimed": self.valid,
            "admitted": self.admitted,
            "waiting": self.valid - self.admitted_valid,
            "cancelled": self.cancelled,
            "refunded": self.refunded,
            "value_minor": self.value,
        }


async def _build(db: AsyncSession, listing: Listing) -> schemas.Settlement:
    admitted = Admission.id.is_not(None)
    rows = (
        await db.execute(
            select(
                Order.channel,
                Ticket.tier_id,
                Ticket.status,
                admitted,
                func.count(),
                func.coalesce(func.sum(OrderItem.unit_price_minor), 0),
            )
            .join(Order, Order.id == Ticket.order_id)
            .join(
                OrderItem,
                (OrderItem.order_id == Ticket.order_id)
                & (OrderItem.tier_id == Ticket.tier_id),
            )
            .outerjoin(Admission, Admission.ticket_id == Ticket.id)
            .where(Ticket.listing_id == listing.id)
            .group_by(Order.channel, Ticket.tier_id, Ticket.status, admitted)
        )
    ).all()
    everything = _Group()
    by_channel: dict[str, _Group] = defaultdict(_Group)
    by_tier: dict[uuid.UUID, dict[str, int]] = defaultdict(
        lambda: {"online": 0, "outlet": 0, "admitted": 0}
    )
    for channel, tier_id, status, was_admitted, count, value in rows:
        everything.add(status, was_admitted, count, int(value))
        by_channel[channel].add(status, was_admitted, count, int(value))
        if status == "valid":
            by_tier[tier_id][channel] += count
        if was_admitted:
            by_tier[tier_id]["admitted"] += count

    collected = {
        channel: int(total)
        for channel, total in (
            await db.execute(
                select(Order.channel, func.coalesce(func.sum(Order.collected_minor), 0))
                .where(Order.listing_id == listing.id)
                .group_by(Order.channel)
            )
        ).all()
    }
    tills = list(
        (
            await db.scalars(
                select(TillSession)
                .where(TillSession.listing_id == listing.id)
                .order_by(TillSession.opened_at, TillSession.id)
            )
        ).all()
    )
    till_rows = await till_views(db, tills)
    refund_rows = list(
        (
            await db.scalars(
                select(Refund)
                .where(Refund.listing_id == listing.id)
                .order_by(Refund.refunded_at, Refund.id)
            )
        ).all()
    )
    refunds = await refund_views(db, refund_rows)
    # Cash handed back outside any open till still left the cash box.
    loose = [
        row for row in refunds if row.method == "cash" and row.till_session_id is None
    ]
    closed = [till for till in till_rows if till.status == "closed"]
    cash_refunds = sum(till.cash_refunds_minor for till in till_rows) + sum(
        row.amount_minor for row in loose
    )
    cash = schemas.SettlementCash(
        collected_minor=collected.get("outlet", 0),
        cash_refunds_minor=cash_refunds,
        net_sales_minor=collected.get("outlet", 0) - cash_refunds,
        expected_minor=sum(till.expected_minor for till in till_rows),
        counted_minor=sum(till.counted_minor or 0 for till in closed),
        difference_minor=sum(till.difference_minor or 0 for till in closed),
        open_tills=len(till_rows) - len(closed),
        closed_tills=len(closed),
    )

    finished = listing.ends_at <= _naive_utc(utc_now()) or listing.status == "cancelled"
    issues: list[schemas.SettlementIssue] = []
    for till in till_rows:
        who = till.staff_name or "Staff"
        if till.status == "open":
            if finished:
                issues.append(
                    schemas.SettlementIssue(
                        kind="till_open",
                        message=f"{who}'s till is still open; count it and close it.",
                        till_id=till.id,
                    )
                )
            continue
        difference = till.difference_minor or 0
        if difference != 0:
            kind: Literal["till_short", "till_over"] = (
                "till_short" if difference < 0 else "till_over"
            )
            issues.append(
                schemas.SettlementIssue(
                    kind=kind,
                    message=(
                        f"{who}'s till counted {money(till.counted_minor or 0)} but"
                        f" expected {money(till.expected_minor)}"
                        f" ({'short' if difference < 0 else 'over'}"
                        f" {money(abs(difference))})."
                    ),
                    till_id=till.id,
                    amount_minor=difference,
                )
            )

    for row in loose:
        issues.append(
            schemas.SettlementIssue(
                kind="refund_without_till",
                message=(
                    f"Cash refund of {money(row.amount_minor)} for ticket {row.code}"
                    " was not paid from an open till."
                ),
                amount_minor=row.amount_minor,
            )
        )

    tiers = list(
        (
            await db.scalars(
                select(TicketTier)
                .where(TicketTier.listing_id == listing.id)
                .order_by(TicketTier.sort_order, TicketTier.id)
            )
        ).all()
    )
    currency = _CURRENCY.validate_python(tiers[0].currency if tiers else "XCD")
    channels = [
        schemas.SettlementChannel(
            channel=name,
            collected_minor=collected.get(key, 0),
            refunded_minor=(
                sum(row.amount_minor for row in refunds) if key == "outlet" else 0
            ),
            **by_channel[key].counts(),
        )
        for name, key in _CHANNELS
    ]
    return schemas.Settlement(
        listing_id=listing.id,
        title=listing.title,
        starts_at=listing.starts_at,
        ends_at=listing.ends_at,
        status=_STATUS.validate_python(listing.status),
        currency=currency,
        generated_at=utc_now(),
        totals=schemas.SettlementCounts(**everything.counts()),
        channels=channels,
        tiers=[
            schemas.SettlementTier(
                id=tier.id,
                name=tier.name,
                price_minor=tier.price_minor,
                allocation=tier.allocation,
                online=by_tier[tier.id]["online"],
                outlet=by_tier[tier.id]["outlet"],
                admitted=by_tier[tier.id]["admitted"],
                remaining=max(
                    tier.allocation
                    - by_tier[tier.id]["online"]
                    - by_tier[tier.id]["outlet"],
                    0,
                ),
            )
            for tier in tiers
        ],
        tills=till_rows,
        cash=cash,
        discrepancies=issues,
        refunds=refunds,
    )


async def settlement(
    db: AsyncSession,
    user: User,
    listing_id: uuid.UUID,
    org_ids: list[str],
    slug: str | None = None,
) -> schemas.Settlement:
    listing = await _door_listing(db, user, listing_id, org_ids, slug)
    return await _build(db, listing)


async def organiser_settlement(
    db: AsyncSession, user: User, org_ids: list[str], slug: str | None = None
) -> schemas.SettlementOverview:
    organiser: Organiser = await _my_organiser(db, user, org_ids, slug)
    listings = list(
        (
            await db.scalars(
                select(Listing)
                .where(
                    Listing.organiser_id == organiser.id,
                    Listing.admission == "ticketed",
                    Listing.status != "draft",
                )
                .order_by(Listing.starts_at.desc())
                .limit(SUMMARY_LIMIT)
            )
        ).all()
    )
    summaries: list[schemas.SettlementSummary] = []
    for listing in listings:
        report = await _build(db, listing)
        summaries.append(
            schemas.SettlementSummary(
                listing_id=listing.id,
                title=listing.title,
                starts_at=listing.starts_at,
                status=report.status,
                issued=report.totals.issued,
                claimed=report.totals.claimed,
                admitted=report.totals.admitted,
                cancelled=report.totals.cancelled,
                cash_collected_minor=report.cash.collected_minor,
                cash_expected_minor=report.cash.expected_minor,
                cash_counted_minor=report.cash.counted_minor,
                issues=len(report.discrepancies),
            )
        )
    return schemas.SettlementOverview(organiser_name=organiser.name, listings=summaries)


# --- CSV ----------------------------------------------------------------------------------

_FORMULA_LEADERS = ("=", "+", "-", "@", "\t", "\r")


def _cell(value: object) -> object:
    """Neutralise spreadsheet formulas in text taken from people."""
    if isinstance(value, str) and value.startswith(_FORMULA_LEADERS):
        return f"'{value}"
    return value


def _dollars(minor: int) -> str:
    sign = "-" if minor < 0 else ""
    return f"{sign}{abs(minor) // 100}.{abs(minor) % 100:02d}"


def to_csv(report: schemas.Settlement) -> str:
    """One CSV with a titled block per section (open it in a spreadsheet)."""
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")

    def block(title: str, header: list[str], rows: list[list[object]]) -> None:
        writer.writerow([title])
        writer.writerow(header)
        writer.writerows([[_cell(value) for value in row] for row in rows])
        writer.writerow([])

    writer.writerow([_cell(report.title)])
    writer.writerow(
        [
            f"Amounts in {report.currency}; generated"
            f" {report.generated_at:%Y-%m-%d %H:%M} UTC"
        ]
    )
    writer.writerow([])
    counts = ["issued", "claimed", "admitted", "waiting", "cancelled", "refunded"]
    block(
        "Tickets by channel",
        ["channel", *counts, "value", "cash collected", "refunded"],
        [
            [
                channel.channel,
                *(getattr(channel, name) for name in counts),
                _dollars(channel.value_minor),
                _dollars(channel.collected_minor),
                _dollars(channel.refunded_minor),
            ]
            for channel in report.channels
        ]
        + [
            [
                "total",
                *(getattr(report.totals, name) for name in counts),
                _dollars(report.totals.value_minor),
                "",
                "",
            ]
        ],
    )
    block(
        "Tiers",
        ["tier", "price", "allocation", "online", "outlet", "admitted", "remaining"],
        [
            [
                tier.name,
                _dollars(tier.price_minor),
                tier.allocation,
                tier.online,
                tier.outlet,
                tier.admitted,
                tier.remaining,
            ]
            for tier in report.tiers
        ],
    )
    block(
        "Tills",
        [
            "staff",
            "day",
            "status",
            "float",
            "sales",
            "tickets",
            "collected",
            "cash refunds",
            "expected",
            "counted",
            "difference",
            "note",
        ],
        [
            [
                till.staff_name or "Staff",
                till.day.isoformat(),
                till.status,
                _dollars(till.opening_float_minor),
                till.sales_count,
                till.tickets_sold,
                _dollars(till.collected_minor),
                _dollars(till.cash_refunds_minor),
                _dollars(till.expected_minor),
                "" if till.counted_minor is None else _dollars(till.counted_minor),
                ""
                if till.difference_minor is None
                else _dollars(till.difference_minor),
                till.close_note or "",
            ]
            for till in report.tills
        ],
    )
    block(
        "Refunds",
        ["ticket", "tier", "amount", "method", "reference", "by", "at"],
        [
            [
                refund.code,
                refund.tier_name,
                _dollars(refund.amount_minor),
                refund.method,
                refund.reference or "",
                refund.refunded_by_name or "Staff",
                f"{refund.refunded_at:%Y-%m-%d %H:%M} UTC",
            ]
            for refund in report.refunds
        ],
    )
    block(
        "Discrepancies",
        ["kind", "amount", "message"],
        [
            [
                issue.kind,
                "" if issue.amount_minor is None else _dollars(issue.amount_minor),
                issue.message,
            ]
            for issue in report.discrepancies
        ],
    )
    return out.getvalue()


async def settlement_csv(
    db: AsyncSession,
    user: User,
    listing_id: uuid.UUID,
    org_ids: list[str],
    slug: str | None = None,
) -> str:
    return to_csv(await settlement(db, user, listing_id, org_ids, slug))
