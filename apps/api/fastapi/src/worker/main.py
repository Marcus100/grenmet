"""arq worker entrypoint.

Run with:  uv run --frozen --package fast-back arq src.worker.main.WorkerSettings

Polls the CAP durable outbox (cap.job_event) on a schedule and dispatches publish
side-effects. The dispatch logic lives in ``src/worker/dispatch.py`` (unit-tested
without Redis).
"""

from __future__ import annotations

from importlib import import_module
from socket import gethostname
from typing import Any

from arq import cron
from arq.connections import RedisSettings

from src import operational_metrics
from src.logging_config import configure_logging
from src.models_guidance.config import guidance_settings
from src.telemetry import sentry_options
from src.worker.config import worker_settings

configure_logging()


async def startup(ctx: dict[str, Any]) -> None:  # noqa: ARG001 - arq passes ctx
    # Fail before the worker starts if task dependencies cannot load. Health
    # probes only need Redis settings and must not repeat these imports.
    for module in (
        "src.database",
        "src.cap.service",
        "src.worker.dispatch",
        "src.notifications.dispatch",
        "src.notifications.scheduler",
        "src.events.outbox",
        "src.eregister.publisher",
        "src.billing.reminders",
        "src.worker.retention",
        "src.outbox",
        "src.notifications.outbox_handlers",
        "src.bookings.reminders",
        "src.bookings.outbox_handlers",
        "src.events.payment_handlers",
        "src.rewards.outbox_handlers",
        "src.webhooks_out.delivery",
    ):
        import_module(module)
    from src.config import settings

    if settings.SENTRY_DSN and settings.ENVIRONMENT != "local":
        import sentry_sdk

        sentry_sdk.init(
            dsn=str(settings.SENTRY_DSN),
            environment=settings.ENVIRONMENT,
            **sentry_options(),
        )


async def process_cap_jobs(ctx: dict[str, Any]) -> int:
    from src.database import async_session_factory
    from src.worker import dispatch

    async with async_session_factory() as session:
        try:
            result = await dispatch.process_due_jobs(
                session=session,
                limit=worker_settings.CAP_JOB_BATCH_SIZE,
                max_attempts=worker_settings.CAP_JOB_MAX_ATTEMPTS,
            )
        except Exception:
            await operational_metrics.record_job(
                ctx.get("redis"), "process_cap_jobs", str(ctx.get("job_id", "")), False
            )
            raise
        await operational_metrics.record_job(
            ctx.get("redis"), "process_cap_jobs", str(ctx.get("job_id", "")), True
        )
        await operational_metrics.worker_completed(ctx.get("redis"))
        return result


async def ingest_cap_feeds(ctx: dict[str, Any]) -> int:
    from src.cap import service as cap_service
    from src.database import async_session_factory

    async with async_session_factory() as session:
        try:
            result = await cap_service.ingest_all_active_feeds(session=session)
        except Exception:
            await operational_metrics.record_job(
                ctx.get("redis"), "ingest_cap_feeds", str(ctx.get("job_id", "")), False
            )
            raise
        await operational_metrics.record_job(
            ctx.get("redis"), "ingest_cap_feeds", str(ctx.get("job_id", "")), True
        )
        return result


async def send_notification_emails(ctx: dict[str, Any]) -> int:
    from src.database import async_session_factory
    from src.notifications import dispatch as notification_dispatch

    async with async_session_factory() as session:
        try:
            result = await notification_dispatch.process_due_deliveries(session=session)
        except Exception:
            await operational_metrics.record_job(
                ctx.get("redis"),
                "send_notification_emails",
                str(ctx.get("job_id", "")),
                False,
            )
            raise
        await operational_metrics.record_job(
            ctx.get("redis"),
            "send_notification_emails",
            str(ctx.get("job_id", "")),
            True,
        )
        return result


