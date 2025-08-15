(async () => {
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
    debug: true // Enable debug mode
  };

  // CAPTCHA Token Storage
  let capturedCaptchaToken = null;

  // CAPTCHA Bypass System - Intercept fetch requests
  const originalFetch = window.fetch;
  window.fetch = async (url, options) => {
    // Debug: Log all WPlace requests
    if (typeof url === "string" && url.includes("backend.wplace.live")) {
      console.log("🔍 WPlace Request:", url, options);
    }

    // Check if the request is for painting a pixel
    if (typeof url === "string" && url.includes("https://backend.wplace.live/s0/pixel/")) {
      try {
        const payload = JSON.parse(options.body);
        // If the request body contains the 't' field, capture it
        if (payload.t) {
          console.log("✅ CAPTCHA Token Captured:", payload.t);
          capturedCaptchaToken = payload.t;
          
          // Update UI to show token captured
          updateUI("🔑 CAPTCHA token captured! Ready to farm.", "success");
        }
      } catch (e) {
        // Ignore JSON parse errors
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
      console.warn("⚠️ No CAPTCHA token available");
      return { error: "No CAPTCHA token" };
    }
    
    const payload = {
      coords: [x, y],
      colors: [randomColor],
      t: capturedCaptchaToken // Include the captured token
    };
    
    if (state.debug) {
      console.log(`🎨 Painting pixel at (${x}, ${y}) with color ${randomColor}`);
      console.log("📦 Payload:", payload);
    }
    
    const result = await fetchAPI(`https://backend.wplace.live/s0/pixel/${CONFIG.START_X}/${CONFIG.START_Y}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload)
    });
    
    // Handle token expiration
    if (result.error && result.error.includes('403')) {
      console.error("🔑 CAPTCHA token expired or invalid");
      capturedCaptchaToken = null;
      updateUI("❌ CAPTCHA token expired. Paint a pixel manually to get new token.", "error");
      return { error: "Token expired" };
    }
    
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
    console.log("🚀 Starting paint loop...");
    
    while (state.running) {
      const { count, cooldownMs } = state.charges;
      
      // Check if we have a CAPTCHA token
      if (!capturedCaptchaToken) {
        updateUI("🔑 CAPTCHA token needed. Paint one pixel manually to continue.", "error");
        await sleep(5000); // Wait 5 seconds before checking again
        continue;
      }
      
      if (count < 1) {
        updateUI(`⌛ No charges. Waiting ${Math.ceil(cooldownMs/1000)}s...`, 'default');
        await sleep(cooldownMs);
        await getCharge();
        continue;
      }

      const randomPos = getRandomPosition();
      const paintResult = await paintPixel(randomPos.x, randomPos.y);
      
      if (paintResult?.painted === 1) {
        state.paintedCount++;
        state.lastPixel = { 
          x: CONFIG.START_X + randomPos.x,
          y: CONFIG.START_Y + randomPos.y,
          time: new Date() 
        };
        state.charges.count--;
        
        document.getElementById('paintEffect').style.animation = 'pulse 0.5s';
        setTimeout(() => {
          document.getElementById('paintEffect').style.animation = '';
        }, 500);
        
        updateUI('✅ Pixel painted successfully!', 'success');
        console.log(`✅ Painted pixel ${state.paintedCount} at (${randomPos.x}, ${randomPos.y})`);
      } else if (paintResult?.error) {
        updateUI(`❌ Failed: ${paintResult.error}`, 'error');
        console.error("❌ Paint failed:", paintResult.error);
        
        // If token error, stop the loop
        if (paintResult.error.includes('Token') || paintResult.error.includes('403')) {
          await sleep(10000); // Wait longer on token errors
        }
      } else {
        updateUI('❌ Failed to paint (unknown error)', 'error');
        console.error("❌ Paint failed with unknown error:", paintResult);
      }

      await sleep(CONFIG.DELAY);
      await updateStats();
    }
    
    console.log("⏹️ Paint loop stopped");
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
          <div id="debugInfo">CAPTCHA Token: <span id="tokenStatus">❌ Not captured</span></div>
        </div>
        
        <div class="wplace-controls">
          <button id="toggleBtn" class="wplace-btn wplace-btn-primary">
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
          🔑 Paint one pixel manually to capture CAPTCHA token, then start farming.
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
    const minimizeBtn = panel.querySelector('#minimizeBtn');
    const debugBtn = panel.querySelector('#debugBtn');
    const statusText = panel.querySelector('#statusText');
    const content = panel.querySelector('.wplace-content');
    const statsArea = panel.querySelector('#statsArea');
    const debugSection = panel.querySelector('#debugSection');
    
    toggleBtn.addEventListener('click', () => {
      if (!capturedCaptchaToken) {
        updateUI("🔑 Please paint one pixel manually first to capture CAPTCHA token!", "error");
        return;
      }
      
      state.running = !state.running;
      
      if (state.running) {
        toggleBtn.innerHTML = `<i class="fas fa-stop"></i> <span>Stop Farming</span>`;
        toggleBtn.classList.remove('wplace-btn-primary');
        toggleBtn.classList.add('wplace-btn-stop');
        updateUI('🚀 Auto-farming started!', 'success');
        paintLoop();
      } else {
        toggleBtn.innerHTML = `<i class="fas fa-play"></i> <span>Start Farming</span>`;
        toggleBtn.classList.add('wplace-btn-primary');
        toggleBtn.classList.remove('wplace-btn-stop');
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
    setInterval(() => {
      const tokenStatus = document.getElementById('tokenStatus');
      if (tokenStatus) {
        tokenStatus.innerHTML = capturedCaptchaToken ? 
          `✅ ${capturedCaptchaToken.substring(0, 10)}...` : 
          '❌ Not captured';
      }
    }, 1000);
    
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
          <div class="wplace-stat-label"><i class="fas fa-key"></i> Token</div>
          <div>${capturedCaptchaToken ? '✅' : '❌'}</div>
        </div>
      `;
    }
  };

  // Initialize
  console.log("🔧 WPlace Auto-Farm with CAPTCHA Bypass initialized");
  console.log("📋 Instructions:");
  console.log("1. Paint ONE pixel manually to capture CAPTCHA token");
  console.log("2. Click 'Start Farming' to begin auto-farming");
  console.log("3. Check debug panel for token status");
  
  createUI();
  await getCharge();
  updateStats();
})();
