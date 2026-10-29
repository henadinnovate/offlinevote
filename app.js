/**
 * OFFLINE Live Arena - Stage Projection & Mobile Tactile Controller
 * Backed by private SQLite auth + MXroute falhen.com mail domain verification
 */

// State Management
const state = {
  fire: 0,
  cold: 0,
  soundEnabled: true,
  demoMode: false,
  demoInterval: null,
  audioCtx: null,
  projectionMode: false,
  adminUnlocked: sessionStorage.getItem('offline_admin_auth') === 'unlocked',
  adminToken: sessionStorage.getItem('offline_admin_token') || '',
  protection: {
    protectReset: true,
    protectSettings: true,
    votingLocked: false,
    requireDomainAuth: true,
    mailDomain: 'falhen.com',
    mailHost: 'mail.falhen.com'
  },
  mailConnection: null,
  pendingResetAfterAuth: false
};

// Cryptographic SHA-256 Hashes for Offline Fallback (Zero plaintext credentials in source)
const AUTH_HASHES = {
  identities: [
    'f8b774dea316fc0a6e7eee606eb49f8146b44c884077de4686750b56dc9886c4', // email
    '33d0f191df8a8b1c206e0b3d9f7e18d6e1c93c1ee1a3b89c465acb8004c83a9d'  // username
  ],
  pass: '72cb0f23437311167f7a8823c98c12e7a8941c2b43256dc7db4eba8f03172f72'
};

async function computeSha256(str) {
  const enc = new TextEncoder();
  const data = enc.encode(str);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// DOM References (All original IDs preserved for Hallmark wiring contract)
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
const hardwareUrlNote = document.getElementById('hardwareUrlNote');

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

// Top Toolbar & Status Controls
const projectionBtn = document.getElementById('projectionBtn');
const settingsBtn = document.getElementById('settingsBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const resetBtn = document.getElementById('resetBtn');
const toastMessage = document.getElementById('toastMessage');
const totalVotesCount = document.getElementById('totalVotesCount');
const liveVotingDot = document.getElementById('liveVotingDot');
const liveVotingLabel = document.getElementById('liveVotingLabel');

// Admin Lock Gate Modal References
const adminGateModalOverlay = document.getElementById('adminGateModalOverlay');
const closeAdminGateModalBtn = document.getElementById('closeAdminGateModalBtn');
const adminLoginForm = document.getElementById('adminLoginForm');
const adminEmailInput = document.getElementById('adminEmailInput');
const adminPassInput = document.getElementById('adminPassInput');
const adminErrorMsg = document.getElementById('adminErrorMsg');
const adminSubmitBtn = document.getElementById('adminSubmitBtn');

// Settings Modal References
const settingsModalOverlay = document.getElementById('settingsModalOverlay');
const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
const lockSettingsBtn = document.getElementById('lockSettingsBtn');
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

// Protection & Mail Domain References
const adminIdentityLabel = document.getElementById('adminIdentityLabel');
const mailDomainDesc = document.getElementById('mailDomainDesc');
const mailDomainBadge = document.getElementById('mailDomainBadge');
const protectResetToggleBtn = document.getElementById('protectResetToggleBtn');
const protectResetStatusText = document.getElementById('protectResetStatusText');
const lockVotingToggleBtn = document.getElementById('lockVotingToggleBtn');
const lockVotingStatusText = document.getElementById('lockVotingStatusText');

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

function getThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    fire: styles.getPropertyValue('--fire-primary').trim() || '#ff4a1c',
    fireAlt: styles.getPropertyValue('--fire-secondary').trim() || '#ff8c24',
    cold: styles.getPropertyValue('--cold-primary').trim() || '#00d8ff',
    coldAlt: styles.getPropertyValue('--cold-secondary').trim() || '#3b82f6'
  };
}

