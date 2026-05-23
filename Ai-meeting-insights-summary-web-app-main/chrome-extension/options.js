function addLog(msg) {
  const d = document.createElement('div');
  d.style.fontSize = "0.75rem";
  d.style.color = "#cbd5e1";
  d.style.marginTop = "4px";
  d.textContent = "> " + msg;
  document.getElementById('desc').appendChild(d);
}

document.getElementById('allowBtn').addEventListener('click', async () => {
  addLog("Button clicked. Disabling button...");
  document.getElementById('allowBtn').disabled = true;
  document.getElementById('allowBtn').textContent = 'Waiting for Chrome prompt...';
  
  addLog("Checking navigator.mediaDevices...");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    addLog("FATAL: getUserMedia is not supported in this browser context.");
    alert("Your browser does not support audio capture here.");
    return;
  }
  
  try {
    addLog("Calling getUserMedia() now (Chrome should pop up the dialog)...");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    
    addLog("Success! Got stream.");
    stream.getTracks().forEach(t => t.stop());
    
    document.getElementById('allowBtn').style.display = 'none';
    document.getElementById('title').style.display = 'none';
    document.getElementById('desc').style.display = 'none';
    document.getElementById('successMsg').style.display = 'block';
    setTimeout(() => window.close(), 2500);
  } catch (err) {
    addLog("Caught Error: " + err.name + " - " + err.message);
    console.error("Mic error:", err);
    const errorName = err.name || "UnknownError";
    const errorMsg = err.message || err.toString();
    
    let userAction = "Please click the padlock/settings icon in the URL bar to allow microphone access.";
    if (errorName === 'NotFoundError' || errorName === 'OverconstrainedError') {
      userAction = "No microphone hardware detected! Please plug in a microphone.";
    }
    
    document.getElementById('allowBtn').style.display = 'none';
    
    const title = document.getElementById('title');
    title.innerHTML = '❌ Error Accessing Mic';
    title.style.color = '#ef4444';
    
    document.getElementById('desc').innerHTML = `
      <strong>Error Code:</strong> ${errorName} <br/> 
      <strong>Message:</strong> ${errorMsg} <br/><br/>
      ${userAction}
    `;
  }
});
