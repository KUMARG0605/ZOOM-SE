"""
Simple script to add admin user directly to SQLite database
"""
import sqlite3
from werkzeug.security import generate_password_hash
from datetime import datetime

# Database file
DB_PATH = 'emotion_tracker.db'

def add_admin(email, username, password='botAdmin@123', full_name=None):
    """Add or promote user to admin"""
    if not full_name:
        full_name = username
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if user exists
        cursor.execute('SELECT id, email, username, role FROM users WHERE email = ?', (email,))
        user = cursor.fetchone()
        
        if user:
            user_id, user_email, user_username, user_role = user
            if user_role == 'admin':
                print(f"✓ User {email} is already an admin")
            else:
                # Promote to admin
                cursor.execute('''
                    UPDATE users 
                    SET role = 'admin', is_active = 1, is_verified = 1
                    WHERE email = ?
                ''', (email,))
                conn.commit()
                print(f"✓ Successfully promoted {email} to admin role")
            
            # Display user info
            cursor.execute('SELECT * FROM users WHERE email = ?', (email,))
            user_data = cursor.fetchone()
            print(f"\nUser Details:")
            print(f"  Email: {email}")
            print(f"  Username: {user_username}")
            print(f"  Role: admin")
            
        else:
            # Create new admin user
            password_hash = generate_password_hash(password)
            created_at = datetime.utcnow().isoformat()
            
            cursor.execute('''
                INSERT INTO users (email, username, password_hash, full_name, role, is_active, is_verified, created_at)
                VALUES (?, ?, ?, ?, 'admin', 1, 1, ?)
            ''', (email, username, password_hash, full_name, created_at))
            
            conn.commit()
            print(f"✓ Successfully created new admin user: {email}")
            print(f"\nUser Details:")
            print(f"  Email: {email}")
            print(f"  Username: {username}")
            print(f"  Full Name: {full_name}")
            print(f"  Password: {password}")
            print(f"  Role: admin")
            print(f"\n⚠️  Please change the password after first login!")
    
    except sqlite3.IntegrityError as e:
        print(f"✗ Error: {str(e)}")
        if 'username' in str(e):
            print(f"  Username '{username}' is already taken. Try a different username.")
    except Exception as e:
        print(f"✗ Error: {str(e)}")
    finally:
        conn.close()

if __name__ == '__main__':
    print("Adding admin user...\n")
    add_admin(
        email='bothackerr03@gmail.com',
        username='bothackerr03',
        full_name='Admin User'
    )
    print("\n✓ Done!")
