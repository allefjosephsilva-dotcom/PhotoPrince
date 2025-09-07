// server.js - Allef PhotoShow (authenticated admin, fixed password 'alef1235')
// Usage:
//   npm install
//   node server.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const DATA_FILE = path.join(__dirname, 'data', 'metadata.json');
const SESSIONS_FILE = path.join(__dirname, 'data', 'sessions.json');

const ADMIN_PASSWORD = 'alef1235'; // fixed password

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ albums: {}, photos: {}, highlights: [], likes: {}, comments: {}, model: {} }, null, 2));
if (!fs.existsSync(SESSIONS_FILE)) fs.writeFileSync(SESSIONS_FILE, JSON.stringify({}, null, 2));

function readData(){ return JSON.parse(fs.readFileSync(DATA_FILE)); }
function writeData(d){ fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }
function readSessions(){ return JSON.parse(fs.readFileSync(SESSIONS_FILE)); }
function writeSessions(s){ fs.writeFileSync(SESSIONS_FILE, JSON.stringify(s, null, 2)); }

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOAD_DIR); },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    cb(null, id + ext);
  }
});
const upload = multer({ storage });

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended:true }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/', express.static(path.join(__dirname, 'public')));

// Middleware: check admin token for protected routes
function requireAuth(req, res, next){
  const token = req.headers['x-admin-token'] || req.query.token;
  if(!token) return res.status(401).json({ok:false, error:'no token'});
  const sessions = readSessions();
  if(sessions[token] && sessions[token].valid){
    sessions[token].last = Date.now();
    writeSessions(sessions);
    req.admin = true;
    return next();
  }
  return res.status(401).json({ok:false, error:'invalid token'});
}

// Login route (returns token)
app.post('/api/login', (req,res)=>{
  const { password } = req.body;
  if(password !== ADMIN_PASSWORD) return res.status(401).json({ok:false, error:'invalid password'});
  const token = crypto.randomBytes(18).toString('hex');
  const sessions = readSessions();
  sessions[token] = { created: Date.now(), last: Date.now(), valid: true };
  writeSessions(sessions);
  res.json({ ok:true, token });
});

// API: list photos (public)
app.get('/api/photos', (req, res) => {
  const data = readData();
  const photos = Object.entries(data.photos).map(([id, p]) => {
    return Object.assign({ id }, p, { url: '/uploads/' + p.filename, likes: data.likes[id]||0, comments: data.comments[id]||[] });
  });
  res.json({ ok:true, photos, albums: data.albums, highlights: data.highlights, model: data.model });
});

// API: create album (protected)
app.post('/api/albums', requireAuth, (req, res) => {
  const { name } = req.body;
  if(!name) return res.status(400).json({ok:false, error:'name required'});
  const data = readData();
  const id = 'a_' + Date.now().toString(36);
  data.albums[id] = { id, name, cover: '' };
  writeData(data);
  res.json({ok:true, album: data.albums[id]});
});

// API: upload photo(s) (protected)
app.post('/api/upload', requireAuth, upload.array('photos', 200), (req, res) => {
  const albumId = req.body.albumId || '';
  const data = readData();
  for(const f of req.files){
    const id = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
    data.photos[id] = { filename: f.filename, albumId, createdAt: Date.now(), featured:false };
    if(albumId && data.albums[albumId] && !data.albums[albumId].cover) data.albums[albumId].cover = id;
  }
  writeData(data);
  res.json({ ok:true });
});

// API: like a photo (public)
app.post('/api/photo/:id/like', (req, res) => {
  const id = req.params.id;
  const data = readData();
  data.likes[id] = (data.likes[id]||0) + 1;
  writeData(data);
  res.json({ ok:true, likes: data.likes[id] });
});

// API: comment (public)
app.post('/api/photo/:id/comment', (req, res) => {
  const id = req.params.id;
  const { name, text } = req.body;
  if(!text) return res.status(400).json({ok:false, error:'text required'});
  const data = readData();
  data.comments[id] = data.comments[id] || [];
  data.comments[id].push({ name: name||'Anônimo', text, ts: Date.now() });
  writeData(data);
  res.json({ ok:true });
});

// API: set featured (protected)
app.post('/api/photo/:id/feature', requireAuth, (req, res) => {
  const id = req.params.id;
  const data = readData();
  if(!data.photos[id]) return res.status(404).json({ok:false});
  data.photos[id].featured = !!req.body.feature;
  if(data.photos[id].featured && !data.highlights.includes(id)) data.highlights.unshift(id);
  if(!data.photos[id].featured) data.highlights = data.highlights.filter(x=>x!==id);
  writeData(data);
  res.json({ ok:true });
});

// API: save model of the week (protected)
app.post('/api/model', requireAuth, (req,res)=>{
  const { name, link, bio, photoDataUrl } = req.body;
  const data = readData();
  data.model = { name, link, bio, photoDataUrl };
  writeData(data);
  res.json({ok:true, model: data.model});
});

// API: download album as zip (protected)
app.get('/api/album/:id/zip', requireAuth, (req, res) => {
  const id = req.params.id;
  const data = readData();
  if(!data.albums[id]) return res.status(404).send('Album not found');
  const files = Object.entries(data.photos).filter(([,p])=> p.albumId===id).map(([pid,p])=> p.filename );
  const archiver = require('archiver');
  res.attachment((data.albums[id].name || 'album') + '.zip');
  const archive = archiver('zip');
  archive.pipe(res);
  for(const f of files) archive.file(path.join(UPLOAD_DIR, f), { name: f });
  archive.finalize();
});

// simple metadata endpoint
app.get('/api/meta', (req,res)=> {
  const data = readData(); res.json({ok:true, data});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Server running on http://localhost:' + PORT));