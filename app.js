/**
 * OFFLINE Live Arena - High-Energy Sentiment Duel
 * Clean presentation mode with Settings Drawer (Theme Studio, Sound & Demo controls)
 */

// State Management
const state = {
  fire: 0,
  cold: 0,
  soundEnabled: true,
  demoMode: false,
  demoInterval: null,
  audioCtx: null
};

// DOM References
const fireCountEl = document.getElementById('fireCount');
const coldCountEl = document.getElementById('coldCount');
const firePctBadge = document.getElementById('firePctBadge');
const coldPctBadge = document.getElementById('coldPctBadge');
const fireBarEl = document.getElementById('fireBar');
const coldBarEl = document.getElementById('coldBar');
const fireCard = document.getElementById('fireCard');
const coldCard = document.getElementById('coldCard');
const fireLeaderTag = document.getElementById('fireLeaderTag');
const coldLeaderTag = document.getElementById('coldLeaderTag');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');

// Momentum Duel Bar Elements
const fireRatioText = document.getElementById('fireRatioText');
const coldRatioText = document.getElementById('coldRatioText');
const leadPill = document.getElementById('leadPill');
const battleFillLeft = document.getElementById('battleFillLeft');
const battleFillRight = document.getElementById('battleFillRight');
const battleDivider = document.getElementById('battleDivider');

// Ambient Stage Lighting Orbs
const ambientFireOrb = document.getElementById('ambientFireOrb');
const ambientColdOrb = document.getElementById('ambientColdOrb');

// Top Toolbar Controls
const settingsBtn = document.getElementById('settingsBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const resetBtn = document.getElementById('resetBtn');
const toastMessage = document.getElementById('toastMessage');

// Settings Modal References
const settingsModalOverlay = document.getElementById('settingsModalOverlay');
const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
const soundToggleBtn = document.getElementById('soundToggleBtn');
const soundIcon = document.getElementById('soundIcon');
const soundStatusText = document.getElementById('soundStatusText');
const demoToggleBtn = document.getElementById('demoToggleBtn');
const demoStatusText = document.getElementById('demoStatusText');
const presetCards = document.querySelectorAll('.preset-card');
const fireColorPicker = document.getElementById('fireColorPicker');
const coldColorPicker = document.getElementById('coldColorPicker');
const fireHexDisplay = document.getElementById('fireHexDisplay');
const coldHexDisplay = document.getElementById('coldHexDisplay');
const copyCssBtn = document.getElementById('copyCssBtn');
const applyCustomThemeBtn = document.getElementById('applyCustomThemeBtn');

// Particle FX Canvas
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');
let particles = [];

// WebSocket Connection
let ws = null;
let reconnectTimer = null;

/* -------------------------------------------------------------
 * 1. Web Audio API Synthesizer (Pops & Chimes)
 * ------------------------------------------------------------- */
function getAudioContext() {
  if (!state.audioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      state.audioCtx = new AudioCtx();
    }
  }
  if (state.audioCtx && state.audioCtx.state === 'suspended') {
    state.audioCtx.resume();
  }
  return state.audioCtx;
}

function playVoteSound(type) {
  if (!state.soundEnabled) return;
  try {
    const actx = getAudioContext();
    if (!actx) return;

    const osc = actx.createOscillator();
    const gain = actx.createGain();
    const now = actx.currentTime;

    if (type === 'fire') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(580, now + 0.12);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      osc.connect(gain);
      gain.connect(actx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.15);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(actx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (err) {
    console.warn('Audio playback error:', err);
  }
}

/* -------------------------------------------------------------
 * 2. Particle FX Engine (Embers for Fire & Ice for Cold)
 * ------------------------------------------------------------- */
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

class Particle {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.size = Math.random() * 6 + 3;
    this.alpha = 1;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.1;

    if (type === 'fire') {
      this.vx = (Math.random() - 0.5) * 4;
      this.vy = -(Math.random() * 5 + 3);
      this.decay = Math.random() * 0.025 + 0.015;
      this.color = Math.random() > 0.4 ? '#ff5500' : '#ffa500';
    } else {
      this.vx = (Math.random() - 0.5) * 3;
      this.vy = Math.random() * 2 + 1.5;
      this.decay = Math.random() * 0.018 + 0.01;
      this.color = Math.random() > 0.4 ? '#00d2ff' : '#99e6ff';
    }
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.rotation += this.rotSpeed;
    this.alpha -= this.decay;
  }

  draw(c) {
    c.save();
    c.globalAlpha = Math.max(0, this.alpha);
    c.translate(this.x, this.y);
    c.rotate(this.rotation);

    if (this.type === 'fire') {
      c.fillStyle = this.color;
      c.shadowColor = this.color;
      c.shadowBlur = 10;
      c.beginPath();
      c.moveTo(0, -this.size * 1.4);
      c.lineTo(this.size * 0.8, 0);
      c.lineTo(0, this.size * 1.4);
      c.lineTo(-this.size * 0.8, 0);
      c.closePath();
      c.fill();
    } else {
      c.fillStyle = this.color;
      c.shadowColor = this.color;
      c.shadowBlur = 8;
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        c.rotate(Math.PI / 3);
        c.rect(-1, -this.size, 2, this.size * 2);
      }
      c.fill();
    }

    c.restore();
  }
}

