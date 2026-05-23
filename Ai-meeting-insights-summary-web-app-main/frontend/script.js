// ============================
// AI Meeting Assistant — Script
// ============================

const API_BASE = window.location.origin;

// ---- Utility Helpers ----

function showToast(message) {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ---- Auth Helpers ----

function getToken() {
  return localStorage.getItem('token');
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user_name');
  
  // Broadcast logout event so extension can clear its token as well
  window.postMessage({ type: "EXTENSION_SYNC_LOGOUT" }, "*");
  
  window.location.href = 'login.html';
}

// Wrapper for fetch API to include token and handle unauth redirects
async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  
  const headers = {
    ...options.headers,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (res.status === 401 || res.status === 403) {
    // Unauthorized or Forbidden, clear token and redirect
    logout();
    throw new Error('Unauthorized');
  }

  return res;
}

async function handleLogin() {
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const btn = document.getElementById('loginSubmitBtn');
  
  if (!emailInput || !passwordInput || !btn) return;
  
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  
  if (!email || !password) return;
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Logging In…';
  
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user_name', data.user.full_name);
      
      // Broadcast this globally so the Extension Content Script can catch it and sync!
      window.postMessage({
        type: "EXTENSION_SYNC_LOGIN",
        token: data.token,
        user: data.user
      }, "*");
      
      window.location.href = 'index.html';
    } else {
      showToast(data.message || 'Login failed');
    }
  } catch (err) {
    console.error(err);
    showToast('Network error during login');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Log In';
  }
}

async function handleRegister() {
  const fullNameInput = document.getElementById('full_name');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirm_password');
  const btn = document.getElementById('registerSubmitBtn');
  
  if (!fullNameInput || !emailInput || !passwordInput || !confirmPasswordInput || !btn) return;
  
  const full_name = fullNameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  
  if (!full_name || !email || !password || !confirmPassword) return;

  if (password !== confirmPassword) {
    showToast('Passwords do not match');
    return;
  }
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Registering…';
  
  try {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name, email, password })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      showToast('Registration successful! Please log in.');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1500);
    } else {
      showToast(data.message || 'Registration failed');
    }
  } catch (err) {
    console.error(err);
    showToast('Network error during registration');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Sign Up';
  }
}

async function handleForgotPassword() {
  const emailInput = document.getElementById('email');
  const btn = document.getElementById('forgotPasswordSubmitBtn');
  
  if (!emailInput || !btn) return;
  
  const email = emailInput.value.trim();
  if (!email) return;

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Sending Reset Link…';

  try {
    const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      const msg = data.previewUrl ? `Link sent: Check Dev Tools Console (Ethereal test url)` : data.message;
      showToast(msg);
      if (data.previewUrl) {
          console.log("Test email URL: ", data.previewUrl);
      }
    } else {
      showToast(data.message || 'Failed to send reset link');
    }
  } catch (err) {
    console.error(err);
    showToast('Network error during forgot password request');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Send Reset Link';
  }
}

async function handleResetPassword() {
  const tokenInput = document.getElementById('resetToken');
  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirm_password');
  const btn = document.getElementById('resetPasswordSubmitBtn');
  
  if (!tokenInput || !passwordInput || !confirmPasswordInput || !btn) return;

  const token = tokenInput.value;
  const new_password = passwordInput.value;
  const confirmResult = confirmPasswordInput.value;

  if (!token || !new_password || !confirmResult) return;

  if (new_password !== confirmResult) {
    showToast("Passwords do not match");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Updating Password…';

  try {
    const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      showToast(data.message);
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 2000);
    } else {
      showToast(data.message || 'Failed to update password');
    }
  } catch (err) {
    console.error(err);
    showToast('Network error while resetting password');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Update Password';
  }
}

function togglePasswordVisibility(inputId, btnElement) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';

  // Update SVG icon
  if (isPassword) {
    // Show "eye-off" icon
    btnElement.innerHTML = `<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" class="eye-off-icon"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
  } else {
    // Show "eye" icon
    btnElement.innerHTML = `<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" class="eye-icon"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
  }
}

