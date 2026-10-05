const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Configuration de la base de données PostgreSQL
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'dina_social_db',
  password: 'votre_mot_de_passe',
  port: 5432,
});

// 2. Middlewares de base
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Configuration des sessions enregistrées dans PostgreSQL
app.use(
  session({
    store: new PgSession({
      pool: pool,
      tableName: 'session', // La table 'session' doit exister dans votre BDD
    }),
    secret: 'votre_cle_secrete_super_securisee',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }, // 30 jours
  })
);

// 4. Configuration de Multer pour l'envoi de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

// Rendre le dossier 'uploads' accessible en public
app.use('/uploads', express.static('uploads'));

// --- ROUTES EXEMPLES ---

// Route d'accueil
app.get('/', (req, res) => {
  res.send('Bienvenue sur l\'API Dina Social Network !');
});

// Exemple : Inscription utilisateur (avec hachage bcrypt)
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, hashedPassword]
    );
    res.json({ message: 'Utilisateur créé', user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Exemple : Publication avec image (Multer)
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Aucun fichier envoyé' });
  }
  res.json({
    message: 'Fichier envoyé avec succès',
    filePath: `/uploads/${req.file.filename}`,
  });
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
