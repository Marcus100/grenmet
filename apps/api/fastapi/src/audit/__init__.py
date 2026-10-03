"""Platform change history: field-level audit of registered models (ADR-0009 core).

Modules opt models in with :func:`src.audit.registry.track`; the flush listener in
:mod:`src.audit.listener` writes one :class:`AuditEntry` per changed row in the
same transaction as the change.
"""
