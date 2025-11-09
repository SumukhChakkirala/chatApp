from supabase import create_client
from config import Config
import datetime

supabase = create_client(Config.SUPABASE_URL, Config.SUPABASE_KEY)

class User:
    @staticmethod
    def create(username, password):
        """Create new user"""
        try:
            # Create auth user
            email = f"{username}@yourdomain.com"
            auth_response = supabase.auth.sign_up({
                "email": email,
                "password": password
            })
            
            if auth_response.user:
                # Create user profile
                supabase.table('users').insert({
                    'id': auth_response.user.id,
                    'username': username
                }).execute()
                
                return {'success': True, 'user': auth_response.user}
            return {'success': False, 'error': 'Signup failed'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def login(username, password):
        """Login user"""
        try:
            email = f"{username}@yourdomain.com"
            response = supabase.auth.sign_in_with_password({
                "email": email,
                "password": password
            })
            
            if response.user:
                # Get username from users table
                user_data = supabase.table('users').select('*').eq('id', response.user.id).execute()
                return {
                    'success': True, 
                    'user': response.user,
                    'username': user_data.data[0]['username'] if user_data.data else username
                }
            return {'success': False, 'error': 'Invalid credentials'}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def get_all_except(user_id):
        """Get all users except current user"""
        try:
            response = supabase.table('users').select('*').neq('id', user_id).execute()
            return response.data
        except Exception as e:
            print(f"Error fetching users: {e}")
            return []

class Message:
    @staticmethod
    def send(sender_id, receiver_id, content=None, file_url=None, file_type=None):
        """Send a message"""
        try:
            data = {
                'sender_id': sender_id,
                'receiver_id': receiver_id,
                'content': content,
                'file_url': file_url,
                'file_type': file_type,
                'created_at': datetime.datetime.now().isoformat()
            }
            response = supabase.table('direct_messages').insert(data).execute()
            return {'success': True, 'message': response.data[0]}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    @staticmethod
    def get_conversation(user1_id, user2_id):
        """Get messages between two users"""
        try:
            r1 = supabase.table('direct_messages').select('*') \
                .eq('sender_id', user1_id).eq('receiver_id', user2_id).execute()
            r2 = supabase.table('direct_messages').select('*') \
                .eq('sender_id', user2_id).eq('receiver_id', user1_id).execute()
            data = (r1.data or []) + (r2.data or [])
            return sorted(data, key=lambda m: m.get('created_at') or '')
        except Exception as e:
            print(f"Error fetching messages: {e}")
            return []
    
    @staticmethod
    def upload_file(file, user_id):
        """Upload file to Supabase storage"""
        try:
            filename = f"{user_id}_{datetime.datetime.now().timestamp()}_{file.filename}"
            file_bytes = file.read()
            
            response = supabase.storage.from_('media').upload(
                filename,
                file_bytes,
                {"content-type": file.content_type}
            )
            
            # Get public URL
            public_url = supabase.storage.from_('media').get_public_url(filename)
            
            return {
                'success': True,
                'url': public_url,
                'type': file.content_type
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}