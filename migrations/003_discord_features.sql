-- Migration 003: Discord Features - COMPLETE FRESH START
-- This migration creates all tables needed for a Discord-clone chat app
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. DIRECT MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS direct_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    file_url TEXT,
    file_type TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_sender ON direct_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_receiver ON direct_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_users ON direct_messages(sender_id, receiver_id, created_at DESC);

-- ============================================
-- 2. FRIEND REQUESTS TABLE
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

CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON friend_requests(sender_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON friend_requests(receiver_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_status ON friend_requests(status);

-- ============================================
-- 3. FRIENDSHIPS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT ordered_friendship CHECK (user1_id < user2_id),
    CONSTRAINT unique_friendship UNIQUE(user1_id, user2_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user1 ON friendships(user1_id);
CREATE INDEX IF NOT EXISTS idx_friendships_user2 ON friendships(user2_id);

-- ============================================
-- 4. SERVERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    icon_url TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_servers_owner ON servers(owner_id);

-- ============================================
-- 5. SERVER MEMBERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS server_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_server_member UNIQUE(server_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_server_members_server ON server_members(server_id);
CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members(user_id);

-- ============================================
-- 6. SERVER INVITES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS server_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_server_invite UNIQUE(server_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS idx_server_invites_server ON server_invites(server_id);
CREATE INDEX IF NOT EXISTS idx_server_invites_invitee ON server_invites(invitee_id);
CREATE INDEX IF NOT EXISTS idx_server_invites_status ON server_invites(status);

-- ============================================
-- 7. SERVER MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS server_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content TEXT,
    file_url TEXT,
    file_type TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_server_messages_server ON server_messages(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_server_messages_user ON server_messages(user_id);

-- ============================================
-- 8. HELPER FUNCTIONS
-- ============================================

-- Function to check if two users are friends
DROP FUNCTION IF EXISTS are_friends(UUID, UUID);
CREATE FUNCTION are_friends(uid1 UUID, uid2 UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM friendships
        WHERE (user1_id = LEAST(uid1, uid2) AND user2_id = GREATEST(uid1, uid2))
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get all friends of a user
DROP FUNCTION IF EXISTS get_user_friends(UUID);
CREATE FUNCTION get_user_friends(uid UUID)
RETURNS TABLE(friend_id UUID, username TEXT, user_tag TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE 
            WHEN f.user1_id = uid THEN f.user2_id
            ELSE f.user1_id
        END as friend_id,
        u.username,
        u.user_tag
    FROM friendships f
    JOIN users u ON (
        CASE 
            WHEN f.user1_id = uid THEN f.user2_id
            ELSE f.user1_id
        END = u.id
    )
    WHERE f.user1_id = uid OR f.user2_id = uid;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 9. TRIGGERS
-- ============================================

-- Function to auto-add server owner as member
DROP FUNCTION IF EXISTS add_owner_as_member() CASCADE;
CREATE FUNCTION add_owner_as_member()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO server_members (server_id, user_id, role)
    VALUES (NEW.id, NEW.owner_id, 'owner');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-add owner as server member
DROP TRIGGER IF EXISTS trigger_add_owner_as_member ON servers;
CREATE TRIGGER trigger_add_owner_as_member
AFTER INSERT ON servers
FOR EACH ROW
EXECUTE FUNCTION add_owner_as_member();

-- Function to create friendship after friend request accepted
DROP FUNCTION IF EXISTS create_friendship_on_accept() CASCADE;
CREATE FUNCTION create_friendship_on_accept()
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

-- Trigger to auto-create friendship
DROP TRIGGER IF EXISTS trigger_create_friendship ON friend_requests;
CREATE TRIGGER trigger_create_friendship
AFTER UPDATE ON friend_requests
FOR EACH ROW
EXECUTE FUNCTION create_friendship_on_accept();

-- Function to add member when server invite is accepted
DROP FUNCTION IF EXISTS add_member_on_invite_accept() CASCADE;
CREATE FUNCTION add_member_on_invite_accept()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
        INSERT INTO server_members (server_id, user_id, role)
        VALUES (NEW.server_id, NEW.invitee_id, 'member')
        ON CONFLICT (server_id, user_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-add member on invite accept
DROP TRIGGER IF EXISTS trigger_add_member_on_invite_accept ON server_invites;
CREATE TRIGGER trigger_add_member_on_invite_accept
AFTER UPDATE ON server_invites
FOR EACH ROW
EXECUTE FUNCTION add_member_on_invite_accept();

-- ============================================
-- Migration Complete!
-- ============================================
