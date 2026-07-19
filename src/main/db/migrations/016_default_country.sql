ALTER TABLE settings ADD COLUMN default_country TEXT DEFAULT NULL REFERENCES countries(code);
