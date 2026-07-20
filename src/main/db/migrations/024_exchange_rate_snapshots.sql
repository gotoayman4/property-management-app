-- Phase 13 (addition): Exchange-rate snapshots on financial transactions.
-- INTENT: Freeze the reporting-currency conversion at write time so reports are deterministic
--         and economically correct — a May payment converted at May's rate stays at May's rate
--         forever, regardless of later rate changes (BR-13: ledger still records the
--         transaction's own currency; the snapshot is an ADDITIONAL frozen fact used only for
--         reporting-currency consolidation).
-- CONSTRAINT (BR-20): ledger_entries remains append-only; the snapshot columns are populated
--             once at write time and never updated by application code.
-- CONSTRAINT: columns are NULLABLE. A row with no resolvable rate at write time stores NULL
--             for all three columns; reports then fall back to the native amount (graceful).
-- DECISION: Mirror the columns on payments, expenses, AND ledger_entries. The ledger is the
--           write chokepoint (every transaction funnels through appendLedgerEntry), but the
--           per-row detail reports and dashboard list views read payments/expenses directly —
--           mirroring avoids a join for every read. base_amount = amount * exchange_rate.
-- DECISION: Backfill resolves the rate using the same direct-then-reverse rule as
--           getLatestRate (currencyHelper.ts): try (currency -> reporting_currency) first,
--           then fall back to 1 / (reporting_currency -> currency). This keeps the migration
--           self-contained and consistent with the runtime resolution rule.

-- 1. Add snapshot columns (nullable) to all three monetary tables.
ALTER TABLE payments ADD COLUMN reporting_currency TEXT;
ALTER TABLE payments ADD COLUMN exchange_rate REAL;
ALTER TABLE payments ADD COLUMN base_amount REAL;

ALTER TABLE expenses ADD COLUMN reporting_currency TEXT;
ALTER TABLE expenses ADD COLUMN exchange_rate REAL;
ALTER TABLE expenses ADD COLUMN base_amount REAL;

ALTER TABLE ledger_entries ADD COLUMN reporting_currency TEXT;
ALTER TABLE ledger_entries ADD COLUMN exchange_rate REAL;
ALTER TABLE ledger_entries ADD COLUMN base_amount REAL;

-- 2. Backfill IDENTITY rows first: transaction currency equals the configured reporting
--    currency. Rate is 1 and base_amount equals the native amount. These need no
--    exchange_rates lookup.
UPDATE payments
   SET reporting_currency = (SELECT reporting_currency FROM settings WHERE id = 1),
       exchange_rate = 1,
       base_amount = amount
 WHERE currency = (SELECT reporting_currency FROM settings WHERE id = 1);

UPDATE expenses
   SET reporting_currency = (SELECT reporting_currency FROM settings WHERE id = 1),
       exchange_rate = 1,
       base_amount = amount
 WHERE currency = (SELECT reporting_currency FROM settings WHERE id = 1);

UPDATE ledger_entries
   SET reporting_currency = (SELECT reporting_currency FROM settings WHERE id = 1),
       exchange_rate = 1,
       base_amount = (debit - credit)
 WHERE currency = (SELECT reporting_currency FROM settings WHERE id = 1);

-- 3. Backfill FOREIGN-currency rows using the DIRECT rate
--    (currency -> reporting_currency), latest effective_date wins.
UPDATE payments
   SET reporting_currency = (SELECT reporting_currency FROM settings WHERE id = 1),
       exchange_rate = (
         SELECT er.rate FROM exchange_rates er
          WHERE er.currency_from = payments.currency
            AND er.currency_to = (SELECT reporting_currency FROM settings WHERE id = 1)
          ORDER BY er.effective_date DESC, er.fetched_at DESC
          LIMIT 1
       ),
       base_amount = amount * (
         SELECT er.rate FROM exchange_rates er
          WHERE er.currency_from = payments.currency
            AND er.currency_to = (SELECT reporting_currency FROM settings WHERE id = 1)
          ORDER BY er.effective_date DESC, er.fetched_at DESC
          LIMIT 1
       )
 WHERE currency <> (SELECT reporting_currency FROM settings WHERE id = 1)
   AND EXISTS (
         SELECT 1 FROM exchange_rates er
          WHERE er.currency_from = payments.currency
            AND er.currency_to = (SELECT reporting_currency FROM settings WHERE id = 1)
       );

UPDATE expenses
   SET reporting_currency = (SELECT reporting_currency FROM settings WHERE id = 1),
       exchange_rate = (
         SELECT er.rate FROM exchange_rates er
          WHERE er.currency_from = expenses.currency
            AND er.currency_to = (SELECT reporting_currency FROM settings WHERE id = 1)
          ORDER BY er.effective_date DESC, er.fetched_at DESC
          LIMIT 1
       ),
       base_amount = amount * (
         SELECT er.rate FROM exchange_rates er
          WHERE er.currency_from = expenses.currency
            AND er.currency_to = (SELECT reporting_currency FROM settings WHERE id = 1)
          ORDER BY er.effective_date DESC, er.fetched_at DESC
          LIMIT 1
       )
 WHERE currency <> (SELECT reporting_currency FROM settings WHERE id = 1)
   AND EXISTS (
         SELECT 1 FROM exchange_rates er
          WHERE er.currency_from = expenses.currency
            AND er.currency_to = (SELECT reporting_currency FROM settings WHERE id = 1)
       );

