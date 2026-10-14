/**
 * Live Polling Arena - Hardware Bridge & WebSocket Server
 * 
 * Features:
 * 1. Hosts WebSocket server on ws://localhost:8080
 * 2. Serves static web UI directly on http://localhost:8080
 * 3. Direct terminal keypad input (Press [1] for Fire, [2] for Cold, [r] to Reset)
 * 4. HTTP REST API endpoints for IoT / microcontrollers / Stream Decks:
 *    - GET /api/vote?option=fire
 *    - GET /api/vote?option=cold
 *    - GET /api/reset
 *    - GET /api/stats
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const readline = require('readline');

const PORT = process.env.PORT || 8080;

// Arena Vote State
const arenaState = {
  fire: 0,
  cold: 0
};

// MIME types for static server
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

// Create HTTP Server
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // REST API: /api/vote?option=fire|cold
  if (pathname === '/api/vote') {
    const option = parsedUrl.searchParams.get('option');
    if (option === 'fire') {
      arenaState.fire++;
      broadcastUpdate();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, option: 'fire', state: arenaState }));
      return;
    } else if (option === 'cold') {
      arenaState.cold++;
      broadcastUpdate();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, option: 'cold', state: arenaState }));
      return;
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing or invalid option parameter (use fire or cold)' }));
      return;
    }
  }

  // REST API: /api/reset
  if (pathname === '/api/reset') {
    arenaState.fire = 0;
    arenaState.cold = 0;
    broadcastUpdate();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Reset arena', state: arenaState }));
    return;
  }

  // REST API: /api/stats
  if (pathname === '/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(arenaState));
    return;
  }

  // Static File Serving
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

// Attach WebSocket Server
const wss = new WebSocketServer({ server });

function broadcastUpdate() {
  const payload = JSON.stringify({
    type: 'UPDATE',
    data: {
      fire: arenaState.fire,
      cold: arenaState.cold
    }
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // 1 = OPEN
      client.send(payload);
    }
  });
}

wss.on('connection', (ws) => {
  console.log(`[WebSocket] Client connected. Total clients: ${wss.clients.size}`);
  
  // Immediately send initial state to the connected client
  ws.send(JSON.stringify({
    type: 'UPDATE',
    data: {
      fire: arenaState.fire,
      cold: arenaState.cold
    }
  }));

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message);
      if (parsed.type === 'VOTE') {
        if (parsed.option === 'fire') arenaState.fire++;
        if (parsed.option === 'cold') arenaState.cold++;
        broadcastUpdate();
      } else if (parsed.type === 'RESET') {
        arenaState.fire = 0;
        arenaState.cold = 0;
        broadcastUpdate();
      }
    } catch (err) {
      console.warn('[WebSocket] Invalid message format:', message);
    }
  });

  ws.on('close', () => {
    console.log(`[WebSocket] Client disconnected. Remaining: ${wss.clients.size}`);
  });
});

// Terminal Keypad Listener (Raw Mode)
if (process.stdin.isTTY) {
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c') {
      console.log('\nExiting server...');
      process.exit();
    }

    if (str === '1') {
      arenaState.fire++;
      console.log(`🔥 [Terminal Keypad] Vote FIRE -> Fire: ${arenaState.fire} | Cold: ${arenaState.cold}`);
      broadcastUpdate();
    } else if (str === '2') {
      arenaState.cold++;
      console.log(`🥶 [Terminal Keypad] Vote COLD -> Fire: ${arenaState.fire} | Cold: ${arenaState.cold}`);
      broadcastUpdate();
    } else if (str === 'r' || str === 'R') {
      arenaState.fire = 0;
      arenaState.cold = 0;
      console.log(`↺ [Terminal Keypad] Reset arena -> Fire: 0 | Cold: 0`);
      broadcastUpdate();
    }
  });
}

// Start Server
server.listen(PORT, () => {
  console.log('========================================================');
  console.log(`🚀 Live Polling Arena Server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket bridge ready on ws://localhost:${PORT}`);
  console.log(`⌨️  Terminal Keypad active: Press [1] for Fire, [2] for Cold, [r] to reset`);
  console.log(`🌐 HTTP API: http://localhost:${PORT}/api/vote?option=fire|cold`);
  console.log('========================================================');
});
