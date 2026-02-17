# routes/google_meet.py
import os
import json
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, session
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request
from googleapiclient.errors import HttpError

google_meet_bp = Blueprint("google_meet", __name__)

# Path to your downloaded credentials file
CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), "..", "google_oauth_client_r21.json")
TOKEN_FILE = os.path.join(os.path.dirname(__file__), "..", "token.json")

# Required scopes for Google Calendar (Google Meet is created via Calendar)
SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
]

# OAuth2 configuration
REDIRECT_URI = "http://localhost:5000/api/google-meet/oauth2callback"

# -------------------------------------------------------------------
#  OAuth Flow Management
# -------------------------------------------------------------------
def get_google_credentials():
    """
    Loads or refreshes Google OAuth credentials.
    Returns None if user needs to authorize.
    """
    creds = None
    if os.path.exists(TOKEN_FILE):
        try:
            creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
        except Exception as e:
            print(f"Error loading credentials: {e}")
            return None

    # Refresh if expired
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            # Save the refreshed credentials
            with open(TOKEN_FILE, "w") as token:
                token.write(creds.to_json())
        except Exception as e:
            print(f"Error refreshing credentials: {e}")
            return None

    return creds if creds and creds.valid else None


def create_flow():
    """Create OAuth flow for authorization"""
    return Flow.from_client_secrets_file(
        CREDENTIALS_FILE,
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI
    )


# -------------------------------------------------------------------
#  OAuth Routes
# -------------------------------------------------------------------
@google_meet_bp.route("/auth", methods=["GET"])
def google_auth():
    """Initiate Google OAuth flow"""
    try:
        flow = create_flow()
        authorization_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            prompt='consent'
        )

        return jsonify({
            "success": True,
            "authorization_url": authorization_url,
            "state": state
        })
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@google_meet_bp.route("/oauth2callback", methods=["GET"])
def oauth2callback():
    """Handle OAuth callback"""
    try:
        flow = create_flow()
        flow.fetch_token(authorization_response=request.url)

        creds = flow.credentials

        # Save credentials
        with open(TOKEN_FILE, "w") as token:
            token.write(creds.to_json())

        return """
        <html>
            <body>
                <h1>Authorization Successful!</h1>
                <p>You can close this window and return to the application.</p>
                <script>window.close();</script>
            </body>
        </html>
        """
    except Exception as e:
        return f"<html><body><h1>Authorization Failed</h1><p>{str(e)}</p></body></html>", 500


@google_meet_bp.route("/auth/status", methods=["GET"])
def auth_status():
    """Check if user is authenticated"""
    creds = get_google_credentials()
    return jsonify({
        "success": True,
        "authenticated": creds is not None
    })


# -------------------------------------------------------------------
#  Google Meet/Calendar Integration
# -------------------------------------------------------------------
@google_meet_bp.route("/create-meeting", methods=["POST"])
def create_meeting():
    """
    Create a Google Meet meeting via Google Calendar.
    Body: {
        "summary": "Meeting Title",
        "duration_minutes": 60,
        "start_time": "2025-01-15T10:00:00" (optional, defaults to now)
    }
    """
    creds = get_google_credentials()
    if not creds:
        return jsonify({
            "success": False,
            "message": "Not authenticated. Please authorize first.",
            "requires_auth": True
        }), 401

    data = request.json or {}
    summary = data.get("summary", "Emotion Tracking Meeting")
    duration_minutes = data.get("duration_minutes", 60)
    start_time = data.get("start_time")

    try:
        service = build('calendar', 'v3', credentials=creds)

        # Parse or create start time
        if start_time:
            start_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        else:
            start_dt = datetime.utcnow()

        end_dt = start_dt + timedelta(minutes=duration_minutes)

        # Get the user's email to add as organizer/attendee
        try:
            user_info = service.calendarList().get(calendarId='primary').execute()
            user_email = user_info.get('id', '')
        except:
            user_email = ''

        # Create event with Google Meet
        event = {
            'summary': summary,
            'description': 'Meeting with emotion tracking enabled - Join instantly, you are the host!',
            'start': {
                'dateTime': start_dt.isoformat(),
                'timeZone': 'UTC',
            },
            'end': {
                'dateTime': end_dt.isoformat(),
                'timeZone': 'UTC',
            },
            'conferenceData': {
                'createRequest': {
                    'requestId': f"meet-{int(datetime.utcnow().timestamp())}",
                    'conferenceSolutionKey': {
                        'type': 'hangoutsMeet'
                    },
                },
            },
            'attendees': [
                {'email': user_email, 'organizer': True, 'responseStatus': 'accepted'}
            ] if user_email else [],
            'guestsCanModify': True,  # Allow guests to modify
            'anyoneCanAddSelf': True,  # Anyone can add themselves
        }

        created_event = service.events().insert(
            calendarId='primary',
            body=event,
            conferenceDataVersion=1
        ).execute()

        meet_link = created_event.get('hangoutLink', '')
        conference_data = created_event.get('conferenceData', {})
        meet_code = conference_data.get('conferenceId', '')

        return jsonify({
            "success": True,
            "meeting": {
                "id": created_event['id'],
                "summary": created_event['summary'],
                "meet_link": meet_link,
                "meet_code": meet_code,
                "start_time": created_event['start']['dateTime'],
                "end_time": created_event['end']['dateTime'],
                "html_link": created_event.get('htmlLink', '')
            }
        })

    except HttpError as error:
        return jsonify({
            "success": False,
            "message": f"Calendar API error: {error}"
        }), 500
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error creating meeting: {str(e)}"
        }), 500


