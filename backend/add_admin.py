"""
Utility script to add or promote a user to admin role
Usage: python add_admin.py
"""
import sys
import os

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from models.database import db, User
from werkzeug.security import generate_password_hash

# Create minimal Flask app for database operations
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///emotion_tracker.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

def add_admin(email, username=None, password=None, full_name=None):
    """Add or promote a user to admin role"""
    with app.app_context():
        # Check if user already exists
        user = User.query.filter_by(email=email).first()
        
        if user:
            # User exists, promote to admin
            if user.role == 'admin':
                print(f"✓ User {user.email} is already an admin")
            else:
                user.role = 'admin'
                user.is_active = True
                user.is_verified = True
                db.session.commit()
                print(f"✓ Successfully promoted {user.email} to admin role")
            
            # Display user info
            print(f"\nUser Details:")
            print(f"  ID: {user.id}")
            print(f"  Email: {user.email}")
            print(f"  Username: {user.username}")
            print(f"  Full Name: {user.full_name}")
            print(f"  Role: {user.role}")
            print(f"  Active: {user.is_active}")
            print(f"  Verified: {user.is_verified}")
            
        else:
            # User doesn't exist, create new admin user
            if not username:
                username = email.split('@')[0]  # Use email prefix as username
            
            if not password:
                password = 'Admin@123'  # Default password
            
            if not full_name:
                full_name = username
            
            new_user = User(
                email=email,
                username=username,
                full_name=full_name,
                role='admin',
                is_active=True,
                is_verified=True
            )
            new_user.set_password(password)
            
            try:
                db.session.add(new_user)
                db.session.commit()
                print(f"✓ Successfully created new admin user: {email}")
                print(f"\nUser Details:")
                print(f"  Email: {new_user.email}")
                print(f"  Username: {new_user.username}")
                print(f"  Full Name: {new_user.full_name}")
                print(f"  Password: {password}")
                print(f"  Role: {new_user.role}")
                print(f"\n⚠️  Please change the password after first login!")
                
            except Exception as e:
                db.session.rollback()
                print(f"✗ Error creating user: {str(e)}")
                sys.exit(1)

if __name__ == '__main__':
    # Create database tables if they don't exist
    with app.app_context():
        db.create_all()
    
    # Add bothackerr03@gmail.com as admin
    print("Adding admin user...\n")
    add_admin(
        email='bothackerr03@gmail.com',
        username='bothackerr03',
        full_name='Admin User'
    )
    
    print("\n✓ Done!")

