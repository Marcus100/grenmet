# ADR-0062: Health records foundation for Barrels Health

## Status

Accepted 18 Nov 2026. The owner made the product decisions and accepted the
record the same day; agents made the decisions the owner delegated. Amends
ADR-0033 for health records and ADR-0043 for the `health` host. Nothing is
built. No real patient data may be stored until the go-live gate in
decision 12 is met.

## Context

Barrels is building **Barrels Health** at `health.barrels.gd`: electronic
medical records and practice management for private doctors and clinics in
Grenada, later the Eastern Caribbean. Three private doctors have agreed to
pilot it: a general practice with ultrasound and two locations, an internal
medicine practice, and an ear, nose and throat practice. The owner wants a
connected private-clinic network: each patient has a primary doctor,
referrals move through the system, patients may also see other doctors on
their own, and one patient portal shows a patient their records from every
clinic, within the law. The aim is fewer paper forms and less manual office
work.

Medical records are the most sensitive data Barrels would hold. Several
existing decisions do not fit them as written:

- ADR-0033 says Barrels owns all data on its platforms. Under Grenada's data
  protection law the clinic is the party responsible for its patients' data
  and patients have rights over it.
- `audit` records changes only; medical records need a log of who **viewed**
  a record.
- `worker/retention.py` purges data; medical records must be kept for years
  and then archived.
- `bookings` has no locations, no walk-in queue and no way for one doctor
  to work at several organisations without clashes.

## Evidence

Facts:

- **Data Protection Act 2023 (Act No. 1 of 2023)** is passed but needs a
  commencement order; none was found up to November 2026 (s.1(2)). High
  confidence on the text, medium on commencement.
  - Health data is "sensitive personal data". It may be processed with
    written consent, or for medical purposes by a healthcare professional or
    a person owing an equivalent duty of confidentiality (s.21). Offence: up
    to EC$200,000 and/or 2 years (s.21(3)).
  - The data user must make sure a data processor gives "sufficient
    guarantees" of security. Security factors include the place where data
    is stored and secure transfer (s.10).
  - Patients may request access and correction (ss.13, 15–16). A correction
    must keep the original (s.19(3)). Health data may be withheld where
    access would likely cause serious harm (s.22).
  - Disclosure needs consent or a directly related purpose (s.9).
  - There is no rule against storing data outside Grenada and no breach
    notification duty.
  - Company fines go up to EC$500,000 (s.42), and directors are personally
    liable (s.41).
- **Health Practitioners Act, s.117**: practitioners keep accurate records
  for 7 years after the last entry, then archive them. High confidence.
- **Electronic Transactions Act 2013**: electronic signatures and records
  are valid, but nobody is obliged to accept them (s.5). Medium confidence.
- **Public Health Act, s.39**: doctors must notify listed diseases forthwith.
  High confidence.
- **Regional standards.** Barbados (2019) and Jamaica (2020) have stricter,
  GDPR-style laws with breach and transfer rules. St Kitts launched a
  national platform on HL7 FHIR R4 in July 2026. Grenada's Ministry of
  Health is commissioning its national digital health architecture now.
  Medium confidence.
- **Reusable pieces in this repository:**
  - `organisations` (one person, many organisations; org-bound permission
    keys, ADR-0044)
  - `bookings` (ADR-0024)
  - `contacts` (ADR-0028)
  - `audit`
  - `utils/secret_box.py` (versioned field encryption)
  - `payments` (ADR-0027)
  - WeasyPrint PDFs (`billing/pdf.py`)
  - the Barrels account app (ADR-0057, ADR-0058)
  - separate databases where retention or risk differ (ADR-0003)

Interpretation:

- Building to the stricter regional standard now costs little. It also
  means no rework when Grenada's Act starts or we sell to Barbados or
  Jamaica. This is best practice.
- A practice-owned record matches both the law (the clinic is the data
  user) and how paper files work today. Heuristic.

Uncertainty:

- Whether a Barrels contract counts as an "equivalent duty of
  confidentiality".
- What "archived" means in s.117.
- Whether outpatient clinics need a licence.
- Whether pharmacies accept printed prescriptions with a verification code.

These go to the owner's lawyer. A different answer changes decisions 9 and
12, not the data model.

## Options considered

1. **Who owns a record**
   - (a) The practice owns it.
   - (b) The doctor owns it.
   - (c) One shared national-style record per patient.

   (b) breaks when a doctor leaves a clinic. (c) is legally the riskiest and
   is the Ministry's role. **Chosen: (a).**
