"""Keys of the money feature flags (story 5.5, story 8.7, ADR-0020).

Every money feature gates its routes and behaviours on one of these keys. The flag
rows are runtime data: the owner creates each one in admin with a success metric
before enabling it outside local (see ``src/feature_flags/AGENTS.md``). No migration
creates them. A key that has no row is off.

Keys are kebab-case (``KEY_PATTERN``). Add a key here, not inline, when a money
feature ships.
"""

#: Stripe Connect for New Zealand businesses (ADR-0027): onboarding, status, disputes,
#: the platform fee and the direct charge in ``src.payments.connect``.
PAYMENTS_STRIPE_CONNECT = "payments-stripe-connect"