@google_meet_bp.route("/meetings", methods=["GET"])
def list_meetings():
    """List upcoming Google Meet meetings"""
    creds = get_google_credentials()
    if not creds:
        return jsonify({
            "success": False,
            "message": "Not authenticated",
            "requires_auth": True
        }), 401

    try:
        service = build('calendar', 'v3', credentials=creds)

        # Get events from now onwards
        now = datetime.utcnow().isoformat() + 'Z'
        events_result = service.events().list(
            calendarId='primary',
            timeMin=now,
            maxResults=10,
            singleEvents=True,
            orderBy='startTime'
        ).execute()

        events = events_result.get('items', [])

        meetings = []
        for event in events:
            # Only include events with Google Meet links
            if 'hangoutLink' in event:
                conference_data = event.get('conferenceData', {})
                meetings.append({
                    'id': event['id'],
                    'summary': event.get('summary', 'No Title'),
                    'meet_link': event.get('hangoutLink', ''),
                    'meet_code': conference_data.get('conferenceId', ''),
                    'start_time': event['start'].get('dateTime', event['start'].get('date')),
                    'end_time': event['end'].get('dateTime', event['end'].get('date')),
                    'html_link': event.get('htmlLink', '')
                })

        return jsonify({
            "success": True,
            "meetings": meetings
        })

    except HttpError as error:
        return jsonify({
            "success": False,
            "message": f"Calendar API error: {error}"
        }), 500
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error listing meetings: {str(e)}"
        }), 500


@google_meet_bp.route("/meeting/<event_id>", methods=["DELETE"])
def delete_meeting(event_id):
    """Delete a Google Meet meeting"""
    creds = get_google_credentials()
    if not creds:
        return jsonify({
            "success": False,
            "message": "Not authenticated",
            "requires_auth": True
        }), 401

    try:
        service = build('calendar', 'v3', credentials=creds)
        service.events().delete(calendarId='primary', eventId=event_id).execute()

        return jsonify({
            "success": True,
            "message": "Meeting deleted successfully"
        })

    except HttpError as error:
        return jsonify({
            "success": False,
            "message": f"Calendar API error: {error}"
        }), 500
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error deleting meeting: {str(e)}"
        }), 500


# -------------------------------------------------------------------
#  Screen Capture Integration (Frontend will capture and send frames)
# -------------------------------------------------------------------
@google_meet_bp.route("/capture/frame", methods=["POST"])
def capture_frame():
    """
    Receive video frame from frontend screen capture and analyze emotion.
    Body: {
        "session_id": "...",
        "participant_id": "...",
        "image": "base64_image_data"
    }
    """
    # This endpoint forwards to the existing emotion analysis
    # The frontend will handle screen capture via browser APIs
    from flask import current_app

    data = request.json
    if not data or 'image' not in data:
        return jsonify({"success": False, "message": "No image data provided"}), 400

    # Forward to emotion analysis endpoint
    with current_app.test_client() as client:
        response = client.post('/api/emotions/analyze', json=data)
        return response.get_json(), response.status_code
