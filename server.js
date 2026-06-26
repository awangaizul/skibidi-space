const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const supabase = require('./supabase');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'skibidi-space-jwt-secret-2026';
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'couple-app';

app.use(express.json());

// CORS for production
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Please log in first' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

// Wrap async route handlers
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(e => res.status(500).json({ error: e.message }));
}

// Upload helpers
const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
const memoryProfileUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

async function uploadToStorage(buffer, filename, contentType) {
  if (supabase) {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filename, buffer, { contentType, upsert: true });
    if (error) throw new Error('Storage upload failed: ' + error.message);
    return filename;
  }
  // Local fallback
  const fp = path.join(__dirname, 'uploads', filename);
  const dir = path.dirname(fp);
  if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true });
  require('fs').writeFileSync(fp, buffer);
  return filename;
}

async function deleteFromStorage(filename) {
  if (!filename) return;
  if (supabase) {
    await supabase.storage.from(STORAGE_BUCKET).remove([filename]).catch(() => {});
    return;
  }
  const fp = path.join(__dirname, 'uploads', filename);
  if (require('fs').existsSync(fp)) require('fs').unlinkSync(fp);
}

// Serve static files in local dev only
if (!process.env.VERCEL) {
  app.use(express.static('public'));
}

/* ===== Auth ===== */
app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const { nickname, password } = req.body;
  if (!nickname || !password) return res.status(400).json({ error: 'Nickname and password are required' });
  const n = nickname.trim();
  if (n.length < 2) return res.status(400).json({ error: 'Nickname must be at least 2 characters' });
  if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  if (await db.getUserByNickname(n)) return res.status(400).json({ error: 'Nickname already taken' });

  const hash = bcrypt.hashSync(password, 10);
  const spaceId = uuidv4();
  const user = await db.createUser(n, hash, spaceId, true);
  const token = jwt.sign({ id: user.id, nickname: user.nickname, spaceId: user.space_id }, JWT_SECRET, { expiresIn: '30d' });
  const pfpUrl = db.getProfilePhotoUrl(user.profile_photo);
  res.json({ token, user: { id: user.id, nickname: user.nickname, spaceId: user.space_id, isCreator: true, profilePhotoUrl: pfpUrl } });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { nickname, password } = req.body;
  if (!nickname || !password) return res.status(400).json({ error: 'Nickname and password are required' });
  const user = await db.getUserByNickname(nickname.trim());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Wrong nickname or password' });
  }
  const token = jwt.sign({ id: user.id, nickname: user.nickname, spaceId: user.space_id }, JWT_SECRET, { expiresIn: '30d' });
  const pfpUrl = db.getProfilePhotoUrl(user.profile_photo);
  res.json({ token, user: { id: user.id, nickname: user.nickname, spaceId: user.space_id, isCreator: !!user.is_creator, profilePhotoUrl: pfpUrl } });
}));

app.get('/api/auth/me', auth, asyncHandler(async (req, res) => {
  const user = await db.getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const pfpUrl = db.getProfilePhotoUrl(user.profile_photo);
  res.json({ id: user.id, nickname: user.nickname, spaceId: user.space_id, isCreator: !!user.is_creator, profilePhoto: user.profile_photo, profilePhotoUrl: pfpUrl });
}));

app.put('/api/auth/nickname', auth, asyncHandler(async (req, res) => {
  const nickname = (req.body.nickname || '').trim();
  if (nickname.length < 2) return res.status(400).json({ error: 'Nickname must be at least 2 characters' });
  const existing = await db.getUserByNickname(nickname);
  if (existing && existing.id !== req.user.id) return res.status(400).json({ error: 'Nickname already taken' });
  await db.updateUserNickname(req.user.id, nickname);
  const token = jwt.sign({ id: req.user.id, nickname, spaceId: req.user.spaceId }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, nickname });
}));

