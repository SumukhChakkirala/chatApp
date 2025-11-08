-- Step 1: Friend System Database Tables
-- Run this in Supabase SQL Editor

-- ============================================
-- FRIEND REQUESTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS friend_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_friend_request UNIQUE(sender_id, receiver_id),
    CONSTRAINT no_self_request CHECK (sender_id != receiver_id)
);

CREATE INDEX idx_friend_requests_sender ON friend_requests(sender_id);
CREATE INDEX idx_friend_requests_receiver ON friend_requests(receiver_id);
CREATE INDEX idx_friend_requests_status ON friend_requests(status);

-- ============================================
-- FRIENDSHIPS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT ordered_friendship CHECK (user1_id < user2_id),
    CONSTRAINT unique_friendship UNIQUE(user1_id, user2_id)
);

CREATE INDEX idx_friendships_user1 ON friendships(user1_id);
CREATE INDEX idx_friendships_user2 ON friendships(user2_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to check if two users are friends
CREATE OR REPLACE FUNCTION are_friends(uid1 UUID, uid2 UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM friendships
        WHERE (user1_id = LEAST(uid1, uid2) AND user2_id = GREATEST(uid1, uid2))
    );
END;
$$ LANGUAGE plpgsql;

-- Function to create friendship after friend request accepted
CREATE OR REPLACE FUNCTION create_friendship_on_accept()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
        INSERT INTO friendships (user1_id, user2_id)
        VALUES (
            LEAST(NEW.sender_id, NEW.receiver_id),
            GREATEST(NEW.sender_id, NEW.receiver_id)
        )
        ON CONFLICT (user1_id, user2_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create friendship when request is accepted
CREATE TRIGGER trigger_create_friendship
AFTER UPDATE ON friend_requests
FOR EACH ROW
EXECUTE FUNCTION create_friendship_on_accept();

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify tables were created:
-- SELECT * FROM friend_requests LIMIT 1;
-- SELECT * FROM friendships LIMIT 1;
-- SELECT are_friends('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000001'::uuid);
