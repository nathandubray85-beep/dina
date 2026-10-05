const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new pgSession({ pool, tableName: 'dina_sessions', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-render',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 30 }
}));
app.use(express.static(path.join(__dirname, 'public')));

async function initDb() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL absent: lance PostgreSQL en local ou configure-la sur Render.');
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(30) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      bio TEXT DEFAULT '',
      avatar BYTEA,
      avatar_type TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content TEXT DEFAULT '',
      image BYTEA,
      image_type TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS likes (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id, post_id)
    );
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Non connecté' });
  next();
}

app.get('/api/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, app: 'Dina' }); }
  catch { res.status(500).json({ ok: false }); }
});

app.post('/api/register', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!/^[a-z0-9_.-]{3,30}$/.test(username)) return res.status(400).json({ error: 'Nom d’utilisateur : 3 à 30 caractères, lettres/chiffres/._-' });
    if (password.length < 6) return res.status(400).json({ error: 'Mot de passe : 6 caractères minimum.' });
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query('INSERT INTO users(username,password_hash) VALUES($1,$2) RETURNING id,username,bio', [username, hash]);
    req.session.userId = rows[0].id;
    res.json({ user: rows[0] });
  } catch (e) { res.status(400).json({ error: e.code === '23505' ? 'Ce nom d’utilisateur existe déjà.' : 'Impossible de créer le compte.' }); }
});

app.post('/api/login', async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const { rows } = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
  if (!rows[0] || !(await bcrypt.compare(password, rows[0].password_hash))) return res.status(401).json({ error: 'Identifiants incorrects.' });
  req.session.userId = rows[0].id;
  res.json({ user: { id: rows[0].id, username: rows[0].username, bio: rows[0].bio } });
});

app.post('/api/logout', auth, (req,res) => req.session.destroy(() => res.json({ ok:true })));

app.get('/api/me', auth, async (req,res) => {
  const { rows } = await pool.query('SELECT id,username,bio FROM users WHERE id=$1',[req.session.userId]);
  res.json({ user: rows[0] });
});

app.get('/api/feed', auth, async (req,res) => {
  const { rows } = await pool.query(`
    SELECT p.id,p.content,p.image,p.image_type,p.created_at,u.id user_id,u.username,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id) likes,
      EXISTS(SELECT 1 FROM likes l2 WHERE l2.post_id=p.id AND l2.user_id=$1) liked,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id) comments
    FROM posts p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 100`, [req.session.userId]);
  res.json({ posts: rows.map(r => ({...r, image: r.image ? `data:${r.image_type};base64,${Buffer.from(r.image).toString('base64')}` : null})) });
});

app.post('/api/posts', auth, upload.single('image'), async (req,res) => {
  const content = String(req.body.content || '').trim();
  if (!content && !req.file) return res.status(400).json({ error:'Ajoute un texte ou une photo.' });
  if (content.length > 2000) return res.status(400).json({ error:'Le texte est trop long.' });
  const { rows } = await pool.query('INSERT INTO posts(user_id,content,image,image_type) VALUES($1,$2,$3,$4) RETURNING id', [req.session.userId, content, req.file ? req.file.buffer : null, req.file ? req.file.mimetype : null]);
  res.json({ id: rows[0].id });
});

app.post('/api/posts/:id/like', auth, async (req,res) => {
  const id = Number(req.params.id);
  const existing = await pool.query('SELECT 1 FROM likes WHERE user_id=$1 AND post_id=$2',[req.session.userId,id]);
  if (existing.rowCount) await pool.query('DELETE FROM likes WHERE user_id=$1 AND post_id=$2',[req.session.userId,id]);
  else await pool.query('INSERT INTO likes(user_id,post_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.session.userId,id]);
  const { rows } = await pool.query('SELECT COUNT(*)::int count FROM likes WHERE post_id=$1',[id]);
  res.json({ liked: !existing.rowCount, likes: rows[0].count });
});

app.get('/api/posts/:id/comments', auth, async (req,res) => {
  const { rows } = await pool.query(`SELECT c.id,c.content,c.created_at,u.username FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=$1 ORDER BY c.created_at ASC`,[Number(req.params.id)]);
  res.json({comments:rows});
});

app.post('/api/posts/:id/comments', auth, async (req,res) => {
  const content=String(req.body.content||'').trim();
  if(!content || content.length>500) return res.status(400).json({error:'Commentaire invalide.'});
  await pool.query('INSERT INTO comments(user_id,post_id,content) VALUES($1,$2,$3)',[req.session.userId,Number(req.params.id),content]);
  res.json({ok:true});
});

app.get('/api/users/:username', auth, async (req,res) => {
  const { rows } = await pool.query('SELECT id,username,bio FROM users WHERE username=$1',[req.params.username.toLowerCase()]);
  if(!rows[0]) return res.status(404).json({error:'Utilisateur introuvable.'});
  const posts=await pool.query('SELECT id,content,created_at FROM posts WHERE user_id=$1 ORDER BY created_at DESC',[rows[0].id]);
  res.json({user:rows[0],posts:posts.rows});
});

app.use((req,res,next)=>{
  if(req.method==='GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(__dirname,'public','index.html'));
  next();
});

initDb().then(()=>app.listen(PORT,'0.0.0.0',()=>console.log(`Dina écoute sur ${PORT}`))).catch(err=>{console.error(err);process.exit(1)});
