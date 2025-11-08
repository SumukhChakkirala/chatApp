# Step 1: Integrated Friend System - Setup & Testing Guide

## Overview
The friend system is now fully integrated into the main chat interface. Users can only message friends, and search results show contextual actions based on friendship status.

## Setup Instructions

### 1. Database Migration
If you haven't already, run the migration in Supabase:

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open `migrations/001_friend_system.sql`
4. Copy the entire content
5. Paste into the SQL Editor
6. Click **Run**

Verify the migration succeeded by checking these tables exist:
- `friend_requests`
- `friendships`

### 2. Start the Application
```powershell
python app.py
```

The app should start on http://localhost:5000

## New Features

### 🎯 Friends Icon in Header
- **Location**: Top-right of the sidebar (next to theme switcher)
- **Badge**: Shows number of pending incoming friend requests
- **Action**: Click to open the Friends Panel

### 🔍 Smart Search Results
Search for users to see context-aware buttons:
- **"Add Friend"**: User is not a friend, no pending request
- **"Pending"**: You've already sent a request to this user
- **"Accept"**: This user sent you a friend request
- **"Chat"**: You're already friends - click to start chatting

### 💬 Friend-Only Messaging
- You can **only** open chats with friends
- Attempting to chat with non-friends shows an alert
- Search results guide you to send a friend request first

### 📋 Friends Panel (Modal)

#### Friends Tab
- View all your friends
- **Chat**: Opens a conversation with the friend
- **Remove**: Unfriends the user (with confirmation)

#### Pending Tab
- **Incoming Requests**: Accept or reject requests from others
- **Outgoing Requests**: Cancel requests you've sent
- Badge shows count of incoming requests

## Testing Checklist

### ✅ Basic Friend Flow
1. **Register/Login** with two different accounts (use different browsers or incognito)
2. **Search for User 2** from User 1's account
3. **Click "Add Friend"** - button should change to "Pending"
4. **Switch to User 2** - notice notification badge on friends icon
5. **Open Friends Panel** - see incoming request in "Pending" tab
6. **Click "Accept"** - friendship is created
7. **Switch to User 1** - search for User 2 again, button now says "Chat"
8. **Click "Chat"** - conversation opens successfully

### ✅ Friends Panel Features
1. **Click Friends Icon** - modal opens smoothly
2. **Friends Tab** - shows all accepted friends
3. **Pending Tab** - shows incoming and outgoing requests separately
4. **Badge Update** - accepting/rejecting updates the badge count
5. **Close Modal** - click X or backdrop to close

### ✅ Messaging Restrictions
1. **Search for non-friend** - no chat option, only "Add Friend"
2. **Try to message** before being friends - alert appears
3. **Accept friend request** - now can chat normally
4. **Remove friend** - search again, back to "Add Friend"

### ✅ UI/UX Elements
1. **Notification Badge** - appears/disappears based on pending requests
2. **Tab Badges** - "Pending" tab shows count
3. **Dark Mode** - all friend UI elements look good in dark mode
4. **Animations** - modal slides up, items hover smoothly
5. **Responsive** - works on different screen sizes

### ✅ Edge Cases
1. **Send request to yourself** - should show error
2. **Send duplicate request** - should show error
3. **Accept already accepted** - should handle gracefully
4. **Remove and re-add friend** - should work normally
5. **Search while requests pending** - shows correct status

## API Endpoints Used

### Friend System
- `POST /api/friends/request` - Send friend request
- `GET /api/friends/requests/pending` - Get all pending requests
- `POST /api/friends/accept/<id>` - Accept request
- `POST /api/friends/reject/<id>` - Reject/cancel request
- `GET /api/friends/` - Get friends list
- `DELETE /api/friends/<user_id>` - Remove friend
- `GET /api/friends/check/<user_id>` - Check friendship status

### Existing
- `GET /api/search_users?q=<query>` - Search users
- `POST /api/send_message` - Send message (should add friendship check)
- `GET /api/messages?friend_id=<id>` - Load messages

## Security Considerations

### ⚠️ Important: Server-Side Validation Needed
The current implementation checks friendship on the client side before allowing chat. For production, you should also add server-side validation:

**Modify `/api/send_message` in app.py:**
```python
@app.route('/api/send_message', methods=['POST'])
@login_required
def send_message():
    # ... existing code ...
    
    # ADD THIS: Check if users are friends
    friends_check = supabase.rpc('are_friends', {
        'uid1': sender_id,
        'uid2': receiver_id
    }).execute()
    
    if not friends_check.data:
        return jsonify({
            'success': False,
            'error': 'You can only message friends'
        }), 403
    
    # ... rest of existing code ...
```

## Troubleshooting

### Badge not updating
- Check browser console for errors
- Verify `/api/friends/requests/pending` returns data
- Badge updates every 5 seconds automatically

### Search results not showing buttons
- Verify `/api/friends/check/<user_id>` endpoint works
- Check browser console for API errors
- Make sure JavaScript is not blocked

### Modal not opening
- Check if `friendsBtn` element exists
- Look for JavaScript errors in console
- Verify CSS classes are applied

### Cannot send messages
- Verify you're friends with the user
- Check server logs for errors
- Ensure database migration ran successfully

## Next Steps

After testing Step 1, you can proceed to:

**Step 2**: Create Groups/Servers
- Server creation interface
- Server management
- Friend-only server invites

**Step 3**: Separate DM/Server Sections
- Split sidebar into DMs and Servers
- Server/channel navigation
- Quick switching between sections

**Step 4**: Channels in Servers
- Multiple channels per server
- Channel creation/management
- Channel permissions

## File Structure

```
chatApp/
├── migrations/
│   └── 001_friend_system.sql      # Database schema
├── routes/
│   ├── __init__.py
│   └── friends.py                  # Friend API endpoints
├── static/
│   ├── css/
│   │   └── styles.css             # Friend UI styles added
│   └── js/
│       └── chat.js                 # Friend functionality added
├── templates/
│   └── chat.html                   # Friends panel integrated
└── app.py                          # Friends blueprint registered
```

## Notes

- The friends panel uses a modal overlay (z-index: 1000)
- Notification badge pulses to draw attention
- All friend operations update the UI in real-time
- Dark mode fully supported for all new components
- Empty states guide users when no friends/requests exist

---

**Ready to test?** Start with the testing checklist above and verify each feature works as expected!