function setProcessing(show, text) {
  const el = document.getElementById("processingStatus");
  const txt = document.getElementById("statusText");
  if (!el) return;
  if (show) {
    el.classList.remove("hidden");
    if (txt) txt.textContent = text || "Processing…";
  } else {
    el.classList.add("hidden");
  }
}

// ---- Dashboard Page Logic ----

async function loadMeetings() {
  const grid = document.getElementById("meetingsGrid");
  const empty = document.getElementById("emptyState");
  if (!grid) return;

  let hasProcessing = false;

  try {
    const res = await apiFetch(`/api/meetings`);
    const meetings = await res.json();

    if (!meetings.length) {
      grid.innerHTML = "";
      if (empty) empty.classList.remove("hidden");
      return;
    }
    if (empty) empty.classList.add("hidden");

    grid.innerHTML = meetings
      .map(
        (m) => {
          const processingStatuses = ['processing', 'transcribing', 'generating_title'];
          const isProcessing = processingStatuses.includes(m.status);
          if (isProcessing) hasProcessing = true;
          // Split "Mar 25, 2026 02:34 PM" → date part + time part
          const rawDate = m.date || "";
          // The format is "Mon DD, YYYY HH12:MI AM" — split on the 3rd space
          const spaceIdx = rawDate.lastIndexOf(" ", rawDate.lastIndexOf(" ") - 1);
          const datePart = spaceIdx > 0 ? rawDate.slice(0, spaceIdx) : rawDate;
          const timePart = spaceIdx > 0 ? rawDate.slice(spaceIdx + 1) : "";
          const extraStyles = isProcessing ? 'cursor: wait;' : '';

          let progressPercent = 0;
          let progressText = '';
          if (m.status === 'processing') { progressPercent = 10; progressText = 'Queued...'; }
          else if (m.status === 'transcribing') { progressPercent = 40; progressText = 'Transcribing audio...'; }
          else if (m.status === 'generating_title') { progressPercent = 85; progressText = 'Generating title...'; }

          const progressBarHtml = isProcessing ? `
            <div style="margin-top: 14px; width: 100%; background: rgba(255,255,255,0.05); border-radius: 6px; overflow: hidden; height: 6px; position: relative;">
               <div style="position: absolute; left: 0; top: 0; height: 100%; width: ${progressPercent}%; background: var(--gradient-primary); transition: width 0.5s ease; border-radius: 6px;"></div>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 6px; text-align: left;">${progressText}</div>
          ` : '';

          return `
      <div class="card meeting-card" data-id="${m.id}" data-status="${m.status}" style="position: relative; ${extraStyles}">
        <!-- Checkbox for Bulk Delete -->
        <div class="checkbox-wrapper hidden" style="position: absolute; top: 12px; right: 12px; z-index: 2;">
            <input type="checkbox" class="meeting-checkbox" data-checkbox-id="${m.id}" style="width: 16px; height: 16px; cursor: pointer; accent-color: var(--primary);" />
        </div>
        <div class="meeting-title" style="padding-right: 24px;">${escapeHtml(m.title || "Untitled Meeting")}</div>
        <div class="meeting-date">${datePart}${timePart ? `<span style="margin-left:8px; font-size:0.8rem; opacity:0.6;">${timePart}</span>` : ""}</div>
        <div style="margin-top:10px; display: flex; justify-content: space-between; align-items: center;">
          <span class="meeting-badge" ${isProcessing ? 'style="background: rgba(255,193,7,0.15); color: #ffc107; border-color: rgba(255,193,7,0.3);"' : (m.status === 'failed' ? 'style="background: rgba(244,67,54,0.15); color: #f44336; border-color: rgba(244,67,54,0.3);"' : '')}>${isProcessing ? '<span class="spinner" style="width:12px; height:12px; border-width:2px; margin-right:4px;"></span> In Progress' : (m.status === 'failed' ? 'Failed' : (m.summary ? 'Summarized' : 'Transcribed'))}</span>
          <button class="btn btn-sm btn-danger delete-btn" data-delete-id="${m.id}" title="Delete Meeting" style="padding: 4px 8px; font-size: 0.75rem;">
            <svg style="pointer-events: none;" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        </div>
        ${progressBarHtml}
      </div>
    `;
        }
      )
      .join("");
  } catch (err) {
    console.error("Error loading meetings:", err);
    showToast("Could not load meetings. Is the backend running?");
  } finally {
    updateBulkActions();
    
    // Auto polling for processing meetings
    if (window.pollingMeetingsTimer) clearTimeout(window.pollingMeetingsTimer);
    if (hasProcessing) {
        window.pollingMeetingsTimer = setTimeout(() => loadMeetings(), 5000);
    }
  }
}