/* ===== Profile Photo ===== */
app.post('/api/auth/profile-photo', auth, memoryProfileUpload.single('photo'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const ext = path.extname(req.file.originalname);
  const filename = 'profiles/pfp-' + req.user.id + ext;

  const old = await db.getUserProfilePhoto(req.user.id);
  if (old) await deleteFromStorage(old);

  await uploadToStorage(req.file.buffer, filename, req.file.mimetype);
  await db.updateUserProfilePhoto(req.user.id, filename);
  res.json({ profilePhoto: filename, profilePhotoUrl: db.getProfilePhotoUrl(filename) });
}));

app.delete('/api/auth/profile-photo', auth, asyncHandler(async (req, res) => {
  const old = await db.getUserProfilePhoto(req.user.id);
  if (old) await deleteFromStorage(old);
  await db.updateUserProfilePhoto(req.user.id, null);
  res.json({ ok: true });
}));

/* ===== Couple ===== */
app.get('/api/couple', auth, asyncHandler(async (req, res) => {
  const users = (await db.getUsersBySpace(req.user.spaceId)).map(u => ({
    id: u.id, nickname: u.nickname, isCreator: !!u.is_creator,
    profilePhoto: u.profile_photo,
    profilePhotoUrl: db.getProfilePhotoUrl(u.profile_photo)
  }));
  const settings = await db.getCoupleSettings(req.user.spaceId);
  res.json({ users, anniversary: settings.anniversary || null, wheelOptions: settings.wheel_options || [] });
}));

app.put('/api/couple/anniversary', auth, asyncHandler(async (req, res) => {
  const date = (req.body.date || '').trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date format' });
  await db.setAnniversary(req.user.spaceId, date);
  res.json({ anniversary: date });
}));

app.put('/api/couple/wheel', auth, asyncHandler(async (req, res) => {
  const options = Array.isArray(req.body.options) ? req.body.options.filter(o => typeof o === 'string' && o.trim()).map(o => o.trim()).slice(0, 12) : [];
  await db.setWheelOptions(req.user.spaceId, options);
  res.json({ wheelOptions: options });
}));

app.post('/api/couple/join', asyncHandler(async (req, res) => {
  const { nickname, password, inviteCode } = req.body;
  if (!nickname || !password || !inviteCode) return res.status(400).json({ error: 'All fields are required' });
  const n = nickname.trim();
  const code = inviteCode.trim();
  if (n.length < 2) return res.status(400).json({ error: 'Nickname must be at least 2 characters' });
  if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
  if (await db.getUserByNickname(n)) return res.status(400).json({ error: 'Nickname already taken' });
  if (!await db.spaceExists(code)) return res.status(400).json({ error: 'Invalid invite code. Ask your partner for the correct code.' });

  const hash = bcrypt.hashSync(password, 10);
  const user = await db.createUser(n, hash, code, false);
  const token = jwt.sign({ id: user.id, nickname: user.nickname, spaceId: user.space_id }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, nickname: user.nickname, spaceId: user.space_id, isCreator: false } });
}));

/* ===== Events ===== */
app.get('/api/events', auth, asyncHandler(async (req, res) => {
  const events = (await db.getEvents(req.user.spaceId)).map(e => ({
    id: e.id, title: e.title, date: e.date,
    startTime: e.start_time, endTime: e.end_time,
    notes: e.notes, createdBy: e.created_by,
    notified1Day: !!e.notified_1day, notified5Hours: !!e.notified_5hours, notified1Hour: !!e.notified_1hour
  }));
  res.json(events);
}));

app.post('/api/events', auth, asyncHandler(async (req, res) => {
  const { title, date, startTime, endTime, notes } = req.body;
  if (!title || !date || !startTime || !endTime) return res.status(400).json({ error: 'Missing required fields' });
  const event = await db.addEvent(req.user.spaceId, {
    title: title.trim(), date, startTime, endTime,
    notes: (notes || '').trim(), createdBy: req.user.nickname
  });
  res.json({ id: event.id });
}));

app.delete('/api/events/:id', auth, asyncHandler(async (req, res) => {
  await db.deleteEvent(req.user.spaceId, req.params.id);
  res.json({ ok: true });
}));

