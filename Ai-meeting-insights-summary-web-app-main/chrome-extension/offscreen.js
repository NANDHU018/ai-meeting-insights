const API_URL = 'http://127.0.0.1:5000/api';
let mediaRecorder;
let audioChunks = [];
let recordingConfig = {};

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'INIT_RECORDING') {
    recordingConfig = message;
    
    try {
      // 1. Get Tab Audio
      const tabStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: message.streamId
          }
        },
        video: false
      });

      // 2. Get Microphone Audio (user's voice)
      let micStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (micErr) {
        console.warn('Microphone permission denied or not available. Recording tab audio only.', micErr);
      }

      // 3. Mix streams
      let finalStream = tabStream; // fallback
      if (micStream && micStream.getAudioTracks().length > 0) {
        const audioContext = new AudioContext();
        
        // Ensure AudioContext is not suspended (can happen in headless documents)
        if (audioContext.state === 'suspended') {
          console.log("AudioContext is suspended. Attempting to resume...");
          await audioContext.resume();
        }
        console.log("AudioContext state is now:", audioContext.state);
        
        const tabSource = audioContext.createMediaStreamSource(tabStream);
        const micSource = audioContext.createMediaStreamSource(micStream);
        
        const destination = audioContext.createMediaStreamDestination();
        
        tabSource.connect(destination);
        micSource.connect(destination);
        
        // Combine tracks from destination
        const mixedTrack = destination.stream.getAudioTracks()[0];
        
        // Create a new stream with the mixed audio track
        finalStream = new MediaStream([mixedTrack]);
        
        // Save references to original tracks so we can stop them later
        finalStream.originalTracks = [...tabStream.getAudioTracks(), ...micStream.getAudioTracks()];
      } else {
        finalStream.originalTracks = tabStream.getAudioTracks();
      }

      startRecording(finalStream);
      
    } catch (err) {
      console.error('Failed to init user media streams', err);
      // Fallback: Notify popup/background that it failed so it doesn't get stuck
      chrome.runtime.sendMessage({ type: "UPLOAD_COMPLETE" }).catch(() => {});
      setTimeout(() => window.close(), 1000); 
    }
  }

  if (message.type === 'TRIGGER_STOP') {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }
});

function startRecording(stream) {
  // Use webm for browser compatibility, backend ffmpeg converts to WAV
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
  audioChunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    // Stop all original tracks (tab + mic)
    if (stream.originalTracks) {
      stream.originalTracks.forEach(track => track.stop());
    } else {
      stream.getTracks().forEach(track => track.stop());
    }
    
    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    uploadRecording(blob);
  };

  mediaRecorder.start();
}

async function uploadRecording(blob) {
  console.log("Recorded blob size:", blob.size);
  
  if (blob.size === 0) {
    chrome.runtime.sendMessage({ 
       type: "UPLOAD_COMPLETE", 
       meetingId: null, 
       errorMsg: "The recording received 0 bytes of audio. Please check your microphone settings." 
    }).catch(() => {});
    setTimeout(() => window.close(), 1000);
    return;
  }

  const formData = new FormData();
  formData.append('audio', blob, 'extension-record.webm');
  if (recordingConfig.title) {
    formData.append('title', recordingConfig.title);
  }

  let meetingId = null;
  let finalError = null;

  try {
    const res = await fetch(`${API_URL}/meetings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${recordingConfig.token}`
      },
      body: formData
    });
    
    const data = await res.json();
    console.log("Upload resolved:", res.status, data);

    if (!res.ok) {
      throw new Error(data.error || `HTTP error ${res.status}`);
    }

    if (data.results && data.results.length > 0) {
      meetingId = data.results[0].meeting_id;
    } else {
      meetingId = data.id || data.meeting_id || null;
    }

  } catch(err) {
    console.error("Upload error:", err);
    finalError = `Error sending to dashboard: ${err.message}`;
  } finally {
    // Notify background to open dashboard
    chrome.runtime.sendMessage({ type: "UPLOAD_COMPLETE", meetingId, errorMsg: finalError }).catch(() => {});
    setTimeout(() => window.close(), 1000); 
  }
}