class Particle {
  constructor(x, y, type) {
    const palette = getThemeColors();
    this.x = x;
    this.y = y;
    this.type = type;
    this.size = Math.random() * 5.5 + 2.5;
    this.alpha = 1;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.1;

    if (type === 'fire') {
      this.vx = (Math.random() - 0.5) * 3.8;
      this.vy = -(Math.random() * 4.8 + 2.6);
      this.decay = Math.random() * 0.025 + 0.015;
      this.color = Math.random() > 0.4 ? palette.fire : palette.fireAlt;
    } else {
      this.vx = (Math.random() - 0.5) * 3;
      this.vy = Math.random() * 2 + 1.4;
      this.decay = Math.random() * 0.018 + 0.01;
      this.color = Math.random() > 0.4 ? palette.cold : palette.coldAlt;
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

function spawnParticles(sourceEl, type, count = 16) {
  if (!sourceEl) return;
  const rect = sourceEl.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;

  for (let i = 0; i < count; i++) {
    particles.push(new Particle(
      originX + (Math.random() - 0.5) * (rect.width * 0.55),
      originY + (Math.random() - 0.5) * 36,
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
  if (!cardEl) return;
  const reaction = document.createElement('div');
  reaction.className = `floating-reaction ${type}`;
  reaction.textContent = type === 'fire' ? '+1 FIRE' : '+1 COLD';

  const rect = cardEl.getBoundingClientRect();
  const randomOffsetX = (Math.random() - 0.5) * 56;
  reaction.style.left = `${rect.left + rect.width / 2 + randomOffsetX}px`;
  reaction.style.top = `${rect.top + rect.height * 0.38}px`;

  document.body.appendChild(reaction);
  setTimeout(() => reaction.remove(), 880);
}

/* -------------------------------------------------------------
 * 4. UI Rendering & Real-Time Analytics
 * ------------------------------------------------------------- */
function updateProtectionUI() {
  const locked = Boolean(state.protection.votingLocked);
  const protectReset = state.protection.protectReset !== false;

  if (liveVotingDot) {
    liveVotingDot.classList.toggle('locked', locked);
  }
  if (liveVotingLabel) {
    liveVotingLabel.textContent = locked ? 'Voting Locked' : 'Voting Open';
  }
  if (fireCard) fireCard.classList.toggle('voting-locked', locked);
  if (coldCard) coldCard.classList.toggle('voting-locked', locked);

  if (protectResetToggleBtn) {
    protectResetToggleBtn.classList.toggle('active', protectReset);
    protectResetToggleBtn.textContent = protectReset ? 'Protected' : 'Unprotected';
  }
  if (protectResetStatusText) {
    protectResetStatusText.textContent = protectReset
      ? 'Requires authenticated admin session before resetting scores'
      : 'Anyone with stage access can reset scores';
  }

  if (lockVotingToggleBtn) {
    lockVotingToggleBtn.classList.toggle('active', locked);
    lockVotingToggleBtn.textContent = locked ? 'Locked' : 'Unlocked';
  }
  if (lockVotingStatusText) {
    lockVotingStatusText.textContent = locked
      ? 'Audience voting is paused on mobile & stage'
      : 'Audience voting is currently open';
  }

  if (state.mailConnection && mailDomainDesc) {
    const host = state.mailConnection.host || state.protection.mailHost || 'mail.falhen.com';
    const imaps = state.mailConnection.imapsHost || 'sunfire.mxrouting.net';
    const port = state.mailConnection.imapsPort || 993;
    const reachable = state.mailConnection.reachable !== false;
    mailDomainDesc.textContent = `${host} · ${imaps}:${port} (${reachable ? 'TLS Active' : 'Standby'})`;
    if (mailDomainBadge) {
      mailDomainBadge.textContent = reachable ? 'IMAPS Verified' : 'Configured';
    }
  }
}

function updateUI(newData, triggeredOption = null) {
  const prevFire = state.fire;
  const prevCold = state.cold;

  state.fire = Number(newData.fire) || 0;
  state.cold = Number(newData.cold) || 0;

  if (newData.protection) {
    state.protection = { ...state.protection, ...newData.protection };
    updateProtectionUI();
  }

  const total = state.fire + state.cold;
  const fireDelta = state.fire - prevFire;
  const coldDelta = state.cold - prevCold;

  // Update Counters
  fireCountEl.textContent = state.fire.toLocaleString();
  coldCountEl.textContent = state.cold.toLocaleString();
  if (totalVotesCount) {
    totalVotesCount.textContent = total.toLocaleString();
  }

  // Calculate Percentages
  let firePct = 0;
  let coldPct = 0;

  if (total > 0) {
    firePct = Math.round((state.fire / total) * 100);
    coldPct = 100 - firePct;
  }

  // Update Percentage Labels & GPU Scale Properties
  firePctBadge.textContent = `${firePct}%`;
  coldPctBadge.textContent = `${coldPct}%`;

  const root = document.documentElement;
  if (total === 0) {
    root.style.setProperty('--fire-scale', '0.5');
    root.style.setProperty('--cold-scale', '0.5');
    if (fireBarEl) fireBarEl.style.transform = 'scaleX(0)';
    if (coldBarEl) coldBarEl.style.transform = 'scaleX(0)';
    fireRatioText.textContent = '50%';
    coldRatioText.textContent = '50%';
    leadPill.textContent = 'Duel Tied';
    leadPill.style.color = 'var(--text-secondary)';
  } else {
    const fireRatio = Math.max(0, Math.min(1, state.fire / total));
    const coldRatio = Math.max(0, Math.min(1, state.cold / total));
    root.style.setProperty('--fire-scale', fireRatio.toFixed(4));
    root.style.setProperty('--cold-scale', coldRatio.toFixed(4));
    if (fireBarEl) fireBarEl.style.transform = `scaleX(${fireRatio.toFixed(4)})`;
    if (coldBarEl) coldBarEl.style.transform = `scaleX(${coldRatio.toFixed(4)})`;

    fireRatioText.textContent = `${firePct}%`;
    coldRatioText.textContent = `${coldPct}%`;

    if (state.fire > state.cold) {
      const leadDiff = state.fire - state.cold;
      leadPill.textContent = `Fire +${leadDiff.toLocaleString()}`;
      leadPill.style.color = 'var(--fire-primary)';
    } else if (state.cold > state.fire) {
      const leadDiff = state.cold - state.fire;
      leadPill.textContent = `Cold +${leadDiff.toLocaleString()}`;
      leadPill.style.color = 'var(--cold-primary)';
    } else {
      leadPill.textContent = 'Duel Tied';
      leadPill.style.color = 'var(--text-primary)';
    }
  }

  // Keep battleFillLeft / battleFillRight / battleDivider referenced for Hallmark wiring contract
  if (battleFillLeft && battleFillRight && battleDivider) {
    battleDivider.style.opacity = total === 0 ? '0.65' : '1';
  }

  // Leader Tags & Leading Card Highlight
  if (total > 0 && state.fire > state.cold) {
    fireLeaderTag.classList.add('visible');
    coldLeaderTag.classList.remove('visible');
    fireCard.classList.add('leading');
    coldCard.classList.remove('leading');
  } else if (total > 0 && state.cold > state.fire) {
    coldLeaderTag.classList.add('visible');
    fireLeaderTag.classList.remove('visible');
    coldCard.classList.add('leading');
    fireCard.classList.remove('leading');
  } else {
    fireLeaderTag.classList.remove('visible');
    coldLeaderTag.classList.remove('visible');
    fireCard.classList.remove('leading');
    coldCard.classList.remove('leading');
  }

  // Ambient Stage Light Bias
  if (total > 0) {
    const fireBias = state.fire / total;
    const coldBias = state.cold / total;
    ambientFireOrb.style.opacity = (0.2 + fireBias * 0.45).toFixed(2);
    ambientColdOrb.style.opacity = (0.2 + coldBias * 0.45).toFixed(2);
  } else {
    ambientFireOrb.style.opacity = '0.32';
    ambientColdOrb.style.opacity = '0.32';
  }

  // Trigger feedback for the exact card that voted
  const isFireVote = triggeredOption === 'fire' || fireDelta > 0;
  const isColdVote = triggeredOption === 'cold' || coldDelta > 0;

  if (isFireVote) {
    fireCard.classList.remove('active-pulse');
    void fireCard.offsetWidth;
    fireCard.classList.add('active-pulse');
    spawnFloatingReaction(fireCard, 'fire');
    spawnParticles(fireCard, 'fire', 18);
    playVoteSound('fire');
    setTimeout(() => fireCard.classList.remove('active-pulse'), 350);
  }

  if (isColdVote) {
    coldCard.classList.remove('active-pulse');
    void coldCard.offsetWidth;
    coldCard.classList.add('active-pulse');
    spawnFloatingReaction(coldCard, 'cold');
    spawnParticles(coldCard, 'cold', 18);
    playVoteSound('cold');
    setTimeout(() => coldCard.classList.remove('active-pulse'), 350);
  }
}

/* -------------------------------------------------------------
 * 5. Direct Voting & Protected Reset Handlers
 * ------------------------------------------------------------- */
function castVote(option) {
  if (state.protection.votingLocked) {
    showToast('Voting is paused by Arena Moderator');
    return;
  }

  // Mobile tactile haptic feedback
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(22);
    } catch (e) {
      // Haptics optional
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

async function resetArena() {
  if (state.protection.protectReset && !state.adminUnlocked) {
    state.pendingResetAfterAuth = true;
    showToast('Admin authentication required to reset scores');
    openAdminGate();
    return;
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'RESET',
      token: state.adminToken
    }));
  } else {
    updateUI({ fire: 0, cold: 0 });
  }

  try {
    if (window.location.protocol !== 'file:') {
      await fetch('/api/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(state.adminToken ? { Authorization: `Bearer ${state.adminToken}` } : {})
        },
        body: JSON.stringify({ token: state.adminToken })
      });
    }
  } catch (err) {
    // Offline fallback already handled above
  }

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
    e.preventDefault();
    resetArena();
  } else if (e.key === 'p' || e.key === 'P') {
    e.preventDefault();
    toggleProjectionMode();
  } else if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    toggleFullscreen();
  } else if (e.key === 's' || e.key === 'S') {
    e.preventDefault();
    toggleSettings();
  } else if (e.key === 'Escape') {
    closeSettings();
  }
});

