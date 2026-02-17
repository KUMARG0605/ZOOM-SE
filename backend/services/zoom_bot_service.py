"""
Zoom Bot Service - Headless bot that joins Zoom meetings and performs emotion detection
"""
import os
import time
import base64
import threading
import uuid
from io import BytesIO
from PIL import Image
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from utils.emotion_detector import EmotionDetector
from deepface import DeepFace
from datetime import datetime
import cv2
import numpy as np

class ZoomBot:
    """Headless Zoom bot that joins meetings and performs emotion detection"""

    def __init__(self, meeting_url, session_id, session_name, user_name="Emotion Bot", meeting_password=None, socketio=None):
        """
        Initialize Zoom bot

        Args:
            meeting_url: Zoom meeting URL or ID
            session_id: Database session ID for tracking
            session_name: Human-readable session name
            user_name: Bot's display name in meeting
            meeting_password: Meeting password (if required)
            socketio: Socket.IO instance for real-time updates
        """
        self.bot_id = str(uuid.uuid4())
        self.meeting_url = meeting_url
        self.session_id = session_id
        self.session_name = session_name
        self.user_name = user_name
        self.meeting_password = meeting_password
        self.socketio = socketio

        self.driver = None
        self.is_running = False
        self.is_in_meeting = False
        self.capture_thread = None

        self.participants = {}  # {participant_id: {name, emotions, ...}}
        self.frame_count = 0
        self.total_detections = 0

        # Initialize emotion detector
        self.emotion_detector = EmotionDetector()

        # Create debug directory for saving images
        self.debug_dir = f"debug_images_{self.bot_id}"
        os.makedirs(self.debug_dir, exist_ok=True)
        print(f"📁 Debug images will be saved to: {self.debug_dir}")

    def start(self):
        """Start the bot in a background thread"""
        if self.is_running:
            return {"error": "Bot already running"}

        self.is_running = True
        bot_thread = threading.Thread(target=self._run_bot, daemon=True)
        bot_thread.start()

        return {
            "bot_id": self.bot_id,
            "status": "starting",
            "message": "Bot is joining the meeting..."
        }

    def _run_bot(self):
        """Main bot execution loop (runs in background thread)"""
        try:
            # Step 1: Initialize browser
            self._send_update("status", {"status": "initializing", "message": "Starting browser..."})
            self._init_browser()

            # Step 2: Join meeting
            self._send_update("status", {"status": "joining", "message": "Joining Zoom meeting..."})
            self._join_meeting()

            # Step 3: Wait for meeting to load
            time.sleep(5)

            # Step 4: Take initial screenshot to see what bot sees
            print("📸 Taking initial screenshot to verify meeting state...")
            try:
                initial_screenshot = self.driver.get_screenshot_as_png()
                initial_image = Image.open(BytesIO(initial_screenshot))
                initial_path = os.path.join(self.debug_dir, "initial_meeting_view.png")
                initial_image.save(initial_path)
                print(f"💾 Initial meeting screenshot saved: {initial_path}")
            except Exception as e:
                print(f"⚠️ Could not save initial screenshot: {e}")

            # Step 5: Enable gallery view
            self._send_update("status", {"status": "configuring", "message": "Enabling gallery view..."})
            self._enable_gallery_view()

            # Step 6: Take screenshot after gallery view
            print("📸 Taking screenshot after gallery view attempt...")
            try:
                gallery_screenshot = self.driver.get_screenshot_as_png()
                gallery_image = Image.open(BytesIO(gallery_screenshot))
                gallery_path = os.path.join(self.debug_dir, "after_gallery_view.png")
                gallery_image.save(gallery_path)
                print(f"💾 Gallery view screenshot saved: {gallery_path}")
            except Exception as e:
                print(f"⚠️ Could not save gallery screenshot: {e}")

            # Step 7: Save page HTML for debugging
            print("💾 Saving page HTML for debugging...")
            try:
                html_path = os.path.join(self.debug_dir, "page_source.html")
                with open(html_path, 'w', encoding='utf-8') as f:
                    f.write(self.driver.page_source)
                print(f"✓ Page HTML saved: {html_path}")
            except Exception as e:
                print(f"⚠️ Could not save HTML: {e}")

            # Step 8: Verify participant tiles are visible
            print("👥 Checking for participant video tiles...")
            self._verify_participant_tiles()

            # Step 9: Start capture loop
            self._send_update("status", {"status": "active", "message": "Bot is active and analyzing..."})
            self.is_in_meeting = True
            self._capture_loop()

        except Exception as e:
            self._send_update("error", {"error": str(e), "message": f"Bot error: {str(e)}"})
            print(f"Bot error: {e}")
        finally:
            self.stop()

    def _init_browser(self):
        """Initialize Chrome browser (visible for debugging)"""
        chrome_options = Options()

        # Headless mode - DISABLED TO SEE BROWSER
        # chrome_options.add_argument('--headless=new')  # COMMENTED OUT!
        # chrome_options.add_argument('--disable-gpu')
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')

        # Window size for good gallery view
        chrome_options.add_argument('--window-size=1920,1080')

        # Enable camera and microphone (fake media)
        chrome_options.add_argument('--use-fake-ui-for-media-stream')
        chrome_options.add_argument('--use-fake-device-for-media-stream')

        # Disable notifications
        chrome_options.add_argument('--disable-notifications')

        # User agent
        chrome_options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')

        # Set page load strategy to 'eager' to not wait for all resources
        chrome_options.page_load_strategy = 'eager'

        self.driver = webdriver.Chrome(options=chrome_options)
        # Increase timeout to 90 seconds for slow networks
        self.driver.set_page_load_timeout(90)

    def _join_meeting(self):
        """Navigate to Zoom meeting and join"""
        try:
            # Check if meeting_url is already a full invitation link with password
            if "zoom.us" in self.meeting_url and ("?pwd=" in self.meeting_url or "&pwd=" in self.meeting_url):
                # Use invitation link directly (password is embedded in URL)
                zoom_url = self.meeting_url

                # Convert /j/ to /wc/ if needed
                if "/j/" in zoom_url:
                    zoom_url = zoom_url.replace("/j/", "/wc/")
                    # Add /join before query params if not present
                    if "/join?" not in zoom_url and "?" in zoom_url:
                        zoom_url = zoom_url.replace("?", "/join?")

                print(f"Using invitation link directly: {zoom_url}")
            else:
                # Parse meeting URL/ID and construct URL
                meeting_id = self._extract_meeting_id(self.meeting_url)

                # Zoom web client URL with password parameter if provided
                if self.meeting_password:
                    zoom_url = f"https://zoom.us/wc/{meeting_id}/join?pwd={self.meeting_password}"
                else:
                    zoom_url = f"https://zoom.us/wc/{meeting_id}/join"
                print(f"Navigating to: {zoom_url}")

            # Navigate with retry logic
            print(f"Loading Zoom URL (this may take up to 90 seconds)...")
            try:
                self.driver.get(zoom_url)
            except TimeoutException:
                print("⚠️ Page load timed out but may still be usable, continuing...")
                # Page might still be partially loaded, try to continue

            # Wait for page to load
            time.sleep(5)

            # Try to find and fill name input with multiple methods
            name_filled = False
            name_selectors = [
                (By.ID, "input-for-name"),
                (By.CSS_SELECTOR, "input[type='text']"),
                (By.CSS_SELECTOR, "input[placeholder*='name' i]"),
                (By.CSS_SELECTOR, "input[aria-label*='name' i]"),
                (By.NAME, "name"),
                (By.XPATH, "//input[@type='text']")
            ]

            for by_type, selector in name_selectors:
                try:
                    name_input = WebDriverWait(self.driver, 3).until(
                        EC.presence_of_element_located((by_type, selector))
                    )
                    name_input.clear()
                    name_input.send_keys(self.user_name)
                    print(f"✓ Name entered using selector: {selector}")
                    name_filled = True
                    break
                except:
                    continue

            if not name_filled:
                print("⚠ Could not find name input field")
                # Take screenshot for debugging
                self.driver.save_screenshot(f"debug_no_name_input_{self.bot_id}.png")
                print(f"Screenshot saved: debug_no_name_input_{self.bot_id}.png")

            # Try to find and click join button with multiple methods
            time.sleep(2)
            join_clicked = False
            join_selectors = [
                (By.ID, "joinBtn"),
                (By.CSS_SELECTOR, "button[type='submit']"),
                (By.XPATH, "//button[contains(text(), 'Join')]"),
                (By.XPATH, "//button[contains(text(), 'join')]"),
                (By.CSS_SELECTOR, "button.zm-btn"),
                (By.CSS_SELECTOR, "button[aria-label*='join' i]")
            ]

            for by_type, selector in join_selectors:
                try:
                    join_button = WebDriverWait(self.driver, 3).until(
                        EC.element_to_be_clickable((by_type, selector))
                    )
                    join_button.click()
                    print(f"✓ Join button clicked using selector: {selector}")
                    join_clicked = True
                    break
                except:
                    continue

            if not join_clicked:
                print("⚠ Could not find join button, trying Enter key...")
                # Try pressing Enter as fallback
                from selenium.webdriver.common.keys import Keys
                try:
                    self.driver.find_element(By.TAG_NAME, "body").send_keys(Keys.RETURN)
                    join_clicked = True
                except:
                    pass

            if not join_clicked:
                print("❌ Failed to click join button")
                self.driver.save_screenshot(f"debug_no_join_button_{self.bot_id}.png")
                print(f"Screenshot saved: debug_no_join_button_{self.bot_id}.png")
                # Don't raise exception, continue to see if we're in meeting

            # Check for password prompt (appears after clicking join)
            # Wait a bit for page to load after join click
            print("Checking for password prompt...")
            time.sleep(4)

            password_found = False
            password_input = None

            # Try multiple selectors to find password field (prioritize exact match)
            password_selectors = [
                # Exact selector from the user's HTML
                (By.CSS_SELECTOR, "input#inputpasscode[type='password'][aria-label='meeting passcode']"),
                (By.ID, "inputpasscode"),
                (By.NAME, "inputpasscode"),
                (By.CSS_SELECTOR, "input[type='password'][placeholder*='Meeting Passcode']"),
                (By.CSS_SELECTOR, "input[aria-label*='meeting passcode']"),
                (By.CSS_SELECTOR, "input[type='password']"),
                (By.XPATH, "//input[@id='inputpasscode' and @type='password']"),
            ]

            for by_type, selector in password_selectors:
                try:
                    # Use explicit wait for each selector
                    password_input = WebDriverWait(self.driver, 2).until(
                        EC.visibility_of_element_located((by_type, selector))
                    )
                    print(f"🔒 Password prompt detected using selector: {selector}")
                    password_found = True
                    break
                except:
                    continue

            if password_found and password_input:
                print("🔒 Password field found! Checking if password provided...")

                if self.meeting_password:
                    print(f"✓ Entering meeting password: {'*' * len(self.meeting_password)}")

                    # Wait for field to be fully ready
                    time.sleep(1)

                    # Click on the field to focus it
                    try:
                        password_input.click()
                        time.sleep(0.5)
                    except:
                        pass

                    # Clear field first
                    try:
                        password_input.clear()
                        time.sleep(0.3)
                    except:
                        pass

                    # Type password character by character to ensure reliability
                    for char in self.meeting_password:
                        password_input.send_keys(char)
                        time.sleep(0.05)  # Small delay between characters

                    # Wait a moment for input to register
                    time.sleep(0.5)

                    # Verify password was entered
                    password_value = password_input.get_attribute('value')
                    if password_value:
                        print(f"✓ Password entered successfully ({len(password_value)} characters)")
                    else:
                        print("⚠️ Warning: Password field appears empty after typing")

                    # Wait a moment
                    time.sleep(1)

                    # Take screenshot to verify
                    self.driver.save_screenshot(f"debug_password_entered_{self.bot_id}.png")
                    print(f"Screenshot saved: debug_password_entered_{self.bot_id}.png")

                    # Find and click join/continue button after password
                    print("Looking for join button after password...")
                    time.sleep(1)

                    password_join_clicked = False
                    password_join_selectors = [
                        (By.ID, "joinBtn"),
                        (By.CSS_SELECTOR, "button[type='submit']"),
                        (By.XPATH, "//button[contains(text(), 'Join')]"),
                        (By.XPATH, "//button[contains(text(), 'join')]"),
                        (By.CSS_SELECTOR, "button.zm-btn"),
                        (By.CSS_SELECTOR, "button.btn"),
                    ]

                    for by_type, selector in password_join_selectors:
                        try:
                            password_join_btn = WebDriverWait(self.driver, 2).until(
                                EC.element_to_be_clickable((by_type, selector))
                            )
                            password_join_btn.click()
                            print(f"✓ Clicked join button after entering password using: {selector}")
                            password_join_clicked = True
                            break
                        except:
                            continue

                    if not password_join_clicked:
                        print("⚠️ Could not find join button after password, trying Enter key...")
                        from selenium.webdriver.common.keys import Keys
                        try:
                            password_input.send_keys(Keys.RETURN)
                            print("✓ Pressed Enter key after password")
                        except:
                            print("❌ Failed to submit password")

                    time.sleep(3)
                else:
                    print("❌ Meeting requires password but none provided!")
                    print("Please provide meeting password in the 'Meeting Password' field")
                    self.driver.save_screenshot(f"debug_password_required_{self.bot_id}.png")
                    print(f"Screenshot saved: debug_password_required_{self.bot_id}.png")
                    raise Exception("Meeting requires password. Please provide the password in the frontend form.")
            else:
                print("✓ No password prompt detected - continuing...")

            # Wait for meeting to load and verify we're in
            print("Waiting for meeting to load...")

            # Wait up to 30 seconds for meeting interface to appear
            meeting_loaded = False
            for i in range(30):
                if not self.is_running:
                    print("⚠ Bot was stopped before meeting loaded")
                    return

                try:
                    time.sleep(1)
                    current_url = self.driver.current_url

                    # Check if we're in the meeting (URL should NOT contain /join)
                    # Look for meeting UI, not just URL change
                    if "zoom.us" in current_url and "/join" not in current_url.lower():
                        print(f"✓ Meeting loaded! URL: {current_url}")
                        meeting_loaded = True
                        break

                    # Also check for meeting interface elements
                    try:
                        # Look for common meeting UI elements
                        meeting_elements = self.driver.find_elements(By.CSS_SELECTOR,
                            "button[aria-label*='mute'], button[aria-label*='video'], div[class*='participant']")
                        if len(meeting_elements) > 0:
                            print(f"✓ Meeting interface detected! Found {len(meeting_elements)} UI elements")
                            meeting_loaded = True
                            break
                    except:
                        pass

                except:
                    pass

                if i % 5 == 0 and i > 0:
                    print(f"Still waiting... ({i} seconds)")

            if not meeting_loaded:
                print("⚠ Meeting may not have loaded completely - continuing anyway")
                try:
                    current_url = self.driver.current_url
                    print(f"Current URL after waiting: {current_url}")

                    # Check if still on join page
                    if "/join" in current_url.lower():
                        print("⚠ WARNING: Still on join page! Bot may not be in actual meeting.")
                        print("This could mean:")
                        print("  - Meeting requires password")
                        print("  - Meeting has waiting room enabled")
                        print("  - Meeting doesn't exist or hasn't started")
                        print("  - Bot failed to click join properly")

                    self.driver.save_screenshot(f"debug_stuck_on_join_{self.bot_id}.png")
                    print(f"Screenshot saved: debug_stuck_on_join_{self.bot_id}.png")
                    print("Please check the screenshot to see where bot is stuck!")
                except:
                    pass
            else:
                print("✓ Successfully entered meeting room!")
                try:
                    self.driver.save_screenshot(f"debug_in_meeting_{self.bot_id}.png")
                    print(f"Screenshot saved: debug_in_meeting_{self.bot_id}.png")
                except:
                    pass

            # Handle audio/video prompts
            self._handle_media_prompts()

        except Exception as e:
            # Check if bot was stopped (invalid session is expected if user clicked stop)
            if "invalid session id" in str(e).lower() and not self.is_running:
                print("⚠ Bot was stopped by user during join process")
                return

            print(f"Exception in _join_meeting: {e}")
            import traceback
            traceback.print_exc()
            # Save screenshot for debugging
            try:
                if self.driver:
                    self.driver.save_screenshot(f"debug_error_{self.bot_id}.png")
                    print(f"Error screenshot saved: debug_error_{self.bot_id}.png")
            except:
                pass

            # Provide helpful error message
            error_msg = str(e)
            if "invalid session id" in error_msg.lower():
                raise Exception("Browser session was closed. Please try again and wait longer before stopping.")
            else:
                raise Exception(f"Failed to join meeting: {error_msg}")

    def _extract_meeting_id(self, meeting_url):
        """Extract meeting ID from URL or return as-is if already ID"""
        if "zoom.us" in meeting_url:
            # Extract from URL like https://zoom.us/j/1234567890
            parts = meeting_url.split("/j/")
            if len(parts) > 1:
                meeting_id = parts[1].split("?")[0]
                return meeting_id.replace(" ", "")

        # Assume it's already a meeting ID
        return meeting_url.replace(" ", "").replace("-", "")

    def _handle_media_prompts(self):
        """Handle Zoom's audio/video permission prompts"""
        try:
            # Try to click "Join Audio by Computer"
            audio_button = WebDriverWait(self.driver, 5).until(
                EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Join Audio')]"))
            )
            audio_button.click()
        except:
            print("Audio prompt not found or already handled")

        try:
            # Try to turn off video (bot doesn't need to send video)
            video_button = self.driver.find_element(By.CSS_SELECTOR, "button[aria-label*='video']")
            video_button.click()
        except:
            print("Video button not found")

    def _enable_gallery_view(self):
        """Switch to gallery view to see all participants"""
        try:
            print("🎬 Attempting to enable gallery view...")

            # Wait a bit for meeting UI to fully load
            time.sleep(3)

            # Strategy 1: Try keyboard shortcut (most reliable for Zoom)
            print("📌 Strategy 1: Trying keyboard shortcut...")
            try:
                from selenium.webdriver.common.keys import Keys
                from selenium.webdriver.common.action_chains import ActionChains

                # Click on the body to ensure focus
                body = self.driver.find_element(By.TAG_NAME, "body")
                body.click()
                time.sleep(1)

                # Try Alt+F1 (common Zoom gallery view shortcut)
                actions = ActionChains(self.driver)
                actions.key_down(Keys.ALT).send_keys(Keys.F1).key_up(Keys.ALT).perform()
                print("✓ Sent Alt+F1 keyboard shortcut")
                time.sleep(2)
            except Exception as e:
                print(f"⚠️ Keyboard shortcut failed: {e}")

            # Strategy 2: Look for and click the view switcher button in toolbar
            print("📌 Strategy 2: Looking for view switcher button...")
            view_selectors = [
                # Common Zoom web client selectors for gallery view button
                (By.CSS_SELECTOR, "button[aria-label*='Gallery View']"),
                (By.CSS_SELECTOR, "button[aria-label*='Switch to Gallery View']"),
                (By.XPATH, "//button[contains(@aria-label, 'Gallery')]"),
                (By.XPATH, "//button[contains(@title, 'Gallery')]"),
                (By.CSS_SELECTOR, "button.gallery-view-button"),
                (By.CSS_SELECTOR, "button[data-tooltip*='Gallery']"),
            ]

            view_clicked = False
            for by_type, selector in view_selectors:
                try:
                    view_button = WebDriverWait(self.driver, 2).until(
                        EC.element_to_be_clickable((by_type, selector))
                    )
                    view_button.click()
                    print(f"✓ Clicked gallery view button using: {selector}")
                    view_clicked = True
                    time.sleep(2)
                    break
                except:
                    continue

            if view_clicked:
                print("✓ Gallery view enabled via button")
                return

            # Strategy 3: Look for View menu and select Gallery
            print("📌 Strategy 3: Looking for View menu...")
            menu_selectors = [
                (By.CSS_SELECTOR, "button[aria-label*='View']"),
                (By.XPATH, "//button[contains(@aria-label, 'View')]"),
                (By.XPATH, "//button[contains(text(), 'View')]"),
            ]

            menu_clicked = False
            for by_type, selector in menu_selectors:
                try:
                    menu_button = WebDriverWait(self.driver, 2).until(
                        EC.element_to_be_clickable((by_type, selector))
                    )
                    menu_button.click()
                    print(f"✓ Opened View menu using: {selector}")
                    menu_clicked = True
                    time.sleep(1)
                    break
                except:
                    continue

            if menu_clicked:
                # Now try to click Gallery option
                gallery_selectors = [
                    (By.XPATH, "//div[contains(text(), 'Gallery')]"),
                    (By.XPATH, "//span[contains(text(), 'Gallery')]"),
                    (By.XPATH, "//li[contains(text(), 'Gallery')]"),
                    (By.XPATH, "//button[contains(text(), 'Gallery')]"),
                ]

                for by_type, selector in gallery_selectors:
                    try:
                        gallery_option = WebDriverWait(self.driver, 2).until(
                            EC.element_to_be_clickable((by_type, selector))
                        )
                        gallery_option.click()
                        print(f"✓ Selected gallery view from menu using: {selector}")
                        time.sleep(2)
                        return
                    except:
                        continue

            # Strategy 4: Use JavaScript to force gallery view (if Zoom exposes it)
            print("📌 Strategy 4: Trying JavaScript approach...")
            try:
                # Try to find and click any element with gallery-related classes
                script = """
                // Look for gallery view button or toggle
                const galleryButtons = document.querySelectorAll('[class*="gallery"], [aria-label*="Gallery"], [data-tooltip*="Gallery"]');
                for (let btn of galleryButtons) {
                    if (btn.click) {
                        btn.click();
                        return true;
                    }
                }
                return false;
                """
                result = self.driver.execute_script(script)
                if result:
                    print("✓ Gallery view enabled via JavaScript")
                    time.sleep(2)
                    return
            except Exception as e:
                print(f"⚠️ JavaScript approach failed: {e}")

            # Strategy 5: Try to hover over top area and look for view switcher
            print("📌 Strategy 5: Moving mouse to trigger toolbar...")
            try:
                from selenium.webdriver.common.action_chains import ActionChains

                # Move mouse to top-right corner where view switcher usually is
                actions = ActionChains(self.driver)
                # Move to top-right area
                actions.move_by_offset(1700, 50).perform()
                time.sleep(2)

                # Try clicking gallery view button again now that toolbar might be visible
                try:
                    gallery_btn = self.driver.find_element(By.XPATH, "//button[contains(@aria-label, 'Gallery')]")
                    gallery_btn.click()
                    print("✓ Gallery view enabled after toolbar appeared")
                    time.sleep(2)
                    return
                except:
                    pass

                # Reset mouse position
                actions = ActionChains(self.driver)
                actions.move_by_offset(-1700, -50).perform()
            except Exception as e:
                print(f"⚠️ Mouse movement strategy failed: {e}")

            print("⚠️ All gallery view strategies exhausted")
            print("💡 MANUAL ACTION REQUIRED:")
            print("   1. Look at the visible browser window")
            print("   2. Hover over the meeting to show controls")
            print("   3. Click the 'View' button (usually top-right)")
            print("   4. Select 'Gallery View' to see all participants")
            print("   OR press Alt+F1 while focused on the browser window")

        except Exception as e:
            print(f"❌ Gallery view error: {e}")
            import traceback
            traceback.print_exc()

    def _verify_participant_tiles(self):
        """Check if participant video tiles are visible"""
        try:
            print("\n" + "="*60)
            print("🔍 VERIFYING PARTICIPANT VIDEO TILES")
            print("="*60)

            # Look for video tiles using various selectors
            video_tile_selectors = [
                (By.CSS_SELECTOR, "video"),  # All video elements
                (By.CSS_SELECTOR, "[class*='video-avatar']"),
                (By.CSS_SELECTOR, "[class*='video-container']"),
                (By.CSS_SELECTOR, "[class*='participant-video']"),
                (By.CSS_SELECTOR, "[data-video]"),
                (By.CSS_SELECTOR, ".gallery-video-container"),
            ]

            total_videos = 0
            for by_type, selector in video_tile_selectors:
                try:
                    elements = self.driver.find_elements(by_type, selector)
                    if elements:
                        print(f"✓ Found {len(elements)} elements matching: {selector}")
                        total_videos = max(total_videos, len(elements))
                except Exception as e:
                    pass

            print(f"\n📊 Total video elements detected: {total_videos}")

            # Try to get more info using JavaScript
            try:
                js_check = """
                const videos = document.querySelectorAll('video');
                const videoContainers = document.querySelectorAll('[class*="video"], [class*="participant"]');
                return {
                    videoElements: videos.length,
                    containerElements: videoContainers.length,
                    visibleVideos: Array.from(videos).filter(v => v.offsetWidth > 0 && v.offsetHeight > 0).length
                };
                """
                result = self.driver.execute_script(js_check)
                print(f"📺 Video elements: {result.get('videoElements', 0)}")
                print(f"📦 Container elements: {result.get('containerElements', 0)}")
                print(f"👁️ Visible videos: {result.get('visibleVideos', 0)}")
            except Exception as e:
                print(f"⚠️ JavaScript check failed: {e}")

            # Check current page HTML for debugging
            try:
                page_source = self.driver.page_source
                if 'gallery' in page_source.lower():
                    print("✓ Page HTML contains 'gallery' - gallery view likely active")
                else:
                    print("⚠️ Page HTML does NOT contain 'gallery' - may not be in gallery view")
            except:
                pass

            print("="*60 + "\n")

            if total_videos <= 1:
                print("⚠️ WARNING: Only seeing 1 or fewer video tiles!")
                print("💡 Possible reasons:")
                print("   1. Other participants haven't joined yet")
                print("   2. Other participants have cameras off")
                print("   3. Gallery view not properly enabled")
                print("   4. Bot is in speaker view (only shows active speaker)")
                print("\n💡 Solutions:")
                print("   1. Wait for more participants to join with cameras on")
                print("   2. Check debug screenshots to verify view")
                print("   3. Manually hover over the meeting window and switch to gallery view")

        except Exception as e:
            print(f"❌ Error verifying participant tiles: {e}")
            import traceback
            traceback.print_exc()

    def _capture_loop(self):
        """Continuous loop to capture and analyze meeting frames"""
        print(f"🎥 Bot {self.bot_id} starting capture loop...")

        while self.is_running and self.is_in_meeting:
            try:
                print(f"\n📸 Capturing frame #{self.frame_count + 1}...")

                # Capture screenshot
                screenshot = self.driver.get_screenshot_as_png()

                # Convert to PIL Image
                image = Image.open(BytesIO(screenshot))

                # Save original screenshot for debugging
                screenshot_path = os.path.join(self.debug_dir, f"frame_{self.frame_count:04d}_original.png")
                image.save(screenshot_path)
                print(f"💾 Saved original screenshot: {screenshot_path}")

                # Perform emotion detection
                print(f"🔍 Analyzing frame for faces and emotions...")
                self._analyze_frame(image)

                # Increment frame counter
                self.frame_count += 1

                # Wait before next capture (analyze every 4 seconds)
                print(f"⏳ Waiting 4 seconds before next capture...")
                time.sleep(4)

            except Exception as e:
                print(f"❌ Capture error: {e}")
                import traceback
                traceback.print_exc()
                time.sleep(2)  # Wait a bit before retrying

    def _analyze_frame(self, image):
        """Analyze a captured frame for faces and emotions"""
        try:
            # Convert PIL Image to OpenCV format (numpy array)
            img_array = np.array(image)
            print(f"📊 Image size: {img_array.shape}")

            # Convert RGB to BGR (OpenCV format)
            if len(img_array.shape) == 3 and img_array.shape[2] == 3:
                img_cv = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
            else:
                img_cv = img_array

            # Create a copy for drawing annotations
            img_annotated = img_cv.copy()

            print(f"🤖 Running DeepFace analysis (timeout: 30s)...")
            # Use DeepFace to analyze all faces in the image
            # enforce_detection=False allows analysis even if no clear face detected
            # Increased timeout to 30 seconds for complex scenes with multiple faces

            import signal

            def timeout_handler(signum, frame):
                raise TimeoutError("DeepFace analysis timed out after 30 seconds")

            # Set up timeout (only works on Unix-like systems)
            try:
                signal.signal(signal.SIGALRM, timeout_handler)
                signal.alarm(30)  # 30 second timeout

                analysis_results = DeepFace.analyze(
                    img_path=img_cv,
                    actions=['emotion'],
                    enforce_detection=False,
                    detector_backend='opencv',
                    silent=True
                )

                signal.alarm(0)  # Cancel the alarm
            except AttributeError:
                # Windows doesn't support signal.SIGALRM, just run without timeout
                print("⚠️ Running on Windows - timeout not available")
                analysis_results = DeepFace.analyze(
                    img_path=img_cv,
                    actions=['emotion'],
                    enforce_detection=False,
                    detector_backend='opencv',
                    silent=True
                )

            # DeepFace returns a list of results (one per detected face)
            if not isinstance(analysis_results, list):
                analysis_results = [analysis_results]

            print(f"👥 Detected {len(analysis_results)} face(s)")

            # Process detected faces
            faces_data = []
            for i, result in enumerate(analysis_results):
                emotion_dict = result.get('emotion', {})
                dominant_emotion = result.get('dominant_emotion', 'neutral')
                region = result.get('region', {})

                print(f"  Face {i+1}: {dominant_emotion} @ region {region}")

                # Draw bounding box and emotion on image
                if region:
                    x, y, w, h = region.get('x', 0), region.get('y', 0), region.get('w', 0), region.get('h', 0)
                    # Draw rectangle
                    cv2.rectangle(img_annotated, (x, y), (x+w, y+h), (0, 255, 0), 2)
                    # Draw emotion label
                    label = f"{dominant_emotion} ({emotion_dict.get(dominant_emotion, 0):.1f}%)"
                    cv2.putText(img_annotated, label, (x, y-10),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

                participant_id = f"participant_{i}"

                # Initialize participant if new
                if participant_id not in self.participants:
                    self.participants[participant_id] = {
                        "id": participant_id,
                        "name": f"Participant {i+1}",
                        "emotions": {},
                        "detected_count": 0
                    }

                # Update emotion counts
                if dominant_emotion not in self.participants[participant_id]['emotions']:
                    self.participants[participant_id]['emotions'][dominant_emotion] = 0
                self.participants[participant_id]['emotions'][dominant_emotion] += 1
                self.participants[participant_id]['detected_count'] += 1

                # Add to faces data for update
                faces_data.append({
                    'participant_id': participant_id,
                    'dominant_emotion': dominant_emotion,
                    'emotions': emotion_dict,
                    'region': region
                })

            # Save annotated image with text indicating face count
            if len(faces_data) == 0:
                # Add "NO FACES DETECTED" text to image
                text = "NO FACES DETECTED"
                font = cv2.FONT_HERSHEY_SIMPLEX
                text_size = cv2.getTextSize(text, font, 1.5, 3)[0]
                text_x = (img_annotated.shape[1] - text_size[0]) // 2
                text_y = (img_annotated.shape[0] + text_size[1]) // 2
                cv2.putText(img_annotated, text, (text_x, text_y), font, 1.5, (0, 0, 255), 3)
                print(f"⚠️ No faces detected in this frame")
            else:
                # Add face count text
                text = f"DETECTED {len(faces_data)} FACE(S)"
                cv2.putText(img_annotated, text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

            annotated_path = os.path.join(self.debug_dir, f"frame_{self.frame_count:04d}_annotated.png")
            cv2.imwrite(annotated_path, img_annotated)
            print(f"💾 Saved annotated image: {annotated_path}")

            self.total_detections += len(faces_data)

            # Send real-time update with detected faces
            if faces_data:
                print(f"📤 Sending emotion update with {len(faces_data)} faces to frontend")
                self._send_emotion_update({'faces': faces_data})
            else:
                print(f"⚠️ No emotion data to send - no faces detected")

        except Exception as e:
            print(f"❌ Analysis error: {e}")
            import traceback
            traceback.print_exc()

            # Save error info
            error_log_path = os.path.join(self.debug_dir, f"frame_{self.frame_count:04d}_error.txt")
            with open(error_log_path, 'w') as f:
                f.write(f"Error: {e}\n\n")
                f.write(traceback.format_exc())

    def _send_update(self, event_type, data):
        """Send real-time update via WebSocket"""
        if self.socketio:
            try:
                payload = {
                    "bot_id": self.bot_id,
                    "session_id": self.session_id,
                    "timestamp": datetime.now().isoformat(),
                    **data
                }

                # Emit to specific session room
                self.socketio.emit(event_type, payload, room=self.session_id)
                print(f"Sent {event_type} update to session {self.session_id}")
            except Exception as e:
                print(f"Socket emit error: {e}")

    def _send_emotion_update(self, emotion_results):
        """Send emotion detection results to frontend"""
        # Calculate statistics
        total_faces = len(emotion_results.get('faces', []))

        # Aggregate emotions across all detected faces
        emotion_totals = {}
        for face in emotion_results.get('faces', []):
            emotion = face.get('dominant_emotion', 'neutral')
            emotion_totals[emotion] = emotion_totals.get(emotion, 0) + 1

        # Update current_emotion for each participant (most recent detection)
        participants_with_current = []
        for participant in self.participants.values():
            participant_copy = participant.copy()
            # Find the most recent emotion for this participant
            if participant['emotions']:
                # Get the most common emotion for this participant
                most_common_emotion = max(participant['emotions'].items(), key=lambda x: x[1])[0]
                participant_copy['current_emotion'] = most_common_emotion
            participants_with_current.append(participant_copy)

        update_data = {
            "total_faces": total_faces,
            "participants": participants_with_current,
            "participant_count": len(self.participants),
            "frame_count": self.frame_count,
            "total_detections": self.total_detections,
            "current_emotions": emotion_totals,
            "timestamp": datetime.now().isoformat()
        }

        self._send_update("emotion_update", update_data)

    def stop(self):
        """Stop the bot and cleanup"""
        print(f"🛑 Stopping bot {self.bot_id}...")
        self.is_running = False
        self.is_in_meeting = False

        if self.driver:
            try:
                self.driver.quit()
            except:
                pass

        # Log summary
        print(f"\n{'='*60}")
        print(f"📊 BOT SESSION SUMMARY")
        print(f"{'='*60}")
        print(f"Bot ID: {self.bot_id}")
        print(f"Frames captured: {self.frame_count}")
        print(f"Total detections: {self.total_detections}")
        print(f"Participants tracked: {len(self.participants)}")
        print(f"Debug images saved to: {self.debug_dir}")
        print(f"{'='*60}\n")

        self._send_update("status", {"status": "stopped", "message": "Bot has stopped"})

    def get_status(self):
        """Get current bot status"""
        return {
            "bot_id": self.bot_id,
            "session_id": self.session_id,
            "is_running": self.is_running,
            "is_in_meeting": self.is_in_meeting,
            "participant_count": len(self.participants),
            "frame_count": self.frame_count,
            "total_detections": self.total_detections,
            "participants": list(self.participants.values())
        }


# Bot manager to track multiple bots
class ZoomBotManager:
    """Manages multiple Zoom bot instances"""

    def __init__(self):
        self.bots = {}  # {bot_id: ZoomBot instance}

    def create_bot(self, meeting_url, session_id, session_name, user_name="Emotion Bot", meeting_password=None, socketio=None):
        """Create and start a new bot"""
        bot = ZoomBot(meeting_url, session_id, session_name, user_name, meeting_password, socketio)
        result = bot.start()

        if "bot_id" in result:
            self.bots[result["bot_id"]] = bot

        return result

    def get_bot(self, bot_id):
        """Get bot instance by ID"""
        return self.bots.get(bot_id)

    def stop_bot(self, bot_id):
        """Stop a specific bot"""
        bot = self.bots.get(bot_id)
        if bot:
            bot.stop()
            del self.bots[bot_id]
            return {"success": True, "message": "Bot stopped"}
        return {"error": "Bot not found"}

    def get_bot_status(self, bot_id):
        """Get status of a specific bot"""
        bot = self.bots.get(bot_id)
        if bot:
            return bot.get_status()
        return {"error": "Bot not found"}

    def stop_all_bots(self):
        """Stop all running bots"""
        for bot_id in list(self.bots.keys()):
            self.stop_bot(bot_id)


# Global bot manager instance
bot_manager = ZoomBotManager()
