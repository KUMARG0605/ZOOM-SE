"""
Zoom Desktop Client Bot - REWRITTEN FOR RELIABILITY
Simpler, focused approach for reliable meeting joining and emotion analysis
"""

import os
import sys
import time
import threading
import uuid
import subprocess
import urllib.parse
from datetime import datetime
from typing import Optional, Dict, List
import logging

# Default configuration values (can be overridden via environment variables or constructor)
DEFAULT_CAPTURE_INTERVAL = int(os.getenv('ZOOM_CAPTURE_INTERVAL', '240'))  # 4 minutes default
DEFAULT_USER_NAME = os.getenv('ZOOM_USER_NAME', 'Emotion Bot')
DEFAULT_SAVE_SCREENSHOTS = os.getenv('ZOOM_SAVE_SCREENSHOTS', 'true').lower() == 'true'
DEFAULT_SAVE_ANNOTATED = os.getenv('ZOOM_SAVE_ANNOTATED', 'true').lower() == 'true'
DEFAULT_ENABLE_GALLERY_VIEW = os.getenv('ZOOM_GALLERY_VIEW', 'true').lower() == 'true'

# Third-party imports
import cv2
import numpy as np
import mss
import psutil
from deepface import DeepFace

# Windows automation
try:
    from pywinauto import Desktop
    from pywinauto.findwindows import ElementNotFoundError
except ImportError:
    print("ERROR: pywinauto not installed. Install with: pip install pywinauto")
    sys.exit(1)

# Win32 window capture (inactive window screenshots)
try:
    import win32gui
    import win32ui
    import win32con
    import win32api