function spawnParticles(sourceEl, type, count = 18) {
  const rect = sourceEl.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;

  for (let i = 0; i < count; i++) {
    particles.push(new Particle(
      originX + (Math.random() - 0.5) * (rect.width * 0.6),
      originY + (Math.random() - 0.5) * 40,
      type
    ));
  }
}

function renderParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.update();
    p.draw(ctx);
    if (p.alpha <= 0) {
      particles.splice(i, 1);
    }
  }
  requestAnimationFrame(renderParticles);
}
renderParticles();

/* -------------------------------------------------------------
 * 3. Floating Reaction Numbers (+1 Effect)
 * ------------------------------------------------------------- */
function spawnFloatingReaction(cardEl, type) {
  const reaction = document.createElement('div');
  reaction.className = `floating-reaction ${type}`;
  reaction.textContent = type === 'fire' ? '+1 🔥' : '+1 🥶';

  const rect = cardEl.getBoundingClientRect();
  const randomOffsetX = (Math.random() - 0.5) * 60;
  reaction.style.left = `${rect.left + rect.width / 2 + randomOffsetX}px`;
  reaction.style.top = `${rect.top + rect.height * 0.4}px`;

  document.body.appendChild(reaction);
  setTimeout(() => reaction.remove(), 900);
}

/* -------------------------------------------------------------
 * 4. UI Rendering & Real-Time Analytics
 * ------------------------------------------------------------- */
