# Step 2: Groups/Servers System - Setup & Testing Guide

## Overview
Create and manage Discord-like servers/groups where you can invite friends. Only friends can be invited to servers.

## Setup Instructions

### 1. Database Migration
Run the server system migration in Supabase:

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open `migrations/002_groups_servers.sql`
4. Copy the entire content
5. Paste into the SQL Editor
6. Click **Run**

Verify the migration succeeded by checking these tables exist:
- `servers`
- `server_members`
- `server_invites`

### 2. Restart the Application
```powershell
# Stop the current app (Ctrl+C in terminal)
# Then restart:
python app.py
```

## API Endpoints

### Server Management
- `POST /api/servers/create` - Create a new server
- `GET /api/servers/` - Get all servers you're a member of
- `GET /api/servers/<server_id>` - Get server details and members
- `POST /api/servers/<server_id>/leave` - Leave a server

### Server Invites
- `POST /api/servers/<server_id>/invite` - Invite a friend to server
- `GET /api/servers/invites/pending` - Get pending server invites
- `POST /api/servers/invites/<invite_id>/accept` - Accept invite
- `POST /api/servers/invites/<invite_id>/reject` - Reject invite

## Features

### ✅ Create Server
- Give server a name (required, max 100 characters)
- Add optional description
- Creator automatically becomes owner

### ✅ Friend-Only Invites
- Can only invite users who are your friends
- Prevents random people from joining
- Discord-like permission system

### ✅ Role System
- **Owner**: Created the server, cannot leave (must delete)
- **Admin**: Can invite members (future: kick/ban)
- **Member**: Regular member

### ✅ Auto-Membership
- Server owner automatically added as member
- Accepted invites automatically add user as member
- Database triggers handle this automatically

## Testing with Postman/cURL

### 1. Create a Server
```bash
POST http://localhost:5000/api/servers/create
Content-Type: application/json

{
  "name": "My Gaming Server",
  "description": "A place to chat about games"
}
```

### 2. Get Your Servers
```bash
GET http://localhost:5000/api/servers/
```

### 3. Invite a Friend
```bash
POST http://localhost:5000/api/servers/<server_id>/invite
Content-Type: application/json

{
  "user_tag": "sumukh#00001"
}
```

### 4. Get Pending Invites (as the invited user)
```bash
GET http://localhost:5000/api/servers/invites/pending
```

### 5. Accept Invite
```bash
POST http://localhost:5000/api/servers/invites/<invite_id>/accept
```

## Next Steps (UI Integration)

After testing the API, we'll add:
1. **Create Server Modal** - UI to create new servers
2. **Server List Sidebar** - Show all your servers with icons
3. **Server Invite Modal** - Invite friends to servers
4. **Server Members View** - See all members in a server
5. **Server Settings** - Edit name, description, etc.

Then we'll proceed to:
- **Step 3**: Separate DM and Server sections in the UI
- **Step 4**: Add channels within servers

## Database Schema

### servers table
- `id` - UUID primary key
- `name` - Server name (1-100 chars)
- `description` - Optional description
- `icon_url` - Optional server icon
- `owner_id` - User who created the server
- `created_at` - Timestamp

### server_members table
- `id` - UUID primary key
- `server_id` - Reference to servers
- `user_id` - Reference to users
- `role` - owner/admin/member
- `joined_at` - Timestamp
- Unique constraint on (server_id, user_id)

### server_invites table
- `id` - UUID primary key
- `server_id` - Reference to servers
- `inviter_id` - Who sent the invite
- `invitee_id` - Who received the invite
- `status` - pending/accepted/rejected
- Friend-only check enforced by API
- Auto-adds member on acceptance

## Validation Rules

✅ **Server Creation**
- Name required (1-100 characters)
- Description optional
- Creator becomes owner automatically

✅ **Server Invites**
- Can only invite friends
- Cannot invite if already a member
- Cannot send duplicate pending invites
- Cannot invite yourself

✅ **Leaving Servers**
- Members can leave anytime
- Admins can leave
- Owners cannot leave (must delete server instead)

---

**Ready to test!** Run the migration, restart the app, and test the API endpoints with Postman or add the UI next.