app.put('/api/events/:id/notifications', auth, asyncHandler(async (req, res) => {
  const updates = {};
  if (req.body.notified1Day !== undefined) updates.notified_1day = req.body.notified1Day ? 1 : 0;
  if (req.body.notified5Hours !== undefined) updates.notified_5hours = req.body.notified5Hours ? 1 : 0;
  if (req.body.notified1Hour !== undefined) updates.notified_1hour = req.body.notified1Hour ? 1 : 0;
  await db.updateEvent(req.user.spaceId, req.params.id, updates);
  res.json({ ok: true });
}));

/* ===== Media ===== */
function mapMedia(m, userId) {
  return {
    id: m.id, type: m.type, filePath: m.file_path,
    url: db.getMediaUrl(m.file_path),
    mimeType: m.mime_type, caption: m.caption,
    uploadedBy: m.uploaded_by, createdAt: m.created_at,
    likes: Array.isArray(m.likes) ? m.likes : [],
    likeCount: Array.isArray(m.likes) ? m.likes.length : 0,
    likedByMe: Array.isArray(m.likes) && m.likes.includes(userId),
    comments: Array.isArray(m.comments) ? m.comments.map(c => ({
      id: c.id, userId: c.user_id, nickname: c.nickname,
      text: c.text, createdAt: c.created_at, isMine: c.user_id === userId
    })) : []
  };
}

app.get('/api/media', auth, asyncHandler(async (req, res) => {
  const media = (await db.getMedia(req.user.spaceId)).map(m => mapMedia(m, req.user.id));
  res.json(media);
}));

app.post('/api/media', auth, memoryUpload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const type = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
  const ext = path.extname(req.file.originalname);
  const filename = 'media/' + uuidv4() + ext;

  await uploadToStorage(req.file.buffer, filename, req.file.mimetype);
  const media = await db.addMedia(req.user.spaceId, {
    type, filePath: filename, mimeType: req.file.mimetype,
    caption: (req.body.caption || '').trim(), uploadedBy: req.user.nickname
  });
  res.json({ id: media.id, filePath: filename, url: db.getMediaUrl(filename) });
}));

app.delete('/api/media/:id', auth, asyncHandler(async (req, res) => {
  const media = await db.deleteMedia(req.user.spaceId, req.params.id);
  if (media) await deleteFromStorage(media.file_path);
  res.json({ ok: true });
}));

app.post('/api/media/:id/like', auth, asyncHandler(async (req, res) => {
  const result = await db.toggleLike(req.user.spaceId, req.params.id, req.user.id);
  if (!result) return res.status(404).json({ error: 'Memory not found' });
  res.json(result);
}));

app.post('/api/media/:id/comments', auth, asyncHandler(async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Comment cannot be empty' });
  if (text.length > 500) return res.status(400).json({ error: 'Comment too long (max 500 chars)' });
  const comment = await db.addComment(req.user.spaceId, req.params.id, req.user.id, req.user.nickname, text);
  if (!comment) return res.status(404).json({ error: 'Memory not found' });
  res.json({ id: comment.id, userId: comment.user_id, nickname: comment.nickname, text: comment.text, createdAt: comment.created_at, isMine: true });
}));

app.delete('/api/media/:id/comments/:commentId', auth, asyncHandler(async (req, res) => {
  const result = await db.deleteComment(req.user.spaceId, req.params.id, req.params.commentId, req.user.id);
  if (!result) return res.status(404).json({ error: 'Comment not found' });
  res.json({ ok: true });
}));

/* ===== Love Notes ===== */
app.get('/api/love-notes', auth, asyncHandler(async (req, res) => {
  const notes = await db.getLoveNotes(req.user.spaceId);
  const users = await db.getUsersBySpace(req.user.spaceId);
  const userMap = new Map(users.map(u => [u.id, u]));
  const now = Date.now();
  const mapped = notes.map(n => {
    const sender = userMap.get(n.from_user_id) || {};
    const recipient = userMap.get(n.to_user_id) || {};
    const unlockTime = new Date(n.unlock_at).getTime();
    const isUnlocked = !isNaN(unlockTime) && now >= unlockTime;
    const isMine = n.from_user_id === req.user.id;
    const showContent = isUnlocked || isMine;
    return {
      id: n.id,
      from: { id: n.from_user_id, nickname: sender.nickname || 'Unknown' },
      to: { id: n.to_user_id, nickname: recipient.nickname || 'Unknown' },
      title: n.title,
      content: showContent ? n.content : null,
      unlockAt: n.unlock_at,
      createdAt: n.created_at,
      isUnlocked,
      isMine,
      canDelete: isMine
    };
  });
  res.json(mapped);
}));

