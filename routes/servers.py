"""
Server/Group System Routes
Handles server creation, invites, and member management
"""

from flask import Blueprint, request, jsonify, session
from functools import wraps
import os
import sys

# Add parent directory to path to import supabase client
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config import Config
from supabase import create_client, Client

# Initialize Supabase client
supabase: Client = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)

# Create blueprint
servers_bp = Blueprint('servers', __name__, url_prefix='/api/servers')

# Login required decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated_function


@servers_bp.route('/create', methods=['POST'])
@login_required
def create_server():
    """Create a new server/group"""
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        description = data.get('description', '').strip()
        
        if not name:
            return jsonify({'success': False, 'error': 'Server name is required'}), 400
        
        if len(name) > 100:
            return jsonify({'success': False, 'error': 'Server name too long (max 100 characters)'}), 400
        
        owner_id = session['user_id']
        
        # Create server
        server_data = {
            'name': name,
            'description': description if description else None,
            'owner_id': owner_id
        }
        
        result = supabase.table('servers').insert(server_data).execute()
        
        if result.data:
            return jsonify({
                'success': True,
                'server': result.data[0],
                'message': 'Server created successfully'
            }), 201
        else:
            return jsonify({'success': False, 'error': 'Failed to create server'}), 500
            
    except Exception as e:
        print(f"Create server error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@servers_bp.route('/', methods=['GET'])
@login_required
def get_user_servers():
    """Get all servers the user is a member of"""
    try:
        user_id = session['user_id']
        
        # Get all server memberships
        memberships = supabase.table('server_members').select(
            'server_id, role, joined_at'
        ).eq('user_id', user_id).execute()
        
        servers_list = []
        if memberships.data:
            for membership in memberships.data:
                # Get server details
                server = supabase.table('servers').select(
                    'id, name, description, icon_url, owner_id, created_at'
                ).eq('id', membership['server_id']).execute()
                
                if server.data:
                    server_info = server.data[0]
                    server_info['user_role'] = membership['role']
                    server_info['joined_at'] = membership['joined_at']
                    
                    # Get member count
                    member_count = supabase.table('server_members').select(
                        'id', count='exact'
                    ).eq('server_id', membership['server_id']).execute()
                    
                    server_info['member_count'] = member_count.count if member_count.count else 0
                    servers_list.append(server_info)
        
        return jsonify({
            'success': True,
            'servers': servers_list
        }), 200
        
    except Exception as e:
        print(f"Get user servers error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@servers_bp.route('/<server_id>', methods=['GET'])
@login_required
def get_server_details(server_id):
    """Get detailed information about a server"""
    try:
        user_id = session['user_id']
        
        # Check if user is a member
        is_member = supabase.rpc('is_server_member', {
            'sid': server_id,
            'uid': user_id
        }).execute()
        
        if not is_member.data:
            return jsonify({'success': False, 'error': 'Not a member of this server'}), 403
        
        # Get server details
        server = supabase.table('servers').select('*').eq('id', server_id).execute()
        
        if not server.data:
            return jsonify({'success': False, 'error': 'Server not found'}), 404
        
        server_info = server.data[0]
        
        # Get members
        members = supabase.table('server_members').select(
            'user_id, role, joined_at'
        ).eq('server_id', server_id).execute()
        
        members_list = []
        if members.data:
            for member in members.data:
                user = supabase.table('users').select(
                    'id, username, user_tag'
                ).eq('id', member['user_id']).execute()
                
                if user.data:
                    member_info = user.data[0]
                    member_info['role'] = member['role']
                    member_info['joined_at'] = member['joined_at']
                    members_list.append(member_info)
        
        server_info['members'] = members_list
        
        return jsonify({
            'success': True,
            'server': server_info
        }), 200
        
    except Exception as e:
        print(f"Get server details error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@servers_bp.route('/<server_id>/invite', methods=['POST'])
@login_required
def invite_to_server(server_id):
    """Invite a friend to the server (friends only)"""
    try:
        data = request.get_json()
        invitee_user_tag = data.get('user_tag', '').strip()
        
        if not invitee_user_tag:
            return jsonify({'success': False, 'error': 'User tag is required'}), 400
        
        inviter_id = session['user_id']
        
        # Check if inviter is a member of the server
        is_member = supabase.rpc('is_server_member', {
            'sid': server_id,
            'uid': inviter_id
        }).execute()
        
        if not is_member.data:
            return jsonify({'success': False, 'error': 'You are not a member of this server'}), 403
        
        # Find invitee by user_tag
        invitee = supabase.table('users').select('id').eq('user_tag', invitee_user_tag).execute()
        
        if not invitee.data:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        invitee_id = invitee.data[0]['id']
        
        # Check if they are friends
        are_friends = supabase.rpc('are_friends', {
            'uid1': inviter_id,
            'uid2': invitee_id
        }).execute()
        
        if not are_friends.data:
            return jsonify({'success': False, 'error': 'You can only invite friends to servers'}), 403
        
        # Check if already a member
        already_member = supabase.rpc('is_server_member', {
            'sid': server_id,
            'uid': invitee_id
        }).execute()
        
        if already_member.data:
            return jsonify({'success': False, 'error': 'User is already a member'}), 400
        
        # Check if invite already exists
        existing_invite = supabase.table('server_invites').select('*').eq(
            'server_id', server_id
        ).eq('invitee_id', invitee_id).eq('status', 'pending').execute()
        
        if existing_invite.data:
            return jsonify({'success': False, 'error': 'Invite already sent'}), 400
        
        # Create invite
        invite_data = {
            'server_id': server_id,
            'inviter_id': inviter_id,
            'invitee_id': invitee_id,
            'status': 'pending'
        }
        
        result = supabase.table('server_invites').insert(invite_data).execute()
        
        if result.data:
            return jsonify({
                'success': True,
                'invite_id': result.data[0]['id'],
                'message': 'Invite sent successfully'
            }), 201
        else:
            return jsonify({'success': False, 'error': 'Failed to send invite'}), 500
            
    except Exception as e:
        print(f"Invite to server error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@servers_bp.route('/invites/pending', methods=['GET'])
@login_required
def get_pending_invites():
    """Get all pending server invites"""
    try:
        user_id = session['user_id']
        
        # Get incoming invites
        incoming = supabase.table('server_invites').select(
            'id, server_id, inviter_id, created_at'
        ).eq('invitee_id', user_id).eq('status', 'pending').execute()
        
        incoming_list = []
        if incoming.data:
            for invite in incoming.data:
                # Get server details
                server = supabase.table('servers').select(
                    'id, name, description'
                ).eq('id', invite['server_id']).execute()
                
                # Get inviter details
                inviter = supabase.table('users').select(
                    'id, username, user_tag'
                ).eq('id', invite['inviter_id']).execute()
                
                if server.data and inviter.data:
                    incoming_list.append({
                        'id': invite['id'],
                        'created_at': invite['created_at'],
                        'server': server.data[0],
                        'inviter': inviter.data[0]
                    })
        
        return jsonify({
            'success': True,
            'invites': incoming_list
        }), 200
        
    except Exception as e:
        print(f"Get pending invites error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@servers_bp.route('/invites/<invite_id>/accept', methods=['POST'])
@login_required
def accept_invite(invite_id):
    """Accept a server invite"""
    try:
        user_id = session['user_id']
        
        # Get the invite
        invite = supabase.table('server_invites').select('*').eq('id', invite_id).execute()
        
        if not invite.data:
            return jsonify({'success': False, 'error': 'Invite not found'}), 404
        
        invite_data = invite.data[0]
        
        # Verify the current user is the invitee
        if invite_data['invitee_id'] != user_id:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 403
        
        # Update invite status
        supabase.table('server_invites').update({
            'status': 'accepted',
            'updated_at': 'now()'
        }).eq('id', invite_id).execute()
        
        # Member is automatically added by trigger
        
        return jsonify({
            'success': True,
            'message': 'Invite accepted'
        }), 200
        
    except Exception as e:
        print(f"Accept invite error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@servers_bp.route('/invites/<invite_id>/reject', methods=['POST'])
@login_required
def reject_invite(invite_id):
    """Reject a server invite"""
    try:
        user_id = session['user_id']
        
        # Get the invite
        invite = supabase.table('server_invites').select('*').eq('id', invite_id).execute()
        
        if not invite.data:
            return jsonify({'success': False, 'error': 'Invite not found'}), 404
        
        invite_data = invite.data[0]
        
        # Verify the current user is the invitee
        if invite_data['invitee_id'] != user_id:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 403
        
        # Update invite status
        supabase.table('server_invites').update({
            'status': 'rejected',
            'updated_at': 'now()'
        }).eq('id', invite_id).execute()
        
        return jsonify({
            'success': True,
            'message': 'Invite rejected'
        }), 200
        
    except Exception as e:
        print(f"Reject invite error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@servers_bp.route('/<server_id>/leave', methods=['POST'])
@login_required
def leave_server(server_id):
    """Leave a server (owner cannot leave)"""
    try:
        user_id = session['user_id']
        
        # Get user's role
        role = supabase.rpc('get_user_server_role', {
            'sid': server_id,
            'uid': user_id
        }).execute()
        
        if not role.data:
            return jsonify({'success': False, 'error': 'Not a member of this server'}), 404
        
        if role.data == 'owner':
            return jsonify({'success': False, 'error': 'Owner cannot leave the server. Delete it instead.'}), 403
        
        # Remove member
        supabase.table('server_members').delete().eq(
            'server_id', server_id
        ).eq('user_id', user_id).execute()
        
        return jsonify({
            'success': True,
            'message': 'Left server successfully'
        }), 200
        
    except Exception as e:
        print(f"Leave server error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@servers_bp.route('/<server_id>/messages', methods=['GET'])
@login_required
def get_server_messages(server_id):
    """Get messages for a server"""
    try:
        user_id = session['user_id']
        
        # Check if user is a member
        is_member = supabase.rpc('is_server_member', {
            'sid': server_id,
            'uid': user_id
        }).execute()
        
        if not is_member.data:
            return jsonify({'success': False, 'error': 'Not a member of this server'}), 403
        
        # Get messages
        messages = supabase.table('server_messages').select(
            'id, content, file_url, file_type, created_at, sender_id, reply_to_id'
        ).eq('server_id', server_id).order('created_at', desc=False).limit(100).execute()
        
        messages_list = []
        if messages.data:
            for msg in messages.data:
                # Get sender info
                sender = supabase.table('users').select(
                    'id, username, user_tag'
                ).eq('id', msg['sender_id']).execute()
                
                message_info = {
                    'id': msg['id'],
                    'content': msg['content'],
                    'file_url': msg.get('file_url'),
                    'file_type': msg.get('file_type'),
                    'created_at': msg['created_at'],
                    'sender': sender.data[0] if sender.data else None,
                    'is_own_message': msg['sender_id'] == user_id
                }
                
                # Fetch replied_to message if exists
                if msg.get('reply_to_id'):
                    try:
                        replied_msg_response = supabase.table('server_messages').select('id, content, sender_id').eq('id', msg['reply_to_id']).execute()
                        if replied_msg_response.data:
                            replied_msg = replied_msg_response.data[0]
                            # Fetch the sender of replied message
                            replied_sender_response = supabase.table('users').select('id, username').eq('id', replied_msg['sender_id']).execute()
                            if replied_sender_response.data:
                                replied_msg['sender'] = replied_sender_response.data[0]
                            message_info['replied_to'] = replied_msg
                    except Exception as e:
                        print(f"Error fetching replied message: {e}")
                
                messages_list.append(message_info)
        
        return jsonify({
            'success': True,
            'messages': messages_list
        }), 200
        
    except Exception as e:
        print(f"Get server messages error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@servers_bp.route('/<server_id>/messages', methods=['POST'])
@login_required
def send_server_message(server_id):
    """Send a message to a server"""
    try:
        user_id = session['user_id']
        data = request.get_json()
        content = data.get('content', '').strip()
        reply_to_id = data.get('reply_to_id')  # Get reply_to_id if present
        
        if not content:
            return jsonify({'success': False, 'error': 'Message content is required'}), 400
        
        # Check if user is a member
        is_member = supabase.rpc('is_server_member', {
            'sid': server_id,
            'uid': user_id
        }).execute()
        
        if not is_member.data:
            return jsonify({'success': False, 'error': 'Not a member of this server'}), 403
        
        # Save message
        message_data = {
            'server_id': server_id,
            'sender_id': user_id,
            'content': content,
            'reply_to_id': reply_to_id if reply_to_id else None  # Include reply_to_id
        }
        
        result = supabase.table('server_messages').insert(message_data).execute()
        
        if result.data:
            msg = result.data[0]
            
            # Get sender info
            sender = supabase.table('users').select(
                'id, username, user_tag'
            ).eq('id', user_id).execute()
            
            message_info = {
                'id': msg['id'],
                'content': msg['content'],
                'created_at': msg['created_at'],
                'sender': sender.data[0] if sender.data else None,
                'server_id': server_id
            }
            
            return jsonify({
                'success': True,
                'message': message_info
            }), 201
        else:
            return jsonify({'success': False, 'error': 'Failed to send message'}), 500
            
    except Exception as e:
        print(f"Send server message error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@servers_bp.route('/<server_id>/members/<member_id>', methods=['DELETE'])
@login_required
def remove_member(server_id, member_id):
    """Remove a member from the server (admin only)"""
    try:
        user_id = session['user_id']
        
        # Get user's role
        user_role = supabase.rpc('get_user_server_role', {
            'sid': server_id,
            'uid': user_id
        }).execute()
        
        if not user_role.data or user_role.data not in ['owner', 'admin']:
            return jsonify({'success': False, 'error': 'Only admins can remove members'}), 403
        
        # Cannot remove the owner
        member_role = supabase.rpc('get_user_server_role', {
            'sid': server_id,
            'uid': member_id
        }).execute()
        
        if member_role.data == 'owner':
            return jsonify({'success': False, 'error': 'Cannot remove the server owner'}), 403
        
        # Remove member
        supabase.table('server_members').delete().eq(
            'server_id', server_id
        ).eq('user_id', member_id).execute()
        
        return jsonify({
            'success': True,
            'message': 'Member removed successfully'
        }), 200
        
    except Exception as e:
        print(f"Remove member error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500
