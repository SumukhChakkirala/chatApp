# Step 1: Friend System - Setup & Testing Guide

## ✅ What Was Built

### Database Tables:
- `friend_requests` - Stores pending/accepted/rejected friend requests
- `friendships` - Stores active friendships
- Helper functions and triggers for automatic friendship creation

### Backend API Routes:
- `POST /api/friends/request` - Send friend request
- `GET /api/friends/requests/pending` - Get pending requests
- `POST /api/friends/accept/<id>` - Accept friend request
- `POST /api/friends/reject/<id>` - Reject friend request
- `GET /api/friends/` - Get friends list
- `DELETE /api/friends/<user_id>` - Remove friend

### Test Page:
- `/friends-test` - Interactive test page to verify everything works

---

## 🚀 Setup Instructions

### 1. Run Database Migration

1. Go to https://app.supabase.com
2. Select your project
3. Click **SQL Editor** → **New Query**
4. Copy the contents of `migrations/001_friend_system.sql`
5. Paste and click **RUN**

### 2. Restart Your App

```powershell
# Stop the app if running (Ctrl+C)
python app.py
```

### 3. Test the Friend System

1. **Login** to your app: http://localhost:5000
2. **Go to test page**: http://localhost:5000/friends-test
3. **Copy your user tag** (shown at top of page)
4. **Open incognito window** and login with a different user
5. **Go to test page** in incognito: http://localhost:5000/friends-test
6. **Send friend request** using the other user's tag

---

## 🧪 Testing Checklist

### Test 1: Send Friend Request
- [ ] Enter friend's user_tag in the input box
- [ ] Click "Send Request"
- [ ] Should see success message
- [ ] Request should appear in "Outgoing Requests" section

### Test 2: Receive & Accept Friend Request
- [ ] Switch to the other user's browser
- [ ] Click "Refresh" in Pending Requests section
- [ ] Should see request in "Incoming Requests"
- [ ] Click "Accept"
- [ ] Both users should now see each other in "Friends" section

### Test 3: Reject Friend Request
- [ ] Send another request
- [ ] Click "Reject" instead of "Accept"
- [ ] Request should disappear
- [ ] Should NOT appear in friends list

### Test 4: Remove Friend
- [ ] In Friends section, click "Remove" next to a friend
- [ ] Confirm the removal
- [ ] Friend should disappear from list
- [ ] Other user should also not see you as friend

### Test 5: Edge Cases
- [ ] Try sending request to yourself (should fail with error)
- [ ] Try sending request to same user twice (should fail)
- [ ] Try sending request to someone you're already friends with (should fail)

---

## 🐛 Troubleshooting

### Error: "Table friend_requests does not exist"
- **Solution**: Run the migration SQL in Supabase

### Error: "Function are_friends does not exist"
- **Solution**: Make sure you ran the ENTIRE migration file

### Error: "Unauthorized"
- **Solution**: Make sure you're logged in

### Friend requests not showing up
- **Solution**: Click "Refresh" button or reload the page

---

## ✅ Verification

If all tests pass, you should see:
- ✅ Can send friend requests by user_tag
- ✅ Receive incoming requests
- ✅ Accept/reject requests
- ✅ Friends list updates automatically
- ✅ Can remove friends
- ✅ Cannot befriend yourself
- ✅ Cannot send duplicate requests

---

## 📝 Notes

- Friend requests use user_tag for searching (e.g., `alice#00001`)
- Once accepted, a friendship is automatically created via database trigger
- Friendships are stored with user1_id < user2_id to avoid duplicates
- All friend actions are logged in the database

---

## ➡️ Next Step

Once you verify this works:
- Tell me "**Step 1 verified**" and I'll move to **Step 2: Create Servers/Groups**
- Or tell me what issues you're seeing so I can fix them

---

**Current Status**: ⏸️ Waiting for your verification before moving to Step 2
