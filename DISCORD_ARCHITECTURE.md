# Discord Clone - Complete Architecture Plan

## 🎯 Overview

Transform the simple chat app into a Discord-style platform with:
- Friend system (send/accept requests)
- Servers with multiple channels
- Direct messages (DMs)
- Only friends can be added to servers

---

## 📊 Database Schema

### New Tables to Create

#### 1. Friend Requests
```sql
CREATE TABLE friend_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(sender_id, receiver_id)
);
```

#### 2. Friendships
```sql
CREATE TABLE friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id UUID REFERENCES users(id) ON DELETE CASCADE,
    user2_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    CHECK (user1_id < user2_id), -- Ensure ordering to avoid duplicates
    UNIQUE(user1_id, user2_id)
);
```

#### 3. Servers
```sql
CREATE TABLE servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    icon_url TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### 4. Server Members
```sql
CREATE TABLE server_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(server_id, user_id)
);
```

#### 5. Channels
```sql
CREATE TABLE channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'text' CHECK (type IN ('text', 'voice')),
    position INTEGER DEFAULT 0,
    topic TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### 6. Channel Messages
```sql
CREATE TABLE channel_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content TEXT,
    file_url TEXT,
    file_type TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Indexes for Performance
```sql
-- Friend requests
CREATE INDEX idx_friend_requests_sender ON friend_requests(sender_id);
CREATE INDEX idx_friend_requests_receiver ON friend_requests(receiver_id);
CREATE INDEX idx_friend_requests_status ON friend_requests(status);

-- Friendships
CREATE INDEX idx_friendships_user1 ON friendships(user1_id);
CREATE INDEX idx_friendships_user2 ON friendships(user2_id);

-- Servers
CREATE INDEX idx_servers_owner ON servers(owner_id);

-- Server members
CREATE INDEX idx_server_members_server ON server_members(server_id);
CREATE INDEX idx_server_members_user ON server_members(user_id);

-- Channels
CREATE INDEX idx_channels_server ON channels(server_id);
CREATE INDEX idx_channels_position ON channels(server_id, position);