except ImportError:
    win32gui = None
    win32ui = None
    win32con = None
    win32api = None

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ZoomDesktopClientBot:
    """Simplified Zoom Desktop Client Bot - Focused on Reliability"""

    def __init__(
        self,
        meeting_id: str,
        session_id: str,
        session_name: str,
        user_name: str = "Emotion Bot",
        meeting_password: Optional[str] = None,
        socketio=None,
        capture_interval: int = DEFAULT_CAPTURE_INTERVAL,
        zoom_path: Optional[str] = None
    ):
        self.bot_id = str(uuid.uuid4())
        self.meeting_id = meeting_id.replace(' ', '').replace('-', '')  # Clean meeting ID
        self.session_id = session_id
        self.session_name = session_name
        self.user_name = user_name
        self.meeting_password = meeting_password
        self.socketio = socketio
        self.capture_interval = capture_interval

        # Zoom application references
        self.zoom_window = None  # Preview dialog window
        self.zoom_meeting_window = None  # Actual meeting window
        self.zoom_window_title = None  # Window title for win32 FindWindow
        self.zoom_process: Optional[subprocess.Popen] = None
        self.zoom_path = zoom_path or self._find_zoom_installation()

        # Create isolated data directory
        self.zoom_data_dir = os.path.abspath(f"zoom_bot_data_{self.bot_id}")
        os.makedirs(self.zoom_data_dir, exist_ok=True)
        logger.info(f"Bot data directory: {self.zoom_data_dir}")

        # State management
        self.is_running = False
        self.is_in_meeting = False

        # Analytics
        self.participants: Dict[str, Dict] = {}
        self.frame_count = 0
        self.total_detections = 0

        # Debug directory
        self.debug_dir = f"debug_zoom_desktop_{self.bot_id}"
        os.makedirs(self.debug_dir, exist_ok=True)
        logger.info(f"Debug images: {self.debug_dir}")

        # MSS (initialized in background thread)
        self.sct = None

    def _find_zoom_installation(self) -> Optional[str]:
        """Find Zoom installation path"""
        possible_paths = [
            os.path.join(os.environ.get('APPDATA', ''), 'Zoom', 'bin', 'Zoom.exe'),
            r'C:\Users\{}\AppData\Roaming\Zoom\bin\Zoom.exe'.format(os.environ.get('USERNAME', '')),
        ]

        for path in possible_paths:
            if os.path.exists(path):
                logger.info(f"Found Zoom: {path}")
                return path

        logger.error("Zoom not found!")
        return None

    def start(self) -> Dict:
        """Start bot in background thread"""
        if self.is_running:
            return {"error": "Bot already running"}

        self.is_running = True
        bot_thread = threading.Thread(target=self._run_bot, daemon=True)
        bot_thread.start()

        return {
            "bot_id": self.bot_id,
            "status": "starting",
            "message": "Bot is starting..."
        }

    def _run_bot(self):
        """Main bot execution loop"""
        try:
            # Initialize mss in this thread
            self.sct = mss.mss()
            logger.info("MSS initialized")

            # Step 1: Launch Zoom and join meeting
            self._send_update("status", {"status": "initializing", "message": "Launching Zoom..."})
            self._launch_and_join_meeting()

            # Step 2: Handle join preview dialog
            self._send_update("status", {"status": "joining", "message": "Joining meeting..."})
            self._handle_join_preview_dialog()

            # Step 3: Wait for meeting to load
            self._send_update("status", {"status": "configuring", "message": "Waiting for meeting..."})
            time.sleep(10)

            # Step 3.5: Find the actual meeting window
            self._send_update("status", {"status": "configuring", "message": "Connecting to meeting window..."})
            self._find_meeting_window()

            # Step 4: (Gallery view is default, skip forcing gallery view)
            # self._send_update("status", {"status": "configuring", "message": "Enabling gallery view..."})
            # self._enable_gallery_view()

            # Step 5: Start capture loop
            self._send_update("status", {"status": "active", "message": "Active and analyzing..."})
            self.is_in_meeting = True
            self._capture_loop()

        except Exception as e:
            logger.error(f"Bot error: {e}", exc_info=True)
            self._send_update("error", {"error": str(e), "message": f"Error: {str(e)}"})
        finally:
            self.stop()

    def _launch_and_join_meeting(self):
        """Launch Zoom and trigger join"""
        try:
            if not self.zoom_path:
                raise Exception("Zoom not found")

            # Extract meeting ID
            meeting_id = self.meeting_id
            logger.info(f"Meeting ID: {meeting_id}")

            # Launch Zoom with isolated data directory
            cmd = [self.zoom_path, f'--datadir={self.zoom_data_dir}']
            logger.info(f"Launching: {' '.join(cmd)}")

            self.zoom_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == 'win32' else 0
            )

            logger.info(f"Zoom process started (PID: {self.zoom_process.pid})")
            time.sleep(8)  # Wait for Zoom to launch

            # Trigger join using protocol URL
            params = {'confno': meeting_id, 'uname': self.user_name}
            if self.meeting_password:
                params['pwd'] = self.meeting_password

            join_url = f"zoommtg://zoom.us/join?{urllib.parse.urlencode(params)}"
            logger.info(f"Opening join URL: {join_url}")

            if sys.platform == 'win32':
                os.startfile(join_url)
            else:
                subprocess.Popen(['open', join_url])

            time.sleep(5)  # Wait for dialog to appear

        except Exception as e:
            logger.error(f"Error launching Zoom: {e}", exc_info=True)
            raise

    def _extract_meeting_id(self, url: str) -> str:
        """Extract meeting ID from URL"""
        if "zoom.us" in url:
            for prefix in ["/j/", "/wc/"]:
                if prefix in url:
                    parts = url.split(prefix)
                    if len(parts) > 1:
                        return parts[1].split("?")[0].split("/")[0].replace(" ", "").replace("-", "")
        return url.replace(" ", "").replace("-", "")


    def _handle_join_preview_dialog(self):
        """Handle the video/audio preview dialog and click Join, then handle passcode dialog if needed"""
        logger.info("Looking for join preview dialog...")

        try:
            # Find the join preview dialog window
            max_attempts = 30
            dialog_found = False


            for attempt in range(max_attempts):
                logger.info(f"Attempt {attempt+1}/{max_attempts}: Searching for dialog...")

                desktop = Desktop(backend="uia")
                all_windows = desktop.windows()

                for window in all_windows:
                    try:
                        window_title = window.window_text()
                        window_pid = window.process_id()

                        # Check if it's a Zoom process
                        try:
                            process = psutil.Process(window_pid)
                            process_name = process.name().lower()

                            if 'zoom.exe' not in process_name:
                                continue

                            title_lower = window_title.lower()
                            # If this is a passcode dialog, handle it immediately
                            if 'passcode' in title_lower:
                                logger.info(f"✅ Found passcode dialog as join preview: '{window_title}'")
                                self.zoom_window = window
                                dialog_found = True
                                # Handle passcode dialog and return
                                self._handle_passcode_dialog()
                                logger.info("Join dialog handled successfully (passcode dialog)")
                                return

                            # Otherwise, look for join preview dialog
                            if any(keyword in title_lower for keyword in ['meeting', 'zoom', 'join']):
                                try:
                                    buttons = window.descendants(control_type="Button")
                                    has_join = any('join' in btn.window_text().lower() for btn in buttons if btn.window_text())
                                    if has_join:
                                        logger.info(f"✅ Found join dialog: '{window_title}'")
                                        self.zoom_window = window
                                        dialog_found = True
                                        break
                                except:
                                    continue
                        except:
                            continue
                    except:
                        continue

                if dialog_found:
                    break

                time.sleep(2)

            if not dialog_found:
                raise Exception("Could not find join preview dialog")

            # Take screenshot
            self._save_debug_screenshot("join_preview_dialog")

            # Wait a moment for dialog to be fully rendered
            time.sleep(2)

            # Turn off audio and video
            logger.info("Turning off audio and video...")
            self._click_audio_video_buttons()

            # Click Join button
            logger.info("Clicking Join button...")
            self._click_join_button()

            # After clicking Join, handle passcode dialog if it appears
            self._handle_passcode_dialog()

            logger.info("Join dialog handled successfully")

        except Exception as e:
            logger.error(f"Error handling join dialog: {e}", exc_info=True)
            raise

    def _handle_passcode_dialog(self):
        """Detect and handle the Zoom passcode dialog if it appears"""
        if not self.meeting_password:
            logger.info("No meeting passcode provided, skipping passcode dialog handling.")
            return

        logger.info("Looking for meeting passcode dialog...")
        try:
            max_attempts = 15
            passcode_dialog = None
            for attempt in range(max_attempts):
                desktop = Desktop(backend="uia")
                all_windows = desktop.windows()
                for window in all_windows:
                    try:
                        title = window.window_text().lower()
                        if ("passcode" in title or "meeting passcode" in title or "enter meeting passcode" in title) and 'zoom' in title:
                            logger.info(f"✅ Found passcode dialog: '{window.window_text()}'")
                            passcode_dialog = window
                            break
                        # Some Zoom versions use a generic title, so check for Edit control with 'passcode' label
                        edits = window.descendants(control_type="Edit")
                        for edit in edits:
                            if 'passcode' in (edit.legacy_properties().get('Name', '').lower()):
                                logger.info(f"✅ Found passcode dialog by Edit control: '{window.window_text()}'")
                                passcode_dialog = window
                                break
                        if passcode_dialog:
                            break
                    except Exception:
                        continue
                if passcode_dialog:
                    break
                time.sleep(1)

            if not passcode_dialog:
                logger.info("No passcode dialog found after join, continuing.")
                return

            # Find the passcode input box and enter the passcode
            logger.info("Entering meeting passcode...")
            edit_controls = passcode_dialog.descendants(control_type="Edit")
            entered = False
            for edit in edit_controls:
                try:
                    # Try to set text
                    edit.set_text(self.meeting_password)
                    entered = True
                    break
                except Exception:
                    continue
            if not entered:
                logger.warning("Could not find or set passcode input box.")
                return

            time.sleep(0.5)

            # Find and click the Join/OK button
            buttons = passcode_dialog.descendants(control_type="Button")
            for button in buttons:
                try:
                    text = button.window_text().lower()
                    if 'join' in text or 'ok' in text:
                        logger.info(f"Clicking passcode dialog button: {button.window_text()}")
                        button.click_input()
                        break
                except Exception:
                    continue
            logger.info("Passcode dialog handled.")
        except Exception as e:
            logger.error(f"Error handling passcode dialog: {e}", exc_info=True)

    def _click_audio_video_buttons(self):
        """Click audio and video buttons to turn them off"""
        try:
            if not self.zoom_window:
                return

            buttons = self.zoom_window.descendants(control_type="Button")

            for button in buttons:
                try:
                    button_text = button.window_text().lower()

                    # Click video button to turn it off
                    if 'video' in button_text and 'join' not in button_text:
                        logger.info(f"Clicking video button: {button.window_text()}")
                        button.click_input()
                        time.sleep(0.5)

                    # Click audio button to turn it off
                    elif 'audio' in button_text and 'join' not in button_text:
                        logger.info(f"Clicking audio button: {button.window_text()}")
                        button.click_input()
                        time.sleep(0.5)

                except:
                    continue

        except Exception as e:
            logger.warning(f"Could not turn off audio/video: {e}")

    def _click_join_button(self):
        """Find and click the Join button"""
        try:
            if not self.zoom_window:
                raise Exception("No zoom window connected")

            buttons = self.zoom_window.descendants(control_type="Button")

            for button in buttons:
                try:
                    button_text = button.window_text()

                    if button_text.lower() == 'join':
                        logger.info(f"Clicking Join button: {button_text}")
                        button.click_input()
                        time.sleep(3)
                        return

                except:
                    continue

            raise Exception("Could not find Join button")

        except Exception as e:
            logger.error(f"Error clicking Join: {e}")
            raise

    def _find_meeting_window(self):
        """Find and store the actual Zoom meeting window (not preview dialog)"""
        logger.info("Searching for Zoom meeting window...")

        try:
            max_attempts = 20
            meeting_window_found = False

            for attempt in range(max_attempts):
                logger.info(f"Attempt {attempt+1}/{max_attempts}: Looking for meeting window...")

                desktop = Desktop(backend="uia")
                all_windows = desktop.windows()

                zoom_windows = []

                for window in all_windows:
                    try:
                        window_title = window.window_text()
                        window_pid = window.process_id()

                        # Check if it's a Zoom process
                        try:
                            process = psutil.Process(window_pid)
                            process_name = process.name().lower()

                            if 'zoom.exe' not in process_name:
                                continue

                            logger.debug(f"Found Zoom window: '{window_title}' (PID: {window_pid})")

                            # Look for meeting-related windows
                            # Meeting window can have various titles:
                            # - "Zoom Meeting"
                            # - "Meeting 40-Minutes"
                            # - Host's name + "Zoom Meeting"
                            # - Just "Zoom"
                            title_lower = window_title.lower()

                            # Skip main workplace/home window and dialogs
                            if 'workplace' in title_lower and 'meeting' not in title_lower:
                                logger.debug(f"Skipping workplace window: '{window_title}'")
                                continue

                            if 'preview' in title_lower or 'join' in title_lower:
                                logger.debug(f"Skipping preview/join dialog: '{window_title}'")
                                continue

                            # Check if window has meeting controls (buttons)
                            try:
                                buttons = window.descendants(control_type="Button")
                                button_texts = [btn.window_text().lower() for btn in buttons if btn.window_text()]

                                # Meeting window should have these buttons
                                has_meeting_buttons = any(keyword in ' '.join(button_texts)
                                                        for keyword in ['mute', 'video', 'share', 'participants', 'leave'])

                                if has_meeting_buttons:
                                    zoom_windows.append((window, window_title))
                                    logger.info(f"📹 Found potential meeting window: '{window_title}'")

                            except Exception as e:
                                logger.debug(f"Could not check buttons for '{window_title}': {e}")
                                # If we can't check buttons, but title looks like a meeting, add it
                                if 'meeting' in title_lower or 'zoom' in title_lower:
                                    zoom_windows.append((window, window_title))

                        except Exception as e:
                            logger.debug(f"Error checking window {window_pid}: {e}")
                            continue

                    except Exception as e:
                        logger.debug(f"Error processing window: {e}")
                        continue

                # Select the best meeting window
                if zoom_windows:
                    # If multiple windows, prefer one with "meeting" in title
                    meeting_window = None
                    selected_title = None
                    for window, title in zoom_windows:
                        if 'meeting' in title.lower():
                            meeting_window = window
                            selected_title = title
                            logger.info(f"✅ Selected meeting window: '{title}'")
                            break

                    # Otherwise just use the first one
                    if not meeting_window and zoom_windows:
                        meeting_window = zoom_windows[0][0]
                        selected_title = zoom_windows[0][1]
                        logger.info(f"✅ Selected meeting window: '{selected_title}'")

                    if meeting_window:
                        self.zoom_meeting_window = meeting_window
                        # Store window title for win32 FindWindow
                        self.zoom_window_title = selected_title

                        # Try to maximize it
                        try:
                            meeting_window.maximize()
                            logger.info("Maximized meeting window")
                        except Exception as e:
                            logger.debug(f"Could not maximize: {e}")

                        meeting_window_found = True
                        break

                time.sleep(2)

            if not meeting_window_found:
                logger.warning("⚠️ Could not find meeting window, will capture entire screen")
                self.zoom_meeting_window = None

        except Exception as e:
            logger.error(f"Error finding meeting window: {e}", exc_info=True)
            self.zoom_meeting_window = None

    def _enable_gallery_view(self):
        """Enable gallery view by clicking View → Gallery"""
        try:
            if not self.zoom_meeting_window:
                logger.warning("No meeting window, cannot enable gallery view")
                return

            logger.info("Enabling gallery view by clicking View → Gallery...")

            # Focus on meeting window
            try:
                self.zoom_meeting_window.set_focus()
                logger.info("Focused on meeting window")
                time.sleep(1)
            except Exception as e:
                logger.warning(f"Could not focus meeting window: {e}")

            # Take screenshot before
            self._save_debug_screenshot("before_gallery_view")

            # Find and click "View" button
            logger.info("Looking for View button...")
            view_button_clicked = False

            try:
                buttons = self.zoom_meeting_window.descendants(control_type="Button")

                for button in buttons:
                    try:
                        button_text = button.window_text()
                        if button_text and 'view' in button_text.lower():
                            logger.info(f"Found View button: '{button_text}'")
                            button.click_input()
                            view_button_clicked = True
                            logger.info("Clicked View button")
                            time.sleep(1)  # Wait for menu to appear
                            break
                    except Exception as e:
                        logger.debug(f"Error clicking button: {e}")
                        continue

            except Exception as e:
                logger.warning(f"Could not find View button: {e}")

            if not view_button_clicked:
                logger.warning("View button not found, trying keyboard shortcut...")
                import pyautogui
                pyautogui.hotkey('alt', 'f1')
                time.sleep(2)
                self._save_debug_screenshot("after_gallery_view")
                return

            # Now find and click "Gallery" menu item
            logger.info("Looking for Gallery menu item...")
            gallery_clicked = False

            try:
                # After clicking View, a menu appears with menu items
                menu_items = self.zoom_meeting_window.descendants(control_type="MenuItem")

                for item in menu_items:
                    try:
                        item_text = item.window_text()
                        if item_text and 'gallery' in item_text.lower():
                            logger.info(f"Found Gallery menu item: '{item_text}'")
                            item.click_input()
                            gallery_clicked = True
                            logger.info("Clicked Gallery menu item")
                            time.sleep(1)
                            break
                    except Exception as e:
                        logger.debug(f"Error clicking menu item: {e}")
                        continue

                # If not found in menu items, try in buttons (some menus use buttons)
                if not gallery_clicked:
                    buttons = self.zoom_meeting_window.descendants(control_type="Button")
                    for button in buttons:
                        try:
                            button_text = button.window_text()
                            if button_text and 'gallery' in button_text.lower():
                                logger.info(f"Found Gallery button: '{button_text}'")
                                button.click_input()
                                gallery_clicked = True
                                logger.info("Clicked Gallery button")
                                time.sleep(1)
                                break
                        except Exception as e:
                            logger.debug(f"Error clicking button: {e}")
                            continue

            except Exception as e:
                logger.warning(f"Could not find Gallery menu item: {e}")

            if gallery_clicked:
                logger.info("✅ Successfully enabled gallery view")
            else:
                logger.warning("⚠️ Could not find Gallery menu item, view may not be changed")

            # Take screenshot after
            time.sleep(2)
            self._save_debug_screenshot("after_gallery_view")

        except Exception as e:
            logger.error(f"Gallery view error: {e}", exc_info=True)

    def _ensure_video_off(self):
        """Ensure video remains disabled during the meeting.
        When video is off, Zoom will show the user's profile picture (bot avatar).
        Note: Cannot programmatically set Zoom profile image, but ensuring video is off
        will display whatever profile image is set in Zoom settings.
        """
        try:
            if not self.zoom_meeting_window:
                return
            buttons = self.zoom_meeting_window.descendants(control_type="Button")
            for button in buttons:
                try:
                    text = (button.window_text() or "").lower()
                    # If button says "Stop Video" then video is ON → click to turn OFF
                    if "stop video" in text:
                        logger.info("Video appears ON. Clicking to turn it OFF.")
                        button.click_input()
                        time.sleep(0.5)
                        break
                except Exception:
                    continue
        except Exception as e:
            logger.debug(f"ensure_video_off error: {e}")

    def _capture_loop(self):
        """Main capture and analysis loop"""
        logger.info(f"Starting capture loop (interval: {self.capture_interval}s)...")

        while self.is_running and self.is_in_meeting:
            try:
                # Check if we should stop
                if not self.is_running or not self.is_in_meeting:
                    logger.info("Stopping capture loop (flags changed)")
                    break

                self.frame_count += 1
                logger.info(f"Capturing frame #{self.frame_count}...")

                # Only ensure video is off, do not force gallery view
                self._ensure_video_off()  # Ensure video stays disabled (shows bot avatar when video is off)

                # Capture screenshot
                image = self._capture_zoom_window()

                if image is not None:
                    # Save original
                    frame_path = os.path.join(self.debug_dir, f"frame_{self.frame_count:04d}_original.png")
                    cv2.imwrite(frame_path, image)
                    logger.info(f"Saved: {frame_path}")

                    # Analyze
                    self._analyze_frame(image)

                    # Try to capture additional gallery pages quickly for this analysis window
                    self._capture_gallery_pages_additional()

                # Sleep in small chunks so we can respond to stop quickly
                for _ in range(int(self.capture_interval)):
                    if not self.is_running or not self.is_in_meeting:
                        logger.info("Stopping capture loop (stop requested during sleep)")
                        break
                    time.sleep(1)

            except Exception as e:
                logger.error(f"Capture error: {e}")
                # Check if we should stop even after error
                if not self.is_running or not self.is_in_meeting:
                    break
                time.sleep(self.capture_interval)

        logger.info("Capture loop ended")

    def _capture_gallery_pages_additional(self):
        """Quickly step through gallery pages (if controls exist) to capture all participants."""
        try:
            if not self.zoom_meeting_window:
                return

            # Look for buttons that indicate pagination
            buttons = self.zoom_meeting_window.descendants(control_type="Button")
            next_buttons = []
            prev_buttons = []
            for btn in buttons:
                try:
                    text = (btn.window_text() or "").lower()
                    if any(k in text for k in ["next", ">", "›", "arrow right"]):
                        next_buttons.append(btn)
                    if any(k in text for k in ["prev", "<", "‹", "arrow left"]):
                        prev_buttons.append(btn)
                except Exception:
                    continue

            # If we found a next button, iterate a few pages
            max_pages = 6
            pages_captured = 0
            for _ in range(max_pages):
                if not next_buttons:
                    break
                try:
                    next_buttons[0].click_input()
                    time.sleep(0.8)
                    img = self._capture_zoom_window()
                    if img is not None:
                        self.frame_count += 1
                        extra_path = os.path.join(self.debug_dir, f"frame_{self.frame_count:04d}_original.png")
                        cv2.imwrite(extra_path, img)
                        logger.info(f"Saved extra gallery page: {extra_path}")
                        self._analyze_frame(img)
                        pages_captured += 1
                except Exception:
                    break

            # Optionally, go back a few pages to original
            for _ in range(pages_captured):
                try:
                    if prev_buttons:
                        prev_buttons[0].click_input()
                        time.sleep(0.2)
                except Exception:
                    break
        except Exception as e:
            logger.debug(f"Gallery pagination capture error: {e}")

    def _capture_zoom_window(self) -> Optional[np.ndarray]:
        """Capture screenshot of ONLY the Zoom meeting window.
        Prefer win32 PrintWindow so we can capture even when window is inactive.
        Fallback to mss region capture or full screen if needed.
        """
        try:
            if not self.sct:
                return None

            # If we have the meeting window, capture only its bounds
            if self.zoom_meeting_window:
                try:
                    # Try win32 PrintWindow first - use FindWindow by window name (works even when inactive)
                    if win32gui and win32ui and self.zoom_window_title:
                        # Try to find window by title (works even if not active)
                        hwnd = None
                        
                        # Method 1: Try exact title match
                        if self.zoom_window_title:
                            hwnd = win32gui.FindWindow(None, self.zoom_window_title)
                        
                        # Method 2: Try partial title match (zoom meeting variations)
                        if not hwnd:
                            def enum_windows_callback(hwnd_param, windows):
                                if win32gui.IsWindowVisible(hwnd_param):
                                    window_text = win32gui.GetWindowText(hwnd_param)
                                    if window_text and ('zoom' in window_text.lower() and 'meeting' in window_text.lower()):
                                        # Check if it's from zoom.exe process
                                        try:
                                            _, pid = win32gui.GetWindowThreadProcessId(hwnd_param)
                                            process = psutil.Process(pid)
                                            if 'zoom.exe' in process.name().lower():
                                                windows.append((hwnd_param, window_text))
                                        except:
                                            pass
                                return True
                            
                            windows_found = []
                            win32gui.EnumWindows(enum_windows_callback, windows_found)
                            if windows_found:
                                hwnd, window_text = windows_found[0]  # Use first matching window
                                logger.debug(f"Found Zoom window via EnumWindows: '{window_text}'")
                        
                        # Method 3: Fallback to handle attribute if available
                        if not hwnd and hasattr(self.zoom_meeting_window, 'handle'):
                            try:
                                hwnd = int(self.zoom_meeting_window.handle)
                            except:
                                pass
                        
                        if hwnd:
                            left, top, right, bottom = win32gui.GetWindowRect(hwnd)
                            width = max(1, right - left)
                            height = max(1, bottom - top)

                            hwndDC = win32gui.GetWindowDC(hwnd)
                            mfcDC = win32ui.CreateDCFromHandle(hwndDC)
                            saveDC = mfcDC.CreateCompatibleDC()

                            bitmap = win32ui.CreateBitmap()
                            bitmap.CreateCompatibleBitmap(mfcDC, width, height)
                            saveDC.SelectObject(bitmap)

                            result = win32gui.PrintWindow(hwnd, saveDC.GetSafeHdc(), 0)

                            bmpinfo = bitmap.GetInfo()
                            bmpstr = bitmap.GetBitmapBits(True)
                            img = np.frombuffer(bmpstr, dtype=np.uint8)
                            img.shape = (height, width, 4)
                            img_bgr = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)

                            # Cleanup
                            win32gui.DeleteObject(bitmap.GetHandle())
                            saveDC.DeleteDC()
                            mfcDC.DeleteDC()
                            win32gui.ReleaseDC(hwnd, hwndDC)

                            if result == 1:
                                logger.debug(f"Captured Zoom window via PrintWindow: {width}x{height}")
                                return img_bgr
                            else:
                                logger.debug(f"PrintWindow returned {result}, falling back to mss")

                    # Fallback to mss region capture using bounds
                    rect = self.zoom_meeting_window.rectangle()
                    monitor = {
                        "top": rect.top,
                        "left": rect.left,
                        "width": rect.width(),
                        "height": rect.height()
                    }
                    sct_img = self.sct.grab(monitor)
                    img = np.array(sct_img)
                    img_bgr = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
                    logger.debug(f"Captured Zoom window via mss: {rect.width()}x{rect.height()}")
                    return img_bgr

                except Exception as e:
                    logger.warning(f"Failed to capture meeting window, falling back to full screen: {e}")
                    # Fallback to full screen if window capture fails
                    pass

            # Fallback: capture entire primary monitor
            monitor = self.sct.monitors[1]
            sct_img = self.sct.grab(monitor)
            img = np.array(sct_img)
            img_bgr = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
            return img_bgr

        except Exception as e:
            logger.error(f"Capture error: {e}")
        return None

    def _analyze_frame(self, image: np.ndarray):
        """Analyze frame for emotions"""
        try:
            logger.info(f"Analyzing frame {self.frame_count}...")

            # Run DeepFace
            results = DeepFace.analyze(
                img_path=image,
                actions=['emotion'],
                enforce_detection=False,
                detector_backend='opencv',
                silent=True
            )

            if not isinstance(results, list):
                results = [results]

            logger.info(f"Detected {len(results)} face(s)")

            # Process faces
            for i, result in enumerate(results):
                emotion = result.get('dominant_emotion', 'neutral')
                logger.info(f"  Face {i+1}: {emotion}")

                # Track participant
                pid = f"participant_{i}"
                if pid not in self.participants:
                    self.participants[pid] = {
                        "id": pid,
                        "name": f"Participant {i+1}",
                        "emotions": {},
                        "detected_count": 0
                    }

                self.participants[pid]["detected_count"] += 1
                self.participants[pid]["emotions"][emotion] = self.participants[pid]["emotions"].get(emotion, 0) + 1
                self.total_detections += 1

            # Save annotated image to debug folder
            try:
                annotated = image.copy()
                # If regions available, draw simple overlays using result['region']
                for r in results:
                    region = r.get('region', {})
                    x, y = region.get('x', 0), region.get('y', 0)
                    w, h = region.get('w', 0), region.get('h', 0)
                    if w > 0 and h > 0:
                        cv2.rectangle(annotated, (x, y), (x + w, y + h), (0, 255, 0), 2)
                        emo = r.get('dominant_emotion', 'neutral')
                        cv2.putText(annotated, emo, (x, max(0, y - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                annotated_path = os.path.join(self.debug_dir, f"frame_{self.frame_count:04d}_annotated.png")
                cv2.imwrite(annotated_path, annotated)
                logger.info(f"Saved annotated: {annotated_path}")
            except Exception as e:
                logger.debug(f"Could not save annotated image: {e}")

            # Send update
            self._send_emotion_update()

        except Exception as e:
            logger.warning(f"Analysis error: {e}")

    def _send_emotion_update(self):
        """Send emotion update via WebSocket"""
        try:
            participants_list = []
            emotion_totals = {}

            for p in self.participants.values():
                if p['emotions']:
                    dominant = max(p['emotions'].items(), key=lambda x: x[1])[0]
                    p_copy = p.copy()
                    p_copy['current_emotion'] = dominant
                    participants_list.append(p_copy)

                    emotion_totals[dominant] = emotion_totals.get(dominant, 0) + 1

            update_data = {
                "total_faces": len(participants_list),
                "participants": participants_list,
                "participant_count": len(self.participants),
                "frame_count": self.frame_count,
                "total_detections": self.total_detections,
                "current_emotions": emotion_totals,
                "timestamp": datetime.now().isoformat()
            }

            self._send_update("emotion_update", update_data)

        except Exception as e:
            logger.error(f"Emotion update error: {e}")

    def _send_update(self, event_type: str, data: Dict):
        """Send update via WebSocket"""
        if self.socketio:
            try:
                payload = {
                    "bot_id": self.bot_id,
                    "session_id": self.session_id,
                    "timestamp": datetime.now().isoformat(),
                    **data
                }
                self.socketio.emit(event_type, payload, room=self.session_id)
            except Exception as e:
                logger.error(f"Socket error: {e}")

    def _save_debug_screenshot(self, name: str):
        """Save debug screenshot"""
        try:
            if self.sct:
                monitor = self.sct.monitors[1]
                sct_img = self.sct.grab(monitor)
                img = np.array(sct_img)
                img_bgr = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
                path = os.path.join(self.debug_dir, f"{name}.png")
                cv2.imwrite(path, img_bgr)
                logger.info(f"Debug screenshot: {path}")
        except Exception as e:
            logger.warning(f"Screenshot error: {e}")

    def stop(self):
        """Stop bot and cleanup"""
        logger.info(f"🛑 Stopping bot {self.bot_id}...")

        # Set flags to stop capture loop
        self.is_running = False
        self.is_in_meeting = False

        logger.info("Waiting for capture loop to finish...")
        time.sleep(2)  # Give capture loop time to exit

        # Attempt to gracefully leave the meeting via UI before killing process
        try:
            self._leave_meeting()
        except Exception as e:
            logger.debug(f"Graceful leave failed: {e}")

        # Send stopped status update
        self._send_update("status", {
            "status": "stopped",
            "message": "Bot stopped. Analysis complete."
        })

        # Close mss
        if self.sct:
            try:
                self.sct.close()
                logger.info("MSS closed")
            except Exception as e:
                logger.warning(f"Error closing MSS: {e}")

        # Terminate Zoom process
        if self.zoom_process:
            try:
                logger.info(f"Terminating Zoom process (PID: {self.zoom_process.pid})...")
                self.zoom_process.terminate()
                self.zoom_process.wait(timeout=5)
                logger.info("Zoom process terminated")
            except:
                try:
                    logger.warning("Force killing Zoom process...")
                    self.zoom_process.kill()
                except:
                    pass

        # Cleanup data directory
        try:
            if os.path.exists(self.zoom_data_dir):
                import shutil
                logger.info(f"Cleaning up data directory: {self.zoom_data_dir}")
                shutil.rmtree(self.zoom_data_dir, ignore_errors=True)
        except Exception as e:
            logger.warning(f"Error cleaning up data dir: {e}")

        logger.info(f"✅ Bot stopped. Frames: {self.frame_count}, Detections: {self.total_detections}")

    def _leave_meeting(self):
        """Click the Leave button and confirm, fallback to Alt+Q."""
        try:
            if self.zoom_meeting_window:
                # Try finding a Leave button
                buttons = self.zoom_meeting_window.descendants(control_type="Button")
                for button in buttons:
                    try:
                        text = (button.window_text() or "").lower()
                        if "leave" in text:
                            logger.info(f"Clicking Leave button: {button.window_text()}")
                            button.click_input()
                            time.sleep(1)
                            break
                    except Exception:
                        continue

                # If a confirmation dialog appears, click Leave Meeting
                desktop = Desktop(backend="uia")
                for wnd in desktop.windows():
                    try:
                        if 'leave meeting' in (wnd.window_text() or '').lower():
                            confirm_buttons = wnd.descendants(control_type="Button")
                            for cb in confirm_buttons:
                                label = (cb.window_text() or "").lower()
                                if "leave" in label:
                                    cb.click_input()
                                    time.sleep(0.5)
                                    logger.info("Confirmed leave meeting")
                                    return
                    except Exception:
                        continue

            # Fallback: Alt+Q then Enter to confirm
            try:
                import pyautogui
                pyautogui.hotkey('alt', 'q')
                time.sleep(1)
                pyautogui.press('enter')
                logger.info("Sent Alt+Q and Enter to leave meeting")
            except Exception as e:
                logger.debug(f"Fallback Alt+Q failed: {e}")
        except Exception as e:
            logger.debug(f"_leave_meeting error: {e}")

    def get_status(self) -> Dict:
        """Get bot status"""
        return {
            "bot_id": self.bot_id,
            "session_id": self.session_id,
            "is_running": self.is_running,
            "is_in_meeting": self.is_in_meeting,
            "frame_count": self.frame_count,
            "total_detections": self.total_detections,
            "participant_count": len(self.participants)
        }


# Bot Manager Class
class ZoomDesktopClientBotManager:
    """Manager for multiple bot instances"""

    def __init__(self):
        self.bots: Dict[str, ZoomDesktopClientBot] = {}
        logger.info("Bot Manager initialized")

    def create_bot(
        self,
        meeting_id: str,
        session_id: str,
        session_name: str,
        user_name: str = "Emotion Bot",
        meeting_password: Optional[str] = None,
        socketio=None,
        capture_interval: int = 240
    ) -> Dict:
        """Create and start a new bot"""
        try:
            bot = ZoomDesktopClientBot(
                meeting_id=meeting_id,
                session_id=session_id,
                session_name=session_name,
                user_name=user_name,
                meeting_password=meeting_password,
                socketio=socketio,
                capture_interval=capture_interval
            )

            result = bot.start()

            if "error" not in result:
                self.bots[bot.bot_id] = bot
                logger.info(f"Bot created: {bot.bot_id}")

            return result

        except Exception as e:
            logger.error(f"Error creating bot: {e}", exc_info=True)
            return {"error": str(e)}

    def stop_bot(self, bot_id: str) -> Dict:
        """Stop a bot"""
        if bot_id in self.bots:
            self.bots[bot_id].stop()
            del self.bots[bot_id]
            return {"success": True, "message": "Bot stopped"}
        return {"error": "Bot not found"}

    def get_bot_status(self, bot_id: str) -> Dict:
        """Get bot status"""
        if bot_id in self.bots:
            return self.bots[bot_id].get_status()
        return {"error": "Bot not found"}

    def stop_all_bots(self) -> Dict:
        """Stop all bots"""
        for bot_id in list(self.bots.keys()):
            self.stop_bot(bot_id)
        return {"success": True, "message": "All bots stopped"}


# Global bot manager instance
desktop_client_bot_manager = ZoomDesktopClientBotManager()
