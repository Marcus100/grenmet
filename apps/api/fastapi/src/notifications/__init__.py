"""Platform notifications: in-app inbox plus an email outbox (ADR-0009 core).

Modules register their events (:mod:`src.notifications.events`) and call
:func:`src.notifications.service.notify` inside their own transaction. Email is
delivered later by the worker from :class:`NotificationDelivery` rows, so a
rolled-back change never sends mail.
"""