app.post('/api/love-notes', auth, asyncHandler(async (req, res) => {
  const { toUserId, title, content, unlockAt } = req.body;
  if (!toUserId || !content || !content.trim()) return res.status(400).json({ error: 'Recipient and message are required' });
  if (toUserId === req.user.id) return res.status(400).json({ error: 'You cannot send a love note to yourself' });
  const recipient = await db.getUserById(toUserId);
  if (!recipient || recipient.space_id !== req.user.spaceId) return res.status(400).json({ error: 'Recipient not found in your space' });

  const unlock = unlockAt ? new Date(unlockAt) : new Date();
  if (isNaN(unlock.getTime())) return res.status(400).json({ error: 'Invalid unlock time' });

  const note = await db.addLoveNote(req.user.spaceId, {
    fromUserId: req.user.id,
    title: (title || '').trim() || 'Untitled',
    toUserId,
    content: content.trim(),
    unlockAt: unlock.toISOString()
  });
  res.json({ id: note.id, title: note.title, unlockAt: note.unlock_at, createdAt: note.created_at });
}));

app.delete('/api/love-notes/:id', auth, asyncHandler(async (req, res) => {
  const ok = await db.deleteLoveNote(req.user.spaceId, req.params.id, req.user.id);
  if (!ok) return res.status(404).json({ error: 'Love note not found' });
  res.json({ ok: true });
}));

/* ===== Date Checklist ===== */
app.get('/api/dates', auth, asyncHandler(async (req, res) => {
  const items = (await db.getDateChecklist(req.user.spaceId)).map(d => ({
    id: d.id,
    title: d.title,
    description: d.description,
    isDone: !!d.is_done,
    doneBy: d.done_by,
    doneAt: d.done_at,
    evidenceFilePath: d.evidence_file_path,
    evidenceUrl: db.getMediaUrl(d.evidence_file_path),
    createdAt: d.created_at,
    createdBy: d.created_by
  }));
  res.json(items);
}));

app.post('/api/dates', auth, asyncHandler(async (req, res) => {
  const { title, description } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  const item = await db.addDateChecklist(req.user.spaceId, {
    title: title.trim(),
    description: (description || '').trim(),
    createdBy: req.user.nickname
  });
  res.json({ id: item.id, title: item.title, description: item.description, createdAt: item.created_at });
}));

app.put('/api/dates/:id', auth, memoryUpload.single('evidence'), asyncHandler(async (req, res) => {
  const updates = {};
  if (req.body.isDone !== undefined) {
    updates.is_done = req.body.isDone === 'true' ? 1 : 0;
    updates.done_by = updates.is_done ? req.user.nickname : null;
    updates.done_at = updates.is_done ? new Date().toISOString() : null;
  }
  if (req.file) {
    const ext = path.extname(req.file.originalname);
    const filename = 'dates/' + req.params.id + ext;
    await uploadToStorage(req.file.buffer, filename, req.file.mimetype);
    updates.evidence_file_path = filename;
  }
  const updated = await db.updateDateChecklist(req.user.spaceId, req.params.id, updates);
  if (!updated) return res.status(404).json({ error: 'Date idea not found' });
  res.json({ ok: true, evidenceUrl: updates.evidence_file_path ? db.getMediaUrl(updates.evidence_file_path) : null });
}));

app.delete('/api/dates/:id', auth, asyncHandler(async (req, res) => {
  const item = await db.deleteDateChecklist(req.user.spaceId, req.params.id);
  if (item && item.evidence_file_path) await deleteFromStorage(item.evidence_file_path);
  res.json({ ok: true });
}));

/* ===== Export for Vercel ===== */
module.exports = app;

// Only start the server when run directly (not in Vercel)
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log('Skibidi Space running at http://localhost:' + PORT);
    if (!supabase) console.log('Running with local JSON file (Supabase not configured)');
  });
}