function updateUI(newData, triggeredOption = null) {
  const prevFire = state.fire;
  const prevCold = state.cold;

  state.fire = Number(newData.fire) || 0;
  state.cold = Number(newData.cold) || 0;

  const total = state.fire + state.cold;
  const fireDelta = state.fire - prevFire;
  const coldDelta = state.cold - prevCold;

  // Update Counters
  fireCountEl.textContent = state.fire.toLocaleString();
  coldCountEl.textContent = state.cold.toLocaleString();

  // Calculate Percentages
  let firePct = 0;
  let coldPct = 0;

  if (total > 0) {
    firePct = Math.round((state.fire / total) * 100);
    coldPct = 100 - firePct;
  }

  // Update Percentage Labels
  firePctBadge.textContent = `${firePct}%`;
  coldPctBadge.textContent = `${coldPct}%`;
  fireBarEl.style.width = `${firePct}%`;
  coldBarEl.style.width = `${coldPct}%`;

  // Update Top Momentum Duel Bar
  if (total === 0) {
    fireRatioText.textContent = '50%';
    coldRatioText.textContent = '50%';
    battleFillLeft.style.width = '50%';
    battleFillRight.style.width = '50%';
    battleDivider.style.left = '50%';
    leadPill.textContent = 'DUEL TIED';
    leadPill.style.color = 'var(--text-muted)';
  } else {
    fireRatioText.textContent = `${firePct}%`;
    coldRatioText.textContent = `${coldPct}%`;
    battleFillLeft.style.width = `${firePct}%`;
    battleFillRight.style.width = `${coldPct}%`;
    battleDivider.style.left = `${firePct}%`;

    if (state.fire > state.cold) {
      const leadDiff = state.fire - state.cold;
      leadPill.textContent = `🔥 FIRE +${leadDiff.toLocaleString()}`;
      leadPill.style.color = 'var(--fire-primary)';
    } else if (state.cold > state.fire) {
      const leadDiff = state.cold - state.fire;
      leadPill.textContent = `COLD +${leadDiff.toLocaleString()} 🥶`;
      leadPill.style.color = 'var(--cold-primary)';
    } else {
      leadPill.textContent = 'DUEL TIED';
      leadPill.style.color = '#fff';
    }
  }

  // Leader Tags
  if (total > 0 && state.fire > state.cold) {
    fireLeaderTag.classList.add('visible');
    coldLeaderTag.classList.remove('visible');
  } else if (total > 0 && state.cold > state.fire) {
    coldLeaderTag.classList.add('visible');
    fireLeaderTag.classList.remove('visible');
  } else {
    fireLeaderTag.classList.remove('visible');
    coldLeaderTag.classList.remove('visible');
  }

  // Ambient Stage Light Bias
  if (total > 0) {
    const fireBias = (state.fire / total);
    const coldBias = (state.cold / total);
    ambientFireOrb.style.opacity = (0.2 + fireBias * 0.45).toFixed(2);
    ambientColdOrb.style.opacity = (0.2 + coldBias * 0.45).toFixed(2);
  } else {
    ambientFireOrb.style.opacity = '0.35';
    ambientColdOrb.style.opacity = '0.35';
  }

  // Trigger feedback for the exact card that voted
  const isFireVote = triggeredOption === 'fire' || fireDelta > 0;
  const isColdVote = triggeredOption === 'cold' || coldDelta > 0;

  if (isFireVote) {
    fireCard.classList.remove('active-pulse');
    void fireCard.offsetWidth;
    fireCard.classList.add('active-pulse');
    spawnFloatingReaction(fireCard, 'fire');
    spawnParticles(fireCard, 'fire', 20);
    playVoteSound('fire');
    setTimeout(() => fireCard.classList.remove('active-pulse'), 350);
  }

  if (isColdVote) {
    coldCard.classList.remove('active-pulse');
    void coldCard.offsetWidth;
    coldCard.classList.add('active-pulse');
    spawnFloatingReaction(coldCard, 'cold');
    spawnParticles(coldCard, 'cold', 20);
    playVoteSound('cold');
    setTimeout(() => coldCard.classList.remove('active-pulse'), 350);
  }
}

/* -------------------------------------------------------------
 * 5. Direct Voting & Handlers
 * ------------------------------------------------------------- */
function castVote(option) {
  // Mobile tactile haptic feedback
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(25);
    } catch (e) {
      // Haptics optional or blocked by user agent
    }
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'VOTE', option }));
  } else {
    if (option === 'fire') {
      updateUI({ fire: state.fire + 1, cold: state.cold }, 'fire');
    } else if (option === 'cold') {
      updateUI({ fire: state.fire, cold: state.cold + 1 }, 'cold');
    }
  }
}

function resetArena() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'RESET' }));
  }
  updateUI({ fire: 0, cold: 0 });
  showToast('Arena Counts Reset to 0');
}

// Click / Touch on Cards
fireCard.addEventListener('click', () => castVote('fire'));
coldCard.addEventListener('click', () => castVote('cold'));

// Keyboard navigation & Keypad [1] and [2]
window.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

  if (e.key === '1' || e.code === 'Numpad1') {
    e.preventDefault();
    castVote('fire');
  } else if (e.key === '2' || e.code === 'Numpad2') {
    e.preventDefault();
    castVote('cold');
  } else if (e.key === 'r' || e.key === 'R') {
    resetArena();
  } else if (e.key === 'f' || e.key === 'F') {
    toggleFullscreen();
  } else if (e.key === 's' || e.key === 'S') {
    toggleSettings();
  } else if (e.key === 'Escape') {
    closeSettings();
  }
});

/* -------------------------------------------------------------
 * 6. WebSocket Hardware Bridge Connection
 * ------------------------------------------------------------- */
function getWebSocketUrl() {
  if (window.location.protocol === 'file:') {
    return 'ws://localhost:8080';
  }
  const isSecure = window.location.protocol === 'https:';
  const protocol = isSecure ? 'wss:' : 'ws:';
  const host = window.location.host || 'localhost:8080';
  return `${protocol}//${host}`;
}

