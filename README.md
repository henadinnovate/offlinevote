# 🔥 Live Polling Arena — Real-Time Sentiment Duel 🥶

An ultra-vibrant, high-performance real-time sentiment arena and audience polling display. Built with modern glassmorphism, dynamic ambient stage lighting, particle explosion physics, synthesized Web Audio sound effects, and full hardware keypad bridge support.

---

## ⚡ Quick Start

### 1. Launch the Server & Hardware Bridge
```bash
cd /Users/henryfalonipe/.gemini/antigravity-ide/scratch/live-polling-arena
node server.js
```

### 2. View in Browser
Open: [http://localhost:8080](http://localhost:8080)

---

## 🎨 Dynamic Color Theme Customization

The styling is built around centralized CSS Custom Properties in `styles.css`. When you are ready to share or apply your exact color theme, you can customize it in two ways:

### Option A: Via the in-browser **Theme Studio**
1. Click the **🎨 Theme Studio** button in the top toolbar (or press `Escape` to close).
2. Choose from curated vibrant presets (*Solar & Glacial*, *Cyber Neon*, *Emerald & Amethyst*, *Gold Sunset*), or use the live color pickers.
3. Click **"Copy CSS Variables"** to copy the exact snippet to your clipboard.

### Option B: Directly in `styles.css`
Edit the `:root` variables at the top of [styles.css](file:///Users/henryfalonipe/.gemini/antigravity-ide/scratch/live-polling-arena/styles.css):

```css
:root {
  /* Option 1 (Fire) */
  --fire-primary: #ff4500;
  --fire-gradient: linear-gradient(135deg, #ffa133 0%, #ff4500 50%, #ff005b 100%);
  --fire-glow: rgba(255, 69, 0, 0.5);

  /* Option 2 (Cold) */
  --cold-primary: #00d2ff;
  --cold-gradient: linear-gradient(135deg, #00f2fe 0%, #0077ff 50%, #7b2cbf 100%);
  --cold-glow: rgba(0, 210, 255, 0.5);
}
```

---

## 🕹️ Controls & Input Methods

| Input | Target | Description |
|---|---|---|
| **Key [1]** / Numpad 1 | Option 1 (Fire) | Vote Fire |
| **Key [2]** / Numpad 2 | Option 2 (Cold) | Vote Cold |
| **Key [R]** | Arena Reset | Zero out all votes |
| **Key [D]** | Demo Simulation | Simulates realistic audience traffic |
| **Key [M]** | Audio Toggle | Mute / Unmute synthesized sound FX |
| **Key [F]** | Presentation Mode | Toggle full screen |
| **Click / Tap** | Either Card | Direct touch/mouse vote |

---

## 📡 Hardware & IoT Integration

The bridge server provides 3 simultaneous ways for hardware to vote:

1. **WebSocket (`ws://localhost:8080`)**:
   - Send: `{"type": "VOTE", "option": "fire"}` or `{"type": "VOTE", "option": "cold"}`
   - Receive: `{"type": "UPDATE", "data": {"fire": 12, "cold": 8}}`
2. **Terminal Keypad**:
   - When running `node server.js`, press `1` or `2` directly in the terminal window.
3. **HTTP REST Endpoints**:
   - `GET /api/vote?option=fire`
   - `GET /api/vote?option=cold`
   - `GET /api/reset`
   - `GET /api/stats`
