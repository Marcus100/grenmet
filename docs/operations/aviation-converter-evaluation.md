# Aviation converter evaluation

23 September 2026. J-Aviation engineering assessment; no dependency installed,
receiver selected or submission performed. Preserve accepted manual TAC procedures.

Source candidate: EMPIRIC2 TAC-to-IWXXM commit
`c3d9780d33458ec947464e8afbe8a3eed9af5fb2` (22 September).
Its [package metadata](https://github.com/EMPIRIC2/TAC-to-IWXXM/blob/c3d9780d33458ec947464e8afbe8a3eed9af5fb2/packages/tac2iwxxm/pyproject.toml)
declares `tac2iwxxm` 2026.9.22, MIT, Python >=3.12 and dependencies msgspec,
PyYAML and tac-decoding. Separate optional validators are tac-validate and
iwxxm-validate. Python 3.14 runtime compatibility has not been demonstrated here.

The package contains METAR/SPECI and TAF emission assets as well as other report
families. Asset presence is not case-by-case operational compliance. Its
[validator documentation](https://github.com/EMPIRIC2/TAC-to-IWXXM/blob/c3d9780d33458ec947464e8afbe8a3eed9af5fb2/packages/iwxxm-validate/README.md)
describes bundled validation assets and warns that the pure-Python path can skip
some Schematron evaluation. An overall success flag alone is insufficient.
Native validation adds a build/runtime dependency that needs separate evaluation.

WMO's [IWXXM release list](https://github.com/wmo-im/iwxxm/releases) currently
identifies 2025-2 as latest. That is not automatic receiver compatibility.
Approve an explicit version/profile and pin validation assets plus checksums;
do not use a moving branch or silently change profiles.

Before requesting installation approval, obtain the receiver/profile requirement
or explicitly choose the file-only sandbox target; inventory transitive licenses,
wheel availability for Python 3.14 and required native runtime, then propose exact
locked versions. No claim of completed runtime/license audit is made yet.

Acceptance corpus must cover METAR, SPECI and TAF; normal, NIL, correction,
amendment/cancellation and missing/exceptional groups where applicable to the
chosen profile. Record TAC parse, XML well-formedness, XSD, Schematron and required
code-list/profile validation separately as passed/failed/skipped/unavailable.
Any required skip/unavailable result blocks full-validation status. Retain input,
artifact and validation-asset hashes with the originating saved draft revision.
Generation, validation, queued submission and receiver acceptance are separate
events; only actual receiver evidence proves receipt.
