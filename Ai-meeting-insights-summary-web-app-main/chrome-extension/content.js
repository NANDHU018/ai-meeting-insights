// Listen for messages from the web application
window.addEventListener("message", (event) => {
  // Only accept messages from our own website (adjust origin if deployed)
  if (event.origin !== "http://localhost:5000" && event.origin !== "http://127.0.0.1:5000") {
    return;
  }

  // Intercept the login sync message
  if (event.data && event.data.type === "EXTENSION_SYNC_LOGIN") {
    console.log("[AI Meeting Assistant] Syncing login to extension...");
    // Relay the token securely directly to the extension's background script
    chrome.runtime.sendMessage({
      type: "SYNC_LOGIN",
      token: event.data.token,
      user: event.data.user
    });
  }
  
  if (event.data && event.data.type === "EXTENSION_SYNC_LOGOUT") {
    console.log("[AI Meeting Assistant] Syncing logout to extension...");
    chrome.runtime.sendMessage({ type: "SYNC_LOGOUT" });
  }
}, false);
