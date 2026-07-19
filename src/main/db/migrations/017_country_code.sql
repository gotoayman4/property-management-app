-- Add country_code column to tenants table for WhatsApp-compatible international phone format.
-- The country code stores the dialing prefix without the '+' sign (e.g., "962" for Jordan).
-- The phone column stores the local number (e.g., "790000000").
-- The full international number is constructed as +{country_code}{phone} for messaging.
ALTER TABLE tenants ADD COLUMN country_code TEXT DEFAULT NULL;
