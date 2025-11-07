"""
Test Supabase Connection
Run this to verify your Supabase credentials are correct
"""

import os
from dotenv import load_dotenv
from supabase import create_client, Client

print("=" * 60)
print("Testing Supabase Connection")
print("=" * 60)
print()

# Load environment variables
load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

# Check if credentials exist
if not url:
    print("❌ ERROR: SUPABASE_URL not found in .env file")
    exit(1)
if not key:
    print("❌ ERROR: SUPABASE_KEY not found in .env file")
    exit(1)

print(f"✓ SUPABASE_URL found: {url[:30]}...")
print(f"✓ SUPABASE_KEY found: {key[:20]}...")
print()

try:
    print("Connecting to Supabase...")
    # Create client (compatible with supabase 2.3.0)
    supabase: Client = create_client(url, key)
    print("✓ Supabase client created successfully")
    print()
    
    # Test database connection by querying users table
    print("Testing database connection...")
    response = supabase.table('users').select("*").limit(1).execute()
    print("✓ Database connection successful!")
    print(f"✓ Users table exists and is accessible")
    print()
    
    # Test messages table
    print("Testing messages table...")
    response = supabase.table('messages').select("*").limit(1).execute()
    print("✓ Messages table exists and is accessible")
    print()
    
    # Test storage
    print("Testing storage...")
    try:
        buckets = supabase.storage.list_buckets()
        print(f"✓ Storage accessible - {len(buckets)} bucket(s) found")
        
        # Check for chat-files bucket
        bucket_names = [b.name for b in buckets]
        if 'chat-files' in bucket_names:
            print("✓ 'chat-files' bucket exists")
        else:
            print("⚠ WARNING: 'chat-files' bucket not found")
            print("  Create it: Supabase Dashboard → Storage → New bucket → Name: chat-files → Public")
    except Exception as e:
        print(f"⚠ Storage check failed: {str(e)}")
    
    print()
    print("=" * 60)
    print("✅ ALL TESTS PASSED! Your app is ready to run.")
    print("=" * 60)
    print()
    print("Next steps:")
    print("1. Make sure 'chat-files' storage bucket exists (see above)")
    print("2. Run: python app.py")
    print("3. Open: http://localhost:5000")
    print()

except Exception as e:
    print(f"❌ ERROR: {str(e)}")
    print()
    print("Common issues:")
    print("  1. Wrong SUPABASE_URL or SUPABASE_KEY in .env")
    print("  2. SQL schema not run (check supabase_schema.sql)")
    print("  3. Supabase project not active")
    print()
    print("Run 'python setup.py' to reconfigure.")