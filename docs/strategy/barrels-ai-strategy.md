# Barrels AI and Data Platform Strategy

**Status:** Working strategy  
**Recorded:** 2026-09-23  
**Horizon:** Five years, with a 2035 national-ambition reference  
**Owner:** Barrels Grenada

## Purpose

This document records how Barrels Grenada can help Grenada, and later the
Caribbean, adopt AI as a general-purpose capability. It complements the
[Barrels Grenada Product Strategy](barrels-product-strategy.md): the
transaction-layer thesis and the Events-first priority remain unchanged. AI and
data capabilities form an additional pillar that real product and client needs
pull into the platform.

The
[Barrels Portfolio Implementation Plan](../portfolio/barrels-portfolio-implementation-plan.md)
remains authoritative for priority and sequencing. The proposed platform
architecture is recorded in
[ADR-0014](../adr/0014-barrels-platform-core-direction.md). Ownership questions
are drafted in the [IP boundary draft](barrels-ip-boundary.md).

This document does not authorize implementation, infrastructure purchases,
schema changes, new dependencies, or client commitments.

## National context

An AI-native Grenada treats AI like electricity or telecommunications: a
capability embedded throughout government, education, business, science, and
everyday services. For a small state, the defensible goal is not frontier-model
research. It is to become one of the most capable small states at adopting,
adapting, and building applications on top of AI.

The national stack has a dependency order. AI should not be built before the
layers beneath it:

| Layer | Contents |
| --- | --- |
| Applications | Copilots, decision tools, citizen and staff assistants, agents |
| AI layer | Model gateway, retrieval, machine learning, APIs |
| Data layer | Registries, GIS, statistics, documents, sensors, open data |
| Digital public infrastructure | Digital ID, authentication, payments, interoperability, consent, notifications |
| Infrastructure | Cloud, networks, cybersecurity, edge |
| Governance | Privacy, audit, standards, legislation |

Context cited in the source strategy (verify before external use): the
Government Division of ICT lists AI tools, automation, and data management as
focus areas; CARDTP/DG4R is building interoperability, digital identification,
authentication, and payments; Grenada enacted a Data Protection Act in 2023;
World Bank figures put internet use near 70% and the 2024 Statistical
Performance Indicator at 50.8/100; the Caribbean Telecommunications Union
published a Caribbean AI Task Force report in July 2026; and UNESCO's Readiness
Assessment Methodology offers a structured national assessment.

## Barrels' role

Barrels is a commercial participant, not the national AI programme. Its role is
to supply the software, platform, engineering capability, and implementation
skill that make AI adoption inexpensive and repeatable for Grenadian
organizations.

Barrels integrates with government digital public infrastructure. It does not
replace it. Barrels does not seek to own:

- The national identity system or national citizen data
- Government authority, public decision-making, or AI regulation
- Government interoperability standards
- Every digital service in Grenada

Barrels does own its software, platform, intellectual property, domain models,
training programmes, research, and commercial relationships, subject to the
[IP boundary draft](barrels-ip-boundary.md).

## Barrels Core

Barrels builds one platform underneath its products rather than separate
infrastructure per product. It has five capabilities:

| Capability | Provides | Existing foundation |
| --- | --- | --- |
| Identity and organizations | Users, organizations, memberships, workspaces, permissions, tenant context | `packages/auth`, FastAPI `auth` |
| Data | Ingestion, storage, APIs, GIS, quality and metadata | PostgreSQL, S3-compatible storage, `storage`, GMS data pipelines |
| AI | Provider-agnostic gateway: routing, policies, usage and cost metering, evaluation | Not present |
| Knowledge | Document ingestion, retrieval with citations, organization-scoped search | Not present |
| Automate | Workflows with AI steps and human approval | ARQ `worker`, `notifications`, HR approval workflow |

Cross-cutting: audit (`src/audit`), security, observability, and billing.

Agents are a later feature assembled from these capabilities (model, knowledge,
tools, workflow, permissions, audit). They are not a separate architecture.

Capabilities are introduced when an approved product or client need pulls them,
consistent with portfolio policy 4. The expected order is organizations and
tenancy, audit, AI provider abstraction, usage accounting, knowledge ingestion
and retrieval, workflow primitives, connectors, evaluations, and then agents.

## Products and verticals

Horizontal offers built on Barrels Core:

- **Barrels AI Gateway:** one API for multiple model providers, with policy,
  logging, cost control, and fallback.
- **Barrels Knowledge:** secure search and question answering over an
  organization's policies, SOPs, legislation, manuals, and reports, with
  citations.