/* -------------------------------------------------------------
 * 6. WebSocket Hardware Bridge & Server State Sync
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
      if (statusDot) statusDot.classList.add('connected');
      if (statusText) statusText.textContent = 'Hardware receiver connected';
      if (hardwareUrlNote) hardwareUrlNote.textContent = targetUrl;
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'UPDATE' && payload.data) {
          updateUI(payload.data);
        } else if (payload.type === 'PROTECTION' && payload.data) {
          state.protection = { ...state.protection, ...payload.data };
          updateProtectionUI();
        } else if (payload.type === 'AUTH_REQUIRED') {
          showToast(payload.message || 'Administrator authentication required');
          openAdminGate();
        } else if (payload.type === 'LOCKED') {
          showToast(payload.message || 'Voting is currently locked');
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
      if (statusDot) statusDot.classList.remove('connected');
      if (statusText) statusText.textContent = 'Offline / local controller mode';
      if (hardwareUrlNote) hardwareUrlNote.textContent = targetUrl;
      reconnectTimer = setTimeout(connectWebSocket, 2500);
    };

    ws.onerror = () => {
      if (statusDot) statusDot.classList.remove('connected');
      if (statusText) statusText.textContent = 'Offline / local controller mode';
      if (hardwareUrlNote) hardwareUrlNote.textContent = targetUrl;
    };
  } catch (err) {
    if (statusDot) statusDot.classList.remove('connected');
    if (statusText) statusText.textContent = 'Offline / local controller mode';
    if (hardwareUrlNote) hardwareUrlNote.textContent = targetUrl;
    reconnectTimer = setTimeout(connectWebSocket, 2500);
  }
}

async function syncServerSessionAndProtection() {
  if (window.location.protocol === 'file:') return;
  try {
    const res = await fetch('/api/auth/session', {
      headers: state.adminToken ? { Authorization: `Bearer ${state.adminToken}` } : {}
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.protection) {
      state.protection = { ...state.protection, ...data.protection };
    }
    if (data.mailConnection) {
      state.mailConnection = data.mailConnection;
    }
    if (data.authenticated) {
      state.adminUnlocked = true;
      sessionStorage.setItem('offline_admin_auth', 'unlocked');
      if (adminIdentityLabel && data.identity) {
        adminIdentityLabel.textContent = `${data.identity} (${data.mailDomain || 'falhen.com'})`;
      }
    } else if (state.adminToken) {
      state.adminUnlocked = false;
      state.adminToken = '';
      sessionStorage.removeItem('offline_admin_auth');
      sessionStorage.removeItem('offline_admin_token');
    }
    updateProtectionUI();
  } catch (err) {
    // Offline static mode
  }
}

/* -------------------------------------------------------------
 * 7. Stage Projection Mode, Fullscreen & Discreet Controls
 * ------------------------------------------------------------- */