async def send_outbound_emails(ctx: dict[str, Any]) -> int:
    from src.database import async_session_factory
    from src.notifications import dispatch as notification_dispatch

    async with async_session_factory() as session:
        try:
            result = await notification_dispatch.process_outbound_emails(
                session=session
            )
        except Exception:
            await operational_metrics.record_job(
                ctx.get("redis"),
                "send_outbound_emails",
                str(ctx.get("job_id", "")),
                False,
            )
            raise
        await operational_metrics.record_job(
            ctx.get("redis"), "send_outbound_emails", str(ctx.get("job_id", "")), True
        )
        return result


async def drain_events_outbox(ctx: dict[str, Any]) -> int:
    """Turn Events outbox rows (published, cancelled, approved...) into notifications."""
    from src.database import async_session_factory
    from src.events import database as events_database
    from src.events import outbox

    events = events_database.create_session()
    if events is None:
        return 0
    async with events, async_session_factory() as session:
        try:
            result = await outbox.drain(events, session)
        except Exception:
            await operational_metrics.record_job(
                ctx.get("redis"),
                "drain_events_outbox",
                str(ctx.get("job_id", "")),
                False,
            )
            raise
        await operational_metrics.record_job(
            ctx.get("redis"), "drain_events_outbox", str(ctx.get("job_id", "")), True
        )
        return result


async def drain_outbox(ctx: dict[str, Any]) -> int:
    """Run due platform outbox rows (email.send, ...); see ADR-0026."""
    from src import outbox
    from src.database import async_session_factory

    # Importing these modules registers their outbox handlers (email.send,
    # rewards.qualifying_action, bookings.deposit_paid, events.order_paid,
    # events.order_refunded, webhook.deliver).
    for module in (
        "src.notifications.outbox_handlers",
        "src.bookings.outbox_handlers",
        "src.events.payment_handlers",
        "src.rewards.outbox_handlers",
        "src.webhooks_out.delivery",
    ):
        import_module(module)

    async with async_session_factory() as session:
        try:
            result = await outbox.drain(session)
        except Exception:
            await operational_metrics.record_job(
                ctx.get("redis"), "drain_outbox", str(ctx.get("job_id", "")), False
            )
            raise
    await operational_metrics.record_job(
        ctx.get("redis"), "drain_outbox", str(ctx.get("job_id", "")), True
    )
    return result


async def enqueue_booking_reminders(ctx: dict[str, Any]) -> int:
    """Queue one reminder per booking starting within 24 hours (idempotent)."""
    from src.bookings import reminders
    from src.database import async_session_factory

    async with async_session_factory() as session:
        try:
            result = await reminders.enqueue_due_reminders(session)
            await session.commit()
        except Exception:
            await operational_metrics.record_job(
                ctx.get("redis"),
                "enqueue_booking_reminders",
                str(ctx.get("job_id", "")),
                False,
            )
            raise
    await operational_metrics.record_job(
        ctx.get("redis"), "enqueue_booking_reminders", str(ctx.get("job_id", "")), True
    )
    return result


async def expire_unpaid_bookings(ctx: dict[str, Any]) -> int:
    """Cancel deposit bookings left unpaid past the hold; frees the slot (idempotent)."""
    from src.bookings import deposits
    from src.database import async_session_factory

    async with async_session_factory() as session:
        try:
            result = await deposits.expire_unpaid(session)
            await session.commit()
        except Exception:
            await operational_metrics.record_job(
                ctx.get("redis"),
                "expire_unpaid_bookings",
                str(ctx.get("job_id", "")),
                False,
            )
            raise
    await operational_metrics.record_job(
        ctx.get("redis"), "expire_unpaid_bookings", str(ctx.get("job_id", "")), True
    )
    return result


async def expire_unpaid_event_orders(ctx: dict[str, Any]) -> int:
    """Cancel paid-tier orders left unpaid past the hold; releases stock (idempotent)."""
    from src.database import async_session_factory
    from src.events import database as events_database
    from src.events import order_fulfilment

    events = events_database.create_session()
    if events is None:
        return 0
    async with events, async_session_factory() as session:
        try:
            result = await order_fulfilment.expire_unpaid(session, events)
        except Exception:
            await operational_metrics.record_job(
                ctx.get("redis"),
                "expire_unpaid_event_orders",
                str(ctx.get("job_id", "")),
                False,
            )
            raise
    await operational_metrics.record_job(
        ctx.get("redis"), "expire_unpaid_event_orders", str(ctx.get("job_id", "")), True
    )
    return result


