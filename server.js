@'
const fs = require("fs");

const file = "server.js";
let s = fs.readFileSync(file, "utf8");

if (!s.includes('require("nodemailer")')) {
  s = s.replace(
    'const path = require("path");',
    'const path = require("path");\nconst nodemailer = require("nodemailer");'
  );
}

if (!s.includes("const transporter = nodemailer.createTransport")) {
  s = s.replace(
    'const PORT = process.env.PORT || 3000;',
    `const PORT = process.env.PORT || 3000;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || "false") === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const APP_URL = process.env.APP_URL || "http://localhost:3000";`
  );
}

if (!s.includes("ADD COLUMN IF NOT EXISTS email")) {
  s = s.replace(
    '    CREATE TABLE IF NOT EXISTS posts (',
    `    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email TEXT,
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS verification_token TEXT,
      ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMPTZ;

    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
      ON users(email)
      WHERE email IS NOT NULL;

    CREATE TABLE IF NOT EXISTS posts (`
  );
}

const registerStart = s.indexOf('app.post("/api/register"');
const loginStart = s.indexOf('app.post("/api/login"', registerStart);
const logoutStart = s.indexOf('app.post("/api/logout"', loginStart);

if (registerStart === -1 || loginStart === -1 || logoutStart === -1) {
  console.error("❌ Impossible de trouver les routes d'inscription/connexion.");
  process.exit(1);
}