- **Barrels Automate:** document and process automation sold on time saved, not
  on the model used.
- **Barrels Data:** data engineering as a prerequisite for useful AI.

Candidate verticals where Barrels has domain access or advantage:

| Vertical | Opportunity | Relationship to current work |
| --- | --- | --- |
| Weather and climate | Forecast support, verification, alert communication, sector decision support | GMS is a client; its systems are a proving ground, not a Barrels product |
| Aviation | Small-airport operations, staff tools, incident and shift management | GAA is a client; productization requires portfolio policy 6 |
| Government | Document intelligence, citizen assistance, workflow automation | Integrates with national DPI |
| Business and SMEs | AI-assisted operations inside Barrels Business | Extends the product strategy |
| Tourism | Visitor assistance, local discovery, business engagement | Extends Events and discovery |
| Education | Teacher and learner tools, used first by Barrels Academy | Explore |

The productization test: can many other organizations buy most of what was
built? Productization of client software still requires the evidence, rights,
supportability, and tenant-isolation gate in the portfolio plan.

The regional path is Grenada, then the OECS, CARICOM, and other small island
developing states.

## Barrels Academy and Barrels Labs

- **Barrels Academy** delivers AI literacy, AI-for-work, and engineering
  training to individuals, companies, schools, and government. It is also
  Barrels' talent pipeline: students, interns, engineers, and ecosystem
  founders.
- **Barrels Labs** does applied research in tropical meteorology, climate,
  geospatial, agriculture, disaster, marine, and Caribbean-language AI. It
  produces datasets, open-source software, prototypes, and product candidates.
  It stays small until the core company generates sustainable cash flow.

## Principles

- **Customers own their data.** Barrels does not acquire or sell national,
  institutional, or personal datasets.
- **Vendor portability.** Applications depend on Barrels AI, not directly on a
  single model provider.
- **Auditable AI.** Important AI executions record organization, user,
  provider, model, prompt version, retrieval sources, tools called, output,
  cost, and human review.
- **Cost accounting.** Usage and cost are attributable per organization,
  feature, workflow, and model.
- **Human accountability.** AI assists high-stakes decisions; it does not
  obscure who made them.
- **Deployment choice.** The architecture should eventually support
  Barrels-hosted, dedicated-cloud, and sovereign or on-premises deployments.
- **Existing stack first.** PostgreSQL with pgvector, Redis/ARQ, and
  S3-compatible storage before any new datastore or distributed service.

## Revenue direction

Barrels should shift from implementation and consulting revenue towards
recurring platform, SaaS, usage, managed-service, and support revenue, with
training as a steady cash generator.

An aspirational customer mix, not a target commitment:

| Segment | Share |
| --- | --- |
| Government | 20–30% |
| Enterprise | 20–25% |
| SME | 20–25% |
| Education and training | 10–15% |
| Regional exports | 20%+ and growing |

Government is a customer, not the whole company.

## Failure modes to avoid

- **AI theatre:** demonstrations that do not improve the underlying process.
- **Vendor capture:** architecture designed around one supplier.
- **GPU-first thinking:** buying compute before workloads, people, and data
  exist.
- **Bad-data automation:** AI layered on fragmented data and paper processes.
- **Speculative platform:** years of infrastructure without customers.
- **Product sprawl:** many products on separate infrastructure under one logo.
- **Ignoring security:** AI expands the attack surface.
- **Automating accountability away.**
- **Digital exclusion:** connectivity cannot be assumed universal.

## Measures

| Level | Measures |
| --- | --- |
| Platform AI | AI cost per organization and feature, gross margin on AI usage, audit completeness, evaluation pass rate, provider fallback success |
| Knowledge and Automate | Answer citation rate, process time before and after, human-override rate |
| Adoption | Organizations using Barrels Core, repeat use, renewal |
| Academy | People trained, completion, placement into Barrels or partner roles |
| National contribution | Organizations moved from paper to digital, services with APIs, locally developed AI IP |

## Horizon mapping

| Horizon | Work |
| --- | --- |
| Now | Record this strategy and the proposed platform direction; resolve IP boundaries; no AI implementation |
| Next | Organizations and tenant context, and platform audit, pulled by Events and GAA multi-department needs |
| Later | AI provider abstraction and usage metering, pulled by a first approved AI feature |
| Explore | Barrels Knowledge pilot over GMS/GAA procedures; Barrels Academy; Barrels Labs; verticals beyond current clients; regional expansion |

Each move between horizons requires the gates in the portfolio plan.