async def sync_event_rewards(ctx: dict[str, Any]) -> int:
    """Credit stamps for Events admissions and reverse refunded ones (idempotent)."""
    from src.database import async_session_factory
    from src.events import database as events_database
    from src.rewards import events_link

    events = events_database.create_session()
    if events is None:
        return 0
    async with events, async_session_factory() as session:
        try:
            result = await events_link.sync_admissions(session, events)
            await session.commit()
        except Exception:
            await operational_metrics.record_job(
                ctx.get("redis"),
                "sync_event_rewards",
                str(ctx.get("job_id", "")),
                False,
            )
            raise
        await operational_metrics.record_job(
            ctx.get("redis"), "sync_event_rewards", str(ctx.get("job_id", "")), True
        )
        return result.credited + result.reversed


async def send_wis2_publications(ctx: dict[str, Any]) -> int:
    """Move queued eRegister CSV files to wis2box; no-op unless configured."""
    from src.database import async_session_factory
    from src.eregister import publisher

    async with async_session_factory() as session:
        try:
            result = await publisher.process_due_publications(session=session)
        except Exception:
            await operational_metrics.record_job(
                ctx.get("redis"),
                "send_wis2_publications",
                str(ctx.get("job_id", "")),
                False,
            )
            raise
        await operational_metrics.record_job(
            ctx.get("redis"), "send_wis2_publications", str(ctx.get("job_id", "")), True
        )
        return result


async def send_invoice_reminders(ctx: dict[str, Any]) -> int:
    """Queue payment reminders for open invoices (7 days before, due day, 7 days after)."""
    from src.billing import reminders
    from src.database import async_session_factory

    async with async_session_factory() as session:
        try:
            result = await reminders.send_due_reminders(session)
        except Exception:
            await operational_metrics.record_job(
                ctx.get("redis"),
                "send_invoice_reminders",
                str(ctx.get("job_id", "")),
                False,
            )
            raise
        await operational_metrics.record_job(
            ctx.get("redis"), "send_invoice_reminders", str(ctx.get("job_id", "")), True
        )
        return result


async def run_notification_sweeps(ctx: dict[str, Any]) -> int:
    from src.database import async_session_factory
    from src.notifications import scheduler

    async with async_session_factory() as session:
        try:
            result = await scheduler.run_sweeps(session)
        except Exception:
            await operational_metrics.record_job(
                ctx.get("redis"),
                "run_notification_sweeps",
                str(ctx.get("job_id", "")),
                False,
            )
            raise
        await operational_metrics.record_job(
            ctx.get("redis"),
            "run_notification_sweeps",
            str(ctx.get("job_id", "")),
            True,
        )
        return result


async def check_nhc_failures(ctx: dict[str, Any]) -> int:
    from src.database import async_session_factory
    from src.wxwatch import alerts, database

    archive = database.create_session()
    if archive is None:
        return 0
    async with archive, async_session_factory() as session:
        try:
            result = await alerts.notify_failed_jobs(session=session, archive=archive)
        except Exception:
            await operational_metrics.record_job(
                ctx.get("redis"),
                "check_nhc_failures",
                str(ctx.get("job_id", "")),
                False,
            )
            raise
        await operational_metrics.record_job(
            ctx.get("redis"), "check_nhc_failures", str(ctx.get("job_id", "")), True
        )
        return result


async def check_alert_outbox(ctx: dict[str, Any]) -> int:
    """Fail loudly when due emails sit unsent, so job metrics show the alert path is stuck."""
    from datetime import timedelta

    from src.database import async_session_factory
    from src.notifications import service as notification_service

    async with async_session_factory() as session:
        stalled = await notification_service.count_stalled_deliveries(
            session, older_than=timedelta(minutes=10)
        )
    healthy = stalled == 0
    await operational_metrics.record_job(
        ctx.get("redis"), "check_alert_outbox", str(ctx.get("job_id", "")), healthy
    )
    if not healthy:
        raise RuntimeError(f"{stalled} notification emails stalled for over 10 minutes")
    return 0


