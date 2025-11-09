"""
Friend System Routes
Handles friend requests, accepting/rejecting, and managing friendships
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
friends_bp = Blueprint('friends', __name__, url_prefix='/api/friends')

# Login required decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated_function


@friends_bp.route('/request', methods=['POST'])
@login_required
def send_friend_request():
    """Send a friend request to another user by user_tag"""
    try:
        data = request.get_json()
        receiver_user_tag = data.get('receiver_user_tag', '').strip()
        
        if not receiver_user_tag:
            return jsonify({'success': False, 'error': 'User tag is required'}), 400
        
        sender_id = session['user_id']
        
        # Find receiver by user_tag
        receiver_response = supabase.table('users').select('id').eq('user_tag', receiver_user_tag).execute()
        
        if not receiver_response.data:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        receiver_id = receiver_response.data[0]['id']
        
        # Check if trying to send request to self
        if sender_id == receiver_id:
            return jsonify({'success': False, 'error': 'Cannot send friend request to yourself'}), 400
        
        # Check if already friends
        friends_check = supabase.rpc('are_friends', {'uid1': sender_id, 'uid2': receiver_id}).execute()
        if friends_check.data:
            return jsonify({'success': False, 'error': 'Already friends'}), 400
        
        # Check if request already exists
        existing_request = supabase.table('friend_requests').select('*').or_(
            f"and(sender_id.eq.{sender_id},receiver_id.eq.{receiver_id}),and(sender_id.eq.{receiver_id},receiver_id.eq.{sender_id})"
        ).execute()
        
        if existing_request.data:
            return jsonify({'success': False, 'error': 'Friend request already exists'}), 400
        
        # Create friend request
        request_data = {
            'sender_id': sender_id,
            'receiver_id': receiver_id,
            'status': 'pending'
        }
        
        result = supabase.table('friend_requests').insert(request_data).execute()
        
        if result.data:
            return jsonify({
                'success': True,
                'request_id': result.data[0]['id'],
                'message': 'Friend request sent successfully'
            }), 200
        else:
            return jsonify({'success': False, 'error': 'Failed to send friend request'}), 500
            
    except Exception as e:
        print(f"Send friend request error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@friends_bp.route('/requests/pending', methods=['GET'])
@login_required
def get_pending_requests():
    """Get all pending friend requests (incoming and outgoing)"""
    try:
        user_id = session['user_id']
        
        # Get incoming requests (where current user is receiver)
        incoming_requests = supabase.table('friend_requests').select(
            'id, sender_id, created_at'
        ).eq('receiver_id', user_id).eq('status', 'pending').execute()
        
        # Get sender details for incoming requests
        incoming = []
        if incoming_requests.data:
            for req in incoming_requests.data:
                sender = supabase.table('users').select('id, username, user_tag').eq('id', req['sender_id']).execute()
                if sender.data:
                    incoming.append({
                        'id': req['id'],
                        'created_at': req['created_at'],
                        'sender': sender.data[0]
                    })
        
        # Get outgoing requests (where current user is sender)
        outgoing_requests = supabase.table('friend_requests').select(
            'id, receiver_id, created_at'
        ).eq('sender_id', user_id).eq('status', 'pending').execute()
        
        # Get receiver details for outgoing requests
        outgoing = []
        if outgoing_requests.data:
            for req in outgoing_requests.data:
                receiver = supabase.table('users').select('id, username, user_tag').eq('id', req['receiver_id']).execute()
                if receiver.data:
                    outgoing.append({
                        'id': req['id'],
                        'created_at': req['created_at'],
                        'receiver': receiver.data[0]
                    })
        
        return jsonify({
            'success': True,
            'incoming': incoming,
            'outgoing': outgoing
        }), 200
        
    except Exception as e:
        print(f"Get pending requests error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@friends_bp.route('/accept/<request_id>', methods=['POST'])
@login_required
def accept_friend_request(request_id):
    """Accept a friend request"""
    try:
        user_id = session['user_id']
        
        # Get the friend request
        friend_request = supabase.table('friend_requests').select('*').eq('id', request_id).execute()
        
        if not friend_request.data:
            return jsonify({'success': False, 'error': 'Friend request not found'}), 404
        
        request_data = friend_request.data[0]
        
        # Verify the current user is the receiver
        if request_data['receiver_id'] != user_id:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 403
        
        # Update request status to accepted
        supabase.table('friend_requests').update({
            'status': 'accepted',
            'updated_at': 'now()'
        }).eq('id', request_id).execute()
        
        # Friendship is automatically created by trigger
        
        return jsonify({
            'success': True,
            'message': 'Friend request accepted'
        }), 200
        
    except Exception as e:
        print(f"Accept friend request error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@friends_bp.route('/reject/<request_id>', methods=['POST'])
@login_required
def reject_friend_request(request_id):
    """Reject a friend request"""
    try:
        user_id = session['user_id']
        
        # Get the friend request
        friend_request = supabase.table('friend_requests').select('*').eq('id', request_id).execute()
        
        if not friend_request.data:
            return jsonify({'success': False, 'error': 'Friend request not found'}), 404
        
        request_data = friend_request.data[0]
        
        # Verify the current user is the receiver
        if request_data['receiver_id'] != user_id:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 403
        
        # Update request status to rejected
        supabase.table('friend_requests').update({
            'status': 'rejected',
            'updated_at': 'now()'
        }).eq('id', request_id).execute()
        
        return jsonify({
            'success': True,
            'message': 'Friend request rejected'
        }), 200
        
    except Exception as e:
        print(f"Reject friend request error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@friends_bp.route('/', methods=['GET'])
@login_required
def get_friends():
    """Get list of all friends"""
    try:
        user_id = session['user_id']
        
        # DEBUG: Print session info
        print("=" * 50)
        print("GET_FRIENDS DEBUG")
        print("Session:", dict(session))
        print("User ID:", user_id)
        print("=" * 50)
        
        # Get friendships where user is either user1 or user2
        friendships = supabase.table('friendships').select('*').or_(
            f'user1_id.eq.{user_id},user2_id.eq.{user_id}'
        ).execute()
        
        print(f"Found {len(friendships.data) if friendships.data else 0} friendships")
        
        friends_list = []
        for friendship in friendships.data if friendships.data else []:
            # Determine which ID is the friend's ID
            friend_id = friendship['user2_id'] if friendship['user1_id'] == user_id else friendship['user1_id']
            
            # Get friend's details
            friend_data = supabase.table('users').select('id, username, user_tag').eq('id', friend_id).execute()
            
            if friend_data.data:
                friends_list.append({
                    **friend_data.data[0],
                    'friendship_created_at': friendship['created_at']
                })
        
        print(f"Returning {len(friends_list)} friends")
        
        return jsonify({
            'success': True,
            'friends': friends_list
        }), 200
        
    except Exception as e:
        print(f"Get friends error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e), 'friends': []}), 500


@friends_bp.route('/<user_id>', methods=['DELETE'])
@login_required
def remove_friend(user_id):
    """Remove a friend"""
    try:
        current_user_id = session['user_id']
        
        # Delete the friendship (works regardless of user1/user2 order due to CHECK constraint)
        supabase.table('friendships').delete().or_(
            f'and(user1_id.eq.{current_user_id},user2_id.eq.{user_id}),and(user1_id.eq.{user_id},user2_id.eq.{current_user_id})'
        ).execute()
        
        return jsonify({
            'success': True,
            'message': 'Friend removed successfully'
        }), 200
        
    except Exception as e:
        print(f"Remove friend error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@friends_bp.route('/check/<user_id>', methods=['GET'])
@login_required
def check_friendship(user_id):
    """Check friendship status with a user"""
    try:
        current_user_id = session['user_id']
        
        # Check if they are friends using the are_friends RPC
        result = supabase.rpc('are_friends', {
            'uid1': current_user_id,
            'uid2': user_id
        }).execute()
        
        is_friend = result.data if result.data else False
        
        # Check for pending friend requests
        request_status = 'none'
        request_id = None
        
        # Check if current user sent a request
        sent_request = supabase.table('friend_requests').select('id').eq(
            'sender_id', current_user_id
        ).eq('receiver_id', user_id).eq('status', 'pending').execute()
        
        if sent_request.data:
            request_status = 'pending_sent'
            request_id = sent_request.data[0]['id']
        else:
            # Check if current user received a request
            received_request = supabase.table('friend_requests').select('id').eq(
                'sender_id', user_id
            ).eq('receiver_id', current_user_id).eq('status', 'pending').execute()
            
            if received_request.data:
                request_status = 'pending_received'
                request_id = received_request.data[0]['id']
        
        return jsonify({
            'success': True,
            'is_friend': is_friend,
            'request_status': request_status,
            'request_id': request_id
        }), 200
    except Exception as e:
        print(f"Error checking friendship: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
