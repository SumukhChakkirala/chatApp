# Supabase SQL Schema Setup
# Run this in your Supabase SQL Editor: https://app.supabase.com -> Your Project -> SQL Editor

# Enable UUID extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

# Users table (linked to Supabase Auth)
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    username TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

# Messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES users(id),
    receiver_id UUID REFERENCES users(id),
    content TEXT,
    file_url TEXT,
    file_type TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

# Index for faster message queries
CREATE INDEX idx_messages_sender_receiver ON messages(sender_id, receiver_id, created_at);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
