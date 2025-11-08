# Database Migration Instructions

## Step 1: Add user_tag column to existing users table

Go to your Supabase project:
1. Open https://app.supabase.com
2. Select your project
3. Click on "SQL Editor" in the left sidebar
4. Click "New Query"
5. Copy and paste the contents of `migration_add_user_tag.sql`
6. Click "Run" to execute

This will:
- Add the `user_tag` column to the `users` table
- Populate existing users with username#ID format
- Make the column unique and required

## Step 2: Test the changes

1. Try logging in with an existing account
2. The user_tag should be automatically set
3. Create a new account - it will have a user_tag from the start
4. Search for users by their username or user_tag

## Important Notes

- All new users will automatically get a user_tag when they sign up
- The format is: username#(first8charsofUUID)
- Example: john#a1b2c3d4
- User tags are displayed in the UI and searchable
