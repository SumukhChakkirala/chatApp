"""
Setup Helper for SecureChat
This script helps you configure your .env file with Supabase credentials
"""

import os
import secrets

print("=" * 60)
print("SecureChat Setup Helper")
print("=" * 60)
print()

print("You'll need to get these values from your Supabase project:")
print("1. Go to https://app.supabase.com")
print("2. Select your project")
print("3. Go to Settings -> API")
print()

# Get Supabase URL
supabase_url = input("Enter your SUPABASE_URL (Project URL): ").strip()
if not supabase_url:
    print("Error: SUPABASE_URL is required!")
    exit(1)

# Get Supabase Key
supabase_key = input("Enter your SUPABASE_KEY (anon/public key): ").strip()
if not supabase_key:
    print("Error: SUPABASE_KEY is required!")
    exit(1)

# Generate secret key
secret_key = secrets.token_hex(32)
print(f"\nGenerated SECRET_KEY: {secret_key}")

# Write to .env file
env_content = f"""# Supabase Configuration
# Get these from: https://app.supabase.com -> Your Project -> Settings -> API
SUPABASE_URL={supabase_url}
SUPABASE_KEY={supabase_key}

# Flask Secret Key (auto-generated)
SECRET_KEY={secret_key}
"""

with open('.env', 'w') as f:
    f.write(env_content)

print("\n" + "=" * 60)
print("✅ Configuration saved to .env file!")
print("=" * 60)
print()
print("Next steps:")
print("1. Make sure you've run the SQL schema in Supabase (supabase_schema.sql)")
print("2. Create a storage bucket called 'chat-files' in Supabase Storage")
print("3. Run: python app.py")
print("4. Open http://localhost:5000 in your browser")
print()
print("Enjoy secure chatting! 🔒")
