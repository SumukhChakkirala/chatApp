# Complete Testing Guide - Server Messaging & Settings

## 🚀 What's New

### Server Messaging
- **All members can send messages** in a server
- **Real-time notifications** for all server members
- **Admin/Owner roles** - whoever creates the server is the owner

### Settings Features

#### Server Settings (Click settings icon in server chat header)
- **View all members** with their roles (Owner/Admin/Member)
- **Admin controls**: Owners and Admins can remove members
- **Cannot remove owner**

#### DM Settings (Click settings icon in DM chat header)
- **View friendship details**: Username, User Tag, Friends Since date
- **Unfriend option**: Remove friend from your friends list
- **Automatically closes chat** when unfriended

---

## ⚙️ IMPORTANT: Run Database Migration First!

**Before testing, copy and run this SQL in your Supabase SQL Editor:**

```sql
-- Step 3: Server Messages System
-- Run this in Supabase SQL Editor after 002_groups_servers.sql

-- ============================================
-- SERVER MESSAGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS server_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    image_url TEXT,
    video_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT valid_message_content CHECK (char_length(content) >= 1 AND char_length(content) <= 5000)
);

CREATE INDEX idx_server_messages_server ON server_messages(server_id);
CREATE INDEX idx_server_messages_sender ON server_messages(sender_id);
CREATE INDEX idx_server_messages_created ON server_messages(created_at DESC);

-- Function to check if user can send message in server (must be member)
CREATE OR REPLACE FUNCTION can_send_server_message(sid UUID, uid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN is_server_member(sid, uid);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify:
-- SELECT * FROM server_messages LIMIT 1;
-- SELECT can_send_server_message('00000000-0000-0000-0000-000000000000'::uuid, '00000000-0000-0000-0000-000000000001'::uuid);
```

---

## 📝 Testing Checklist

### Part 1: Server Messaging (Basic)
1. **Login as Sumukh**
   - Open existing server or create a new one
   - Click on the server name in the SERVERS section
   
2. **Send a Server Message**
   - Type a message in the input box
   - Press Send
   - ✅ Message should appear with your username

3. **Test Real-Time Notifications**
   - Open another browser (or incognito)
   - Login as Pramiti
   - Accept server invite if needed
   - Click on the same server
   - **From Sumukh's window**: Send a message
   - ✅ **Pramiti should see it instantly** without refresh

4. **Test Multiple Members**
   - Have both Sumukh and Pramiti send messages
   - ✅ Both should see each other's messages in real-time
   - ✅ Messages show sender's username
   - ✅ Time shows in IST format (HH:MM)

---

### Part 2: Server Settings
1. **As Server Owner (Sumukh)**
   - Open a server you created
   - Click the **settings icon** (⚙️) in the chat header
   - ✅ Modal opens showing "Server Settings"
   
2. **View All Members**
   - ✅ See list of all members
   - ✅ Each member shows: Avatar, User Tag, Role (owner/admin/member)
   - ✅ Your role shows as "OWNER"

3. **Admin Controls - Remove Member**
   - If Pramiti is in the server
   - ✅ You should see "Remove" button next to Pramiti's name
   - Click "Remove" → Confirm
   - ✅ Pramiti removed from server
   - ✅ Member list updates immediately

