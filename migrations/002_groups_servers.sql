-- Step 2: Groups/Servers System Database Tables
-- Run this in Supabase SQL Editor after 001_friend_system.sql

-- ============================================
-- SERVERS/GROUPS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT valid_name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 100)
);

CREATE INDEX idx_servers_owner ON servers(owner_id);
CREATE INDEX idx_servers_created ON servers(created_at DESC);

-- ============================================
-- SERVER MEMBERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS server_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_server_member UNIQUE(server_id, user_id)
);

CREATE INDEX idx_server_members_server ON server_members(server_id);
CREATE INDEX idx_server_members_user ON server_members(user_id);

-- ============================================
-- SERVER INVITES TABLE
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

CREATE INDEX idx_server_invites_server ON server_invites(server_id);
CREATE INDEX idx_server_invites_invitee ON server_invites(invitee_id);
CREATE INDEX idx_server_invites_status ON server_invites(status);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to check if user is member of a server
CREATE OR REPLACE FUNCTION is_server_member(sid UUID, uid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM server_members
        WHERE server_id = sid AND user_id = uid
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get user's role in a server
CREATE OR REPLACE FUNCTION get_user_server_role(sid UUID, uid UUID)
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM server_members
    WHERE server_id = sid AND user_id = uid;
    
    RETURN user_role;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-add member when invite is accepted
CREATE OR REPLACE FUNCTION add_member_on_invite_accept()
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

-- Trigger to auto-add member when invite is accepted
CREATE TRIGGER trigger_add_member_on_invite
AFTER UPDATE ON server_invites
FOR EACH ROW
EXECUTE FUNCTION add_member_on_invite_accept();

-- Function to auto-add owner as member when server is created
CREATE OR REPLACE FUNCTION add_owner_as_member()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO server_members (server_id, user_id, role)
    VALUES (NEW.id, NEW.owner_id, 'owner');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-add owner as member
CREATE TRIGGER trigger_add_owner_as_member
AFTER INSERT ON servers
FOR EACH ROW
EXECUTE FUNCTION add_owner_as_member();

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify tables were created:
-- SELECT * FROM servers LIMIT 1;
-- SELECT * FROM server_members LIMIT 1;
-- SELECT * FROM server_invites LIMIT 1;
-- SELECT is_server_member('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000001'::uuid);