-- Channel messages
CREATE INDEX idx_channel_messages_channel ON channel_messages(channel_id, created_at DESC);
CREATE INDEX idx_channel_messages_user ON channel_messages(user_id);
```

### Modify Existing Messages Table
```sql
-- Rename to direct_messages for clarity
ALTER TABLE messages RENAME TO direct_messages;
```

---

## 🔧 Backend API Endpoints

### Friend System

#### Send Friend Request
```
POST /api/friends/request
Body: { "receiver_user_tag": "alice#00001" }
Response: { "success": true, "request_id": "uuid" }
```

#### Accept Friend Request
```
POST /api/friends/accept/<request_id>
Response: { "success": true, "friendship_id": "uuid" }
```

#### Reject Friend Request
```
POST /api/friends/reject/<request_id>
Response: { "success": true }
```

#### Get Friend Requests (Pending)
```
GET /api/friends/requests/pending
Response: { "incoming": [...], "outgoing": [...] }
```

#### Get Friends List
```
GET /api/friends
Response: { "friends": [{ "id": "...", "username": "...", "user_tag": "...", "online": true }] }
```

#### Remove Friend
```
DELETE /api/friends/<user_id>
Response: { "success": true }
```

### Server Management

#### Create Server
```
POST /api/servers/create
Body: { "name": "My Server", "description": "..." }
Response: { "success": true, "server": {...}, "default_channel": {...} }
Creates server with default #general channel
```

#### Get User's Servers
```
GET /api/servers
Response: { "servers": [{ "id": "...", "name": "...", "icon_url": "...", "unread": 5 }] }
```

#### Get Server Details
```
GET /api/servers/<server_id>
Response: { "server": {...}, "channels": [...], "members": [...] }
```

#### Invite Friend to Server
```
POST /api/servers/<server_id>/invite
Body: { "user_id": "uuid" }
Validation: Check if they are friends first
Response: { "success": true }
```

#### Leave Server
```
DELETE /api/servers/<server_id>/leave
Response: { "success": true }
```

#### Delete Server (Owner only)
```
DELETE /api/servers/<server_id>
Response: { "success": true }
```

### Channel Management

#### Create Channel
```
POST /api/servers/<server_id>/channels
Body: { "name": "general", "type": "text", "topic": "..." }
Response: { "success": true, "channel": {...} }
```

#### Delete Channel
```
DELETE /api/channels/<channel_id>
Response: { "success": true }
```

#### Get Channel Messages
```
GET /api/channels/<channel_id>/messages?limit=50&before=<message_id>
Response: { "messages": [...] }
```

#### Send Channel Message
```
POST /api/channels/<channel_id>/messages
Body: { "content": "Hello!", "file": <optional> }
Response: { "success": true, "message": {...} }
```

### Direct Messages (DMs)

#### Get DM Conversations
```
GET /api/dms
Response: { "conversations": [{ "user": {...}, "last_message": {...}, "unread": 2 }] }
```

#### Get DM Messages with Friend
```
GET /api/dms/<friend_id>/messages?since=<timestamp>
Response: { "messages": [...] }
```

#### Send DM
```
POST /api/dms/<friend_id>/send
Body: { "content": "Hi!", "file": <optional> }
Response: { "success": true, "message": {...} }
```

---

## 🎨 UI Structure

### Layout (3-Column)

```
┌─────────────┬──────────────────┬─────────────────────────────┬──────────────┐
│   Server    │  Channels/       │      Main Chat Area         │   Members    │
│   List      │  Friends List    │                             │   (Server)   │
│             │                  │                             │              │
│  [Home]     │ 🔍 Search       │  # general                  │ 👑 Owner     │
│             │                  │  ────────────────────       │              │
│  [S] [S]    │ Friends (3)      │  [Messages here]            │ 👤 Member1   │
│  [S] [S]    │ • Alice #0001    │                             │ 👤 Member2   │
│  [+]        │ • Bob #0002      │                             │              │
│             │                  │  ────────────────────       │              │
│             │ Servers          │  [Message input]            │              │
│             │ ▼ My Server      │                             │              │
│             │   # general      │                             │              │
│             │   # chat1        │                             │              │
│             │   # random       │                             │              │
│             │                  │                             │              │
└─────────────┴──────────────────┴─────────────────────────────┴──────────────┘
```

### Components

1. **Server List (Left Sidebar)**
   - Home button (for DMs)
   - Server icons (clickable)
   - Add server button (+)

2. **Middle Sidebar**
   - **DM Mode**: Friends list with search, pending requests
   - **Server Mode**: Channels list with # prefix, voice channels

3. **Main Chat Area**
   - Header: Channel/User name, topic, settings
   - Messages container
   - Message input with file upload

4. **Right Sidebar (Server only)**
   - Members list with roles
   - Online status indicators

---

## 📁 File Structure

```
chatApp/
├── app.py                          # Main Flask app
├── routes/
│   ├── __init__.py
│   ├── auth.py                     # Login, signup, logout
│   ├── friends.py                  # Friend request routes
│   ├── servers.py                  # Server management
│   ├── channels.py                 # Channel management
│   └── messages.py                 # DMs and channel messages
├── templates/
│   ├── index.html
│   ├── login.html
│   ├── signup.html
│   └── discord.html                # Main Discord UI
├── static/
│   ├── css/
│   │   ├── styles.css              # Auth pages
│   │   └── discord.css             # Discord UI styles
│   └── js/
│       ├── discord.js              # Main Discord logic
│       ├── friends.js              # Friend management
│       ├── servers.js              # Server/channel logic
│       └── messages.js             # Message handling
├── migrations/
│   ├── 001_initial_schema.sql      # Original tables
│   ├── 002_add_user_tags.sql       # User tags migration
│   └── 003_discord_features.sql    # New Discord tables
└── requirements.txt
```

---

## 🚀 Implementation Phases

### **Phase 1: Database Setup**
- Create all new tables
- Add indexes
- Test with sample data

### **Phase 2: Friend System**
- Backend routes for friend requests
- UI for sending/accepting requests
- Friends list display

### **Phase 3: Server Creation**
- Create/delete servers
- Default #general channel
- Server list UI

### **Phase 4: Channels & Messaging**
- Create channels in servers
- Channel message sending
- Real-time updates with Socket.IO

### **Phase 5: Server Members**
- Invite friends to server
- Members list display
- Roles (owner, admin, member)

### **Phase 6: Polish**
- Unread message indicators
- Online status
- Notifications
- Server icons

---

## 🔒 Business Rules

1. **Friends Only**: Can only send DMs to friends
2. **Server Invites**: Can only invite friends to servers
3. **Channel Access**: Only server members can see/access channels
4. **Server Owner**: Full control (delete server, manage all channels)
5. **Message History**: Load messages on-demand (pagination)
6. **Real-time**: Use Socket.IO rooms for each channel/DM

---

## 🎯 Key Features

### Friend System
- ✅ Send friend requests by user_tag
- ✅ Accept/reject requests
- ✅ View friends list
- ✅ Remove friends
- ✅ Only friends can DM

### Servers
- ✅ Create unlimited servers
- ✅ Server owner has full control
- ✅ Invite friends only
- ✅ Multiple text channels per server
- ✅ Default #general channel
- ✅ Leave/delete servers

### Channels
- ✅ Create/delete channels (owner/admin)
- ✅ Channel-specific messages
- ✅ Message history
- ✅ Real-time updates
- ✅ File sharing in channels

### Direct Messages
- ✅ Private 1:1 chats with friends
- ✅ Message history
- ✅ File sharing
- ✅ Real-time delivery

---

## 📋 Migration Steps

1. **Backup current database**
2. **Run migration SQL** (003_discord_features.sql)
3. **Update app.py** with new routes
4. **Create new templates** (discord.html)
5. **Add new JavaScript** files
6. **Test friend system**
7. **Test server creation**
8. **Test channel messaging**
9. **Deploy**

---

## 🔄 Socket.IO Rooms Strategy

- **DM Rooms**: `dm_{user1_id}_{user2_id}` (sorted IDs)
- **Channel Rooms**: `channel_{channel_id}`
- **User Rooms**: `user_{user_id}` (for notifications)
- **Server Rooms**: `server_{server_id}` (for server-wide events)

---

## ⚠️ Breaking Changes

1. **UI**: Complete redesign (current chat.html becomes legacy)
2. **Routes**: New route structure with blueprints
3. **Database**: New tables, renamed messages → direct_messages
4. **JavaScript**: Complete rewrite for Discord UI
5. **Sessions**: Additional session data (current_server, current_channel)

---

## 🎨 Design Inspiration

- Discord's dark theme
- Server icons (circular)
- Channel list with # prefix
- Clean, modern UI
- Smooth animations
- Responsive design

---

Ready to implement? Tell me which phase to start with!