function connectWebSocket() {
  clearTimeout(reconnectTimer);
  const targetUrl = getWebSocketUrl();

  try {
    ws = new WebSocket(targetUrl);

    ws.onopen = () => {
      statusDot.classList.add('connected');
      statusText.textContent = `Hardware receiver connected (${targetUrl})`;
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'UPDATE' && payload.data) {
          updateUI(payload.data);
        } else if (payload.type === 'VOTE' && payload.option) {
          if (payload.option === 'fire') {
            updateUI({ fire: state.fire + 1, cold: state.cold }, 'fire');
          } else if (payload.option === 'cold') {
            updateUI({ fire: state.fire, cold: state.cold + 1 }, 'cold');
          }
        } else if (payload.type === 'RESET') {
          updateUI({ fire: 0, cold: 0 });
        }
      } catch (err) {
        console.warn('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      statusDot.classList.remove('connected');
      statusText.textContent = `Hardware receiver connecting (${targetUrl})...`;
      reconnectTimer = setTimeout(connectWebSocket, 2500);
    };

    ws.onerror = () => {
      statusDot.classList.remove('connected');
      statusText.textContent = `Hardware receiver connecting (${targetUrl})...`;
    };
  } catch (err) {
    statusDot.classList.remove('connected');
    statusText.textContent = `Hardware receiver connecting (${targetUrl})...`;
    reconnectTimer = setTimeout(connectWebSocket, 2500);
  }
}

/* -------------------------------------------------------------
 * 7. Fullscreen & Discreet Controls
 * ------------------------------------------------------------- */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}
if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);
if (resetBtn) resetBtn.addEventListener('click', resetArena);

function showToast(msg) {
  if (!toastMessage) return;
  toastMessage.textContent = msg;
  toastMessage.classList.add('active');
  setTimeout(() => toastMessage.classList.remove('active'), 2000);
}

/* -------------------------------------------------------------
 * 8. Settings Drawer (Theme Studio, Sound & Demo Simulation)
 * ------------------------------------------------------------- */
function openSettings() {
  if (settingsModalOverlay) settingsModalOverlay.classList.add('active');
}

function closeSettings() {
  if (settingsModalOverlay) settingsModalOverlay.classList.remove('active');
}

function toggleSettings() {
  if (settingsModalOverlay) {
    settingsModalOverlay.classList.toggle('active');
  }
}

if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
if (closeSettingsModalBtn) closeSettingsModalBtn.addEventListener('click', closeSettings);
if (settingsModalOverlay) {
  settingsModalOverlay.addEventListener('click', (e) => {
    if (e.target === settingsModalOverlay) closeSettings();
  });
}

// Sound Toggle inside Settings
function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  if (soundToggleBtn) {
    soundToggleBtn.classList.toggle('active', state.soundEnabled);
    soundToggleBtn.textContent = state.soundEnabled ? 'Sound ON' : 'Muted';
  }
  if (soundIcon) soundIcon.textContent = state.soundEnabled ? '🔊' : '🔇';
  if (soundStatusText) {
    soundStatusText.textContent = state.soundEnabled 
      ? 'Web Audio pops & chimes active' 
      : 'Sound effects muted';
  }
  showToast(state.soundEnabled ? 'Sound FX Enabled' : 'Sound FX Muted');
}
if (soundToggleBtn) soundToggleBtn.addEventListener('click', toggleSound);

// Demo Mode Toggle inside Settings
function toggleDemoMode() {
  state.demoMode = !state.demoMode;
  if (demoToggleBtn) {
    demoToggleBtn.classList.toggle('active', state.demoMode);
    demoToggleBtn.textContent = state.demoMode ? 'Stop Demo' : 'Start Demo';
  }
  if (demoStatusText) {
    demoStatusText.textContent = state.demoMode 
      ? 'Simulating audience traffic...' 
      : 'Simulates live crowd traffic';
  }

  if (state.demoMode) {
    showToast('Demo Traffic Simulation Started');
    state.demoInterval = setInterval(() => {
      const pick = Math.random() > 0.48 ? 'fire' : 'cold';
      castVote(pick);
    }, Math.floor(Math.random() * 300) + 250);
  } else {
    clearInterval(state.demoInterval);
    showToast('Demo Simulation Stopped');
  }
}
if (demoToggleBtn) demoToggleBtn.addEventListener('click', toggleDemoMode);

