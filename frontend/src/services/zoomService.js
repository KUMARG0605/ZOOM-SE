import ZoomVideo from '@zoom/videosdk';

class ZoomService {
  constructor() {
    this.client = null;
    this.stream = null;
    this.isInitialized = false;
  }

  async initClient() {
    if (!this.client) {
      this.client = ZoomVideo.createClient();
      this.isInitialized = true;
    }
    return this.client;
  }

  async joinSession(sessionName, userName, sessionPassword, role) {
    try {
      console.log('[ZoomService] Initializing client...');
      await this.initClient();

      console.log('[ZoomService] Generating token for session:', sessionName);
      const token = await this.generateToken(sessionName, role);

      if (!token) {
        throw new Error('Failed to generate session token. Please check your Zoom Video SDK credentials.');
      }

      console.log('[ZoomService] Token generated, joining session...');
      console.log('[ZoomService] Session params:', { sessionName, userName, hasPassword: !!sessionPassword, role });

      // Add timeout to the join call
      const joinPromise = this.client.join(sessionName, token, userName, sessionPassword);

      await joinPromise;

      console.log('[ZoomService] Successfully joined session');

      this.stream = this.client.getMediaStream();

      console.log('[ZoomService] Media stream obtained');

      return {
        success: true,
        message: 'Joined session successfully',
      };
    } catch (error) {
      console.error('[ZoomService] Error joining Zoom session:', error);
      console.error('[ZoomService] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });

      return {
        success: false,
        message: error.message || 'Unknown error occurred while joining session',
      };
    }
  }

  async startVideo(videoElement) {
    try {
      if (this.stream) {
        await this.stream.startVideo();
        await this.stream.renderVideo(
          videoElement,
          this.client.getCurrentUserInfo().userId,
          videoElement.offsetWidth,
          videoElement.offsetHeight,
          0,
          0,
          3
        );
        return { success: true };
      }
      return { success: false, message: 'Stream not available' };
    } catch (error) {
      console.error('Error starting video:', error);
      return { success: false, message: error.message };
    }
  }

  async stopVideo() {
    try {
      if (this.stream) {
        await this.stream.stopVideo();
        return { success: true };
      }
      return { success: false, message: 'Stream not available' };
    } catch (error) {
      console.error('Error stopping video:', error);
      return { success: false, message: error.message };
    }
  }

  async startAudio() {
    try {
      if (this.stream) {
        await this.stream.startAudio();
        return { success: true };
      }
      return { success: false, message: 'Stream not available' };
    } catch (error) {
      console.error('Error starting audio:', error);
      return { success: false, message: error.message };
    }
  }

  async stopAudio() {
    try {
      if (this.stream) {
        await this.stream.stopAudio();
        return { success: true };
      }
      return { success: false, message: 'Stream not available' };
    } catch (error) {
      console.error('Error stopping audio:', error);
      return { success: false, message: error.message };
    }
  }

  async leaveSession() {
    try {
      if (this.client) {
        await this.client.leave();
        this.stream = null;
        return { success: true };
      }
      return { success: false, message: 'Client not available' };
    } catch (error) {
      console.error('Error leaving session:', error);
      return { success: false, message: error.message };
    }
  }

  getParticipants() {
    if (this.client) {
      return this.client.getAllUser();
    }
    return [];
  }

  async captureVideoFrame(userId) {
    try {
      if (this.stream) {
        // Create a canvas to capture the frame
        const canvas = document.createElement('canvas');
        const video = document.querySelector(`video[data-user-id="${userId}"]`);

        if (video) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0);

          return canvas.toDataURL('image/jpeg', 0.8);
        }
      }
      return null;
    } catch (error) {
      console.error('Error capturing video frame:', error);
      return null;
    }
  }

  async generateToken(sessionName, role) {
    // In production, this should be an API call to your backend
    // For now, we'll use a placeholder
    // You need to implement JWT token generation on the server using Zoom SDK credentials

    console.log('[ZoomService] Fetching token from backend...');

    try {
      const response = await fetch('http://localhost:5000/api/zoom/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionName,
          role: role || 1, // 1 for host, 0 for participant
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ZoomService] Token generation failed:', response.status, errorText);
        throw new Error(`Token generation failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      if (!data.success || !data.token) {
        console.error('[ZoomService] Invalid token response:', data);
        throw new Error(data.message || 'Failed to generate token');
      }

      console.log('[ZoomService] Token generated successfully');
      return data.token;
    } catch (error) {
      console.error('[ZoomService] Error in generateToken:', error);
      throw new Error(`Unable to generate session token: ${error.message}`);
    }
  }
}

const zoomService = new ZoomService();
export default zoomService;