function toggleProjectionMode() {
  state.projectionMode = !state.projectionMode;
  document.body.classList.toggle('projection-mode', state.projectionMode);
  if (projectionBtn) {
    projectionBtn.setAttribute('aria-pressed', state.projectionMode ? 'true' : 'false');
  }
  showToast(state.projectionMode ? 'Stage Projection Mode Active' : 'Standard Arena View');
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

if (projectionBtn) projectionBtn.addEventListener('click', toggleProjectionMode);
if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);
if (resetBtn) resetBtn.addEventListener('click', resetArena);

function showToast(msg) {
  if (!toastMessage) return;
  toastMessage.textContent = msg;
  toastMessage.classList.add('active');
  setTimeout(() => toastMessage.classList.remove('active'), 2200);
}

/* -------------------------------------------------------------
 * 8. Settings Drawer, Mail Domain Auth & Protection Controls
 * ------------------------------------------------------------- */
function openAdminGate() {
  if (adminGateModalOverlay) {
    adminGateModalOverlay.classList.add('active');
    if (adminErrorMsg) adminErrorMsg.style.display = 'none';
    if (adminEmailInput) {
      setTimeout(() => adminEmailInput.focus(), 80);
    }
  }
}

function closeAdminGate() {
  if (adminGateModalOverlay) adminGateModalOverlay.classList.remove('active');
  if (adminErrorMsg) adminErrorMsg.style.display = 'none';
}

