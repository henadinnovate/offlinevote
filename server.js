/**
 * OFFLINE Live Arena (offlinevote.falhen.com) — Hardware Bridge, Auth DB & WebSocket Server
 *
 * Features:
 * 1. Hosts WebSocket server & static web UI on PORT (default 8080)
 * 2. Private SQLite Database (data/arena_auth.db) for Admin Auth, Vote Persistence & Protection Settings
 * 3. Connected to falhen.com Mail Domain (mail.falhen.com / sunfire.mxrouting.net:993 IMAPS)
 * 4. Cryptographic PBKDF2-SHA512 & SHA-256 verification + HMAC session tokens & brute-force rate limiting
 * 5. Configurable Arena Protection (Protect Reset, Lock Voting, Protect Demo & Settings)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const tls = require('tls');
const { WebSocketServer } = require('ws');
const readline = require('readline');

// Load private .env if present (never committed to git)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  });
}

const PORT = process.env.PORT || 8080;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Cryptographic constants (No plaintext credentials in code)
const DEFAULT_AUTH_SPEC = {
  emailSha256: process.env.ADMIN_EMAIL_SHA256 || 'f8b774dea316fc0a6e7eee606eb49f8146b44c884077de4686750b56dc9886c4',
  userSha256: process.env.ADMIN_USER_SHA256 || '33d0f191df8a8b1c206e0b3d9f7e18d6e1c93c1ee1a3b89c465acb8004c83a9d',
  passSha256: process.env.ADMIN_PASS_SHA256 || '72cb0f23437311167f7a8823c98c12e7a8941c2b43256dc7db4eba8f03172f72',
  pbkdf2Salt: process.env.ADMIN_PBKDF2_SALT || 'falhen_arena_salt_2026_v1',
  passPbkdf2: '04a23b004349ee1e141ed015eccb9dfe390fc4599dc1820718d3623599a01db52bc65fd70bd409986d60c5ec89f7640b99c4d730cd24bd2d7de1a9470939106a',
  mailDomain: process.env.MAIL_DOMAIN || 'falhen.com',
  webmailUrl: process.env.WEBMAIL_PORTAL_URL || 'https://mail.falhen.com',
  imapHost: process.env.IMAP_HOST || 'sunfire.mxrouting.net',
  imapPort: Number(process.env.IMAP_PORT) || 993,
  smtpHost: process.env.SMTP_HOST || 'sunfire.mxrouting.net',
  smtpPort: Number(process.env.SMTP_PORT) || 465
};

// Arena State & Protection State
const arenaState = {
  fire: 0,
  cold: 0,
  protection: {
    protectReset: true,
    protectSettings: true,
    protectDemo: true,
    lockVoting: false
  }
};

// Private SQLite Database Initialization
let db = null;
function initPrivateDatabase() {
  try {
    const { DatabaseSync } = require('node:sqlite');
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    }
    const dbPath = path.join(dataDir, 'arena_auth.db');
    db = new DatabaseSync(dbPath);
    try {
      fs.chmodSync(dbPath, 0o600);
    } catch (_) {}

    db.exec(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        email_sha256 TEXT NOT NULL,
        username_sha256 TEXT NOT NULL,
        password_sha256 TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        password_pbkdf2 TEXT NOT NULL,
        mail_domain TEXT NOT NULL,
        webmail_url TEXT NOT NULL,
        imap_host TEXT NOT NULL,
        imap_port INTEGER NOT NULL,
        smtp_host TEXT NOT NULL,
        smtp_port INTEGER NOT NULL,
        role TEXT DEFAULT 'owner',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS arena_protection (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        protect_reset INTEGER DEFAULT 1,
        protect_settings INTEGER DEFAULT 1,
        protect_demo INTEGER DEFAULT 1,
        lock_voting INTEGER DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS arena_votes (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        fire INTEGER DEFAULT 0,
        cold INTEGER DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `);

    const existingAdmin = db.prepare('SELECT id FROM admin_users WHERE id = 1').get();
    if (!existingAdmin) {
      const seedEmail = process.env.ADMIN_EMAIL || 'admin@falhen.com';
      const seedUser = process.env.ADMIN_USERNAME || 'admin';
      db.prepare(`
        INSERT INTO admin_users (
          id, email, username, email_sha256, username_sha256, password_sha256,
          password_salt, password_pbkdf2, mail_domain, webmail_url,
          imap_host, imap_port, smtp_host, smtp_port, role, created_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'owner', datetime('now'))
      `).run(
        seedEmail,
        seedUser,
        DEFAULT_AUTH_SPEC.emailSha256,
        DEFAULT_AUTH_SPEC.userSha256,
        DEFAULT_AUTH_SPEC.passSha256,
        DEFAULT_AUTH_SPEC.pbkdf2Salt,
        DEFAULT_AUTH_SPEC.passPbkdf2,
        DEFAULT_AUTH_SPEC.mailDomain,
        DEFAULT_AUTH_SPEC.webmailUrl,
        DEFAULT_AUTH_SPEC.imapHost,
        DEFAULT_AUTH_SPEC.imapPort,
        DEFAULT_AUTH_SPEC.smtpHost,
        DEFAULT_AUTH_SPEC.smtpPort
      );
    }

    const protRow = db.prepare('SELECT * FROM arena_protection WHERE id = 1').get();
    if (protRow) {
      arenaState.protection.protectReset = Boolean(protRow.protect_reset);
      arenaState.protection.protectSettings = Boolean(protRow.protect_settings);
      arenaState.protection.protectDemo = Boolean(protRow.protect_demo);
      arenaState.protection.lockVoting = Boolean(protRow.lock_voting);
    } else {
      db.prepare(`
        INSERT INTO arena_protection (id, protect_reset, protect_settings, protect_demo, lock_voting, updated_at)
        VALUES (1, 1, 1, 1, 0, datetime('now'))
      `).run();
    }

    const voteRow = db.prepare('SELECT * FROM arena_votes WHERE id = 1').get();
    if (voteRow) {
      arenaState.fire = Number(voteRow.fire) || 0;
      arenaState.cold = Number(voteRow.cold) || 0;
    } else {
      db.prepare(`
        INSERT INTO arena_votes (id, fire, cold, updated_at)
        VALUES (1, 0, 0, datetime('now'))
      `).run();
    }
  } catch (err) {
    console.warn('[DB] Running with in-memory cryptographic store:', err.message);
  }
}

initPrivateDatabase();

function persistVotesToDb() {
  if (!db) return;
  try {
    db.prepare(`UPDATE arena_votes SET fire = ?, cold = ?, updated_at = datetime('now') WHERE id = 1`)
      .run(arenaState.fire, arenaState.cold);
  } catch (_) {}
}

function persistProtectionToDb() {
  if (!db) return;
  try {
    db.prepare(`
      UPDATE arena_protection
      SET protect_reset = ?, protect_settings = ?, protect_demo = ?, lock_voting = ?, updated_at = datetime('now')
      WHERE id = 1
    `).run(
      arenaState.protection.protectReset ? 1 : 0,
      arenaState.protection.protectSettings ? 1 : 0,
      arenaState.protection.protectDemo ? 1 : 0,
      arenaState.protection.lockVoting ? 1 : 0
    );
  } catch (_) {}
}

// Brute-force Rate Limiting
const loginAttempts = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry) return { allowed: true };
  if (entry.lockUntil && now < entry.lockUntil) {
    const waitSec = Math.ceil((entry.lockUntil - now) / 1000);
    return { allowed: false, waitSeconds: waitSec };
  }
  if (entry.lockUntil && now >= entry.lockUntil) {
    loginAttempts.delete(ip);
  }
  return { allowed: true };
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, lockUntil: null };
  entry.count += 1;
  if (entry.count >= 6) {
    entry.lockUntil = now + 2 * 60 * 1000; // 2 minute lockout
  }
  loginAttempts.set(ip, entry);
}

function clearRateLimit(ip) {
  loginAttempts.delete(ip);
}

// Cryptographic Helpers
function sha256Hex(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch (_) {
    return false;
  }
}

function createAdminToken(payload) {
  const data = Buffer.from(JSON.stringify({
    ...payload,
    exp: Date.now() + 8 * 3600 * 1000 // 8 hours
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyAdminToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function extractAdminSession(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    const session = verifyAdminToken(authHeader.slice(7).trim());
    if (session) return session;
  }
  const cookieHeader = req.headers['cookie'] || '';
  const match = cookieHeader.match(/(?:^|;\s*)offline_arena_session=([^;]+)/);
  if (match) {
    return verifyAdminToken(decodeURIComponent(match[1]));
  }
  return null;
}

// Verify Mail Domain TLS Reachability (sunfire.mxrouting.net:993)
function probeMailDomainHandshake(host = DEFAULT_AUTH_SPEC.imapHost, port = DEFAULT_AUTH_SPEC.imapPort) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = tls.connect({ host, port, timeout: 2200, rejectUnauthorized: false }, () => {
      if (!settled) {
        settled = true;
        socket.end();
        resolve({ reachable: true, host, port });
      }
    });
    socket.on('error', () => {
      if (!settled) {
        settled = true;
        resolve({ reachable: false, host, port });
      }
    });
    socket.on('timeout', () => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve({ reachable: false, host, port });
      }
    });
  });
}

function verifyCredentialsAgainstDb(identifier, password) {
  const normId = String(identifier || '').trim().toLowerCase();
  const rawPass = String(password || '').trim();
  const idSha = sha256Hex(normId);
  const passSha = sha256Hex(rawPass);

  let record = DEFAULT_AUTH_SPEC;
  let storedEmail = process.env.ADMIN_EMAIL || (normId.includes('@') ? normId : `${normId}@falhen.com`);
  let storedUsername = process.env.ADMIN_USERNAME || normId.split('@')[0];

  if (db) {
    try {
      const row = db.prepare('SELECT * FROM admin_users WHERE id = 1').get();
      if (row) {
        record = {
          emailSha256: row.email_sha256,
          userSha256: row.username_sha256,
          passSha256: row.password_sha256,
          pbkdf2Salt: row.password_salt,
          passPbkdf2: row.password_pbkdf2,
          mailDomain: row.mail_domain,
          webmailUrl: row.webmail_url,
          imapHost: row.imap_host,
          imapPort: row.imap_port,
          smtpHost: row.smtp_host,
          smtpPort: row.smtp_port
        };
        storedEmail = row.email;
        storedUsername = row.username;
      }
    } catch (_) {}
  }

  const idMatches = safeEqualHex(idSha, record.emailSha256) || safeEqualHex(idSha, record.userSha256);
  const computedPbkdf2 = crypto.pbkdf2Sync(rawPass, record.pbkdf2Salt, 120000, 64, 'sha512').toString('hex');
  const passMatches = safeEqualHex(computedPbkdf2, record.passPbkdf2) && safeEqualHex(passSha, record.passSha256);

  if (!idMatches || !passMatches) {
    return null;
  }

  return {
    email: storedEmail,
    username: storedUsername,
    mailDomain: record.mailDomain,
    webmailUrl: record.webmailUrl,
    imapHost: record.imapHost,
    imapPort: record.imapPort,
    smtpHost: record.smtpHost,
    smtpPort: record.smtpPort
  };
}

// MIME types for static server
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 32768) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

// Create HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Security & CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Block direct access to private files (.env, data/, *.db)
  if (
    pathname.startsWith('/data') ||
    pathname.startsWith('/.env') ||
    pathname.startsWith('/.git') ||
    pathname.startsWith('/.hallmark') ||
    pathname.endsWith('.db') ||
    pathname.endsWith('.sqlite')
  ) {
    sendJson(res, 403, { error: 'Access denied to private storage' });
    return;
  }

  // AUTH API: POST /api/auth/login
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const rate = checkRateLimit(clientIp);
    if (!rate.allowed) {
      sendJson(res, 429, { error: `Too many sign-in attempts. Wait ${rate.waitSeconds}s.` });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const identifier = body.email || body.username || '';
      const password = body.password || '';
      const verified = verifyCredentialsAgainstDb(identifier, password);

      if (!verified) {
        recordFailedLogin(clientIp);
        sendJson(res, 401, { error: 'Invalid username/email or password.' });
        return;
      }

      clearRateLimit(clientIp);
      const mailProbe = await probeMailDomainHandshake(verified.imapHost, verified.imapPort);
      const token = createAdminToken({
        email: verified.email,
        username: verified.username,
        mailDomain: verified.mailDomain,
        role: 'owner'
      });

      sendJson(
        res,
        200,
        {
          ok: true,
          authenticated: true,
          token,
          admin: {
            email: verified.email,
            username: verified.username,
            mailDomain: verified.mailDomain,
            webmailUrl: verified.webmailUrl,
            imapHost: verified.imapHost,
            imapPort: verified.imapPort,
            mailServerReachable: mailProbe.reachable
          },
          account: {
            email: verified.email,
            username: verified.username,
            domain: verified.mailDomain
          },
          mailConnection: {
            host: 'mail.falhen.com',
            imapsHost: verified.imapHost,
            imapsPort: verified.imapPort,
            reachable: mailProbe.reachable
          },
          protection: {
            ...arenaState.protection,
            votingLocked: arenaState.protection.lockVoting
          }
        },
        {
          'Set-Cookie': `offline_arena_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800`
        }
      );
    } catch (err) {
      sendJson(res, 400, { error: 'Invalid sign-in request.' });
    }
    return;
  }

  // AUTH API: GET /api/auth/session
  if (pathname === '/api/auth/session' && req.method === 'GET') {
    const session = extractAdminSession(req);
    if (!session) {
      sendJson(res, 200, {
        authenticated: false,
        protection: {
          ...arenaState.protection,
          votingLocked: arenaState.protection.lockVoting
        }
      });
      return;
    }
    sendJson(res, 200, {
      authenticated: true,
      identity: session.email,
      mailDomain: session.mailDomain || 'falhen.com',
      admin: {
        email: session.email,
        username: session.username,
        mailDomain: session.mailDomain || 'falhen.com',
        webmailUrl: DEFAULT_AUTH_SPEC.webmailUrl,
        imapHost: DEFAULT_AUTH_SPEC.imapHost
      },
      mailConnection: {
        host: 'mail.falhen.com',
        imapsHost: DEFAULT_AUTH_SPEC.imapHost,
        imapsPort: DEFAULT_AUTH_SPEC.imapPort,
        reachable: true
      },
      protection: {
        ...arenaState.protection,
        votingLocked: arenaState.protection.lockVoting
      }
    });
    return;
  }

  // AUTH API: POST /api/auth/logout
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    sendJson(
      res,
      200,
      { success: true },
      {
        'Set-Cookie': 'offline_arena_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
      }
    );
    return;
  }

  // PROTECTION API: GET/POST /api/protection
  if (pathname === '/api/protection') {
    if (req.method === 'GET') {
      sendJson(res, 200, {
        protection: {
          ...arenaState.protection,
          votingLocked: arenaState.protection.lockVoting
        }
      });
      return;
    }
    if (req.method === 'POST') {
      const session = extractAdminSession(req);
      if (!session) {
        sendJson(res, 401, { error: 'Admin authentication required to update protection.' });
        return;
      }
      try {
        const body = await readJsonBody(req);
        if (typeof body.protectReset === 'boolean') arenaState.protection.protectReset = body.protectReset;
        if (typeof body.protectSettings === 'boolean') arenaState.protection.protectSettings = body.protectSettings;
        if (typeof body.protectDemo === 'boolean') arenaState.protection.protectDemo = body.protectDemo;
        if (typeof body.lockVoting === 'boolean') arenaState.protection.lockVoting = body.lockVoting;
        if (typeof body.votingLocked === 'boolean') arenaState.protection.lockVoting = body.votingLocked;
        persistProtectionToDb();
        broadcastUpdate();
        sendJson(res, 200, {
          success: true,
          protection: {
            ...arenaState.protection,
            votingLocked: arenaState.protection.lockVoting
          }
        });
      } catch (err) {
        sendJson(res, 400, { error: 'Invalid protection payload.' });
      }
      return;
    }
  }

  // REST API: /api/vote?option=fire|cold
  if (pathname === '/api/vote') {
    if (arenaState.protection.lockVoting) {
      sendJson(res, 423, { error: 'Live voting is currently paused by the stage host.', state: arenaState });
      return;
    }
    const option = parsedUrl.searchParams.get('option');
    if (option === 'fire') {
      arenaState.fire++;
      persistVotesToDb();
      broadcastUpdate();
      sendJson(res, 200, { success: true, option: 'fire', state: arenaState });
      return;
    } else if (option === 'cold') {
      arenaState.cold++;
      persistVotesToDb();
      broadcastUpdate();
      sendJson(res, 200, { success: true, option: 'cold', state: arenaState });
      return;
    } else {
      sendJson(res, 400, { error: 'Missing or invalid option parameter (use fire or cold)' });
      return;
    }
  }

  // REST API: /api/reset
  if (pathname === '/api/reset') {
    if (arenaState.protection.protectReset) {
      const session = extractAdminSession(req);
      if (!session) {
        sendJson(res, 401, { error: 'Reset is protected. Sign in as administrator first.' });
        return;
      }
    }
    arenaState.fire = 0;
    arenaState.cold = 0;
    persistVotesToDb();
    broadcastUpdate();
    sendJson(res, 200, { success: true, message: 'Reset arena', state: arenaState });
    return;
  }

  // REST API: /api/stats
  if (pathname === '/api/stats') {
    sendJson(res, 200, arenaState);
    return;
  }

  // Static File Serving
  const safePath = path.normalize(pathname === '/' ? 'index.html' : pathname).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(__dirname, safePath);
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
      cold: arenaState.cold,
      protection: {
        ...arenaState.protection,
        votingLocked: arenaState.protection.lockVoting
      }
    }
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'UPDATE',
    data: {
      fire: arenaState.fire,
      cold: arenaState.cold,
      protection: {
        ...arenaState.protection,
        votingLocked: arenaState.protection.lockVoting
      }
    }
  }));

  ws.on('message', (message) => {
    try {
      const parsed = JSON.parse(message);
      if (parsed.type === 'VOTE') {
        if (arenaState.protection.lockVoting) return;
        if (parsed.option === 'fire') arenaState.fire++;
        if (parsed.option === 'cold') arenaState.cold++;
        persistVotesToDb();
        broadcastUpdate();
      } else if (parsed.type === 'RESET') {
        if (arenaState.protection.protectReset) {
          const verified = verifyAdminToken(parsed.token);
          if (!verified) return;
        }
        arenaState.fire = 0;
        arenaState.cold = 0;
        persistVotesToDb();
        broadcastUpdate();
      }
    } catch (err) {
      console.warn('[WebSocket] Invalid message format');
    }
  });
});

// Terminal Keypad Listener (Raw Mode)
if (process.stdin.isTTY) {
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  process.stdin.on('keypress', (str, key) => {
    if (key && key.ctrl && key.name === 'c') {
      process.exit();
    }

    if (str === '1') {
      if (!arenaState.protection.lockVoting) {
        arenaState.fire++;
        persistVotesToDb();
        broadcastUpdate();
      }
    } else if (str === '2') {
      if (!arenaState.protection.lockVoting) {
        arenaState.cold++;
        persistVotesToDb();
        broadcastUpdate();
      }
    } else if (str === 'r' || str === 'R') {
      arenaState.fire = 0;
      arenaState.cold = 0;
      persistVotesToDb();
      broadcastUpdate();
    }
  });
}

// Start Server
server.listen(PORT, () => {
  console.log('========================================================');
  console.log(`Live Polling Arena Server running on http://localhost:${PORT}`);
  console.log(`WebSocket bridge ready on ws://localhost:${PORT}`);
  console.log(`Private Auth DB & falhen.com Mail Domain active`);
  console.log('========================================================');
});
