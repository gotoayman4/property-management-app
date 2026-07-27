-- 028: Defense-in-depth trigger to prevent UPDATE/DELETE on ledger_entries.
-- The application layer already enforces immutability (ledgerService.ts exports no mutation API),
-- but a stray db.exec('UPDATE ledger_entries…') from debug code or a future feature could
-- silently corrupt financial history. This trigger raises ABORT on any attempt.
-- Reversal entries (the only way to correct a ledger mistake) INSERT new rows, so they
-- are not affected by this trigger.

CREATE TRIGGER IF NOT EXISTS ledger_immutable_no_update
BEFORE UPDATE ON ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'Ledger entries are immutable. Use a reversal entry instead.');
END;

CREATE TRIGGER IF NOT EXISTS ledger_immutable_no_delete
BEFORE DELETE ON ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'Ledger entries are immutable. Use a reversal entry instead.');
END;
