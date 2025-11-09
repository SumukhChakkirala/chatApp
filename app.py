from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash
from flask_socketio import SocketIO, emit, join_room
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from supabase import create_client, Client
from config import Config
from functools import wraps
import os
import uuid
from datetime import datetime
import sys

# Import blueprints
from routes.friends import friends_bp
from routes.servers import servers_bp

app = Flask(__name__)
app.config.from_object(Config)
socketio = SocketIO(app, cors_allowed_origins="*")

# Debug prints
print("Python version:", sys.version)
print("SUPABASE_URL:", app.config['SUPABASE_URL'])
print("SUPABASE_KEY:", app.config['SUPABASE_KEY'])

# Register blueprints
app.register_blueprint(friends_bp)
app.register_blueprint(servers_bp)

# Initialize Supabase client
supabase: Client = create_client(app.config['SUPABASE_URL'], app.config['SUPABASE_KEY'])

# Login required decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# Routes
@app.route('/')
def index():
    try:
        if 'user_id' in session:
            return redirect(url_for('chat'))
        return render_template('index.html')
    except Exception as e:
        print(f"Error in index route: {e}")
        import traceback
        traceback.print_exc()
        return f"Error: {e}", 500

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    try:
        if request.method == 'POST':
            username = request.form.get('username')
            password = request.form.get('password')
            confirm_password = request.form.get('confirm_password')
            
            if not username or not password:
                flash('Username and password are required', 'error')
                return render_template('signup.html')
            
            if password != confirm_password:
                flash('Passwords do not match', 'error')
                return render_template('signup.html')
            
            if len(password) < 6:
                flash('Password must be at least 6 characters', 'error')
                return render_template('signup.html')
            
            # Check if username already exists
            try:
                existing = supabase.table('users').select('id').eq('username', username).execute()
                if existing.data:
                    flash('Username already exists', 'error')
                    return render_template('signup.html')
            except Exception as e:
                print(f"Error checking username: {e}")
                flash('Error checking username. Please try again.', 'error')
                return render_template('signup.html')
            
            try:
                # Hash the password
                hashed_password = generate_password_hash(password)
                
                # Insert user directly into users table (let trigger handle discriminator/user_tag)
                result = supabase.table('users').insert({
                    'username': username,
                    'password': hashed_password
                }).execute()
                
                if result.data and len(result.data) > 0:
                    user = result.data[0]
                    user_id = user['id']
                    user_tag = user.get('user_tag', f"{username}#00001")
                    
                    # Set session
                    session['user_id'] = user_id
                    session['username'] = username
                    session['user_tag'] = user_tag
                    
                    flash('Account created successfully!', 'success')
                    return redirect(url_for('chat'))
                else:
                    flash('Error creating account', 'error')
                    
            except Exception as e:
                print(f"Signup error: {e}")
                import traceback
                traceback.print_exc()
                flash('Error creating account. Please try again.', 'error')
        
        return render_template('signup.html')
    except Exception as e:
        print(f"Signup route error: {e}")
        import traceback
        traceback.print_exc()
        return f"Error: {e}", 500

@app.route('/login', methods=['GET', 'POST'])
def login():
    try:
        if request.method == 'POST':
            username = request.form.get('username')
            password = request.form.get('password')
            
            if not username or not password:
                flash('Username and password are required', 'error')
                return render_template('login.html')
            
            try:
                # Get user from database
                user_data = supabase.table('users').select('*').eq('username', username).execute()
                
                if user_data.data and len(user_data.data) > 0:
                    user = user_data.data[0]
                    
                    # Check password hash
                    if check_password_hash(user['password'], password):
                        session['user_id'] = user['id']
                        session['username'] = user['username']
                        session['user_tag'] = user.get('user_tag', f"{username}#00001")
                        flash('Login successful!', 'success')
                        return redirect(url_for('chat'))
                    else:
                        flash('Invalid username or password', 'error')
                else:
                    flash('Invalid username or password', 'error')
                    
            except Exception as e:
                print(f"Login error: {e}")
                import traceback
                traceback.print_exc()
                flash('Login failed. Please try again.', 'error')
        
        return render_template('login.html')
    except Exception as e:
        print(f"Login route error: {e}")
        import traceback
        traceback.print_exc()
        return f"Error: {e}", 500

