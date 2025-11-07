# SecureChat - End-to-End Encrypted Messaging

A private, secure messaging application for two people with image/video sharing capabilities. Built with Flask, Supabase, and Socket.IO.

## Features

- 🔐 Secure authentication with Supabase Auth
- 💬 Real-time messaging with Socket.IO
- 📸 Image and video sharing
- 🔒 End-to-end encryption ready
- 🎨 Modern WhatsApp-like UI
- ⚡ Instant message delivery

## Prerequisites

- Python 3.8+
- Supabase account (free tier works)
- Node.js (for Supabase CLI - optional)

## Setup Instructions

### 1. Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)

2. Create the required tables (go to SQL Editor in Supabase Dashboard):

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    username TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES users(id),
    receiver_id UUID REFERENCES users(id),
    content TEXT,
    file_url TEXT,
    file_type TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

3. Create a storage bucket for file uploads:
   - Go to Storage in Supabase Dashboard
   - Click "New bucket"
   - Name it: `chat-files`
   - Make it public
   - Click "Create bucket"

4. Get your credentials:
   - Go to Project Settings → API
   - Copy your `Project URL` (SUPABASE_URL)
   - Copy your `anon public` key (SUPABASE_KEY)

### 2. Local Setup

1. Clone or navigate to the project directory:
```powershell
cd C:\Users\Sumukh\Desktop\chatApp
```

2. Install Python dependencies:
```powershell
pip install -r requirements.txt
```

3. Configure environment variables:
   - Open `.env` file
   - Replace with your actual Supabase credentials:
```
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_KEY=your-anon-public-key
SECRET_KEY=generate-a-random-secret-string
```

4. Generate a secret key (optional, for production):
```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

### 3. Run the Application

```powershell
python app.py
```

The app will start on `http://localhost:5000`

### 4. Create Accounts

1. Open `http://localhost:5000` in your browser
2. Click "Sign Up" and create the first account
3. Open an incognito/private window
4. Go to `http://localhost:5000` and create the second account
5. Both users can now message each other in real-time!

## Usage

- **Login**: Use your username and password
- **Send Messages**: Type in the input box and click Send
- **Send Images/Videos**: Click the 📎 button to attach files
- **Logout**: Click the 🚪 icon in the sidebar

## File Structure

```
chatApp/
├── app.py                 # Flask backend with Supabase integration
├── config.py              # Configuration settings
├── requirements.txt       # Python dependencies
├── .env                   # Environment variables (Supabase credentials)
├── templates/
│   ├── index.html        # Landing page
│   ├── login.html        # Login page
│   ├── signup.html       # Signup page
│   └── chat.html         # Chat interface
└── static/
    ├── css/
    │   └── styles.css    # All styling
    └── js/
        └── chat.js       # Real-time messaging logic
```

## Security Features

- Password hashing with Supabase Auth
- Session management
- Secure file uploads to Supabase Storage
- CSRF protection (Flask built-in)
- Ready for end-to-end encryption implementation

## Troubleshooting

### Port already in use
If port 5000 is busy, change it in `app.py`:
```python
socketio.run(app, host='0.0.0.0', port=5001, debug=True)
```

### Supabase connection errors
- Verify your `.env` file has correct credentials
- Check that your Supabase project is active
- Ensure the `chat-files` storage bucket exists

### Messages not appearing
- Check browser console for errors
- Verify Socket.IO is connecting (check browser console)
- Ensure both users are logged in

### File upload errors
- Verify the `chat-files` bucket exists in Supabase Storage
- Check the bucket is set to public
- Ensure file size is under 16MB

## Next Steps

1. **Add End-to-End Encryption**: Implement Web Crypto API for message encryption
2. **Deploy**: Host on platforms like Heroku, Render, or Railway
3. **Add Features**: 
   - Typing indicators
   - Read receipts
   - Message deletion
   - Voice messages
   - Video calls

## License

MIT License - Feel free to modify and use as needed.