async def poll_flights(ctx: dict[str, Any]) -> int:
    """Refresh cached OpenSky movements. Does nothing unless the flag is on."""
    from src.flights import service as flights_service
    from src.flights.config import flights_settings

    if not flights_settings.FLIGHTS_OPENSKY_ENABLED:
        return 0
    result = await flights_service.poll_flights()
    # A fully failed poll (nothing cached) is a failure for job metrics.
    healthy = bool(result)
    await operational_metrics.record_job(
        ctx.get("redis"), "poll_flights", str(ctx.get("job_id", "")), healthy
    )
    return sum(result.values())


async def purge_expired_data(ctx: dict[str, Any]) -> int:
    """Daily retention purge (contact, data requests, pending subscriptions, comments)."""
    from src.database import async_session_factory
    from src.worker import retention

    async with async_session_factory() as session:
        try:
            result = await retention.purge_expired(session=session)
        except Exception:
            await operational_metrics.record_job(
                ctx.get("redis"),
                "purge_expired_data",
                str(ctx.get("job_id", "")),
                False,
            )
            raise
    await operational_metrics.record_job(
        ctx.get("redis"), "purge_expired_data", str(ctx.get("job_id", "")), True
    )
    return result.total


async def fetch_marine_environment(ctx: dict[str, Any]) -> int:
    """Fetch Copernicus Marine series. No-op unless credentials are set."""
    from src.database import async_session_factory
    from src.environmental import service as environmental_service
    from src.environmental.config import environmental_settings

    _ = ctx
    if not environmental_settings.marine_enabled:
        return 0
    async with async_session_factory() as session:
        return await environmental_service.refresh_marine(session)


async def fetch_air_environment(ctx: dict[str, Any]) -> int:
    """Fetch CAMS UV and dust series. No-op unless ADS credentials are set."""
    from src.database import async_session_factory
    from src.environmental import service as environmental_service
    from src.environmental.config import environmental_settings

    _ = ctx
    if not environmental_settings.air_enabled:
        return 0
    async with async_session_factory() as session:
        return await environmental_service.refresh_air(session)


async def fetch_model_guidance(ctx: dict[str, Any]) -> dict[str, str]:
    """Store the newest ECMWF/GFS runs not yet held. No-op unless enabled."""
    from src.database import async_session_factory
    from src.models_guidance import ingest
    from src.models_guidance.config import guidance_settings

    if not guidance_settings.ENABLED:
        return {}
    outcomes = await ingest.refresh_all(async_session_factory)
    await operational_metrics.record_job(
        ctx.get("redis"),
        "fetch_model_guidance",
        str(ctx.get("job_id", "")),
        "error" not in outcomes.values(),
    )
    return outcomes