function openSettings() {
  if (state.adminUnlocked || !state.protection.protectSettings) {
    if (settingsModalOverlay) settingsModalOverlay.classList.add('active');
  } else {
    openAdminGate();
  }
}

function closeSettings() {
  if (settingsModalOverlay) settingsModalOverlay.classList.remove('active');
  closeAdminGate();
}

function toggleSettings() {
  if (state.adminUnlocked || !state.protection.protectSettings) {
    if (settingsModalOverlay) {
      settingsModalOverlay.classList.toggle('active');
    }
  } else {
    if (adminGateModalOverlay && adminGateModalOverlay.classList.contains('active')) {
      closeAdminGate();
    } else {
      openAdminGate();
    }
  }
}

async function lockSettings() {
  try {
    if (window.location.protocol !== 'file:' && state.adminToken) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.adminToken}`
        },
        body: JSON.stringify({ token: state.adminToken })
      });
    }
  } catch (err) {
    // Ignore network error during logout
  }
  state.adminUnlocked = false;
  state.adminToken = '';
  sessionStorage.removeItem('offline_admin_auth');
  sessionStorage.removeItem('offline_admin_token');
  closeSettings();
  showToast('Admin Session Locked');
}

if (settingsBtn) settingsBtn.addEventListener('click', openSettings);
if (closeSettingsModalBtn) closeSettingsModalBtn.addEventListener('click', closeSettings);
if (lockSettingsBtn) lockSettingsBtn.addEventListener('click', lockSettings);
if (closeAdminGateModalBtn) closeAdminGateModalBtn.addEventListener('click', closeAdminGate);

if (adminGateModalOverlay) {
  adminGateModalOverlay.addEventListener('click', (e) => {
    if (e.target === adminGateModalOverlay) closeAdminGate();
  });
}

if (settingsModalOverlay) {
  settingsModalOverlay.addEventListener('click', (e) => {
    if (e.target === settingsModalOverlay) closeSettings();
  });
}

// Admin Gate Form Submission (DB + Mail Domain first, SHA-256 fallback)
if (adminLoginForm) {
  adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (adminErrorMsg) adminErrorMsg.style.display = 'none';

    const rawIdentity = (adminEmailInput ? adminEmailInput.value : '').trim().toLowerCase();
    const passVal = (adminPassInput ? adminPassInput.value : '').trim();

    if (adminSubmitBtn) {
      adminSubmitBtn.disabled = true;
      adminSubmitBtn.textContent = 'Verifying...';
    }

    try {
      let authenticated = false;
      let resolvedIdentity = rawIdentity.includes('@') ? rawIdentity : `${rawIdentity}@falhen.com`;

      // 1. Try server-backed SQLite + MXroute falhen.com verification
      if (window.location.protocol !== 'file:') {
        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: rawIdentity, password: passVal })
          });

          if (response.ok) {
            const payload = await response.json();
            if (payload.ok) {
              authenticated = true;
              state.adminToken = payload.token || '';
              sessionStorage.setItem('offline_admin_token', state.adminToken);
              if (payload.protection) {
                state.protection = { ...state.protection, ...payload.protection };
              }
              if (payload.mailConnection) {
                state.mailConnection = payload.mailConnection;
              }
              if (payload.account && payload.account.domain) {
                resolvedIdentity = rawIdentity.includes('@')
                  ? rawIdentity
                  : `${rawIdentity}@${payload.account.domain}`;
              }
            }
          }
        } catch (networkErr) {
          // Fall back to local cryptographic hash verification if server is unreachable
        }
      }

      // 2. Cryptographic SHA-256 fallback verification
      if (!authenticated) {
        const identityHash = await computeSha256(rawIdentity);
        const passHash = await computeSha256(passVal);
        if (AUTH_HASHES.identities.includes(identityHash) && passHash === AUTH_HASHES.pass) {
          authenticated = true;
        }
      }

      if (authenticated) {
        state.adminUnlocked = true;
        sessionStorage.setItem('offline_admin_auth', 'unlocked');
        if (adminPassInput) adminPassInput.value = '';
        if (adminIdentityLabel) {
          adminIdentityLabel.textContent = resolvedIdentity;
        }
        updateProtectionUI();
        closeAdminGate();

        if (state.pendingResetAfterAuth) {
          state.pendingResetAfterAuth = false;
          await resetArena();
        } else if (settingsModalOverlay) {
          settingsModalOverlay.classList.add('active');
          showToast('Administrator Authenticated');
        }
      } else {
        if (adminErrorMsg) {
          adminErrorMsg.textContent = 'Invalid falhen.com administrator credentials.';
          adminErrorMsg.style.display = 'block';
        }
      }
    } catch (err) {
      console.error('Authentication verification error:', err);
      if (adminErrorMsg) {
        adminErrorMsg.textContent = 'Authentication error. Please try again.';
        adminErrorMsg.style.display = 'block';
      }
    } finally {
      if (adminSubmitBtn) {
        adminSubmitBtn.disabled = false;
        adminSubmitBtn.textContent = 'Unlock Studio';
      }
    }
  });
}

// Protection Controls inside Settings
async function updateServerProtection(patch, toastLabel) {
  state.protection = { ...state.protection, ...patch };
  updateProtectionUI();

  if (window.location.protocol !== 'file:' && state.adminToken) {
    try {
      const res = await fetch('/api/protection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${state.adminToken}`
        },
        body: JSON.stringify({
          token: state.adminToken,
          ...patch
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.protection) {
          state.protection = { ...state.protection, ...data.protection };
          updateProtectionUI();
        }
      }
    } catch (err) {
      // Offline mode keeps local state
    }
  }

  if (toastLabel) showToast(toastLabel);
}