UPDATE ledger_entries
   SET reporting_currency = (SELECT reporting_currency FROM settings WHERE id = 1),
       exchange_rate = (
         SELECT er.rate FROM exchange_rates er
          WHERE er.currency_from = ledger_entries.currency
            AND er.currency_to = (SELECT reporting_currency FROM settings WHERE id = 1)
          ORDER BY er.effective_date DESC, er.fetched_at DESC
          LIMIT 1
       ),
       base_amount = (debit - credit) * (
         SELECT er.rate FROM exchange_rates er
          WHERE er.currency_from = ledger_entries.currency
            AND er.currency_to = (SELECT reporting_currency FROM settings WHERE id = 1)
          ORDER BY er.effective_date DESC, er.fetched_at DESC
          LIMIT 1
       )
 WHERE currency <> (SELECT reporting_currency FROM settings WHERE id = 1)
   AND EXISTS (
         SELECT 1 FROM exchange_rates er
          WHERE er.currency_from = ledger_entries.currency
            AND er.currency_to = (SELECT reporting_currency FROM settings WHERE id = 1)
       );

-- 4. Backfill FOREIGN-currency rows that have NO direct rate, using the REVERSE rate
--    (reporting_currency -> currency), inverted: rate = 1 / stored_reverse_rate.
--    These rows were skipped by step 3 (no direct pair).
UPDATE payments
   SET reporting_currency = (SELECT reporting_currency FROM settings WHERE id = 1),
       exchange_rate = 1 / (
         SELECT er.rate FROM exchange_rates er
          WHERE er.currency_from = (SELECT reporting_currency FROM settings WHERE id = 1)
            AND er.currency_to = payments.currency
          ORDER BY er.effective_date DESC, er.fetched_at DESC
          LIMIT 1
       ),
       base_amount = amount / (
         SELECT er.rate FROM exchange_rates er
          WHERE er.currency_from = (SELECT reporting_currency FROM settings WHERE id = 1)
            AND er.currency_to = payments.currency
          ORDER BY er.effective_date DESC, er.fetched_at DESC
          LIMIT 1
       )
 WHERE reporting_currency IS NULL
   AND currency <> (SELECT reporting_currency FROM settings WHERE id = 1)
   AND EXISTS (
         SELECT 1 FROM exchange_rates er
          WHERE er.currency_from = (SELECT reporting_currency FROM settings WHERE id = 1)
            AND er.currency_to = payments.currency
       );

UPDATE expenses
   SET reporting_currency = (SELECT reporting_currency FROM settings WHERE id = 1),
       exchange_rate = 1 / (
         SELECT er.rate FROM exchange_rates er
          WHERE er.currency_from = (SELECT reporting_currency FROM settings WHERE id = 1)
            AND er.currency_to = expenses.currency
          ORDER BY er.effective_date DESC, er.fetched_at DESC
          LIMIT 1
       ),
       base_amount = amount / (
         SELECT er.rate FROM exchange_rates er
          WHERE er.currency_from = (SELECT reporting_currency FROM settings WHERE id = 1)
            AND er.currency_to = expenses.currency
          ORDER BY er.effective_date DESC, er.fetched_at DESC
          LIMIT 1
       )
 WHERE reporting_currency IS NULL
   AND currency <> (SELECT reporting_currency FROM settings WHERE id = 1)
   AND EXISTS (
         SELECT 1 FROM exchange_rates er
          WHERE er.currency_from = (SELECT reporting_currency FROM settings WHERE id = 1)
            AND er.currency_to = expenses.currency
       );

UPDATE ledger_entries
   SET reporting_currency = (SELECT reporting_currency FROM settings WHERE id = 1),
       exchange_rate = 1 / (
         SELECT er.rate FROM exchange_rates er
          WHERE er.currency_from = (SELECT reporting_currency FROM settings WHERE id = 1)
            AND er.currency_to = ledger_entries.currency
          ORDER BY er.effective_date DESC, er.fetched_at DESC
          LIMIT 1
       ),
       base_amount = (debit - credit) / (
         SELECT er.rate FROM exchange_rates er
          WHERE er.currency_from = (SELECT reporting_currency FROM settings WHERE id = 1)
            AND er.currency_to = ledger_entries.currency
          ORDER BY er.effective_date DESC, er.fetched_at DESC
          LIMIT 1
       )
 WHERE reporting_currency IS NULL
   AND currency <> (SELECT reporting_currency FROM settings WHERE id = 1)
   AND EXISTS (
         SELECT 1 FROM exchange_rates er
          WHERE er.currency_from = (SELECT reporting_currency FROM settings WHERE id = 1)
            AND er.currency_to = ledger_entries.currency
       );
