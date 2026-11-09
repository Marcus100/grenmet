# Vendored IWXXM 2025-2 schemas: source and licence

**Status: licence unresolved. Confirm before this folder is published in a public repository.**

## Source

- Repository: https://github.com/wmo-im/iwxxm
- Tag: `v2025-2` (released 25 November 2025), commit `2c4db03d20f22bca74e55024ff6dc357adfff473`
- Also published at https://schemas.wmo.int/iwxxm/2025-2/
- Copied on 9 November 2026 by the eRegister IWXXM work (GitHub #1201).

## What is here

- `IWXXM/`: the XML schemas that `iwxxm.xsd` imports (the closure of `iwxxm.xsd` and
  `metarSpeci.xsd`), copied unchanged.
- `externalSchema/`: the local copies of the external schemas those files import:
  OGC GML 3.2.1, AIXM 5.1.1, ISO 19139 (gco, gmd, gsr, gss, gts), OGC OM 2.0 and
  sampling, WMO METCE 1.2 and OPM 1.2, and W3C xlink and xml. Copied unchanged from
  the upstream `externalSchema/` folder, which says it mirrors the original web locations.
- `IWXXM/rule/`: the Schematron rules (`iwxxm.sch`) and the WMO codelist RDF files it
  uses. Schematron is not run yet; the codelist RDF files are used by the tests.
- `IWXXM/ReleaseNotes-IWXXM.txt`: the upstream release notes.

Not copied: the upstream `examples/`, `html/` and `XMI/` folders, and the XSDs of
report types that `iwxxm.xsd` does not import.

## Licence

- The upstream repository declares no licence file, and the GitHub API reports no
  licence for it.
- The WMO disclaimer (https://public.wmo.int/en/disclaimer, read 9 November 2026)
  says that materials on the WMO site are covered by intellectual property rights and
  that reproduction or adaptation needs permission.

The owner must confirm with WMO (or the IWXXM maintainers, tt-avdata@groups.wmo.int)
that these files may be redistributed in the public `Marcus100/grenmet` repository.
If permission is not given, remove this folder and fetch the pinned tag at build or
test time instead.

## Use

`src/eregister/iwxxm.py` loads `IWXXM/iwxxm.xsd` with explicit local entry points for
each namespace and `allow="local"`, so validation never fetches over the network.