if (protectResetToggleBtn) {
  protectResetToggleBtn.addEventListener('click', () => {
    const nextVal = !state.protection.protectReset;
    updateServerProtection(
      { protectReset: nextVal },
      nextVal ? 'Score Reset Protection Enabled' : 'Score Reset Protection Disabled'
    );
  });
}

if (lockVotingToggleBtn) {
  lockVotingToggleBtn.addEventListener('click', () => {
    const nextVal = !state.protection.votingLocked;
    updateServerProtection(
      { votingLocked: nextVal },
      nextVal ? 'Live Audience Voting Locked' : 'Live Audience Voting Unlocked'
    );
  });
}

// Sound Toggle inside Settings
function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  if (soundToggleBtn) {
    soundToggleBtn.classList.toggle('active', state.soundEnabled);
    soundToggleBtn.textContent = state.soundEnabled ? 'Sound ON' : 'Muted';
  }
  if (soundIcon) {
    soundIcon.style.opacity = state.soundEnabled ? '1' : '0.45';
  }
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
    fire: '#ff4a1c',
    fireSec: '#ff8c24',
    fireAccent: '#c4f82a',
    cold: '#00d8ff',
    coldSec: '#2563eb',
    coldAccent: '#7c3aed'
  },
  'solar-glacial': {
    fire: '#ff5500',
    fireSec: '#ff9500',
    fireAccent: '#ff1e56',
    cold: '#00d2ff',
    coldSec: '#0077ff',
    coldAccent: '#7b2cbf'
  },
  'cyber-neon': {
    fire: '#ff1f8f',
    fireSec: '#ff5ca8',
    fireAccent: '#ff0055',
    cold: '#00f0ff',
    coldSec: '#0088ff',
    coldAccent: '#7b00ff'
  },
  'radioactive-violet': {
    fire: '#10b981',
    fireSec: '#34d399',
    fireAccent: '#06d6a0',
    cold: '#a855f7',
    coldSec: '#6366f1',
    coldAccent: '#ec4899'
  }
};

