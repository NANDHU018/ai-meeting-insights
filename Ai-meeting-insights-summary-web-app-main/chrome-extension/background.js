let isRecording = false;
let recordingTabId = null;

// Track which tabs we've already notified to avoid spamming
const notifiedTabs = new Set();

// ── Restore persisted state on service worker startup ─────────────────────────
chrome.storage.local.get(['isRecording', 'recordingTabId'], (data) => {
  isRecording = data.isRecording || false;
  recordingTabId = data.recordingTabId || null;
});

// ── Persist state helper ──────────────────────────────────────────────────────
function saveState() {
  chrome.storage.local.set({ isRecording, recordingTabId });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;

  const isMeetingUrl = tab.url.includes("meet.google.com/") ||
                       tab.url.includes("zoom.us/j/") ||
                       tab.url.includes("zoom.us/wc/");

  if (isMeetingUrl) {
    chrome.action.setBadgeText({ text: "REC", tabId: tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444", tabId: tabId });
    chrome.action.setTitle({ title: "AI Meeting Recorder — Meeting Detected! Click to record.", tabId: tabId });

    if (!notifiedTabs.has(tabId)) {
      notifiedTabs.add(tabId);
      chrome.notifications.create(`meeting-${tabId}`, {
        type: "basic",
        iconUrl: "icon.png",
        title: "Meeting Detected!",
        message: "Click the AI Meeting Recorder extension icon to start recording.",
        priority: 2,
        requireInteraction: true
      });
    }
  } else {
    chrome.action.setBadgeText({ text: "", tabId: tabId });
    chrome.action.setTitle({ title: "AI Meeting Recorder", tabId: tabId });
    notifiedTabs.delete(tabId);

    if (isRecording && recordingTabId === tabId) {
      stopRecordingAndUpload();
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  notifiedTabs.delete(tabId);
  if (isRecording && recordingTabId === tabId) {
    stopRecordingAndUpload();
  }
});

function stopRecordingAndUpload() {
  if (!isRecording) return;
  isRecording = false;
  recordingTabId = null;
  saveState();
  chrome.runtime.sendMessage({ type: "TRIGGER_STOP" })
    .catch(e => console.log('Offscreen not listening or stopped', e));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_STATE") {
    // Always re-read storage in case worker restarted and lost in-memory state
    chrome.storage.local.get(['isRecording', 'recordingTabId'], (data) => {
      isRecording = data.isRecording || false;
      recordingTabId = data.recordingTabId || null;
      sendResponse({ isRecording, recordingTabId });
    });
    return true; // async
  }
  
  if (message.type === "START_RECORDING") {
    isRecording = true;
    recordingTabId = message.tabId;
    saveState();

    // Update badge to show actively recording
    if (message.tabId) {
      chrome.action.setBadgeText({ text: "●", tabId: message.tabId });
      chrome.action.setBadgeBackgroundColor({ color: "#ef4444", tabId: message.tabId });
    }
    
    startOffscreenRecording(message)
      .then(() => sendResponse({ status: "started" }))
      .catch((err) => {
        isRecording = false;
        recordingTabId = null;
        saveState();
        console.error(err);
        sendResponse({ status: "failed", error: err.message || "Unknown error" });
      });
    return true;
  }
  
  if (message.type === "STOP_RECORDING") {
    stopRecordingAndUpload();
    sendResponse({ status: "stopping" });
    return true;
  }

  if (message.type === "UPLOAD_COMPLETE") {
    // Clear persisted state
    isRecording = false;
    recordingTabId = null;
    saveState();

    if (message.errorMsg) {
       chrome.notifications.create({
         type: 'basic',
         iconUrl: 'icon.png',
         title: 'Upload Failed',
         message: message.errorMsg
       });
    }

    // Redirect the user straight to the dashboard so they can watch the live polling progress bar
    const targetUrl = "http://localhost:5000/";
    chrome.tabs.create({ url: targetUrl });
    sendResponse({ status: "opened" });
    return true;
  }

  if (message.type === "SYNC_LOGIN") {
    chrome.storage.local.set({ token: message.token, user: message.user }, () => {
      console.log("[AI Meeting Assistant] Successfully synced login from web app");
    });
    return true;
  }

  if (message.type === "SYNC_LOGOUT") {
    chrome.storage.local.remove(['token', 'user'], () => {
      console.log("[AI Meeting Assistant] Successfully synced logout from web app");
    });
    return true;
  }
});

async function startOffscreenRecording(config) {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('offscreen.html')]
  });

  if (existingContexts.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Recording meeting audio'
    });
  }

  await new Promise(r => setTimeout(r, 200));

  await chrome.runtime.sendMessage({
    type: "INIT_RECORDING",
    streamId: config.streamId,
    title: config.title,
    token: config.token
  });
}
