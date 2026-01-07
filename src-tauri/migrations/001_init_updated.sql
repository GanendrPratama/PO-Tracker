    from_name TEXT DEFAULT 'POTracker'
);

-- Google Authentication table
CREATE TABLE IF NOT EXISTS google_auth (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT,
    refresh_token TEXT,
    token_expiry TEXT,
    user_email TEXT,
    user_name TEXT,
    auth_mode TEXT DEFAULT 'oauth',
    api_key TEXT
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_preorders_status ON preorders(status);
CREATE INDEX IF NOT EXISTS idx_preorders_code ON preorders(confirmation_code);
CREATE INDEX IF NOT EXISTS idx_order_items_preorder ON order_items(preorder_id);
