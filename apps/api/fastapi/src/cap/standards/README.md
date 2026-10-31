# CAP 1.2 schema (vendored)

`CAP-v1.2.xsd` is the official XML Schema for the Common Alerting Protocol
version 1.2, published by OASIS. It is used unmodified.

| Item | Value |
| --- | --- |
| File | `CAP-v1.2.xsd` |
| Source URL | <https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2.xsd> (the schema location named in section 3, Conformance, of the standard) |
| Standard | Common Alerting Protocol Version 1.2, OASIS Standard: <https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2-os.html> |
| Retrieved | 2026-10-30 |
| SHA-256 | `b7798ef25868b068c97b268bda02d067c7d4ba9373adc5638bf37105804ee723` |
| Licence | The file's own header reads "Copyright OASIS Open 2010 All Rights Reserved". This copy is redistributed unmodified with that notice. The terms are OASIS's copyright and intellectual property policies. Check them before redistributing the file outside this repository. |

## Use

- `src/cap/xsd.py` validates generated XML at publish (`publish` and the
  cancellation message) and imported XML (`import`, and CAP feed entries). A
  document that fails is refused with HTTP 422 and logged.
- `tests/cap/test_cap_xsd_corpus.py` checks every real alert shape against this
  file. `tests/cap/test_cap_xsd_refusal.py` checks that non-conforming documents
  are refused.

## Updating

Do not edit the file. To refresh it, download the source URL, compare the SHA-256
with the table, and update the table and the test corpus together. A changed
schema is a change to what counts as a valid warning, so it needs a review.
