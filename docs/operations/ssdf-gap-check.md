# Secure development gap check (NIST SSDF)

**Status:** Assessment of repository evidence on 2026-10-15; not an audit and not a compliance claim  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-15

Compares how this repository builds and ships software with the four groups of the
NIST Secure Software Development Framework (SP 800-218 v1.1): prepare the
organisation, protect the software, produce well-secured software, and respond to
vulnerabilities. Practice names are paraphrased; check NIST's text before using this
for any formal compliance purpose. The [security baseline](../security.md) remains the
statement of implemented controls.

**How it was checked.** Read-only: repository files, GitHub's settings API as the
repository owner, and the workflow definitions. **Not checked:** two-factor enforcement
for people, access to servers and the production runner host, secrets handling on hosts,
backup encryption, staff training, supplier risk, and anything inside GAA's network.

States: **Meets** has repository evidence; **Partial** is present with a stated gap;
**Gap** is missing; **Not checked**.

## Prepare the organisation

| Practice | Evidence | State |
| --- | --- | --- |
| Define security requirements | [Security baseline](../security.md), rules for engineers, authorisation model; weather security needs in the [continuity plan](cybersecurity-continuity.md) | Partial: no per-product requirements for Events, Pay or Signal |
| Roles and responsibilities | Owners named per document; agent rules in `AGENTS.md`; DTO and ISDS roles in the continuity plan | Partial: no named security owner for the repository |
| Supporting toolchain | Frozen lockfiles, Biome and Ruff (including security rules), type checks, suppression and coverage ratchets, risk tiers, hooks that block dangerous git commands and protected files | Meets |
| Criteria for security checks | Required checks on protected branches; an [image vulnerability policy](../security.md#image-vulnerability-policy) with dated exceptions | Meets |
| Secure development environments | Protected branches (below); read-only default workflow token; workflows on the self-hosted production runner start only from manual, scheduled or reusable-workflow triggers, never from pull requests | Partial: secret scanning off; see below |

## Protect the software

| Practice | Evidence | State |
| --- | --- | --- |
| Protect source from tampering | Rulesets on `main` and `staging`: pull request and six required checks, no deletion, no force push, no bypass actors. `dev` has no ruleset and takes direct pushes by design. No `CODEOWNERS`, no required reviewers (0 approvals), no signed-commit requirement. | Partial |
| Verify release integrity | Actions are pinned to commit SHAs and deploys reference images by digest. No image signing, build provenance or software bill of materials. | Gap |
| Archive each release | Published GitHub releases and an image tag per release. Retained release manifests for rollback are listed as later work in the [release runbook](release-runbook.md). | Partial |
| Fork pull request safety | Approval is required only for first-time contributors; the safest setting is every external contributor | Partial |

## Produce well-secured software

| Practice | Evidence | State |
| --- | --- | --- |
| Design to meet security requirements | 21 decision records, authorisation model, app-scoped sessions | Partial: no threat model found anywhere in `docs/` |
| Review the design | Decision records reviewed through pull requests | Partial: not tied to a security checklist |
| Reuse well-secured software | Lockfiles; Dependabot for GitHub Actions, uv, Docker, Docker Compose and npm | Meets |
| Follow secure coding practice | Ruff security rules (the bandit set), Biome, repository conventions, ratchets on suppressions | Meets |
| Secure build configuration | Frozen installs and digest-pinned base images in the Dockerfiles | Meets; build reproducibility not checked |
| Review and analyse code | Required checks and agent run records. No static analysis beyond Ruff and Biome (no CodeQL or Semgrep). No required human review. | Partial |
| Test the running software | Unit and integration tests, Schemathesis fuzzing of every read-only API operation, Playwright smoke tests | Meets; no scan of a running staging site |
| Secure defaults | MFA for privileged accounts, a Content-Security-Policy and standard headers, a web application firewall and verified rate limiting are all listed as gaps in the security baseline. No CSP was found in the web apps' configuration. | Gap |

## Respond to vulnerabilities

| Practice | Evidence | State |
| --- | --- | --- |
| Find vulnerabilities continuously | Trivy scans every image and uploads results to the Security tab. GitHub reported secret scanning, push protection, Dependabot alerts and Dependabot security updates **disabled** and there was no `SECURITY.md`; all are now fixed (see the changes section below). | Meets after the 2026-10-15 changes |
| Assess and fix | Image vulnerability policy with exceptions and review dates; Dependabot pull requests (two open on 2026-10-15, both green) | Meets |
| Find root causes | Post-launch review, friction issues and run records. A formal incident-response SOP is a listed gap in the continuity plan. | Partial |

## Changes made on 2026-10-15

After this assessment the repository owner enabled, and a read-back confirmed:
secret scanning with push protection, Dependabot alerts, Dependabot security updates,
approval of workflow runs for every external contributor, and GitHub private
vulnerability reporting. [`SECURITY.md`](../../SECURITY.md) now tells researchers how to
report. The first three priorities below are done; the tables above show the state
before these changes.

## Priorities

**High, cheap, mostly settings (done 2026-10-15)**
1. Turn on secret scanning with push protection, Dependabot alerts and Dependabot
   security updates. They are available for public repositories and need the repository
   owner. A leaked key in a public repository is the highest-impact failure here.
2. Add a `SECURITY.md` that says how to report a vulnerability privately. It needs a
   contact address that someone decides on.
3. Require approval for every external contributor's workflow runs.

**High, small design work**
4. Write a short threat model for the three paths that matter most: sign-in and
   sessions, warning publication (CAP), and staff personal data.
5. Close the privileged-account MFA gap and add CSP and security headers to the web apps,
   both already tracked in the security baseline.

**Medium**
6. Produce a software bill of materials and signed build provenance for release images.
7. Add `CODEOWNERS` for workflows, migrations and authentication code, and require human
   review for changes the risk tier rates high.
8. Add a code-analysis workflow (for example CodeQL) and a scan of the running staging site.
9. Write the incident-response SOP (already a continuity-plan gap).

**Later**
10. Evaluate whether `dev` needs a ruleset once more than one person pushes to it.