function escapeHtml(text) {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

let currentMeetingToDelete = null;
let pendingBulkIds = null;

function initDashboardEvents() {
  const grid = document.getElementById("meetingsGrid");
  const modal = document.getElementById("deleteModal");
  const cancelBtn = document.getElementById("cancelDeleteBtn");
  const confirmBtn = document.getElementById("confirmDeleteBtn");

  let longPressTimer;
  let isLongPress = false;

  const handlePressStart = (e) => {
    const card = e.target.closest('.meeting-card');
    if (!card || e.target.tagName === 'INPUT' || e.target.closest('.delete-btn')) return;
    
    // Clear any existing timer
    if (longPressTimer) clearTimeout(longPressTimer);
    
    isLongPress = false; 
    
    longPressTimer = setTimeout(() => {
      isLongPress = true;
      const checkbox = card.querySelector('.meeting-checkbox');
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
        updateBulkActions();
        if (navigator.vibrate) navigator.vibrate(50);
      }
    }, 500); // 500ms for long press
  };

  const handlePressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  if (grid) {
    grid.addEventListener('mousedown', handlePressStart);
    grid.addEventListener('touchstart', handlePressStart, { passive: true });
    
    grid.addEventListener('mouseup', handlePressEnd);
    grid.addEventListener('mouseleave', handlePressEnd);
    grid.addEventListener('touchend', handlePressEnd);
    grid.addEventListener('touchcancel', handlePressEnd);
    grid.addEventListener('touchmove', handlePressEnd, { passive: true });

    grid.addEventListener('click', (e) => {
      // Handle delete button click
      const deleteBtn = e.target.closest('.delete-btn');
      if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        currentMeetingToDelete = deleteBtn.getAttribute('data-delete-id');
        if (modal) modal.classList.remove('hidden');
        return;
      }

      // Handle Checkbox Selection
      if (e.target.classList.contains('meeting-checkbox')) {
        updateBulkActions();
        return; // don't navigate or block
      }

      // Handle card click
      const card = e.target.closest('.meeting-card');
      if (card && e.target.tagName !== 'INPUT' && !e.target.closest('.delete-btn')) { // ensure we don't handle clicks inside inputs or delete btn
        if (isLongPress) {
          e.preventDefault();
          isLongPress = false;
          return;
        }

        // Selection mode logic
        const checkedLength = document.querySelectorAll('.meeting-checkbox:checked').length;
        if (checkedLength > 0) {
          e.preventDefault();
          const checkbox = card.querySelector('.meeting-checkbox');
          if (checkbox) {
            checkbox.checked = !checkbox.checked;
            updateBulkActions();
          }
          return;
        }

        const status = card.getAttribute('data-status');
        const processingStatuses = ['processing', 'transcribing', 'generating_title'];
        if (processingStatuses.includes(status)) {
          e.preventDefault();
          showToast("This meeting is currently being processed. Please wait a moment.");
          return;
        }

        const id = card.getAttribute('data-id');
        window.location.href = `meeting.html?id=${id}`;
      }
    });
  }

  if (cancelBtn && modal) {
    cancelBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      currentMeetingToDelete = null;
      pendingBulkIds = null;
      // Restore default modal text
      const modalTitle = modal.querySelector('h3');
      const modalBody = modal.querySelector('p');
      if (modalTitle) modalTitle.textContent = 'Delete Meeting?';
      if (modalBody) modalBody.textContent = 'Are you sure you want to delete this meeting? This action cannot be undone.';
    });
  }

  if (confirmBtn && modal) {
    confirmBtn.addEventListener('click', async () => {
      modal.classList.add('hidden');
      const btnOriginalText = confirmBtn.innerHTML;
      confirmBtn.innerHTML = '<span class="spinner"></span>';

      if (pendingBulkIds && pendingBulkIds.length > 0) {
        // Bulk delete
        const ids = pendingBulkIds;
        pendingBulkIds = null;
        currentMeetingToDelete = null;
        try {
          const res = await apiFetch(`/api/meetings/bulk-delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
          });
          if (res.ok) {
            showToast(`Successfully deleted ${ids.length} meeting(s).`);
            loadMeetings();
          } else {
            const data = await res.json();
            showToast('Failed to delete meetings: ' + (data.error || 'Unknown error'));
          }
        } catch (err) {
          console.error('Error bulk deleting meetings:', err);
          showToast('Error executing bulk delete.');
        } finally {
          confirmBtn.innerHTML = btnOriginalText;
          updateBulkActions();
          // Restore default modal text for next use
          const modalTitle = modal ? modal.querySelector('h3') : null;
          const modalBody = modal ? modal.querySelector('p') : null;
          if (modalTitle) modalTitle.textContent = 'Delete Meeting?';
          if (modalBody) modalBody.textContent = 'Are you sure you want to delete this meeting? This action cannot be undone.';
        }
      } else if (currentMeetingToDelete) {
        // Single delete
        await deleteMeeting(currentMeetingToDelete);
        confirmBtn.innerHTML = btnOriginalText;
        currentMeetingToDelete = null;
      } else {
        confirmBtn.innerHTML = btnOriginalText;
      }
    });
  }

  // Bulk Delete Actions
  const bulkDeleteBtn = document.getElementById("bulkDeleteBtn");
  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener("click", () => {
      const selectedCheckboxes = document.querySelectorAll('.meeting-checkbox:checked');
      const ids = Array.from(selectedCheckboxes).map(cb => cb.getAttribute('data-checkbox-id'));

      if (ids.length === 0) return;

      // Use the existing modal instead of confirm()
      pendingBulkIds = ids;
      currentMeetingToDelete = null;

      const modalTitle = modal ? modal.querySelector('h3') : null;
      const modalBody = modal ? modal.querySelector('p') : null;
      if (modalTitle) modalTitle.textContent = `Delete ${ids.length} Meeting(s)?`;
      if (modalBody) modalBody.textContent = `Are you sure you want to delete ${ids.length} selected meeting(s)? This action cannot be undone.`;
      if (modal) modal.classList.remove('hidden');
    });
  }

  // Select All / Deselect All
  const selectAllBtn = document.getElementById("selectAllBtn");
  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => {
      const allCheckboxes = document.querySelectorAll('.meeting-checkbox');
      const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);

      allCheckboxes.forEach(cb => {
        cb.checked = !allChecked;
      });

      // Make sure all wrappers are visible while in selection mode
      document.querySelectorAll('.checkbox-wrapper').forEach(w => w.classList.remove('hidden'));

      selectAllBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
      updateBulkActions();
    });
  }
}

function updateBulkActions() {
  const bulkActions = document.getElementById("bulkActions");
  const selectedCountSpan = document.getElementById("selectedCount");
  const selectAllBtn = document.getElementById("selectAllBtn");
  if (!bulkActions || !selectedCountSpan) return;

  const checkboxes = document.querySelectorAll('.meeting-checkbox');
  const checked = document.querySelectorAll('.meeting-checkbox:checked');
  const wrappers = document.querySelectorAll('.checkbox-wrapper');
  
  if (checked.length > 0) {
    bulkActions.classList.remove("hidden");
    selectedCountSpan.textContent = `${checked.length} selected`;
    wrappers.forEach(w => w.classList.remove("hidden"));
    // Update Select All label
    if (selectAllBtn) {
      selectAllBtn.textContent = checked.length === checkboxes.length ? 'Deselect All' : 'Select All';
    }
  } else {
    bulkActions.classList.add("hidden");
    wrappers.forEach(w => w.classList.add("hidden"));
    if (selectAllBtn) selectAllBtn.textContent = 'Select All';
  }
}

async function deleteMeeting(id) {
  try {
    const res = await apiFetch(`/api/meetings/${id}`, {
      method: 'DELETE'
    });
    
    if (res.ok) {
      showToast("Meeting deleted successfully.");
      loadMeetings();
    } else {
      const data = await res.json();
      showToast("Failed to delete meeting: " + (data.error || "Unknown error"));
    }
  } catch (err) {
    console.error("Error deleting meeting:", err);
    showToast("Error deleting meeting.");
  }
}

// ---- Audio Upload ----

function initUpload() {
  const input = document.getElementById("audioUpload");
  if (!input) return;

  input.addEventListener("change", async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setProcessing(true, "Uploading & processing audio…");

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("audio", files[i]);
    }

    try {
      const res = await apiFetch(`/api/meetings`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok || res.status === 202) {
        showToast(files.length > 1 ? "Files uploaded! Processing in the background..." : "Audio uploaded! Processing in the background...");
        loadMeetings();
      } else {
        showToast("Processing failed: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      console.error(err);
      showToast("Error: " + err.message);
    } finally {
      setProcessing(false);
      input.value = "";
    }
  });
}

// ---- Browser Recording ----

let mediaRecorder = null;
let audioChunks = [];

function initRecording() {
  const recordBtn = document.getElementById("recordBtn");
  const stopBtn = document.getElementById("stopRecordBtn");
  const indicator = document.getElementById("recordingIndicator");
  if (!recordBtn) return;

  recordBtn.addEventListener("click", async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        indicator.classList.remove("active");
        recordBtn.style.display = "";

        // Upload the recorded audio — single step
        const formData = new FormData();
        formData.append("audio", blob, "recording.webm");

        setProcessing(true, "Uploading recording…");
        try {
          const res = await apiFetch(`/api/meetings`, {
            method: "POST",
            body: formData,
          });

          if (res.ok || res.status === 202) {
            showToast("Recording uploaded! Processing in the background...");
            loadMeetings();
          } else {
            showToast("Processing failed.");
          }
        } catch (err) {
          showToast("Error: " + err.message);
        } finally {
          setProcessing(false);
        }
      };

      mediaRecorder.start();
      indicator.classList.add("active");
      recordBtn.style.display = "none";
      showToast("Recording started…");
    } catch (err) {
      showToast("Microphone access denied.");
    }
  });

  stopBtn.addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  });
}

// ---- Meeting Detail Page Logic ----

function getMeetingIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

async function loadMeetingDetail() {
  const titleEl = document.getElementById("meetingTitle");
  const dateEl = document.getElementById("meetingDate");
  const transcriptEl = document.getElementById("transcriptText");
  const summaryEl = document.getElementById("summaryText");
  if (!titleEl) return; // not on meeting page

  const id = getMeetingIdFromUrl();
  if (!id) {
    titleEl.textContent = "Meeting not found.";
    return;
  }

  try {
    const res = await apiFetch(`/api/meetings/${id}`);
    if (!res.ok) {
      titleEl.textContent = "Meeting not found.";
      return;
    }
    const meeting = await res.json();

    titleEl.textContent = meeting.title || "Untitled Meeting";
    dateEl.textContent = meeting.date || "";
    transcriptEl.textContent = meeting.transcript || "No transcript available.";
    summaryEl.textContent = meeting.summary || "No summary yet. Click 'Generate AI Summary' above.";

    const editBtn = document.getElementById("editTitleBtn");
    if (editBtn) editBtn.style.display = "inline-flex";
  } catch (err) {
    titleEl.textContent = "Could not load meeting.";
    console.error(err);
  }
}

function initEditTitle() {
  const editBtn = document.getElementById("editTitleBtn");
  const saveBtn = document.getElementById("saveTitleBtn");
  const cancelBtn = document.getElementById("cancelTitleBtn");
  const titleEl = document.getElementById("meetingTitle");
  const titleInput = document.getElementById("editTitleInput");
  
  if (!editBtn || !saveBtn || !cancelBtn || !titleEl || !titleInput) return;

  const id = getMeetingIdFromUrl();
  if (!id) return;

  function toggleEdit(isEditing) {
    if (isEditing) {
      titleEl.classList.add("hidden");
      editBtn.classList.add("hidden"); // Also hide edit btn using utility class to avoid display conflicts
      editBtn.style.display = "none";
      titleInput.classList.remove("hidden");
      saveBtn.classList.remove("hidden");
      cancelBtn.classList.remove("hidden");
      titleInput.value = titleEl.textContent;
      titleInput.focus();
    } else {
      titleEl.classList.remove("hidden");
      editBtn.classList.remove("hidden");
      editBtn.style.display = "inline-flex";
      titleInput.classList.add("hidden");
      saveBtn.classList.add("hidden");
      cancelBtn.classList.add("hidden");
    }
  }

  editBtn.addEventListener("click", () => toggleEdit(true));
  cancelBtn.addEventListener("click", () => toggleEdit(false));

  saveBtn.addEventListener("click", async () => {
    const newTitle = titleInput.value.trim();
    if (!newTitle) {
      showToast("Title cannot be empty.");
      return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner"></span>';

    try {
      const res = await apiFetch(`/api/meetings/${id}/title`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });

      if (res.ok) {
        titleEl.textContent = newTitle;
        showToast("Title updated.");
        toggleEdit(false);
      } else {
        const data = await res.json();
        showToast("Failed to update title: " + data.error);
      }
    } catch (err) {
      console.error(err);
      showToast("Error updating title.");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    }
  });
}

function initSummarize() {
  const btn = document.getElementById("summarizeBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const id = getMeetingIdFromUrl();
    if (!id) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Generating…';

    try {
      const res = await apiFetch(`/api/meetings/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_id: id }),
      });
      const data = await res.json();

      const summaryEl = document.getElementById("summaryText");
      if (res.ok && data.summary) {
        summaryEl.textContent = data.summary;
        showToast("Summary generated!");
      } else {
        showToast("Summarization failed.");
      }
    } catch (err) {
      showToast("Error: " + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = "✨ Generate AI Summary";
    }
  });
}

