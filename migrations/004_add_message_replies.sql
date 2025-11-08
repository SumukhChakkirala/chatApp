-- Add reply functionality to server_messages table
ALTER TABLE server_messages 
ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES server_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_server_messages_reply ON server_messages(reply_to_id);

-- Add reply functionality to direct_messages table (for future use)
ALTER TABLE direct_messages
ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES direct_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_direct_messages_reply ON direct_messages(reply_to_id);
x