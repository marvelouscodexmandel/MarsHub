// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Simple in-memory stores (replace with DB for production)
const users = new Map(); // socketId -> user
const online = new Map(); // userId -> {username, color}
const messages = []; // keep last 1000

// Multer for uploads (100MB)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('WARNING: Google OAuth client ID/secret not provided in environment variables. /auth/google will fail until these are set.');
}

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
}, (accessToken, refreshToken, profile, done) => {
  try {
    const email = (profile.emails && profile.emails[0] && profile.emails[0].value) || '';
    // Allow gmail.com only
    if (!email.endsWith('@gmail.com')) {
      return done(null, false, { message: 'Only Gmail accounts are allowed.' });
    }
    // Auto-generate username displayName + random number
    const displayName = profile.displayName || (profile.name && (profile.name.givenName + ' ' + profile.name.familyName)) || 'user';
    const sanitized = displayName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
    const username = `${sanitized}_${Math.floor(Math.random() * 900 + 100)}`;
    const user = {
      id: profile.id,
      username,
      displayName,
      emails: profile.emails,
      photos: profile.photos,
      verified: true,
      exclusive: true,
      color: `hsl(${Math.floor(Math.random()*360)},70%,50%)`
    };
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

// Routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/?auth=failed' }), (req, res) => {
  // successful
  res.redirect('/');
});

app.get('/api/user', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json({ user: req.user });
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${path.basename(req.file.path)}`;
  res.json({ url, original: req.file.originalname, size: req.file.size, mime: req.file.mimetype });
});

app.get('/uploads/:name', (req, res) => {
  const file = path.join(uploadDir, req.params.name);
  res.sendFile(file);
});

app.get('/logout', (req, res) => {
  req.logout(() => {});
  res.redirect('/');
});

// Meta webhook placeholders
app.get('/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});
app.post('/webhooks/whatsapp', (req, res) => {
  console.log('WhatsApp webhook', JSON.stringify(req.body).slice(0,2000));
  res.sendStatus(200);
});

// Serve static
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

// Very small AI filter
function isBlocked(text) {
  if (!text) return false;
  const blockers = ['spam', 'scam', 'phish', 'malware'];
  const t = text.toLowerCase();
  return blockers.some(b => t.includes(b));
}

// Socket.io
io.on('connection', (socket) => {
  // When a client provides their user details
  socket.on('join', (user) => {
    if (!user) return;
    users.set(socket.id, user);
    online.set(user.id || socket.id, { username: user.username, color: user.color });
    socket.emit('history', messages);
    io.emit('online', Array.from(online.values()));
  });

  socket.on('typing', (data) => {
    const user = users.get(socket.id);
    if (!user) return;
    socket.broadcast.emit('typing', { username: user.username });
  });

  socket.on('newMessage', (msg) => {
    const user = users.get(socket.id) || { username: 'anon', color: '#ccc', id: socket.id };
    if (isBlocked(msg.text || msg.file?.name)) {
      socket.emit('blocked', { reason: 'Message blocked by AI filter' });
      return;
    }
    const message = {
      id: Date.now() + '_' + Math.floor(Math.random()*1000),
      user: { id: user.id || socket.id, username: user.username, color: user.color, verified: user.verified, exclusive: user.exclusive },
      text: msg.text || null,
      time: new Date().toISOString(),
      reactions: {},
      replyTo: msg.replyTo || null,
      pinned: false,
      file: msg.file || null,
      readBy: [],
      voice: msg.voice || null
    };
    messages.push(message);
    while (messages.length > 1000) messages.shift();
    io.emit('newMessage', message);
  });

  socket.on('reaction', ({ messageId, emoji, username }) => {
    const m = messages.find(x => x.id === messageId);
    if (!m) return;
    m.reactions[emoji] = (m.reactions[emoji] || 0) + 1;
    io.emit('reaction', { messageId, emoji, count: m.reactions[emoji] });
  });

  socket.on('read', ({ messageId, userId }) => {
    const m = messages.find(x => x.id === messageId);
    if (!m) return;
    if (!m.readBy.includes(userId)) m.readBy.push(userId);
    io.emit('read', { messageId, readBy: m.readBy });
  });

  socket.on('delete', ({ messageId }) => {
    const idx = messages.findIndex(x => x.id === messageId);
    if (idx !== -1) {
      messages.splice(idx,1);
      io.emit('delete', { messageId });
    }
  });

  socket.on('pin', ({ messageId }) => {
    const m = messages.find(x => x.id === messageId);
    if (m) {
      m.pinned = !m.pinned;
      io.emit('pin', { messageId, pinned: m.pinned });
    }
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) {
      users.delete(socket.id);
      online.delete(user.id || socket.id);
      io.emit('online', Array.from(online.values()));
    }
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