function initChat() {
  const input = document.getElementById("chatInput");
  const btn = document.getElementById("askBtn");
  const msgs = document.getElementById("chatMessages");
  if (!input || !btn || !msgs) return;

  async function sendQuestion() {
    const q = input.value.trim();
    if (!q) return;

    const meetingId = getMeetingIdFromUrl();

    // Show user bubble
    const userBubble = document.createElement("div");
    userBubble.className = "chat-bubble user";
    userBubble.textContent = q;
    msgs.appendChild(userBubble);
    input.value = "";
    msgs.scrollTop = msgs.scrollHeight;

    // Loading bubble
    const loadBubble = document.createElement("div");
    loadBubble.className = "chat-bubble ai";
    loadBubble.innerHTML = '<span class="spinner"></span>';
    msgs.appendChild(loadBubble);
    msgs.scrollTop = msgs.scrollHeight;

    try {
      const res = await apiFetch(`/api/meetings/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, meeting_id: meetingId || undefined }),
      });
      const data = await res.json();
      loadBubble.textContent = data.answer || "Sorry, I don't have an answer.";
    } catch (err) {
      loadBubble.textContent = "Error reaching the server.";
    }
    msgs.scrollTop = msgs.scrollHeight;
  }

  btn.addEventListener("click", sendQuestion);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendQuestion();
  });
}

// ---- Init ----

document.addEventListener("DOMContentLoaded", () => {
  // Check auth globally on protected pages
  const isAuthPage = 
    window.location.pathname.includes('login.html') || 
    window.location.pathname.includes('register.html') ||
    window.location.pathname.includes('forgot-password.html') ||
    window.location.pathname.includes('reset-password.html');
    
  if (!isAuthPage && !getToken()) {
    window.location.href = 'login.html';
    return;
  }
  
  if (!isAuthPage) {
    const userLabel = document.getElementById('userGreeting');
    if (userLabel) {
      userLabel.textContent = `Hi, ${localStorage.getItem('user_name') || 'User'}`;
    }
  }

  // Dashboard
  loadMeetings();
  initDashboardEvents();
  initUpload();
  initRecording();

  // Meeting detail page
  loadMeetingDetail();
  initEditTitle();
  initSummarize();
  initChat();
});
