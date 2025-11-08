-- Migration: Add user_tag column and discriminator to users table
-- Run this in Supabase SQL Editor

-- Create sequence for auto-incrementing discriminator (starts at 1)
CREATE SEQUENCE IF NOT EXISTS user_discriminator_seq START 1;

-- Create function to get next discriminator value
CREATE OR REPLACE FUNCTION get_next_discriminator()
RETURNS INTEGER AS $$
BEGIN
    RETURN nextval('user_discriminator_seq');
END;
$$ LANGUAGE plpgsql;

-- Add columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS discriminator INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_tag TEXT;

-- Update existing users with discriminator and user_tag
UPDATE users 
SET discriminator = nextval('user_discriminator_seq'),
    user_tag = username || '#' || LPAD(CAST(nextval('user_discriminator_seq') AS TEXT), 5, '0')
WHERE discriminator IS NULL OR user_tag IS NULL;

-- Make columns not null and unique
ALTER TABLE users ALTER COLUMN discriminator SET NOT NULL;
ALTER TABLE users ALTER COLUMN user_tag SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_discriminator_key ON users(discriminator);
CREATE UNIQUE INDEX IF NOT EXISTS users_user_tag_key ON users(user_tag);