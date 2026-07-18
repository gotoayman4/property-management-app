# ADR-002: Schema and Feature Drift from SRS v1.1

## Status

Accepted (supersedes implicit drift; aligns remaining gaps to SRS where cheap, documents deliberate divergence where alignment is costly).

## Context

A full SRS compliance audit (2026-07-18) compared the implementation against
`SRS_Property_Management_App_EN.md` v1.1, `AGENTS.md`, and the steering guidelines.
The audit found two categories of drift:

1. **Unintentional drift** — schema columns named differently from the SRS §8.2
   spec, missing tables, half-implemented features. These are bugs/gaps and will
   be **fixed** in code (not documented here).
2. **Deliberate drift** — places where the SRS spec is more elaborate than the
   product needs, where the existing implementation chose a simpler-but-sound
   design, or where renaming to match the SRS would break existing data without
   value. These are **documented here** and the SRS is the artefact that gives
   ground.

This ADR records only category 2. Every other audit finding is being fixed in
code to achieve full SRS alignment.

## Decisions

### D1. Unified `documents` table instead of four per-entity tables

**SRS §8.2** specifies four separate tables: `property_documents`,
`tenant_documents`, `contract_documents`, plus `property_images`.

**Implementation** uses a single polymorphic `documents` table with
`(entity_type, entity_id)` and a CHECK constraint limiting `entity_type` to
`property | tenant | contract | expense`.

**Rationale:** The four SRS tables have near-identical columns. A polymorphic
table eliminates ~75% of duplicated CRUD code and IPC surface while preserving
all data (the entity link is explicit and indexed). The implementation ADDS the
SRS-mandated columns that were missing (`document_type`, `is_archived`,
`issue_date`, `expiry_date`) rather than splitting the table.

**Property images (FR-PROP-08):** stored in the same `documents` table with
`entity_type='property'` and `document_type='image'`. No separate
`property_images` table is created — it would be a third near-identical table
for no functional gain.

**SRS impact:** The SRS §8.2 ERD and schema tables are updated by this ADR to
reflect the unified `documents` table. All FR-DOC-* requirements are satisfied
by the unified table; no functional capability is lost.

### D2. Tenant column naming: `fullname`, `phone`, `is_active`

**SRS §8.2** specifies `full_name`, `phone_primary` + `phone_secondary`,
`is_archived`.

**Implementation** uses `fullname` (single word), a single `phone` column, and
`is_active`.

**Rationale + fix:** `phone_secondary` is genuinely useful (SRS FR-TEN-01 lists
multiple phone numbers) — **added** via migration. `national_id` UNIQUE
constraint is **added** (SRS validation rule requires uniqueness). However,
`fullname` vs `full_name` and `is_active` vs `is_archived` are cosmetic and
renaming would touch ~30 files for zero functional value; the SRS field names
are treated as **aliases** of the implemented names. The "archived" vs
"deactivated" semantic is identical (a hidden tenant).

### D3. Contract status enum: `cancelled` (not `terminated`), adds `renewing`

**SRS §8.2** specifies contract status as `active | expired | renewing | cancelled`.

**Implementation** used `draft | active | expired | terminated`.

**Fix (not drift):** Aligning fully — migration adds the SRS values and the
terminate flow is renamed to cancel. `draft` is retained as an additional
in-progress state (useful for half-entered contracts) — this is a **superset**
of the SRS enum, not a contradiction. `terminated` rows are migrated to
`cancelled`.

### D4. Contract financial columns: `rent_amount`, `security_deposit`

**SRS §8.2** specifies `monthly_rent`, `deposit_amount`, `deposit_status`.

**Implementation** uses `rent_amount`, `security_deposit`, and (after fix)
`deposit_status`.

**Rationale:** `rent_amount` is a more accurate name (contracts may have
non-monthly frequencies, so "monthly_rent" is misleading for quarterly/annual
contracts). `security_deposit` is unambiguous. These are treated as **aliases**
of the SRS names; the SRS is updated to use the implemented names. The missing
`deposit_status` column IS added (FR-INC-02 requires it).

### D5. Recurring expenses: `description` (not `name`)

**SRS §8.2** specifies `name`, `next_due_date`, `notes`, frequencies including
`daily`/`weekly`.

**Fix (mostly not drift):** `next_due_date`, `notes`, and `daily`/`weekly`
frequencies are **added** (they were genuinely missing and are required by
FR-REC-02/08). `description` is retained instead of renaming to `name` — both
are free-text labels and renaming adds no value.

### D6. Notifications: single `notifications` table

**SRS §8.2** specifies `notification_log` (with tenant/property/contract FKs and
`pending/sent/dismissed` status) plus `notification_templates`.

**Implementation** uses a single `notifications` table with
`entity_type/entity_id` polymorphic linkage.

**Rationale:** Same polymorphic pattern as D1. `notification_templates` IS
added (FR-NOT-06 requires template storage and per-language message bodies).
The `notifications` table is kept as the operational log; it satisfies the
SRS's intent (a queryable history of generated alerts) without the FK fan-out.

### D7. WhatsApp deep-link, not WhatsApp Business API

**SRS §5.13 / FR-NOT-05** is explicit: open `https://wa.me/<number>?text=<msg>`
in the system browser; the user presses Send manually. No API integration.

**Implementation (after fix):** exactly this — `shell.openExternal` with a
pre-filled `wa.me` URL built from the tenant's `preferred_language` template.

**No drift** — recorded here only because the SRS wording could be misread as
"automatic sending," which is explicitly out of scope (SRS §2.4).

## What this ADR does NOT excuse

The following audit findings are **fixed in code**, not excused by this ADR:

- Missing DOCX/XLSX in the upload whitelist (FR-DOC-03) — fixed.
- Missing 10 MB upload cap (FR-DOC-03) — fixed.
- Hardcoded English notification bodies (NFR-I18N-02, BR-29) — fixed via
  templates + i18n keys.
- Duplicate recurring-expense generation bug (BR-23) — fixed via
  `recurring_expense_log` + uniqueness guard.
- `next_due_date` not stored (FR-REC-08) — fixed.
- Dashboard summing mixed currencies (BR-14) — fixed via per-currency grouping.
- Missing Zod validation on read-side IPC (NFR-SEC-06) — fixed.
- Raw `.toLocaleString()` without locale (NFR-I18N-07) — fixed via shared helper.
- Hardcoded country name strings (BR-29) — fixed via i18n keys.
- Missing backup module (FR-BAK-*) — implemented.
- Missing contract renewal + escalation consumer (FR-CON-04/11/12) — implemented.
- Missing 8 of 13 reports (FR-REP-*) — implemented.
- Missing instant Convert IPC (FR-FX-04) — implemented.
- Missing E2E for critical flows (NFR-TEST-02) — added.
- i18n parity check not enforced (NFR-I18N-03) — wired into pre-commit + build.
- Missing ESLint rules (import-x, no-console, no-raw-hex, logical-CSS) — added.

## Consequences

- Future AI sessions and developers should treat the implemented column names
  in D2 and D4 as canonical; the SRS field names are aliases.
- The SRS §8.2 schema tables will be annotated to point at this ADR where the
  implemented name differs.
- Any future "align schema to SRS literally" refactor is explicitly NOT
  authorized by this ADR — the polymorphic `documents` table and the alias
  column names are the chosen design.