2. **Sharing between practices**
   - (a) A consented copy.
   - (b) Live access to the other practice's record.

   (b) blurs responsibility under the Act and is hard to withdraw.
   **Chosen: (a).**
3. **Linking a patient's records across practices**
   - (a) Automatic matching on name and date of birth.
   - (b) A link code issued at the clinic after an in-person ID check.
   - (c) A national ID.

   (a) risks showing one person's record to another. (c) does not exist yet.
   **Chosen: (b)**, with the national ID stored if one appears.
4. **Where health data lives**
   - (a) New schemas in the main database.
   - (b) A separate health database (ADR-0003 allows this where risk and
     retention differ).

   **Chosen: (b).** It gives separate backups, keys, access and retention,
   and a smaller blast radius.
5. **Standards**
   - (a) Our own model only.
   - (b) Tables shaped on FHIR R4 resources, with FHIR export.
   - (c) An off-the-shelf FHIR server.

   (c) adds an unfamiliar service to run. **Chosen: (b).**

## Decision

1. **Product and hosts.**
   - Staff web app: `health.barrels.gd`, with practices as organisation-slug
     paths (ADR-0043).
   - Patient portal: inside the Barrels account app on the single Barrels ID
     (ADR-0057, ADR-0058).
   - A phone app comes later as a PWA.
   - The product key is `health`.
   - `health` is on the reserved-names list under "Ops" (`docs/ports.md`,
     `src/utils/reserved_names.py`). Reserved names may still be used by the
     platform itself, so build step 1 moves `health` from "Ops" to "Product
     and client hosts", allocates the next free product port (3042) and adds
     the host to ADR-0043's product list. `health` stays reserved, so no
     organisation can claim it as a slug.
   - Staff sign-in follows app-scoped sessions (ADR-0016) in a server-rendered
     Next.js app, like the other staff apps. The required authenticator uses
     the per-app setting from ADR-0061.
   - The patient portal is a new "Health" section in the account app, served
     by the `health` API domain.
2. **Health records are an exception to ADR-0033.**
   - Each practice is the data user (controller) of its patients' records.
     Barrels is the data processor.
   - Patients keep their legal rights.
   - Barrels owns the software and may use only anonymised, aggregated data
     for its own purposes. Re-identifiable data needs the practice's written
     agreement.
   - Every practice signs a data processing agreement before real patient
     data is stored.
3. **Practices own their records.**
   - A practice is an `org.organisation`. A solo doctor is a one-person
     practice.
   - Health tables in the separate database hold the organisation, user and
     contact IDs as plain IDs with no cross-database foreign keys
     (ADR-0003). Membership and permission checks run in the API through the
     existing organisation dependencies before any health query. Bookings
     stay in the main database and refer to health charts by ID only.
   - A doctor may work in several practices and sees one combined schedule.
   - Each patient chart lives in exactly one practice.
4. **Sharing is a consented copy.**
   - A share copies chosen parts of a chart into another practice's
     records, for example a summary, allergies, medicines or results.
   - Every share records the sender, the receiver, the time, the parts sent
     and its legal basis: patient consent, or an emergency with a reason.
   - The receiving practice owns its copy.
   - A patient can share their own record with a practice from the portal;
     the patient's request is the consent.
   - There is no live access into another practice's records.
5. **Primary doctor and referrals.**
   - A patient may name one primary doctor.
   - Referrals are sent inside the network, with a consented copy attached.
   - A patient may book any doctor without a referral.
   - Doctors outside the network get a PDF letter, or an expiring, logged
     secure link with only the consented parts, marked "sent via
     health.barrels.gd".
6. **Patient linking.**
   - The practice checks the patient's ID in person and issues a one-time
     link code, printed or sent by text or email.
   - The patient enters it in their Barrels account to link that chart.
   - There is no automatic matching across practices.
   - A parent or guardian links a child's chart the same way.
   - Link codes expire (14 days), are single use and can be revoked.
   - A code is at least 10 characters from an unambiguous alphabet, about 50
     bits. It is stored as an HMAC with a health-only key, not a bare hash,
     so a leaked database cannot be brute-forced offline.
   - Code entry is rate-limited per account and per code.
7. **Portal release rules.**
   - Rules are set per practice, by record type:
     - shown at once: appointments, receipts, prescriptions, certificates,
       vaccinations, referral letters
     - shown after a doctor reviews them: lab and imaging results
     - shown after a delay, or released by hand: visit notes
     - released only by the doctor: sensitive results, such as HIV, cancer,
       pregnancy and sexual-health findings
   - A doctor can hold any item.
   - Held items still count towards a patient's formal access request, which
     the practice answers within the legal time.