class WorkerSettings:
    # Bound heartbeat staleness and prevent another worker masking this one.
    health_check_interval = 30
    health_check_key = f"grenmet:worker:{gethostname()}:health"
    redis_settings = RedisSettings.from_dsn(worker_settings.redis_dsn)
    on_startup = startup
    functions = [
        process_cap_jobs,
        ingest_cap_feeds,
        send_notification_emails,
        send_outbound_emails,
        drain_events_outbox,
        drain_outbox,
        enqueue_booking_reminders,
        expire_unpaid_bookings,
        expire_unpaid_event_orders,
        sync_event_rewards,
        send_wis2_publications,
        run_notification_sweeps,
        send_invoice_reminders,
        purge_expired_data,
        check_nhc_failures,
        check_alert_outbox,
        poll_flights,
        fetch_marine_environment,
        fetch_air_environment,
        fetch_model_guidance,
    ]
    # A poll/ingest run must not hang a worker slot; retries of the cron function
    # itself are pointless because the durable outbox already tracks per-job
    # attempts and backoff, so keep arq-level tries at 1.
    job_timeout = 300
    max_tries = 1
    cron_jobs = [
        # Drain the CAP publish outbox every CAP_JOB_POLL_SECONDS (default 10s).
        cron(
            process_cap_jobs,
            second=set(range(0, 60, worker_settings.CAP_JOB_POLL_SECONDS)),
            run_at_startup=True,
        ),
        # Poll external CAP feeds every 5 minutes.
        cron(
            ingest_cap_feeds,
            minute=set(range(0, 60, 5)),
            run_at_startup=False,
        ),
        # Drain the notification email outbox every 30 seconds.
        cron(send_notification_emails, second={0, 30}, run_at_startup=True),
        # Drain the public-flow email outbox (subscriptions, contact) too.
        cron(send_outbound_emails, second={15, 45}, run_at_startup=True),
        # Events changes (publish, cancel, approve) become notifications.
        cron(drain_events_outbox, second={5, 35}, run_at_startup=False),
        # Platform outbox (ADR-0026): emails and other side effects, offset so the
        # email worker (seconds 15 and 45) sends what this run queues.
        cron(drain_outbox, second={10, 40}, run_at_startup=False),
        # Booking reminders (24 hours ahead), hourly; one per booking.
        cron(enqueue_booking_reminders, minute={7}, run_at_startup=False),
        # Unpaid deposit holds (BOOKINGS_DEPOSIT_HOLD_MINUTES, default 30) are
        # cancelled and their slots released, every 5 minutes.
        cron(
            expire_unpaid_bookings,
            minute=set(range(2, 60, 5)),
            run_at_startup=False,
        ),
        # Unpaid paid-tier orders (EVENTS_ORDER_HOLD_MINUTES, default 30) are
        # cancelled and their stock released, every 5 minutes.
        cron(
            expire_unpaid_event_orders,
            minute=set(range(3, 60, 5)),
            run_at_startup=False,
        ),
        # Admissions become reward stamps; refunded ones are reversed.
        cron(
            sync_event_rewards,
            second={25},
            minute={0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55},
            run_at_startup=False,
        ),
        # eRegister observations queued for wis2box (retries live on the row).
        cron(send_wis2_publications, second={20, 50}, run_at_startup=False),
        # Daily reminders (expiries, overdue approvals) at 06:00 Grenada (UTC-4).
        cron(run_notification_sweeps, hour=10, minute=0, run_at_startup=False),
        # Invoice payment reminders at 07:00 Grenada (UTC-4); idempotent per stage.
        cron(send_invoice_reminders, hour=11, minute=0, run_at_startup=False),
        # Retention purge, 03:30 UTC (23:30 Grenada); idempotent and batched.
        cron(purge_expired_data, hour=3, minute=30, run_at_startup=False),
        # NHC job failures every 5 minutes; the 1-hour window stops repeat messages.
        cron(check_nhc_failures, minute=set(range(0, 60, 5)), run_at_startup=False),
        # Is the email outbox draining? Every 15 minutes.
        cron(check_alert_outbox, minute={0, 15, 30, 45}, run_at_startup=False),
        # OpenSky flight movements every 30 minutes; no-op unless the flag is on.
        cron(poll_flights, minute={5, 35}, run_at_startup=False),
        # Copernicus Marine analysis/forecast, every 6 hours; no-op without credentials.
        cron(
            fetch_marine_environment,
            hour={1, 7, 13, 19},
            minute=20,
            run_at_startup=False,
            timeout=900,
        ),
        # CAMS runs (00/12 UTC) are published about 10 hours later. ADS requests
        # queue, so allow a long job timeout.
        cron(
            fetch_air_environment,
            hour={10, 22},
            minute=30,
            run_at_startup=False,
            timeout=1800,
        ),
        # Model guidance (ECMWF IFS/AIFS, NOAA GFS point series): hourly check,
        # fetches only runs not stored yet; no-op unless MODELS_GUIDANCE_ENABLED.
        cron(
            fetch_model_guidance,
            minute={guidance_settings.POLL_MINUTE},
            run_at_startup=False,
            timeout=3600,
        ),
    ]
