const API_URL = 'http://127.0.0.1:5000/api';

document.addEventListener('DOMContentLoaded', async () => {
  // ── DOM refs ────────────────────────────────────────────────────────────────
  const loginSection    = document.getElementById('loginSection');
  const recordSection   = document.getElementById('recordSection');
  const emailInput      = document.getElementById('email');
  const passwordInput   = document.getElementById('password');
  const loginBtn        = document.getElementById('loginBtn');
  const logoutBtn       = document.getElementById('logoutBtn');
  const startBtn        = document.getElementById('startBtn');
  const stopBtn         = document.getElementById('stopBtn');
  const meetingTitleInput = document.getElementById('meetingTitle');
  const recordingCard   = document.getElementById('recordingCard');
  const idleSection     = document.getElementById('idleSection');
  const detectedBanner  = document.getElementById('detectedBanner');
  const detectedText    = document.getElementById('detectedText');
  const recTabLabel     = document.getElementById('recTabLabel');
  const statusEl        = document.getElementById('status');

  let currentToken = null;

  // ── Helper: safe message to background ─────────────────────────────────────
  function safeSendMessage(msg) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('BG not ready:', chrome.runtime.lastError.message);
            resolve(null);
          } else {
            resolve(response || null);
          }
        });
      } catch (e) {
        console.warn('sendMessage threw:', e.message);
        resolve(null);
      }
    });
  }

  // ── Auth ───────────────────────────────────────────────────────────────────
  const stored = await chrome.storage.local.get(['token']);
  currentToken = stored.token || null;

  if (currentToken) {
    showRecordUI();
  } else {
    showLoginUI();
  }

  // ── Recording state ─────────────────────────────────────────────────────────
  // Primary: ask background worker. Fallback: chrome.storage.local directly.
  let state = await safeSendMessage({ type: "GET_STATE" });
  if (!state) {
    state = await chrome.storage.local.get(['isRecording', 'recordingTabId']);
  }
  const currentlyRecording = !!(state && state.isRecording);

  if (currentlyRecording) {
    showRecordingUI();
  } else {
    showIdleUI();
  }

  // ── Meeting detection ───────────────────────────────────────────────────────
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url) return;

    const isMeetingUrl = tab.url.includes("meet.google.com") || tab.url.includes("zoom.us");
    if (!isMeetingUrl) return;

    if (!currentlyRecording) {
      // Pre-fill title
      if (!meetingTitleInput.value) {
        let title = (tab.title || '')
          .replace(/ - Google Meet/i, '')
          .replace(/Zoom Meeting/i, '')
          .trim();
        meetingTitleInput.value = title || 'Meeting Recording';
      }
      // Show banner
      detectedBanner.classList.remove('hidden');
      const src = tab.url.includes("meet.google.com") ? "Google Meet" : "Zoom";
      detectedText.textContent = `${src} detected — Ready to record!`;
    } else {
      // Show which tab is being recorded
      recTabLabel.textContent = tab.title ? tab.title.slice(0, 30) : '';
    }
  });

  // ── UI helpers ──────────────────────────────────────────────────────────────
  let micAnalyzerNode = null;
  let micDataArray = null;

  async function startMicVisualizer() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      
      // Permission granted! Hide the fix button if it was showing
      const fixBtn = document.getElementById('allowMicBtn');
      if (fixBtn) fixBtn.classList.add('hidden');
      document.getElementById('micVisualizerWrapper').classList.remove('hidden');

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      micAnalyzerNode = audioCtx.createAnalyser();
      micAnalyzerNode.fftSize = 256;
      source.connect(micAnalyzerNode);
      micDataArray = new Uint8Array(micAnalyzerNode.frequencyBinCount);
      updateVolumeBar();
    } catch (err) {
      console.warn("Could not start mic visualizer", err);
      const fixBtn = document.getElementById('allowMicBtn');
      if (fixBtn) {
        fixBtn.classList.remove('hidden');
        document.getElementById('micVisualizerWrapper').classList.add('hidden');
        fixBtn.textContent = `Fix Mic (${err.name || 'Error'})`;
        fixBtn.onclick = () => {
          chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
        };
      }
    }
  }

  function updateVolumeBar() {
    if (!micAnalyzerNode) return;
    requestAnimationFrame(updateVolumeBar);
    micAnalyzerNode.getByteFrequencyData(micDataArray);
    let sum = 0;
    for (let i = 0; i < micDataArray.length; i++) {
      sum += micDataArray[i];
    }
    const average = sum / micDataArray.length;
    // Map average (0-255) to percentage (0-100)
    let percent = Math.min(100, Math.max(0, average * 1.5));
    const bar = document.getElementById('micVolumeBar');
    if (bar) bar.style.width = percent + '%';
  }

  function showLoginUI() {
    loginSection.classList.remove('hidden');
    recordSection.classList.add('hidden');
  }

  function showRecordUI() {
    loginSection.classList.add('hidden');
    recordSection.classList.remove('hidden');
    // Start visualizer when record section comes into view
    startMicVisualizer();
  }

  function showRecordingUI() {
    recordingCard.classList.remove('hidden');
    idleSection.classList.add('hidden');
    detectedBanner.classList.add('hidden');
  }

  function showIdleUI() {
    recordingCard.classList.add('hidden');
    idleSection.classList.remove('hidden');
  }

  function setStatus(msg, duration = 3000) {
    statusEl.textContent = msg;
    if (duration > 0) {
      setTimeout(() => {
        if (statusEl.textContent === msg) statusEl.textContent = '';
      }, duration);
    }
  }

  // ── Login ───────────────────────────────────────────────────────────────────
  loginBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) return setStatus('Enter email and password');

    loginBtn.textContent = 'Logging in...';
    loginBtn.disabled = true;
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        await chrome.storage.local.set({ token: data.token, user: data.user });
        currentToken = data.token;
        showRecordUI();
        showIdleUI();
      } else {
        setStatus(data.message || 'Login failed');
      }
    } catch (err) {
      setStatus('Network error');
    } finally {
      loginBtn.textContent = 'Log In';
      loginBtn.disabled = false;
    }
  });

  // ── Logout ──────────────────────────────────────────────────────────────────
  logoutBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove(['token', 'user']);
    currentToken = null;
    showLoginUI();
  });

  // ── Start Recording ─────────────────────────────────────────────────────────
  startBtn.addEventListener('click', () => {
    const title = meetingTitleInput.value.trim() || 'Recorded via Extension';
    if (!currentToken) return setStatus('Please log in first');

    setStatus('Requesting capture permission…', 0);
    startBtn.disabled = true;
    startBtn.textContent = 'Starting…';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) { setStatus('No active tab'); resetStartBtn(); return; }
      if (tab.url && tab.url.startsWith('chrome://')) {
        setStatus('Cannot record system pages'); resetStartBtn(); return;
      }

      chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, async (streamId) => {
        if (chrome.runtime.lastError || !streamId) {
          setStatus('Capture error: ' + (chrome.runtime.lastError?.message || 'No stream ID'));
          resetStartBtn();
          return;
        }

        setStatus('Starting recorder…', 0);
        const res = await safeSendMessage({
          type: "START_RECORDING",
          streamId,
          tabId: tab.id,
          title,
          token: currentToken
        });

        if (res && res.status === 'started') {
          setStatus('');
          recTabLabel.textContent = tab.title ? tab.title.slice(0, 30) : '';
          showRecordingUI();
        } else {
          setStatus('Error: ' + (res ? res.error : 'No response from background'));
          resetStartBtn();
        }
      });
    });
  });

  function resetStartBtn() {
    startBtn.disabled = false;
    startBtn.textContent = '▶ Start Recording';
  }

  // ── Stop Recording ──────────────────────────────────────────────────────────
  stopBtn.addEventListener('click', async () => {
    stopBtn.disabled = true;
    stopBtn.textContent = '⏳ Stopping…';

    await safeSendMessage({ type: "STOP_RECORDING" });

    // Show uploading state
    recordingCard.innerHTML = `
      <div style="text-align:center; padding:4px 0;">
        <div style="font-size:1.5rem; margin-bottom:8px;">📤</div>
        <div style="font-weight:600; color:#f8fafc; margin-bottom:4px;">Uploading recording…</div>
        <div style="font-size:0.8rem; color:#94a3b8;">You'll be taken to the dashboard once done.</div>
      </div>
    `;
  });
});