8. **Storage and encryption.**
   - A separate `health` database with its own Alembic configuration,
     backups and restore drill (ADR-0021).
   - Clinical free text and identity numbers are encrypted at field level
     using the `secret_box` pattern, with a key ring used only for health.
   - Uploads (PDF, images; DICOM later) use private storage under a
     health-only purpose.
   - No health data in Sentry, logs or analytics beyond internal IDs
     (ADR-0037).
9. **Access control.**
   - Clinic roles are org-bound keys with bundles (ADR-0044): doctor, nurse,
     reception, billing, practice manager.
   - Reception and billing never see clinical notes.
   - Restricted records, such as sexual health, are visible only to the
     treating doctor and anyone they name.
   - All clinic staff must use an authenticator app.
   - Emergency ("break the glass") access needs a written reason and alerts
     the practice manager.
   - Barrels staff have no clinical access. Support uses a time-limited,
     logged grant that the practice gives.
10. **Access log and history.**
    - Every view of a chart is logged: who, when, which patient, which part,
      and the reason for emergency access. Practice managers can read the
      log, and patients can request it.
    - Changes use `audit`.
    - Signed notes are locked. Corrections are dated additions that keep the
      original.
11. **Retention.**
    - Charts are kept for the later of 7 years after the last entry or the
      patient's 25th birthday, then archived (read-only, restricted) and
      never purged automatically. The lawyer will confirm what "archived"
      means.
    - Deleting a Barrels account (anonymisation, ADR-0058 section 7)
      unlinks every chart from that account. The charts stay with their
      practices for the retention period. Copies the patient already shared
      stay with the receiving practices.
12. **Go-live gate for real patients.** All of these are true first:
    - the production firewall is on
    - a restore of the health database has been tested
    - monitoring alerts reach the owner's phone (the owner supports clinics
      at any time they are open)
    - a security review of the health domain is clean
    - the data processing agreement is signed
    - the lawyer has answered the confidentiality, archive, clinic-licence
      and printed-prescription questions

    Until then, only synthetic patients are used, on all environments.
13. **Standards.**
    - Tables follow FHIR R4 resources (Patient, Practitioner, Organization,
      Encounter, Observation, Condition, AllergyIntolerance,
      MedicationRequest, Immunization, ServiceRequest, DiagnosticReport,
      Consent), so FHIR export is straightforward.
    - Diagnoses use ICD-10, with ICD-11 ready.
    - Lab tests use LOINC.
    - Medicines come from our own list.
    - No SNOMED CT (licence cost for non-member countries).
14. **Build order.**
    1. Health domain and database; practices, locations, roles and
       multi-practice doctors.
    2. Patients, consent and link codes.
    3. Chart core and the view log.
    4. Bookings extension: locations, sessions, walk-in queue, cross-practice
       clash check.
    5. Sharing and referrals.
    6. Portal with release rules.

    Then pilot features: certificates and prescriptions (printed, with a
    verification code), patient billing, lab and ultrasound reports,
    long-term care and specialist templates. Each step is its own issue and
    PR, labelled `risk:high` with a security review.

## Consequences

Easier:

- Selling to new practices.
- Passing a client's or regulator's privacy questions.
- Plugging into a future national system (FHIR R4).
- Meeting Grenada's Act on the day it starts.

Harder:

- A second database to back up and restore.
- Field encryption means no free-text search on encrypted fields; search
  uses names, IDs and dates.
- Every share and every view writes a log row.
- Every clinical PR needs a security review.

Forbidden:

- Real patient data before the go-live gate.
- Automatic patient matching across practices.
- Live cross-practice access.
- Barrels staff reading clinical data outside a practice-given grant.
- Clinical data in error tracking, logs or analytics.
- Purging charts within the retention period.

Follow-ups:

- Done in this change: ADR-0033's status line notes the exception.
- Step 1: move `health` to the product hosts (decision 1), and add the
  `health` database to the database table in ADR-0003 with its reason
  (legal duty, retention and risk).
- Check `docs/security.md` and `docs/data-architecture.md` for wording that
  says Barrels owns all data, and point it to this exception.
- Add `health` to `entitlements.PRODUCTS` and its keys to `permissions.py`
  in build step 1.
- Draft the data processing agreement and a one-page security summary for
  clinics (owner and lawyer).