4. **Test as Regular Member (Pramiti)**
   - Login as Pramiti
   - Open a server where you're NOT the owner
   - Click settings icon
   - ✅ See all members
   - ✅ NO "Remove" buttons (regular members can't remove others)

---

### Part 3: DM Settings
1. **Open DM with a Friend**
   - Login as Sumukh
   - Click on Pramiti in DIRECT MESSAGES
   - Click the **settings icon** (⚙️) in the chat header
   - ✅ Modal opens showing "Chat Settings"

2. **View Friendship Details**
   - ✅ Shows Username
   - ✅ Shows User Tag
   - ✅ Shows "Friends Since: [Date]"

3. **Test Unfriend**
   - Click the red "Unfriend" button
   - ✅ Confirmation dialog appears
   - Confirm
   - ✅ Success message
   - ✅ Chat closes automatically
   - ✅ Pramiti removed from sidebar
   - ✅ Can no longer send messages

4. **Verify From Other Side**
   - Login as Pramiti
   - ✅ Sumukh no longer in her friends list
   - ✅ Cannot send messages to Sumukh

---

## 🎯 Advanced Testing

### Multi-Member Server Chat
1. **Create a server with 3+ members**
   - Sumukh creates server
   - Invites Pramiti and another friend
   - All accept

2. **Test Broadcasting**
   - Open 3 browser windows (one per user)
   - Have each user join the server
   - Send messages from each window
   - ✅ All users see ALL messages in real-time

3. **Test Member Removal Mid-Chat**
   - While all 3 are chatting
   - Owner removes one member
   - ✅ Removed member loses access
   - ✅ Other members continue chatting

### Settings Edge Cases
1. **Try to remove owner**
   - As admin, try to remove the server owner
   - ✅ Should NOT have "Remove" button for owner

2. **Switch Between DM and Server**
   - Open a DM chat → Check settings (shows friendship date)
   - Switch to server chat → Check settings (shows members)
   - ✅ Settings context switches correctly

3. **Unfriend While Chatting**
   - Have an active conversation open
   - Unfriend the person
   - ✅ Chat closes immediately
   - ✅ Message input disappears

---

## 🐛 Common Issues

### Server Messages Not Appearing
- **Check**: Did you run the `003_server_messages.sql` migration?
- **Check**: Are both users members of the same server?
- **Check**: Open browser console - any errors?

### Settings Icon Not Showing
- **Check**: Make sure you have an active chat open
- **Check**: Settings icon only appears in chat header when chatting

### Cannot Remove Member
- **Check**: Are you Owner or Admin?
- **Check**: Cannot remove the server owner
- **Check**: Cannot remove yourself

### Unfriend Not Working
- **Check**: Are you actually friends? (Check in Friends panel)
- **Check**: Browser console for error messages

---

## 🎨 UI Features

### Server Chat Header
```
[Server Avatar] Server Name       [Settings ⚙️] [Invite 👥]
                X members
```

### DM Chat Header
```
[User Avatar] User#12345         [Settings ⚙️]
              Online
```

### Server Settings Modal
- Title: "Server Name - Settings"
- Section: "Server Members"
- Each member: Avatar | Name | Role | [Remove button if admin]

### DM Settings Modal
- Title: "Username#12345 - Settings"
- Info box: Username, User Tag, Friends Since
- Red "Unfriend" button at bottom

---

## ✅ Success Criteria

### Server Messaging
- [ ] All server members can send messages
- [ ] Messages appear in real-time for all members
- [ ] Sender's username displays correctly
- [ ] Timestamps show in IST (HH:MM format)
- [ ] Own messages align right, others align left

### Server Settings
- [ ] Settings button visible in server chat header
- [ ] All members listed with correct roles
- [ ] Owner/Admin can remove regular members
- [ ] Cannot remove owner
- [ ] Regular members cannot remove anyone

### DM Settings
- [ ] Settings button visible in DM chat header
- [ ] Shows correct friendship date
- [ ] Unfriend button works
- [ ] Chat closes after unfriending
- [ ] Friend removed from sidebar

---

## 🚀 Next Steps

After testing these features, you can:
1. **Add channels within servers** (Step 4)
2. **Add more admin features** (promote to admin, etc.)
3. **Add server icons/avatars**
4. **Add direct message to server members**

---

## 📞 Need Help?

If something doesn't work:
1. Check browser console (F12) for errors
2. Check terminal for backend errors
3. Verify all SQL migrations ran successfully
4. Make sure you're using the latest code

**Happy Testing!** 🎉