// Theme Studio Palette Presets
const THEME_PRESETS = {
  'offline-vybes': {
    fire: '#ff3b00',
    fireSec: '#ff8800',
    fireAccent: '#b6ff00',
    cold: '#00f0ff',
    coldSec: '#0077ff',
    coldAccent: '#8a2be2'
  },
  'solar-glacial': {
    fire: '#ff4500',
    fireSec: '#ff8c00',
    fireAccent: '#ff0055',
    cold: '#00d2ff',
    coldSec: '#0077ff',
    coldAccent: '#7b2cbf'
  },
  'cyber-neon': {
    fire: '#ff007f',
    fireSec: '#ff3399',
    fireAccent: '#ff0055',
    cold: '#00f3ff',
    coldSec: '#0088ff',
    coldAccent: '#7b00ff'
  },
  'radioactive-violet': {
    fire: '#00ff88',
    fireSec: '#10b981',
    fireAccent: '#06d6a0',
    cold: '#a855f7',
    coldSec: '#6366f1',
    coldAccent: '#ec4899'
  }
};

function applyPalette(theme) {
  const root = document.documentElement;
  root.style.setProperty('--fire-primary', theme.fire);
  root.style.setProperty('--fire-gradient', `linear-gradient(135deg, ${theme.fireSec} 0%, ${theme.fire} 50%, ${theme.fireAccent} 100%)`);
  root.style.setProperty('--fire-glow', `${theme.fire}77`);
  root.style.setProperty('--fire-subtle', `${theme.fire}22`);

  root.style.setProperty('--cold-primary', theme.cold);
  root.style.setProperty('--cold-gradient', `linear-gradient(135deg, ${theme.cold} 0%, ${theme.coldSec} 50%, ${theme.coldAccent} 100%)`);
  root.style.setProperty('--cold-glow', `${theme.cold}77`);
  root.style.setProperty('--cold-subtle', `${theme.cold}22`);

  if (fireColorPicker) fireColorPicker.value = theme.fire;
  if (fireHexDisplay) fireHexDisplay.value = theme.fire;
  if (coldColorPicker) coldColorPicker.value = theme.cold;
  if (coldHexDisplay) coldHexDisplay.value = theme.cold;
}

presetCards.forEach(card => {
  card.addEventListener('click', () => {
    presetCards.forEach(c => c.classList.remove('active'));
    card.classList.add('active');

    const presetKey = card.getAttribute('data-preset');
    if (THEME_PRESETS[presetKey]) {
      applyPalette(THEME_PRESETS[presetKey]);
      showToast(`Applied: ${card.querySelector('.preset-name').textContent}`);
    }
  });
});

if (fireColorPicker && fireHexDisplay) {
  fireColorPicker.addEventListener('input', (e) => {
    fireHexDisplay.value = e.target.value;
  });
}

if (coldColorPicker && coldHexDisplay) {
  coldColorPicker.addEventListener('input', (e) => {
    coldHexDisplay.value = e.target.value;
  });
}

if (applyCustomThemeBtn) {
  applyCustomThemeBtn.addEventListener('click', () => {
    const customTheme = {
      fire: fireColorPicker.value,
      fireSec: fireColorPicker.value,
      fireAccent: '#b6ff00',
      cold: coldColorPicker.value,
      coldSec: coldColorPicker.value,
      coldAccent: '#8a2be2'
    };
    presetCards.forEach(c => c.classList.remove('active'));
    applyPalette(customTheme);
    closeSettings();
    showToast('Custom Theme Applied!');
  });
}

if (copyCssBtn) {
  copyCssBtn.addEventListener('click', () => {
    const cssTokens = `:root {
  --fire-primary: ${fireColorPicker.value};
  --cold-primary: ${coldColorPicker.value};
}`;
    navigator.clipboard.writeText(cssTokens).then(() => {
      showToast('CSS Variables Copied!');
    }).catch(() => {
      showToast('Check console for tokens');
      console.log(cssTokens);
    });
  });
}

// Initialize Application
connectWebSocket();
updateUI({ fire: 0, cold: 0 });
