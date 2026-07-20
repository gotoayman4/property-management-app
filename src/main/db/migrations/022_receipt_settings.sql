-- FR-SET-10: Receipt number prefix and starting sequence configuration.
-- INTENT: Allow the user to customize the receipt number format from Settings.
--         The prefix is the text before the year (default 'RCT'), and the starting
--         sequence is the first number used when no receipts exist for the current year.
-- CAVEAT: The year component is mandatory per SRS. Format: {prefix}-{year}-{sequence}.

ALTER TABLE settings ADD COLUMN receipt_prefix TEXT NOT NULL DEFAULT 'RCT';
ALTER TABLE settings ADD COLUMN receipt_starting_sequence INTEGER NOT NULL DEFAULT 1;