function applyPalette(theme) {
  const root = document.documentElement;
  root.style.setProperty('--fire-primary', theme.fire);
  root.style.setProperty('--fire-secondary', theme.fireSec);
  root.style.setProperty('--fire-gradient', `linear-gradient(135deg, ${theme.fireSec} 0%, ${theme.fire} 55%, ${theme.fireAccent} 100%)`);
  root.style.setProperty('--fire-glow', `${theme.fire}66`);
  root.style.setProperty('--fire-subtle', `${theme.fire}22`);

  root.style.setProperty('--cold-primary', theme.cold);
  root.style.setProperty('--cold-secondary', theme.coldSec);
  root.style.setProperty('--cold-gradient', `linear-gradient(135deg, ${theme.cold} 0%, ${theme.coldSec} 55%, ${theme.coldAccent} 100%)`);
  root.style.setProperty('--cold-glow', `${theme.cold}66`);
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
      const nameEl = card.querySelector('.preset-name');
      showToast(`Applied: ${nameEl ? nameEl.textContent : presetKey}`);
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
      fireAccent: '#c4f82a',
      cold: coldColorPicker.value,
      coldSec: coldColorPicker.value,
      coldAccent: '#7c3aed'
    };
    presetCards.forEach(c => c.classList.remove('active'));
    applyPalette(customTheme);
    closeSettings();
    showToast('Custom Theme Applied');
  });
}

if (copyCssBtn) {
  copyCssBtn.addEventListener('click', () => {
    const cssTokens = `:root {\n  --fire-primary: ${fireColorPicker.value};\n  --cold-primary: ${coldColorPicker.value};\n}`;
    navigator.clipboard.writeText(cssTokens).then(() => {
      showToast('CSS Variables Copied');
    }).catch(() => {
      showToast('Check console for tokens');
      console.log(cssTokens);
    });
  });
}

// Initialize Application
connectWebSocket();
syncServerSessionAndProtection();
updateUI({ fire: 0, cold: 0 });
updateProtectionUI();