@app.route('/logout')
@login_required
def logout():
    session.clear()
    flash('You have been logged out', 'success')
    return redirect(url_for('index'))

@app.route('/friends-test')
@login_required
def friends_test():
    """Test page for friend system"""
    return render_template('friends_test.html', 
                         current_user={
                             'id': session['user_id'], 
                             'username': session['username'],
                             'user_tag': session.get('user_tag', session['username'])
                         })

@app.route('/chat')
@login_required
def chat():
    try:
        # Get all users except current user (for search functionality)
        users_response = supabase.table('users').select('*').neq('id', session['user_id']).execute()
        users = users_response.data
        
        # No auto-pairing - empty chat window by default
        return render_template('chat.html', 
                             current_user={
                                 'id': session['user_id'], 
                                 'username': session['username'],
                                 'user_tag': session.get('user_tag', session['username'])
                             },
                             users=users,
                             messages=[]
                             )
    except Exception as e:
        print(f"Chat error: {e}")
        flash('Error loading chat', 'error')
        return redirect(url_for('index'))

@app.route('/api/send_message', methods=['POST'])
@login_required
def send_message():
    try:
        receiver_id = request.form.get('receiver_id')
        content = request.form.get('content', '').strip()
        file = request.files.get('file')
        reply_to_id = request.form.get('reply_to_id')  # Get reply_to_id if present
        
        # Validate receiver_id
        if not receiver_id or receiver_id == '':
            return jsonify({'success': False, 'error': 'No recipient selected'}), 400
        
        # Validate that receiver exists
        try:
            receiver_check = supabase.table('users').select('id').eq('id', receiver_id).execute()
            if not receiver_check.data:
                return jsonify({'success': False, 'error': 'Recipient not found'}), 400
        except Exception as e:
            print(f"Error checking receiver: {e}")
            return jsonify({'success': False, 'error': 'Error validating recipient'}), 500
        
        file_url = None
        file_type = None
        
        # Handle file upload
        if file and file.filename:
            # Upload to Supabase Storage
            filename = f"{uuid.uuid4()}_{secure_filename(file.filename)}"
            file_bytes = file.read()
            
            # Upload to Supabase storage bucket 'chat-files'
            storage_response = supabase.storage.from_('chat-files').upload(
                filename,
                file_bytes,
                {'content-type': file.content_type}
            )
            
            # Get public URL
            file_url = supabase.storage.from_('chat-files').get_public_url(filename)
            file_type = file.content_type
        
        # Insert message into database
        message_data = {
            'sender_id': session['user_id'],
            'receiver_id': receiver_id,
            'content': content if content else None,
            'file_url': file_url,
            'file_type': file_type,
            'reply_to_id': reply_to_id if reply_to_id else None  # Include reply_to_id
        }
        
        message_response = supabase.table('direct_messages').insert(message_data).execute()
        message = message_response.data[0] if message_response.data else None
        
        if message:
            # Enrich message with replied_to data if present
            if message.get('reply_to_id'):
                replied_msg_response = supabase.table('direct_messages').select('content, sender_id').eq('id', message['reply_to_id']).execute()
                if replied_msg_response.data:
                    replied_msg = replied_msg_response.data[0]
                    sender_response = supabase.table('users').select('username').eq('id', replied_msg['sender_id']).execute()
                    if sender_response.data:
                        message['replied_to'] = {
                            'content': replied_msg['content'],
                            'sender': {'username': sender_response.data[0]['username']}
                        }
            
            # Emit via SocketIO for real-time delivery
            socketio.emit('new_message', {'message': message}, room=receiver_id)
            socketio.emit('message_sent', {'message': message}, room=session['user_id'])
            
            return jsonify({'success': True, 'message': message}), 200
        else:
            return jsonify({'success': False, 'error': 'Failed to send message'}), 500
            
    except Exception as e:
        print(f"Send message error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/messages', methods=['GET'])
@login_required
def get_messages():
    friend_id = request.args.get('friend_id')
    since = request.args.get('since')

    if not friend_id:
        return jsonify({'success': False, 'error': 'Friend ID is required'}), 400

    try:
        filters = (
            f"and(sender_id.eq.{session['user_id']},receiver_id.eq.{friend_id}),"
            f"and(sender_id.eq.{friend_id},receiver_id.eq.{session['user_id']})"
        )

        query = supabase.table('direct_messages').select('*').or_(filters).order('created_at', desc=False)

        if since:
            query = query.filter('created_at', 'gt', since)

        response = query.execute()
        messages = response.data if response.data else []
        
        # Enrich messages with replied_to data
        for message in messages:
            if message.get('reply_to_id'):
                try:
                    # Fetch the replied-to message
                    replied_msg_response = supabase.table('direct_messages').select('id, content, sender_id').eq('id', message['reply_to_id']).execute()
                    if replied_msg_response.data:
                        replied_msg = replied_msg_response.data[0]
                        # Fetch the sender of replied message
                        sender_response = supabase.table('users').select('id, username').eq('id', replied_msg['sender_id']).execute()
                        if sender_response.data:
                            replied_msg['sender'] = sender_response.data[0]
                        message['replied_to'] = replied_msg
                except Exception as e:
                    print(f"Error fetching replied message: {e}")

        return jsonify({'success': True, 'messages': messages}), 200
    except Exception as e:
        print(f"Get messages error: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch messages'}), 500


@app.route('/api/search_users', methods=['GET'])
@login_required
def search_users():
    search_query = request.args.get('q', '').strip()
    
    if not search_query:
        return jsonify({'success': True, 'users': []}), 200
    
    try:
        # Search by username or user_tag
        users_response = supabase.table('users').select('id, username, user_tag').neq('id', session['user_id']).or_(
            f"username.ilike.%{search_query}%,user_tag.ilike.%{search_query}%"
        ).limit(20).execute()
        
        users = users_response.data if users_response.data else []
        return jsonify({'success': True, 'users': users}), 200
    except Exception as e:
        print(f"Search users error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

# SocketIO events
@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")

@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")

@socketio.on('join')
def handle_join(data):
    user_id = data.get('user_id')
    if user_id:
        join_room(user_id)
        print(f"User {user_id} joined their room")

@socketio.on('join_server')
def handle_join_server(data):
    server_id = data.get('server_id')
    if server_id:
        join_room(f"server_{server_id}")
        print(f"User joined server room: server_{server_id}")

@socketio.on('leave_server')
def handle_leave_server(data):
    server_id = data.get('server_id')
    if server_id:
        from flask_socketio import leave_room
        leave_room(f"server_{server_id}")
        print(f"User left server room: server_{server_id}")

@socketio.on('server_message')
def handle_server_message(data):
    """Handle server message via WebSocket"""
    server_id = data.get('server_id')
    content = data.get('content', '').strip()
    reply_to_id = data.get('reply_to_id')  # Get reply_to_id if present
    
    if not server_id or not content:
        emit('error', {'message': 'Invalid message data'})
        return
    
    if 'user_id' not in session:
        emit('error', {'message': 'Not authenticated'})
        return
    
    try:
        user_id = session['user_id']
        
        # Check if user is a member
        is_member = supabase.rpc('is_server_member', {
            'sid': server_id,
            'uid': user_id
        }).execute()
        
        if not is_member.data:
            emit('error', {'message': 'Not a member of this server'})
            return
        
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
            
            # Enrich message with replied_to data if present
            if msg.get('reply_to_id'):
                replied_msg_response = supabase.table('server_messages').select('content, sender_id').eq('id', msg['reply_to_id']).execute()
                if replied_msg_response.data:
                    replied_msg = replied_msg_response.data[0]
                    sender_response = supabase.table('users').select('username').eq('id', replied_msg['sender_id']).execute()
                    if sender_response.data:
                        message_info['replied_to'] = {
                            'content': replied_msg['content'],
                            'sender': {'username': sender_response.data[0]['username']}
                        }
            
            # Broadcast to all members in the server room
            emit('new_server_message', message_info, room=f"server_{server_id}")
        else:
            emit('error', {'message': 'Failed to send message'})
            
    except Exception as e:
        print(f"Server message error: {e}")
        emit('error', {'message': str(e)})

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True)
