# Migration Steps - Discord-Style User Tags

## Step 1: Run Migration in Supabase

1. Go to https://app.supabase.com
2. Select your project
3. Click **SQL Editor** → **New Query**
4. Copy and paste the entire `migration_add_user_tag.sql` file
5. Click **RUN**

This will:
- Add `discriminator` column (auto-incrementing integer)
- Add `user_tag` column (username#00001 format)
- Update existing users with sequential numbers
- Set up auto-increment for new users

## Step 2: Restart Your App

```powershell
# Stop the app (Ctrl+C if running)
# Then start again:
python app.py
```

## Step 3: Test

### For Existing Users:
- **Logout** from the app
- **Login** again
- Your user tag will now show as `username#00001`, `username#00002`, etc.

### For New Users:
- Sign up normally
- User tag is automatically created with next sequential number
- First user: `alice#00001`
- Second user: `bob#00002`
- Third user: `charlie#00003`

## What Changed?

### Before:
- User tags: `sumukh#a1b2c3d4` (random UUID segment)

### After:
- User tags: `sumukh#00001` (sequential 5-digit number)
- Pramiti: `pramiti#00002`
- Next user: `username#00003`

## Example User Tags:
```
sumukh#00001
pramiti#00002
alice#00003
bob#00004
charlie#00005
...
sumukh#99999 (supports up to 99,999 users)
```

## Troubleshooting

If you see errors:
1. Make sure you ran the ENTIRE migration SQL
2. Check Supabase logs for errors
3. Verify the sequence was created: `SELECT * FROM user_discriminator_seq;`
4. Check existing users: `SELECT username, discriminator, user_tag FROM users;`
