-- Step 3: Server Messages System
-- Run this in Supabase SQL Editor after 002_groups_servers.sql

-- ============================================
-- SERVER MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS server_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    image_url TEXT,
    video_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT valid_message_content CHECK (char_length(content) >= 1 AND char_length(content) <= 5000)
);

CREATE INDEX idx_server_messages_server ON server_messages(server_id);
CREATE INDEX idx_server_messages_sender ON server_messages(sender_id);
CREATE INDEX idx_server_messages_created ON server_messages(created_at DESC);

-- Function to check if user can send message in server (must be member)
CREATE OR REPLACE FUNCTION can_send_server_message(sid UUID, uid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN is_server_member(sid, uid);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify:
-- SELECT * FROM server_messages LIMIT 1;
-- SELECT can_send_server_message('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000001'::uuid);
