# Barrels AI workflow register

**Status:** Pilot register

**Owner:** Barrels Grenada product and engineering

**Last updated:** 2026-11-19

Barrels uses AI to assist work with defined inputs, checks and human decisions.
The [AI strategy](../strategy/barrels-ai-strategy.md) describes the platform
direction. This register records the workflows being evaluated and the
evidence that supports taking each one further.

## Current workflows

| Workflow | Trigger and permitted inputs | Accountable owner and human decision | Current evidence and next check |
| --- | --- | --- | --- |
| [Printix operations briefs](printix-operations-brief-pilot.md) | An operator requests a readiness or closeout brief. The supplied packet contains verified checklist states and, at closeout, optional aggregate counts. | Barrels operations nominates a trial lead. The lead checks the brief and the organiser decides readiness and closure. | Synthetic checks cover missing evidence, blocked checks and exact counts. At rehearsal, compare time through correction with the fixed brief and record missed exceptions or unsupported claims. |
| [Events WhatsApp drafts](events-whatsapp-draft-pilot.md) | An authenticated organiser opts in from the editor of a qualifying saved public listing. The draft uses the title, Grenada date and start time, public venue and canonical link. | Barrels product and engineering own the trial. The organiser reviews and edits the opening line and decides whether to send the announcement. | Synthetic checks cover eligibility, local time, rescheduling and the fixed fact block. Complete the signed-in staging check, then compare review time and unsupported claims with an organiser. |

Both pilots have a fixed draft. Use it whenever the assistant is unavailable,
changes a fact, misses an exception or takes more time through review. The
pilot runbooks specify how the operator starts a run, checks the output and
records a correction. The operator passes the prompt to an approved assistant.
Start the comparison with synthetic inputs. For a real trial, use the tool
and fields approved for that workflow. The Printix prompt carries checklist
states and optional aggregate counts. The Events prompt carries only the
listing fields in the table. Sending, publishing and event decisions remain
in the normal workflow.

## Record acceptance evidence

Use the same source facts for the fixed and AI-assisted versions. Time each
from drafting through review and correction. Check both original outputs
against the source before correcting either one. Record unsupported claims and
missed exceptions even if the reviewer catches them.

In the private trial record, keep the workflow and prompt version, case
reference, method, tool or model, elapsed minutes, findings, corrections and
acceptance decision. Record observed costs when available. The accountable
owner reviews paired results, including failed or unavailable runs, before
extending the trial. Repository documentation carries synthetic cases and
shareable aggregate results.

For any later workflow proposal, identify the request or event that starts it,
the authorised source and fields, the person accountable for the decision, the
permitted actions, and how operators return to the existing process. Specify
the evidence that would justify additional access, spending or autonomy. The
[portfolio plan](../portfolio/barrels-portfolio-implementation-plan.md) governs
investment. GAA and GMS work uses its own client programme and acceptance
authority.

## Engineering workflows

The [engineering factory](../agents/factory.md) already records delivery and
verification. For one candidate workflow, compare a single implementation
worker with specialist implementation workers using the same starting commit,
task and acceptance checks. Keep independent review in both runs. Compare
accepted results, blocked checks, elapsed time, review and correction minutes,
and tool usage where recorded. An aggregate delivery report establishes a
baseline for the repository. Matched runs compare the delivery approaches on
the same task.
