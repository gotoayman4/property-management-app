-- Change the default banking payment method from 'cash' to 'bank_transfer'.
-- Existing databases that never changed the setting (still on the old default) are migrated;
-- users who explicitly chose another method keep their choice.
UPDATE settings SET default_payment_method = 'bank_transfer' WHERE default_payment_method = 'cash';