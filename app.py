from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash
from flask_socketio import SocketIO, emit, join_room
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from supabase import create_client, Client
from config import Config
from functools import wraps
import os
import uuid
from datetime import datetime, timedelta
online_users = set()
def to_ist(utc_str):
    if not utc_str:
        return ''
    try:
        # Parse ISO format (e.g., '2023-11-08T14:30:00')
        dt = datetime.fromisoformat(utc_str)
        # Add 5 hours 30 minutes for IST
        ist_dt = dt + timedelta(hours=5, minutes=30)
        return ist_dt.strftime('%d-%m-%Y %I:%M %p')  # e.g., 08-11-2023 08:00 PM
    except Exception:
        return utc_str

app = Flask(__name__)
app.config.from_object(Config)
socketio = SocketIO(app, cors_allowed_origins="*")

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
    if 'user_id' in session:
        return redirect(url_for('chat'))
    return render_template('index.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
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
        
        # Check if username already exists in users table
        try:
            existing = supabase.table('users').select('id').eq('username', username).execute()
            if existing.data:
                flash('Username already exists', 'error')
                return render_template('signup.html')
        except Exception as e:
            print(f"Error checking username: {e}")
        
        try:
            # Create user in Supabase Auth
            auth_response = supabase.auth.sign_up({
                "email": f"{username}@example.com",  # Using username as email prefix
                "password": password
            })
            
            if auth_response.user:
                user_id = auth_response.user.id
                
                # Insert user into users table
                try:
                    supabase.table('users').insert({
                        'id': user_id,
                        'username': username
                    }).execute()
                except Exception as e:
                    print(f"Error inserting user: {e}")
                    flash('Error creating user profile', 'error')
                    return render_template('signup.html')
                
                session['user_id'] = user_id
                session['username'] = username
                
                flash('Account created successfully!', 'success')
                return redirect(url_for('chat'))
            else:
                flash('Error creating account', 'error')
                
        except Exception as e:
            print(f"Signup error: {e}")
            error_msg = str(e)
            if 'already registered' in error_msg.lower() or 'already exists' in error_msg.lower():
                flash('This account already exists. Please try logging in.', 'error')
            else:
                flash('Error creating account. Please try again.', 'error')
    
    return render_template('signup.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        if not username or not password:
            flash('Username and password are required', 'error')
            return render_template('login.html')
        
        try:
            # Sign in with Supabase Auth
            auth_response = supabase.auth.sign_in_with_password({
                "email": f"{username}@example.com",
                "password": password
            })
            
            if auth_response.user:
                session['user_id'] = auth_response.user.id
                session['username'] = username
                return redirect(url_for('chat'))
            else:
                flash('Invalid username or password', 'error')
                
        except Exception as e:
            print(f"Login error: {e}")
            error_msg = str(e).lower()
            if 'invalid' in error_msg or 'credentials' in error_msg or 'password' in error_msg:
                flash('Invalid username or password', 'error')
            else:
                flash('Login failed. Please try again.', 'error')
    
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    supabase.auth.sign_out()
    session.clear()
    return redirect(url_for('index'))

@app.route('/chat')
@login_required
def chat():
    try:
        # Get all users except current user
        users_response = supabase.table('users').select('*').neq('id', session['user_id']).execute()
        users = users_response.data
        
        # For a 2-person chat, get the other user (friend)
        friend = users[0] if users else None
        
        # Get messages between current user and friend
        messages = []
        if friend:
            messages_response = supabase.table('messages').select('*').or_(
                f"and(sender_id.eq.{session['user_id']},receiver_id.eq.{friend['id']}),and(sender_id.eq.{friend['id']},receiver_id.eq.{session['user_id']})"
            ).order('created_at', desc=False).execute()
            messages = messages_response.data

            # Add this block to convert timestamps to IST
            for msg in messages:
                msg['created_at_ist'] = to_ist(msg.get('created_at'))

        return render_template('chat.html', 
            current_user={'id': session['user_id'], 'username': session['username']},
            friend_id=friend['id'] if friend else '',
            friend_name=friend['username'] if friend else 'No users',
            messages=messages
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
            'file_type': file_type
        }
        
        message_response = supabase.table('messages').insert(message_data).execute()
        message = message_response.data[0] if message_response.data else None
        
        if message:
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

        query = supabase.table('messages').select('*').or_(filters).order('created_at', desc=False)

        if since:
            query = query.filter('created_at', 'gt', since)

        response = query.execute()
        messages = response.data if response.data else []

        return jsonify({'success': True, 'messages': messages}), 200
    except Exception as e:
        print(f"Get messages error: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch messages'}), 500

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


@socketio.on('user_online')
def handle_user_online(data):
    user_id = data.get('user_id')
    if user_id:
        online_users.add(user_id)
        socketio.emit('presence_update', {'online_users': list(online_users)})

@socketio.on('user_offline')
def handle_user_offline(data):
    user_id = data.get('user_id')
    if user_id:
        online_users.discard(user_id)
        socketio.emit('presence_update', {'online_users': list(online_users)})


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