const newAuth = `app.post("/api/register", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim().toLowerCase();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
      return res.status(400).json({
        error: "Nom d'utilisateur : 3 à 30 caractères, lettres, chiffres, . _ ou -."
      });
    }

    if (!/^[^\\\\s@]+@[^\\\\s@]+\\\\.[^\\\\s@]+$/.test(email)) {
      return res.status(400).json({
        error: "Adresse email invalide."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Mot de passe : 6 caractères minimum."
      });
    }

    const existing = await pool.query(
      \`SELECT username, email
       FROM users
       WHERE username=$1 OR email=$2\`,
      [username, email]
    );

    if (existing.rows.some(u => u.username === username)) {
      return res.status(400).json({
        error: "Ce nom d'utilisateur existe déjà."
      });
    }

    if (existing.rows.some(u => u.email === email)) {
      return res.status(400).json({
        error: "Cette adresse email est déjà utilisée."
      });
    }

    const hash = await bcrypt.hash(password, 12);
    const crypto = require("crypto");

    const verificationToken = crypto
      .randomBytes(32)
      .toString("hex");

    const verificationExpires = new Date(
      Date.now() + 30 * 60 * 1000
    );

    await pool.query(
      \`INSERT INTO users(
        username,
        email,
        password_hash,
        email_verified,
        verification_token,
        verification_expires
      )
      VALUES($1,$2,$3,FALSE,$4,$5)\`,
      [
        username,
        email,
        hash,
        verificationToken,
        verificationExpires
      ]
    );

    const verifyUrl =
      \`\${APP_URL}/api/verify-email?token=\${verificationToken}\`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: "Vérifie ton adresse email - Dina",
      text:
        "Bienvenue sur Dina !\\n\\n" +
        "Vérifie ton adresse email ici :\\n" +
        verifyUrl +
        "\\n\\nCe lien est valable 30 minutes.",
      html:
        '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">' +
        '<h1 style="color:#7c3aed">Bienvenue sur Dina 👋</h1>' +
        '<p>Merci pour ton inscription.</p>' +
        '<p>Clique sur le bouton pour vérifier ton adresse email :</p>' +
        '<p><a href="' + verifyUrl + '" style="display:inline-block;padding:12px 20px;background:#7c3aed;color:white;text-decoration:none;border-radius:10px">Vérifier mon email</a></p>' +
        '<p>Ce lien est valable 30 minutes.</p>' +
        '</div>'
    });

    res.json({
      ok: true,
      requiresVerification: true,
      email
    });

  } catch (error) {
    console.error(error);

    if (error.code === "23505") {
      return res.status(400).json({
        error: "Ce nom d'utilisateur ou cette adresse email existe déjà."
      });
    }

    res.status(500).json({
      error: "Impossible de créer le compte."
    });
  }
});

app.get("/api/verify-email", async (req, res) => {
  try {
    const token = String(req.query.token || "");

    const result = await pool.query(
      \`SELECT id, email_verified, verification_expires
       FROM users
       WHERE verification_token=$1\`,
      [token]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(400).send(
        "Lien de vérification invalide ou déjà utilisé."
      );
    }

    if (user.email_verified) {
      return res.send(
        "Ton adresse email est déjà vérifiée. Tu peux te connecter à Dina."
      );
    }

    if (
      !user.verification_expires ||
      new Date(user.verification_expires) < new Date()
    ) {
      return res.status(400).send(
        "Ce lien de vérification a expiré. Demande un nouveau lien."
      );
    }

    await pool.query(
      \`UPDATE users
       SET email_verified=TRUE,
           verification_token=NULL,
           verification_expires=NULL
       WHERE id=$1\`,
      [user.id]
    );

    res.send(\`
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Email vérifié - Dina</title>
        </head>
        <body style="font-family:Arial;text-align:center;padding:60px">
          <h1>✅ Email vérifié !</h1>
          <p>Ton adresse email a bien été vérifiée.</p>
          <a href="\${APP_URL}"
             style="display:inline-block;padding:12px 20px;background:#7c3aed;color:white;text-decoration:none;border-radius:10px">
            Retourner sur Dina
          </a>
        </body>
      </html>
    \`);

  } catch (error) {
    console.error(error);
    res.status(500).send("Erreur pendant la vérification.");
  }
});

app.post("/api/resend-verification", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).json({
        error: "Adresse email obligatoire."
      });
    }

    const result = await pool.query(
      \`SELECT id, email_verified
       FROM users
       WHERE email=$1\`,
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({
        error: "Aucun compte avec cette adresse email."
      });
    }

    if (user.email_verified) {
      return res.status(400).json({
        error: "Cette adresse email est déjà vérifiée."
      });
    }

    const crypto = require("crypto");

    const verificationToken = crypto
      .randomBytes(32)
      .toString("hex");

    const verificationExpires = new Date(
      Date.now() + 30 * 60 * 1000
    );

    await pool.query(
      \`UPDATE users
       SET verification_token=$1,
           verification_expires=$2
       WHERE id=$3\`,
      [
        verificationToken,
        verificationExpires,
        user.id
      ]
    );

    const verifyUrl =
      \`\${APP_URL}/api/verify-email?token=\${verificationToken}\`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: "Nouveau lien de vérification - Dina",
      text:
        "Vérifie ton adresse email ici :\\n" +
        verifyUrl,
      html:
        '<p>Vérifie ton adresse email :</p>' +
        '<p><a href="' + verifyUrl + '">Vérifier mon email</a></p>' +
        '<p>Le lien est valable 30 minutes.</p>'
    });

    res.json({ ok: true });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Impossible d'envoyer le mail de vérification."
    });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const username = String(req.body.username || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    const result = await pool.query(
      "SELECT * FROM users WHERE username=$1",
      [username]
    );

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        error: "Identifiants incorrects."
      });
    }

    if (user.email && !user.email_verified) {
      return res.status(403).json({
        error: "Ton email n'est pas encore vérifié.",
        emailNotVerified: true,
        email: user.email
      });
    }

    req.session.userId = user.id;

    res.json({
      user: {
        id: user.id,
        username: user.username,
        bio: user.bio,
        email: user.email,
        email_verified: user.email_verified
      }
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erreur de connexion."
    });
  }
});

`;

s = s.slice(0, registerStart) + newAuth + s.slice(logoutStart);

if (!s.includes("email_verified, bio, avatar")) {
  s = s.replace(
    "SELECT id, username, bio, avatar, avatar_type FROM users WHERE id=$1",
    "SELECT id, username, email, email_verified, bio, avatar, avatar_type FROM users WHERE id=$1"
  );
}

s = s.replace(
`      id: user.id,
      username: user.username,
      bio: user.bio,
      avatar: imageData(user.avatar, user.avatar_type)`,
`      id: user.id,
      username: user.username,
      bio: user.bio,
      email: user.email,
      email_verified: user.email_verified,
      avatar: imageData(user.avatar, user.avatar_type)`,
1
);

fs.writeFileSync(file, s, "utf8");

console.log("✅ server.js de Dina a été modifié.");
console.log("✅ Recherche conservée.");
console.log("✅ Messages privés conservés.");
console.log("✅ Notifications conservées.");
console.log("✅ Vérification email ajoutée.");
'@ | Set-Content update-dina.js -Encoding UTF8

node update-dina.js
Remove-Item update-dina.js

npm.cmd install
