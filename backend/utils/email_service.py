"""
Email Service for sending verification codes
"""
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import random
import string
import os
from datetime import datetime, timedelta

# In-memory storage for verification codes (in production, use Redis or database)
verification_codes = {}

def generate_verification_code():
    """Generate a 6-digit verification code"""
    return ''.join(random.choices(string.digits, k=6))

def send_verification_email(to_email, code, purpose='verification'):
    """
    Send verification code via email

    Args:
        to_email: Recipient email address
        code: 6-digit verification code
        purpose: 'verification' or 'password_reset'
    """
    try:
        # Email configuration (use environment variables in production)
        smtp_server = os.getenv('SMTP_SERVER', 'smtp.gmail.com')
        smtp_port = int(os.getenv('SMTP_PORT', '587'))
        smtp_username = os.getenv('SMTP_USERNAME', '')
        smtp_password = os.getenv('SMTP_PASSWORD', '')
        # Support either FROM_EMAIL or EMAIL_FROM environment variable names
        from_email = os.getenv('FROM_EMAIL', os.getenv('EMAIL_FROM', smtp_username))

        # If credentials not configured, print to console instead
        if not smtp_username or not smtp_password:
            print("\n" + "="*60)
            print("📧 EMAIL SERVICE NOT CONFIGURED - SHOWING CODE IN CONSOLE")
            print("="*60)
            print(f"To: {to_email}")
            print(f"Purpose: {purpose}")
            print(f"Verification Code: {code}")
            print("="*60 + "\n")
            return code  # Return the code in development mode

        # Create message
        message = MIMEMultipart()
        message['From'] = from_email
        message['To'] = to_email

        if purpose == 'password_reset':
            message['Subject'] = 'Password Reset - Emotion Detection System'
            body = f"""
            <html>
                <body style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #2563eb;">Password Reset Request</h2>
                    <p>You requested to reset your password.</p>
                    <p>Your verification code is:</p>
                    <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                        <h1 style="color: #2563eb; font-size: 36px; letter-spacing: 8px; margin: 0;">{code}</h1>
                    </div>
                    <p>This code will expire in 10 minutes.</p>
                    <p>If you didn't request this, please ignore this email.</p>
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 12px;">Emotion Detection System</p>
                </body>
            </html>
            """
        else:
            message['Subject'] = 'Email Verification - Emotion Detection System'
            body = f"""
            <html>
                <body style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #2563eb;">Welcome! Verify Your Email</h2>
                    <p>Thank you for registering with our Emotion Detection System.</p>
                    <p>Your verification code is:</p>
                    <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                        <h1 style="color: #2563eb; font-size: 36px; letter-spacing: 8px; margin: 0;">{code}</h1>
                    </div>
                    <p>This code will expire in 10 minutes.</p>
                    <p>If you didn't create an account, please ignore this email.</p>
                    <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 12px;">Emotion Detection System</p>
                </body>
            </html>
            """

        message.attach(MIMEText(body, 'html'))

        # Send email
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_username, smtp_password)
            server.send_message(message)

        print(f"✅ Verification email sent to {to_email}")
        return True

    except Exception as e:
        print(f"❌ Error sending email: {e}")
        # Fallback: print to console for debugging
        print("\n" + "="*60)
        print("📧 EMAIL SENDING FAILED - SHOWING CODE IN CONSOLE")
        print("="*60)
        print(f"To: {to_email}")
        print(f"Purpose: {purpose}")
        print(f"Verification Code: {code}")
        print("="*60 + "\n")
        # Return False to indicate the send failed so callers can react
        return False

def store_verification_code(email, code):
    """Store verification code with expiration"""
    print("\n=== Storing Verification Code ===")
    print(f"Email: {email}")
    print(f"Code: {code}")
    
    expiration = datetime.now() + timedelta(minutes=10)
    verification_codes[email] = {
        'code': code,
        'expiration': expiration,
        'attempts': 0
    }
    print("✅ Code stored successfully")
    print(f"Will expire at: {expiration}")

def verify_code(email, code):
    """Verify the code for an email"""
    print("\n=== Email Service: Verify Code ===")
    print(f"Email: {email}")
    print(f"Code to verify: {code}")
    print(f"Current verification_codes: {verification_codes}")
    
    if email not in verification_codes:
        print(f"❌ No verification code found for email: {email}")
        return False, "No verification code found for this email"

    stored = verification_codes[email]
    print(f"Found stored code data: {stored}")

    # Check expiration
    if datetime.now() > stored['expiration']:
        del verification_codes[email]
        return False, "Verification code has expired"

    # Check attempts
    if stored['attempts'] >= 3:
        del verification_codes[email]
        return False, "Too many failed attempts. Please request a new code."

    # Check code
    if stored['code'] != code:
        verification_codes[email]['attempts'] += 1
        return False, "Invalid verification code"

    # Success
    del verification_codes[email]
    return True, "Code verified successfully"

def cleanup_expired_codes():
    """Remove expired verification codes"""
    now = datetime.now()
    expired = [email for email, data in verification_codes.items()
               if now > data['expiration']]
    for email in expired:
        del verification_codes[email]
