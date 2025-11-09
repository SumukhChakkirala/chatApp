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
from supabase_helper import get_data

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
        receiver_data = get_data(receiver_response)
        
        if not receiver_data:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        receiver_id = receiver_data[0]['id']
        
        # Check if trying to send request to self
        if sender_id == receiver_id:
            return jsonify({'success': False, 'error': 'Cannot send friend request to yourself'}), 400
        
        # Check if already friends
        friends_check = supabase.rpc('are_friends', {'uid1': sender_id, 'uid2': receiver_id}).execute()
        if get_data(friends_check):
            return jsonify({'success': False, 'error': 'Already friends'}), 400
        
        # Check if request already exists
        # Check if an existing request in either direction without using .or_
        req1 = supabase.table('friend_requests').select('*') \
            .eq('sender_id', sender_id).eq('receiver_id', receiver_id).execute()
        req2 = supabase.table('friend_requests').select('*') \
            .eq('sender_id', receiver_id).eq('receiver_id', sender_id).execute()
        existing_request = {'data': (get_data(req1) or []) + (get_data(req2) or [])}
        
        if existing_request['data']:
            return jsonify({'success': False, 'error': 'Friend request already exists'}), 400
        
        # Create friend request
        request_data = {
            'sender_id': sender_id,
            'receiver_id': receiver_id,
            'status': 'pending'
        }
        
        result = supabase.table('friend_requests').insert(request_data).execute()
        result_data = get_data(result)
        
        if result_data:
            return jsonify({
                'success': True,
                'request_id': result_data[0]['id'],
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
        incoming_data = get_data(incoming_requests)
        if incoming_data:
            for req in incoming_data:
                sender = supabase.table('users').select('id, username, user_tag').eq('id', req['sender_id']).execute()
                sender_data = get_data(sender)
                if sender_data:
                    incoming.append({
                        'id': req['id'],
                        'created_at': req['created_at'],
                        'sender': sender_data[0]
                    })
        
        # Get outgoing requests (where current user is sender)
        outgoing_requests = supabase.table('friend_requests').select(
            'id, receiver_id, created_at'
        ).eq('sender_id', user_id).eq('status', 'pending').execute()
        
        # Get receiver details for outgoing requests
        outgoing = []
        outgoing_data = get_data(outgoing_requests)
        if outgoing_data:
            for req in outgoing_data:
                receiver = supabase.table('users').select('id, username, user_tag').eq('id', req['receiver_id']).execute()
                receiver_data = get_data(receiver)
                if receiver_data:
                    outgoing.append({
                        'id': req['id'],
                        'created_at': req['created_at'],
                        'receiver': receiver_data[0]
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
        request_data_list = get_data(friend_request)
        
        if not request_data_list:
            return jsonify({'success': False, 'error': 'Friend request not found'}), 404
        
        request_data = request_data_list[0]
        
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
        request_data_list = get_data(friend_request)
        
        if not request_data_list:
            return jsonify({'success': False, 'error': 'Friend request not found'}), 404
        
        request_data = request_data_list[0]
        
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
        
        # Query both directions (user as user1 or user2) and merge results
        f1 = supabase.table('friendships').select('*').eq('user1_id', user_id).execute()
        f2 = supabase.table('friendships').select('*').eq('user2_id', user_id).execute()
        merged_friendships = (get_data(f1) or []) + (get_data(f2) or [])

        print(f"Found {len(merged_friendships)} friendships")

        friends_list = []
        for friendship in merged_friendships:
            # Determine which ID is the friend's ID
            friend_id = friendship['user2_id'] if friendship['user1_id'] == user_id else friendship['user1_id']

            # Get friend's details
            friend_data = supabase.table('users').select('id, username, user_tag').eq('id', friend_id).execute()
            friend_list = get_data(friend_data)
            if friend_list:
                friends_list.append({
                    **friend_list[0],
                    'friendship_created_at': friendship['created_at']
                })

        print(f"Returning {len(friends_list)} friends")
        return jsonify({'success': True, 'friends': friends_list}), 200
        
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
        # Delete friendship regardless of ordering by performing two deletes
        supabase.table('friendships').delete().eq('user1_id', current_user_id).eq('user2_id', user_id).execute()
        supabase.table('friendships').delete().eq('user1_id', user_id).eq('user2_id', current_user_id).execute()
        
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
        
        is_friend = get_data(result) if get_data(result) else False
        
        # Check for pending friend requests
        request_status = 'none'
        request_id = None
        
        # Check if current user sent a request
        sent_request = supabase.table('friend_requests').select('id').eq(
            'sender_id', current_user_id
        ).eq('receiver_id', user_id).eq('status', 'pending').execute()
        
        sent_data = get_data(sent_request)
        if sent_data:
            request_status = 'pending_sent'
            request_id = sent_data[0]['id']
        else:
            # Check if current user received a request
            received_request = supabase.table('friend_requests').select('id').eq(
                'sender_id', user_id
            ).eq('receiver_id', current_user_id).eq('status', 'pending').execute()
            
            received_data = get_data(received_request)
            if received_data:
                request_status = 'pending_received'
                request_id = received_data[0]['id']
        
        return jsonify({
            'success': True,
            'is_friend': is_friend,
            'request_status': request_status,
            'request_id': request_id
        }), 200
    except Exception as e:
        print(f"Error checking friendship: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
