-- 034: Contract-level payment due day.
-- Each contract can specify WHICH day of the month its rent falls due (FR: per-contract due
-- date). 1 = start of month (default, previous implicit behaviour), 31 = end of month — values
-- beyond a month's length clamp to that month's last day at dues-generation time.
ALTER TABLE contracts ADD COLUMN payment_due_day INTEGER NOT NULL DEFAULT 1
  CHECK (payment_due_day BETWEEN 1 AND 31);
