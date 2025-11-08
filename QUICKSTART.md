# Quick Start Guide - SecureChat

## Fast Setup (5 minutes)

### Step 1: Supabase Setup (2 minutes)

1. **Create Supabase Project**
   - Go to https://supabase.com and sign up/login
   - Click "New Project"
   - Enter project name (e.g., "SecureChat")
   - Enter database password (save it somewhere)
   - Choose region closest to you
   - Wait ~2 minutes for setup

2. **Run SQL Schema**
   - In Supabase Dashboard → Click "SQL" in left menu
   - Click "New query"
   - Copy and paste the contents of `supabase_schema.sql`
   - Click "RUN" button

3. **Create Storage Bucket**
   - In Supabase Dashboard → Click "Storage" in left menu
   - Click "New bucket"
   - Bucket name: `chat-files`
   - Toggle "Public bucket" to ON
   - Click "Create bucket"

4. **Get Your Credentials**
   - Go to Project Settings (gear icon) → API
   - Copy these two values:
     - `Project URL` (e.g., https://xxxxx.supabase.co)
     - `anon public` key (long string starting with eyJ...)

### Step 2: Local Setup (2 minutes)

1. **Run Setup Helper**
   ```powershell
   cd C:\Users\Sumukh\Desktop\chatApp
   python setup.py
   ```
   - Paste your SUPABASE_URL when asked
   - Paste your SUPABASE_KEY when asked
   - Script will auto-generate a SECRET_KEY

   **OR manually edit `.env` file:**
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_KEY=your-anon-key-here
   SECRET_KEY=any-random-string
   ```

### Step 3: Run Database Migration (New!)

**IMPORTANT**: This adds user tags (username#ID) for multi-user chat

1. Go to Supabase Dashboard → SQL Editor
2. Click "New query"
3. Copy and paste contents of `migration_add_user_tag.sql`
4. Click "RUN"

This enables:
- Username#ID tags (e.g., `alice#a1b2c3d4`)
- User search functionality
- Multi-user chat support

### Step 4: Run the App (1 minute)

```powershell
python app.py
```

You should see:
```
* Running on http://0.0.0.0:5000
```

### Step 5: Create Accounts & Chat

1. **First User**
   - Open browser: http://localhost:5000
   - Click "Sign Up"
   - Username: `alice` (or any name)
   - Password: `password123` (min 6 chars)
   - Click "Sign Up"
   - You'll see your user tag: `alice#xxxxxxxx`

2. **Second User**
   - Open INCOGNITO/PRIVATE window
   - Go to: http://localhost:5000
   - Click "Sign Up"
   - Username: `bob` (different name)
   - Password: `password123`
   - Click "Sign Up"

3. **Start Chatting!**
   - Search for the other user using the search box
   - Type their username (e.g., "alice") or user tag
   - Click on the user from search results
   - Chat window opens - start messaging!
   - Messages appear instantly with real-time updates

## Testing File Uploads

1. Click the 📎 (paperclip) button
2. Select an image or video
3. Preview will appear below the input
4. Type a message (optional)
5. Click "Send"
6. File appears in chat with thumbnail/player

## New Multi-User Features

### User Search
- Type any username or user tag in the search box
- Results appear instantly
- Click a user to open chat with them

### User Tags
- Every user gets unique tag: `username#shortID`
- Example: `alice#a1b2c3d4`
- Displayed in sidebar next to your username
- Share your tag with friends so they can find you

### Multiple Conversations
- Chat with unlimited users
- Search and click to start new conversations
- Previous chats saved in contacts list
- Click any contact to switch conversations
- Each chat is completely separate

### Empty Chat State
- New users start with empty chat window
- Search for users to begin chatting
- No automatic pairing

## Troubleshooting

### "Error loading chat"
- Check that `.env` has correct Supabase credentials
- Verify Supabase project is active
- Check browser console (F12) for errors

### "Failed to send message"
- Ensure `chat-files` bucket exists in Supabase Storage
- Verify bucket is set to PUBLIC
- Check file size < 16MB

### Messages don't update in real-time
- Check that Socket.IO connected (browser console)
- Refresh both browser windows
- Ensure you're using http://localhost:5000 (not 127.0.0.1)

### Can't sign up
- Check Supabase Auth is enabled (Settings → Authentication)
- Verify SQL schema was run successfully
- Look at terminal output for Python errors

## Commands Cheat Sheet

```powershell
# Install dependencies
pip install -r requirements.txt

# Run setup helper
python setup.py

# Start the app
python app.py

# Generate a new secret key
python -c "import secrets; print(secrets.token_hex(32))"
```

## What's Next?

- Add end-to-end encryption for messages
- Deploy to a server (Heroku, Render, Railway)
- Add typing indicators
- Add read receipts
- Add message search
- Add emoji picker
- Add voice messages

## Need Help?

Check the full `README.md` for detailed documentation.

Happy chatting! 💬🔒
