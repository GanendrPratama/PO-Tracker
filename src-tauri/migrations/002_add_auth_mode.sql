-- Add auth_mode and api_key columns to google_auth table
ALTER TABLE google_auth ADD COLUMN auth_mode TEXT DEFAULT 'oauth';
ALTER TABLE google_auth ADD COLUMN api_key TEXT;
