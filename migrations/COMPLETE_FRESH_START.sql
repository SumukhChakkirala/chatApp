-- COMPLETE FRESH MIGRATION FOR DISCORD CLONE
-- Run this in Supabase SQL Editor (new project)

-- ============================================
-- 1. USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    discriminator INTEGER,
    user_tag TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at DESC);

-- ============================================
-- 2. USER TAGS (username#00001)
-- ============================================
CREATE SEQUENCE IF NOT EXISTS user_discriminator_seq START 1;

DROP FUNCTION IF EXISTS get_next_discriminator();
CREATE FUNCTION get_next_discriminator()
RETURNS INTEGER AS $$
BEGIN
    RETURN nextval('user_discriminator_seq');
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-assign discriminator and user_tag on user creation
DROP FUNCTION IF EXISTS set_user_tag() CASCADE;
CREATE FUNCTION set_user_tag()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.discriminator IS NULL THEN
        NEW.discriminator := nextval('user_discriminator_seq');
    END IF;
    IF NEW.user_tag IS NULL THEN
        NEW.user_tag := NEW.username || '#' || LPAD(NEW.discriminator::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_user_tag ON users;
CREATE TRIGGER trigger_set_user_tag
BEFORE INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION set_user_tag();

-- ============================================
-- 3. DIRECT MESSAGES (1-on-1 chats)
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
CREATE INDEX IF NOT EXISTS idx_direct_messages_created ON direct_messages(created_at DESC);

-- ============================================
-- 4. FRIEND REQUESTS
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
-- 5. FRIENDSHIPS
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
-- 6. SERVERS
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
-- 7. SERVER MEMBERS
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
-- 8. SERVER INVITES
-- ============================================
CREATE TABLE IF NOT EXISTS server_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_server_invite UNIQUE(server_id, invitee_id),
    CONSTRAINT no_self_invite CHECK (inviter_id != invitee_id)
);

CREATE INDEX IF NOT EXISTS idx_server_invites_server ON server_invites(server_id);
CREATE INDEX IF NOT EXISTS idx_server_invites_invitee ON server_invites(invitee_id);
CREATE INDEX IF NOT EXISTS idx_server_invites_status ON server_invites(status);

-- ============================================
-- 9. SERVER MESSAGES
-- ============================================
CREATE TABLE IF NOT EXISTS server_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT,
    file_url TEXT,
    file_type TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_server_messages_server ON server_messages(server_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_server_messages_sender ON server_messages(sender_id);

-- ============================================
-- 10. HELPER FUNCTIONS
-- ============================================

-- Check if users are friends
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

-- Check if user is server member
DROP FUNCTION IF EXISTS is_server_member(UUID, UUID);
CREATE FUNCTION is_server_member(sid UUID, uid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM server_members
        WHERE server_id = sid AND user_id = uid
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 11. TRIGGERS
-- ============================================

-- Auto-create friendship on friend request accept
DROP FUNCTION IF EXISTS create_friendship_on_accept() CASCADE;
CREATE FUNCTION create_friendship_on_accept()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
        INSERT INTO friendships (user1_id, user2_id)
        VALUES (LEAST(NEW.sender_id, NEW.receiver_id), GREATEST(NEW.sender_id, NEW.receiver_id))
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_friendship ON friend_requests;
CREATE TRIGGER trigger_create_friendship
AFTER UPDATE ON friend_requests
FOR EACH ROW
EXECUTE FUNCTION create_friendship_on_accept();

-- Auto-add server owner as member
DROP FUNCTION IF EXISTS add_owner_as_member() CASCADE;
CREATE FUNCTION add_owner_as_member()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO server_members (server_id, user_id, role)
    VALUES (NEW.id, NEW.owner_id, 'owner');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_add_owner_as_member ON servers;
CREATE TRIGGER trigger_add_owner_as_member
AFTER INSERT ON servers
FOR EACH ROW
EXECUTE FUNCTION add_owner_as_member();

-- Auto-add member when server invite is accepted
DROP FUNCTION IF EXISTS add_member_on_invite_accept() CASCADE;
CREATE FUNCTION add_member_on_invite_accept()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
        INSERT INTO server_members (server_id, user_id, role)
        VALUES (NEW.server_id, NEW.invitee_id, 'member')
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_add_member_on_invite ON server_invites;
CREATE TRIGGER trigger_add_member_on_invite
AFTER UPDATE ON server_invites
FOR EACH ROW
EXECUTE FUNCTION add_member_on_invite_accept();

-- ============================================
-- 12. ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow service role all" ON users;
DROP POLICY IF EXISTS "Allow service role all" ON direct_messages;
DROP POLICY IF EXISTS "Allow service role all" ON friend_requests;
DROP POLICY IF EXISTS "Allow service role all" ON friendships;
DROP POLICY IF EXISTS "Allow service role all" ON servers;
DROP POLICY IF EXISTS "Allow service role all" ON server_members;
DROP POLICY IF EXISTS "Allow service role all" ON server_invites;
DROP POLICY IF EXISTS "Allow service role all" ON server_messages;

-- Allow service role (backend) to bypass RLS
CREATE POLICY "Allow service role all" ON users FOR ALL USING (true);
CREATE POLICY "Allow service role all" ON direct_messages FOR ALL USING (true);
CREATE POLICY "Allow service role all" ON friend_requests FOR ALL USING (true);
CREATE POLICY "Allow service role all" ON friendships FOR ALL USING (true);
CREATE POLICY "Allow service role all" ON servers FOR ALL USING (true);
CREATE POLICY "Allow service role all" ON server_members FOR ALL USING (true);
CREATE POLICY "Allow service role all" ON server_invites FOR ALL USING (true);
CREATE POLICY "Allow service role all" ON server_messages FOR ALL USING (true);

-- ============================================
-- MIGRATION COMPLETE!
-- ============================================
