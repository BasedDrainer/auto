<div class="wplace-stat-item">
            <div class="wplace-stat-label"><i class="fas fa-crosshairs"></i> Position</div(async () => {
  const CONFIG = {
    START_X: 742,
    START_Y: 1148,
    PIXELS_PER_LINE: 100,
    DELAY: 1000,
    THEME: {
      primary: '#000000',
      secondary: '#111111',
      accent: '#222222',
      text: '#ffffff',
      highlight: '#775ce3',
      success: '#00ff00',
      error: '#ff0000'
    }
  };

  const state = {
    running: false,
    paintedCount: 0,
    charges: { count: 0, max: 80, cooldownMs: 30000 },
    userInfo: null,
    lastPixel: null,
    minimized: false,
    menuOpen: false,
    debug: true, // Enable debug mode
    selectingPosition: false,
    startPosition: null,
    region: null,
    debugLog: [] // Store debug messages
  };

  // CAPTCHA Token Storage
  let capturedCaptchaToken = null;

  // Debug logging function
  const debugLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = { timestamp, message, type };
    state.debugLog.push(logEntry);
    
    // Keep only last 50 entries
    if (state.debugLog.length > 50) {
      state.debugLog.shift();
    }
    
    // Update debug display
    updateDebugDisplay();
    
    // Console log with emoji
    const emoji = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '📝';
    console.log(`${emoji} [${timestamp}] ${message}`);
  };

  // CAPTCHA Bypass System - Intercept fetch requests
  const originalFetch = window.fetch;
  window.fetch = async (url, options) => {
    // Debug: Log all WPlace requests
    if (typeof url === "string" && url.includes("backend.wplace.live")) {
      debugLog(`WPlace Request: ${url}`, 'info');
    }

    // Check if the request is for painting a pixel
    if (typeof url === "string" && url.includes("https://backend.wplace.live/s0/pixel/")) {
      try {
        const payload = JSON.parse(options.body);
        
        // Capture position when user paints manually
        if (state.selectingPosition && payload.coords) {
          debugLog(`Position selected: (${payload.coords[0]}, ${payload.coords[1]})`, 'success');
          
          // Extract region from URL
          const regionMatch = url.match(/\/pixel\/(\d+)\/(\d+)/);
          if (regionMatch) {
            state.region = {
              x: parseInt(regionMatch[1]),
              y: parseInt(regionMatch[2])
            };
            
            state.startPosition = {
              x: payload.coords[0],
              y: payload.coords[1]
            };
            
            state.selectingPosition = false;
            debugLog(`Region captured: ${state.region.x}, ${state.region.y}`, 'success');
            updateUI("✅ Position set! You can now start farming.", "success");
          }
        }
        
        // If the request body contains the 't' field, capture it
        if (payload.t) {
          capturedCaptchaToken = payload.t;
          debugLog(`CAPTCHA Token Captured: ${payload.t.substring(0, 20)}...`, 'success');
          updateUI("🔑 CAPTCHA token captured! Ready to farm.", "success");
        }
      } catch (e) {
        debugLog(`Error parsing pixel request: ${e.message}`, 'error');
      }
    }
    
    // Execute the original request
    return originalFetch(url, options);
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const fetchAPI = async (url, options = {}) => {
    try {
      const res = await fetch(url, {
        credentials: 'include',
        ...options
      });
      
      // Debug response
      if (state.debug) {
        console.log(`📡 API Response from ${url}:`, {
          status: res.status,
          statusText: res.statusText,
          ok: res.ok
        });
      }
      
      if (!res.ok) {
        console.error(`❌ API Error: ${res.status} ${res.statusText}`);
        return { error: `${res.status} ${res.statusText}` };
      }
      
      const data = await res.json();
      if (state.debug && url.includes('pixel')) {
        console.log("🎨 Paint Response:", data);
      }
      
      return data;
    } catch (e) {
      console.error("💥 Fetch Error:", e);
      return { error: e.message };
    }
  };

  const getRandomPosition = () => ({
    x: Math.floor(Math.random() * CONFIG.PIXELS_PER_LINE),
    y: Math.floor(Math.random() * CONFIG.PIXELS_PER_LINE)
  });

  const paintPixel = async (x, y) => {
    const randomColor = Math.floor(Math.random() * 31) + 1;
    
    // Check if we have a CAPTCHA token
    if (!capturedCaptchaToken) {
      debugLog("No CAPTCHA token available", 'error');
      return { error: "No CAPTCHA token" };
    }
    
    // Use captured position if available, otherwise use the configured start position
    const targetX = state.startPosition ? state.startPosition.x + x : CONFIG.START_X + x;
    const targetY = state.startPosition ? state.startPosition.y + y : CONFIG.START_Y + y;
    const regionX = state.region ? state.region.x : CONFIG.START_X;
    const regionY = state.region ? state.region.y : CONFIG.START_Y;
    
    const payload = {
      coords: [targetX, targetY],
      colors: [randomColor],
      t: capturedCaptchaToken
    };
    
    debugLog(`Painting pixel at global (${targetX}, ${targetY}) with color ${randomColor}`, 'info');
    debugLog(`Payload: ${JSON.stringify(payload)}`, 'info');
    
    const result = await fetchAPI(`https://backend.wplace.live/s0/pixel/${regionX}/${regionY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload)
    });
    
    // Handle token expiration
    if (result.error && result.error.includes('403')) {
      debugLog("CAPTCHA token expired or invalid - 403 Forbidden", 'error');
      capturedCaptchaToken = null;
      updateUI("❌ CAPTCHA token expired. Paint a pixel manually to get new token.", "error");
      return { error: "Token expired" };
    }
    
    debugLog(`Paint result: ${JSON.stringify(result)}`, result.painted === 1 ? 'success' : 'error');
    return result;
  };

  const getCharge = async () => {
    const data = await fetchAPI('https://backend.wplace.live/me');
    if (data && !data.error) {
      state.userInfo = data;
      state.charges = {
        count: Math.floor(data.charges.count),
        max: Math.floor(data.charges.max),
        cooldownMs: data.charges.cooldownMs
      };
      if (state.userInfo.level) {
        state.userInfo.level = Math.floor(state.userInfo.level);
      }
      
      if (state.debug) {
        console.log("⚡ Charges updated:", state.charges);
      }
    }
    return state.charges;
  };

  const paintLoop = async () => {
    debugLog("Starting paint loop...", 'info');
    
    while (state.running) {
      const { count, cooldownMs } = state.charges;
      
      // Check if we have a CAPTCHA token
      if (!capturedCaptchaToken) {
        debugLog("Waiting for CAPTCHA token...", 'warning');
        updateUI("🔑 CAPTCHA token needed. Paint one pixel manually to continue.", "error");
        await sleep(5000);
        continue;
      }
      
      if (count < 1) {
        debugLog(`No charges available. Waiting ${Math.ceil(cooldownMs/1000)}s...`, 'warning');
        updateUI(`⌛ No charges. Waiting ${Math.ceil(cooldownMs/1000)}s...`, 'default');
        await sleep(cooldownMs);
        await getCharge();
        continue;
      }

      // Paint at the selected position (0,0 relative to start position)
      const paintResult = await paintPixel(0, 0);
      
      if (paintResult?.painted === 1) {
        state.paintedCount++;
        const actualX = state.startPosition ? state.startPosition.x : CONFIG.START_X;
        const actualY = state.startPosition ? state.startPosition.y : CONFIG.START_Y;
        
        state.lastPixel = { 
          x: actualX,
          y: actualY,
          time: new Date() 
        };
        state.charges.count--;
        
        document.getElementById('paintEffect').style.animation = 'pulse 0.5s';
        setTimeout(() => {
          document.getElementById('paintEffect').style.animation = '';
        }, 500);
        
        debugLog(`Successfully painted pixel ${state.paintedCount} at (${actualX}, ${actualY})`, 'success');
        updateUI('✅ Pixel painted successfully!', 'success');
      } else if (paintResult?.error) {
        debugLog(`Paint failed: ${paintResult.error}`, 'error');
        updateUI(`❌ Failed: ${paintResult.error}`, 'error');
        
        // If token error, stop the loop
        if (paintResult.error.includes('Token') || paintResult.error.includes('403')) {
          await sleep(10000);
        }
      } else {
        debugLog(`Paint failed with unknown error: ${JSON.stringify(paintResult)}`, 'error');
        updateUI('❌ Failed to paint (unknown error)', 'error');
      }

      await sleep(CONFIG.DELAY);
      await updateStats();
    }
    
    debugLog("Paint loop stopped", 'info');
  };

  const createUI = () => {
    if (state.menuOpen) return;
    state.menuOpen = true;

    const fontAwesome = document.createElement('link');
    fontAwesome.rel = 'stylesheet';
    fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    document.head.appendChild(fontAwesome);

    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(0, 255, 0, 0.7); }
        70% { box-shadow: 0 0 0 10px rgba(0, 255, 0, 0); }
        100% { box-shadow: 0 0 0 0 rgba(0, 255, 0, 0); }
      }
      @keyframes slideIn {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .wplace-bot-panel {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 280px;
        background: ${CONFIG.THEME.primary};
        border: 1px solid ${CONFIG.THEME.accent};
        border-radius: 8px;
        padding: 0;
        box-shadow: 0 5px 15px rgba(0,0,0,0.5);
        z-index: 9999;
        font-family: 'Segoe UI', Roboto, sans-serif;
        color: ${CONFIG.THEME.text};
        animation: slideIn 0.4s ease-out;
        overflow: hidden;
      }
      .wplace-header {
        padding: 12px 15px;
        background: ${CONFIG.THEME.secondary};
        color: ${CONFIG.THEME.highlight};
        font-size: 16px;
        font-weight: 600;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: move;
        user-select: none;
      }
      .wplace-header-title {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .wplace-header-controls {
        display: flex;
        gap: 10px;
      }
      .wplace-header-btn {
        background: none;
        border: none;
        color: ${CONFIG.THEME.text};
        cursor: pointer;
        opacity: 0.7;
        transition: opacity 0.2s;
        font-size: 12px;
        padding: 4px;
      }
      .wplace-header-btn:hover {
        opacity: 1;
      }
      .wplace-content {
        padding: 15px;
        display: ${state.minimized ? 'none' : 'block'};
      }
      .wplace-controls {
        display: flex;
        gap: 10px;
        margin-bottom: 15px;
      }
      .wplace-btn {
        flex: 1;
        padding: 10px;
        border: none;
        border-radius: 6px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: all 0.2s;
        font-size: 13px;
      }
      .wplace-btn:hover {
        transform: translateY(-2px);
      }
      .wplace-btn-primary {
        background: ${CONFIG.THEME.accent};
        color: white;
      }
      .wplace-btn-stop {
        background: ${CONFIG.THEME.error};
        color: white;
      }
      .wplace-stats {
        background: ${CONFIG.THEME.secondary};
        padding: 12px;
        border-radius: 6px;
        margin-bottom: 15px;
      }
      .wplace-stat-item {
        display: flex;
        justify-content: space-between;
        padding: 6px 0;
        font-size: 13px;
      }
      .wplace-stat-label {
        display: flex;
        align-items: center;
        gap: 6px;
        opacity: 0.8;
      }
      .wplace-status {
        padding: 8px;
        border-radius: 4px;
        text-align: center;
        font-size: 12px;
        line-height: 1.3;
      }
      .status-default {
        background: rgba(255,255,255,0.1);
      }
      .status-success {
        background: rgba(0, 255, 0, 0.1);
        color: ${CONFIG.THEME.success};
      }
      .status-error {
        background: rgba(255, 0, 0, 0.1);
        color: ${CONFIG.THEME.error};
      }
      #paintEffect {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        border-radius: 8px;
      }
      .debug-section {
        background: rgba(255, 255, 0, 0.1);
        border: 1px solid rgba(255, 255, 0, 0.3);
        border-radius: 4px;
        padding: 8px;
        margin-bottom: 10px;
        font-size: 11px;
      }
      .debug-title {
        font-weight: bold;
        margin-bottom: 4px;
        color: #ffeb3b;
      }
      .debug-log {
        max-height: 200px;
        overflow-y: auto;
        background: rgba(0,0,0,0.3);
        padding: 8px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 10px;
        line-height: 1.2;
        margin-top: 8px;
      }
      .debug-log-entry {
        margin-bottom: 2px;
        padding: 2px 4px;
        border-radius: 2px;
      }
      .debug-log-entry.info { color: #81c784; }
      .debug-log-entry.success { color: #4caf50; }
      .debug-log-entry.warning { color: #ff9800; }
      .debug-log-entry.error { color: #f44336; }
      .debug-tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 8px;
      }
      .debug-tab {
        padding: 4px 8px;
        background: rgba(255,255,255,0.1);
        border: none;
        border-radius: 3px;
        color: white;
        font-size: 10px;
        cursor: pointer;
        transition: background 0.2s;
      }
      .debug-tab.active {
        background: rgba(255,255,255,0.3);
      }
      .debug-tab:hover {
        background: rgba(255,255,255,0.2);
      }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.className = 'wplace-bot-panel';
    panel.innerHTML = `
      <div id="paintEffect"></div>
      <div class="wplace-header">
        <div class="wplace-header-title">
          <i class="fas fa-paint-brush"></i>
          <span>WPlace Auto-Farm</span>
        </div>
        <div class="wplace-header-controls">
          <button id="debugBtn" class="wplace-header-btn" title="Toggle Debug">
            <i class="fas fa-bug"></i>
          </button>
          <button id="minimizeBtn" class="wplace-header-btn" title="Minimize">
            <i class="fas fa-${state.minimized ? 'expand' : 'minus'}"></i>
          </button>
        </div>
      </div>
      <div class="wplace-content">
        <div class="debug-section" id="debugSection">
          <div class="debug-title">🔍 Debug Info</div>
          <div class="debug-tabs">
            <button class="debug-tab active" data-tab="status">Status</button>
            <button class="debug-tab" data-tab="log">Log</button>
          </div>
          <div id="debugStatus" class="debug-tab-content">
            <div id="debugInfo">
              <div>CAPTCHA Token: <span id="tokenStatus">❌ Not captured</span></div>
              <div>Position: <span id="positionStatus">❌ Not set</span></div>
              <div>Region: <span id="regionStatus">❌ Not set</span></div>
            </div>
          </div>
          <div id="debugLog" class="debug-tab-content debug-log" style="display: none;">
            <!-- Debug log entries will be inserted here -->
          </div>
        </div>
        
        <div class="wplace-controls">
          <button id="selectPosBtn" class="wplace-btn wplace-btn-primary">
            <i class="fas fa-crosshairs"></i>
            <span>Select Position</span>
          </button>
        </div>
        
        <div class="wplace-controls">
          <button id="toggleBtn" class="wplace-btn wplace-btn-primary" disabled>
            <i class="fas fa-play"></i>
            <span>Start Farming</span>
          </button>
        </div>
        
        <div class="wplace-stats">
          <div id="statsArea">
            <div class="wplace-stat-item">
              <div class="wplace-stat-label"><i class="fas fa-paint-brush"></i> Loading...</div>
            </div>
          </div>
        </div>
        
        <div id="statusText" class="wplace-status status-default">
          1. Click "Select Position"<br>
          2. Paint one pixel where you want to farm<br>
          3. Click "Start Farming"
        </div>
      </div>
    `;
    
    document.body.appendChild(panel);
    
    const header = panel.querySelector('.wplace-header');
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    header.onmousedown = dragMouseDown;
    
    function dragMouseDown(e) {
      if (e.target.closest('.wplace-header-btn')) return;
      
      e = e || window.event;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }
    
    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      panel.style.top = (panel.offsetTop - pos2) + "px";
      panel.style.left = (panel.offsetLeft - pos1) + "px";
    }
    
    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
    
    const toggleBtn = panel.querySelector('#toggleBtn');
    const selectPosBtn = panel.querySelector('#selectPosBtn');
    const minimizeBtn = panel.querySelector('#minimizeBtn');
    const debugBtn = panel.querySelector('#debugBtn');
    const statusText = panel.querySelector('#statusText');
    const content = panel.querySelector('.wplace-content');
    const statsArea = panel.querySelector('#statsArea');
    const debugSection = panel.querySelector('#debugSection');
    
    // Debug tab functionality
    const debugTabs = panel.querySelectorAll('.debug-tab');
    const debugTabContents = {
      status: panel.querySelector('#debugStatus'),
      log: panel.querySelector('#debugLog')
    };
    
    debugTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        
        // Update active tab
        debugTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Show/hide content
        Object.values(debugTabContents).forEach(content => content.style.display = 'none');
        debugTabContents[tabName].style.display = 'block';
      });
    });
    
    selectPosBtn.addEventListener('click', () => {
      if (state.selectingPosition) return;
      
      state.selectingPosition = true;
      state.startPosition = null;
      state.region = null;
      toggleBtn.disabled = true;
      
      selectPosBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Waiting...</span>';
      selectPosBtn.disabled = true;
      
      debugLog("Position selection started. Paint a pixel where you want to farm.", 'info');
      updateUI("👆 Paint one pixel where you want to farm!", "default");
      
      // Set timeout for position selection
      setTimeout(() => {
        if (state.selectingPosition) {
          state.selectingPosition = false;
          selectPosBtn.innerHTML = '<i class="fas fa-crosshairs"></i> <span>Select Position</span>';
          selectPosBtn.disabled = false;
          debugLog("Position selection timed out", 'error');
          updateUI("❌ Position selection timed out. Try again.", "error");
        }
      }, 120000); // 2 minutes timeout
    });
    
    toggleBtn.addEventListener('click', () => {
      if (!capturedCaptchaToken) {
        debugLog("Cannot start: No CAPTCHA token", 'error');
        updateUI("🔑 Please paint one pixel manually first to capture CAPTCHA token!", "error");
        return;
      }
      
      if (!state.startPosition) {
        debugLog("Cannot start: No position selected", 'error');
        updateUI("📍 Please select a position first by clicking 'Select Position'!", "error");
        return;
      }
      
      state.running = !state.running;
      
      if (state.running) {
        toggleBtn.innerHTML = `<i class="fas fa-stop"></i> <span>Stop Farming</span>`;
        toggleBtn.classList.remove('wplace-btn-primary');
        toggleBtn.classList.add('wplace-btn-stop');
        debugLog("Auto-farming started", 'success');
        updateUI('🚀 Auto-farming started!', 'success');
        paintLoop();
      } else {
        toggleBtn.innerHTML = `<i class="fas fa-play"></i> <span>Start Farming</span>`;
        toggleBtn.classList.add('wplace-btn-primary');
        toggleBtn.classList.remove('wplace-btn-stop');
        debugLog("Auto-farming paused", 'info');
        updateUI('⏸️ Auto-farming paused', 'default');
      }
    });
    
    minimizeBtn.addEventListener('click', () => {
      state.minimized = !state.minimized;
      content.style.display = state.minimized ? 'none' : 'block';
      minimizeBtn.innerHTML = `<i class="fas fa-${state.minimized ? 'expand' : 'minus'}"></i>`;
    });
    
    debugBtn.addEventListener('click', () => {
      state.debug = !state.debug;
      debugSection.style.display = state.debug ? 'block' : 'none';
      debugBtn.style.opacity = state.debug ? '1' : '0.7';
      console.log(`🔍 Debug mode: ${state.debug ? 'ON' : 'OFF'}`);
    });
    
    // Update debug info periodically
    const updateDebugDisplay = () => {
      const tokenStatus = document.getElementById('tokenStatus');
      const positionStatus = document.getElementById('positionStatus');
      const regionStatus = document.getElementById('regionStatus');
      
      if (tokenStatus) {
        tokenStatus.innerHTML = capturedCaptchaToken ? 
          `✅ ${capturedCaptchaToken.substring(0, 10)}...` : 
          '❌ Not captured';
      }
      
      if (positionStatus) {
        positionStatus.innerHTML = state.startPosition ? 
          `✅ (${state.startPosition.x}, ${state.startPosition.y})` : 
          '❌ Not set';
      }
      
      if (regionStatus) {
        regionStatus.innerHTML = state.region ? 
          `✅ (${state.region.x}, ${state.region.y})` : 
          '❌ Not set';
      }
      
      // Update debug log
      const debugLogElement = document.getElementById('debugLog');
      if (debugLogElement && state.debugLog.length > 0) {
        debugLogElement.innerHTML = state.debugLog
          .slice(-20) // Show last 20 entries
          .map(entry => `
            <div class="debug-log-entry ${entry.type}">
              [${entry.timestamp}] ${entry.message}
            </div>
          `).join('');
        
        // Auto-scroll to bottom
        debugLogElement.scrollTop = debugLogElement.scrollHeight;
      }
      
      // Update button states
      const canStart = capturedCaptchaToken && state.startPosition && !state.running;
      if (toggleBtn) {
        toggleBtn.disabled = !canStart;
      }
      
      if (selectPosBtn && !state.selectingPosition) {
        selectPosBtn.innerHTML = '<i class="fas fa-crosshairs"></i> <span>Select Position</span>';
        selectPosBtn.disabled = false;
      }
    };
    
    // Make updateDebugDisplay available globally
    window.updateDebugDisplay = updateDebugDisplay;
    
    setInterval(updateDebugDisplay, 1000);
    
    window.addEventListener('beforeunload', () => {
      state.menuOpen = false;
    });
  };

  window.updateUI = (message, type = 'default') => {
    const statusText = document.querySelector('#statusText');
    if (statusText) {
      statusText.textContent = message;
      statusText.className = `wplace-status status-${type}`;
      statusText.style.animation = 'none';
      void statusText.offsetWidth;
      statusText.style.animation = 'slideIn 0.3s ease-out';
    }
  };

  window.updateStats = async () => {
    await getCharge();
    const statsArea = document.querySelector('#statsArea');
    if (statsArea) {
      statsArea.innerHTML = `
        <div class="wplace-stat-item">
          <div class="wplace-stat-label"><i class="fas fa-user"></i> User</div>
          <div>${state.userInfo?.name || 'Loading...'}</div>
        </div>
        <div class="wplace-stat-item">
          <div class="wplace-stat-label"><i class="fas fa-paint-brush"></i> Pixels</div>
          <div>${state.paintedCount}</div>
        </div>
        <div class="wplace-stat-item">
          <div class="wplace-stat-label"><i class="fas fa-bolt"></i> Charges</div>
          <div>${Math.floor(state.charges.count)}/${Math.floor(state.charges.max)}</div>
        </div>
        <div class="wplace-stat-item">
          <div class="wplace-stat-label"><i class="fas fa-star"></i> Level</div>
          <div>${state.userInfo?.level || '0'}</div>
        </div>
        <div class="wplace-stat-item">
          <div class="wplace-stat-label"><i class="fas fa-crosshairs"></i> Position</div>
          <div>${state.startPosition ? `(${state.startPosition.x}, ${state.startPosition.y})` : 'Not set'}</div>
        </div>
        <div class="wplace-stat-item">
          <div class="wplace-stat-label"><i class="fas fa-key"></i> Token</div>
          <div>${capturedCaptchaToken ? '✅' : '❌'}</div>
        </div>
      `;
    }
  };

  // Initialize
  debugLog("WPlace Auto-Farm with CAPTCHA Bypass initialized", 'info');
  debugLog("Instructions:", 'info');
  debugLog("1. Click 'Select Position'", 'info');
  debugLog("2. Paint ONE pixel where you want to farm", 'info');
  debugLog("3. Click 'Start Farming' to begin auto-farming", 'info');
  debugLog("4. Check debug log for detailed events", 'info');
  
  createUI();
  await getCharge();
  updateStats();
})();
