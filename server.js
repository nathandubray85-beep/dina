const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL est manquante.");
  console.error("Configure PostgreSQL avant de lancer Dina.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024
  }
});

app.set("trust proxy", 1);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new pgSession({
      pool,
      tableName: "dina_sessions",
      createTableIfMissing: true
    }),
    secret:
      process.env.SESSION_SECRET ||
      "dina-secret-change-this-on-render",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 30
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

/* =====================================================
   OUTILS
===================================================== */

function auth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      error: "Non connecté"
    });
  }

  next();
}

function id(value) {
  const n = Number(value);

  if (!Number.isInteger(n) || n <= 0) {
    return null;
  }

  return n;
}

function imageData(buffer, type) {
  if (!buffer || !type) return null;

  return `data:${type};base64,${Buffer.from(buffer).toString(
    "base64"
  )}`;
}

/* =====================================================
   BASE DE DONNÉES
===================================================== */

async function initDb() {
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

    CREATE TABLE IF NOT EXISTS follows (
      follower_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(follower_id, following_id),
      CHECK(follower_id <> following_id)
    );

    CREATE TABLE IF NOT EXISTS saved_posts (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY(user_id, post_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(30) NOT NULL,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY(conversation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stories (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content TEXT DEFAULT '',
      image BYTEA,
      image_type TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
    );
  `);

  console.log("✅ Base de données Dina prête");
}

/* =====================================================
   SANTÉ
===================================================== */

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      app: "Dina"
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "Base de données inaccessible"
    });
  }
});

/* =====================================================
   INSCRIPTION
===================================================== */

app.post("/api/register", async (req, res) => {
  try {
    const username = String(req.body.username || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    if (!/^[a-z0-9_.-]{3,30}$/.test(username)) {
      return res.status(400).json({
        error:
          "Nom d’utilisateur : 3 à 30 caractères, lettres, chiffres, . _ ou -."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Mot de passe : 6 caractères minimum."
      });
    }

    const hash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `
      INSERT INTO users(username, password_hash)
      VALUES($1, $2)
      RETURNING id, username, bio
      `,
      [username, hash]
    );

    req.session.userId = result.rows[0].id;

    res.json({
      user: result.rows[0]
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(400).json({
        error: "Ce nom d’utilisateur existe déjà."
      });
    }

    console.error(error);

    res.status(500).json({
      error: "Impossible de créer le compte."
    });
  }
});

/* =====================================================
   CONNEXION
===================================================== */

app.post("/api/login", async (req, res) => {
  try {
    const username = String(req.body.username || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    const user = result.rows[0];

    if (
      !user ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {
      return res.status(401).json({
        error: "Identifiants incorrects."
      });
    }

    req.session.userId = user.id;

    res.json({
      user: {
        id: user.id,
        username: user.username,
        bio: user.bio
      }
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erreur de connexion."
    });
  }
});

/* =====================================================
   DÉCONNEXION
===================================================== */

app.post("/api/logout", auth, (req, res) => {
  req.session.destroy(() => {
    res.json({
      ok: true
    });
  });
});

/* =====================================================
   UTILISATEUR CONNECTÉ
===================================================== */

app.get("/api/me", auth, async (req, res) => {
  const result = await pool.query(
    `
    SELECT id, username, bio, avatar, avatar_type
    FROM users
    WHERE id = $1
    `,
    [req.session.userId]
  );

  if (!result.rows[0]) {
    return res.status(404).json({
      error: "Utilisateur introuvable."
    });
  }

  const user = result.rows[0];

  res.json({
    user: {
      id: user.id,
      username: user.username,
      bio: user.bio,
      avatar: imageData(user.avatar, user.avatar_type)
    }
  });
});

/* =====================================================
   FIL
===================================================== */

app.get("/api/feed", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        p.id,
        p.content,
        p.image,
        p.image_type,
        p.created_at,

        u.id AS user_id,
        u.username,
        u.avatar,
        u.avatar_type,

        (
          SELECT COUNT(*)
          FROM likes l
          WHERE l.post_id = p.id
        )::int AS likes,

        EXISTS(
          SELECT 1
          FROM likes l2
          WHERE l2.post_id = p.id
          AND l2.user_id = $1
        ) AS liked,

        (
          SELECT COUNT(*)
          FROM comments c
          WHERE c.post_id = p.id
        )::int AS comments,

        EXISTS(
          SELECT 1
          FROM saved_posts s
          WHERE s.post_id = p.id
          AND s.user_id = $1
        ) AS saved

      FROM posts p

      JOIN users u
        ON u.id = p.user_id

      ORDER BY p.created_at DESC

      LIMIT 100
      `,
      [req.session.userId]
    );

    res.json({
      posts: result.rows.map((post) => ({
        id: post.id,
        content: post.content,
        created_at: post.created_at,
        username: post.username,
        user_id: post.user_id,
        avatar: imageData(
          post.avatar,
          post.avatar_type
        ),
        image: imageData(
          post.image,
          post.image_type
        ),
        likes: Number(post.likes),
        liked: post.liked,
        comments: Number(post.comments),
        saved: post.saved
      }))
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Impossible de charger le fil."
    });
  }
});

/* =====================================================
   CRÉER UNE PUBLICATION
===================================================== */

app.post(
  "/api/posts",
  auth,
  upload.single("image"),
  async (req, res) => {
    try {
      const content = String(req.body.content || "").trim();

      if (!content && !req.file) {
        return res.status(400).json({
          error: "Ajoute un texte ou une photo."
        });
      }

      if (content.length > 2000) {
        return res.status(400).json({
          error: "Le texte est trop long."
        });
      }

      if (
        req.file &&
        !req.file.mimetype.startsWith("image/")
      ) {
        return res.status(400).json({
          error: "Le fichier doit être une image."
        });
      }

      const result = await pool.query(
        `
        INSERT INTO posts(
          user_id,
          content,
          image,
          image_type
        )
        VALUES($1,$2,$3,$4)
        RETURNING id
        `,
        [
          req.session.userId,
          content,
          req.file ? req.file.buffer : null,
          req.file ? req.file.mimetype : null
        ]
      );

      res.json({
        ok: true,
        id: result.rows[0].id
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "Impossible de publier."
      });
    }
  }
);

/* =====================================================
   LIKE
===================================================== */

app.post(
  "/api/posts/:id/like",
  auth,
  async (req, res) => {
    try {
      const postId = id(req.params.id);

      if (!postId) {
        return res.status(400).json({
          error: "Publication invalide."
        });
      }

      const existing = await pool.query(
        `
        SELECT 1
        FROM likes
        WHERE user_id=$1
        AND post_id=$2
        `,
        [req.session.userId, postId]
      );

      if (existing.rowCount) {
        await pool.query(
          `
          DELETE FROM likes
          WHERE user_id=$1
          AND post_id=$2
          `,
          [req.session.userId, postId]
        );
      } else {
        await pool.query(
          `
          INSERT INTO likes(user_id,post_id)
          VALUES($1,$2)
          ON CONFLICT DO NOTHING
          `,
          [req.session.userId, postId]
        );

        const owner = await pool.query(
          "SELECT user_id FROM posts WHERE id=$1",
          [postId]
        );

        if (
          owner.rows[0] &&
          owner.rows[0].user_id !== req.session.userId
        ) {
          await pool.query(
            `
            INSERT INTO notifications(
              user_id,
              actor_id,
              type,
              post_id,
              message
            )
            VALUES($1,$2,'like',$3,$4)
            `,
            [
              owner.rows[0].user_id,
              req.session.userId,
              postId,
              "a aimé ta publication."
            ]
          );
        }
      }

      const count = await pool.query(
        `
        SELECT COUNT(*)::int AS count
        FROM likes
        WHERE post_id=$1
        `,
        [postId]
      );

      res.json({
        liked: !existing.rowCount,
        likes: count.rows[0].count
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "Impossible de modifier le like."
      });
    }
  }
);

/* =====================================================
   COMMENTAIRES
===================================================== */

app.get(
  "/api/posts/:id/comments",
  auth,
  async (req, res) => {
    const postId = id(req.params.id);

    if (!postId) {
      return res.status(400).json({
        error: "Publication invalide."
      });
    }

    const result = await pool.query(
      `
      SELECT
        c.id,
        c.content,
        c.created_at,
        u.username
      FROM comments c
      JOIN users u ON u.id=c.user_id
      WHERE c.post_id=$1
      ORDER BY c.created_at ASC
      `,
      [postId]
    );

    res.json({
      comments: result.rows
    });
  }
);

app.post(
  "/api/posts/:id/comments",
  auth,
  async (req, res) => {
    const postId = id(req.params.id);
    const content = String(
      req.body.content || ""
    ).trim();

    if (!postId || !content || content.length > 500) {
      return res.status(400).json({
        error: "Commentaire invalide."
      });
    }

    await pool.query(
      `
      INSERT INTO comments(
        user_id,
        post_id,
        content
      )
      VALUES($1,$2,$3)
      `,
      [
        req.session.userId,
        postId,
        content
      ]
    );

    const owner = await pool.query(
      "SELECT user_id FROM posts WHERE id=$1",
      [postId]
    );

    if (
      owner.rows[0] &&
      owner.rows[0].user_id !== req.session.userId
    ) {
      await pool.query(
        `
        INSERT INTO notifications(
          user_id,
          actor_id,
          type,
          post_id,
          message
        )
        VALUES($1,$2,'comment',$3,$4)
        `,
        [
          owner.rows[0].user_id,
          req.session.userId,
          postId,
          "a commenté ta publication."
        ]
      );
    }

    res.json({
      ok: true
    });
  }
);

/* =====================================================
   ENREGISTRER / RETIRER
===================================================== */

app.post(
  "/api/posts/:id/save",
  auth,
  async (req, res) => {
    const postId = id(req.params.id);

    if (!postId) {
      return res.status(400).json({
        error: "Publication invalide."
      });
    }

    const existing = await pool.query(
      `
      SELECT 1
      FROM saved_posts
      WHERE user_id=$1
      AND post_id=$2
      `,
      [req.session.userId, postId]
    );

    if (existing.rowCount) {
      await pool.query(
        `
        DELETE FROM saved_posts
        WHERE user_id=$1
        AND post_id=$2
        `,
        [req.session.userId, postId]
      );
    } else {
      await pool.query(
        `
        INSERT INTO saved_posts(
          user_id,
          post_id
        )
        VALUES($1,$2)
        ON CONFLICT DO NOTHING
        `,
        [req.session.userId, postId]
      );
    }

    res.json({
      saved: !existing.rowCount
    });
  }
);

/* =====================================================
   PUBLICATIONS ENREGISTRÉES
===================================================== */

app.get(
  "/api/saved",
  auth,
  async (req, res) => {
    const result = await pool.query(
      `
      SELECT
        p.id,
        p.content,
        p.image,
        p.image_type,
        p.created_at,
        u.username,
        u.avatar,
        u.avatar_type
      FROM saved_posts s

      JOIN posts p
        ON p.id=s.post_id

      JOIN users u
        ON u.id=p.user_id

      WHERE s.user_id=$1

      ORDER BY s.created_at DESC
      `,
      [req.session.userId]
    );

    res.json({
      posts: result.rows.map((post) => ({
        id: post.id,
        content: post.content,
        created_at: post.created_at,
        username: post.username,
        avatar: imageData(
          post.avatar,
          post.avatar_type
        ),
        image: imageData(
          post.image,
          post.image_type
        )
      }))
    });
  }
);

/* =====================================================
   RECHERCHE
===================================================== */

app.get(
  "/api/search",
  auth,
  async (req, res) => {
    const q = String(
      req.query.q || ""
    ).trim().toLowerCase();

    if (!q) {
      return res.json({
        users: []
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        username,
        bio,
        avatar,
        avatar_type
      FROM users
      WHERE username ILIKE $1
      ORDER BY username
      LIMIT 30
      `,
      [`%${q}%`]
    );

    res.json({
      users: result.rows.map((user) => ({
        id: user.id,
        username: user.username,
        bio: user.bio,
        avatar: imageData(
          user.avatar,
          user.avatar_type
        )
      }))
    });
  }
);

/* =====================================================
   PROFIL
===================================================== */

app.get(
  "/api/users/:username",
  auth,
  async (req, res) => {
    const username = String(
      req.params.username
    ).toLowerCase();

    const userResult = await pool.query(
      `
      SELECT
        id,
        username,
        bio,
        avatar,
        avatar_type
      FROM users
      WHERE username=$1
      `,
      [username]
    );

    if (!userResult.rows[0]) {
      return res.status(404).json({
        error: "Utilisateur introuvable."
      });
    }

    const user = userResult.rows[0];

    const posts = await pool.query(
      `
      SELECT
        id,
        content,
        image,
        image_type,
        created_at
      FROM posts
      WHERE user_id=$1
      ORDER BY created_at DESC
      `,
      [user.id]
    );

    const followers = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM follows
      WHERE following_id=$1
      `,
      [user.id]
    );

    const following = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM follows
      WHERE follower_id=$1
      `,
      [user.id]
    );

    const isFollowing = await pool.query(
      `
      SELECT 1
      FROM follows
      WHERE follower_id=$1
      AND following_id=$2
      `,
      [
        req.session.userId,
        user.id
      ]
    );

    res.json({
      user: {
        id: user.id,
        username: user.username,
        bio: user.bio,
        avatar: imageData(
          user.avatar,
          user.avatar_type
        )
      },

      followers: followers.rows[0].count,
      following: following.rows[0].count,
      isFollowing: !!isFollowing.rowCount,

      posts: posts.rows.map((post) => ({
        id: post.id,
        content: post.content,
        created_at: post.created_at,
        image: imageData(
          post.image,
          post.image_type
        )
      }))
    });
  }
);

/* =====================================================
   SUIVRE / NE PLUS SUIVRE
===================================================== */

app.post(
  "/api/users/:username/follow",
  auth,
  async (req, res) => {
    const username = String(
      req.params.username
    ).toLowerCase();

    const user = await pool.query(
      "SELECT id FROM users WHERE username=$1",
      [username]
    );

    if (!user.rows[0]) {
      return res.status(404).json({
        error: "Utilisateur introuvable."
      });
    }

    const targetId = user.rows[0].id;

    if (targetId === req.session.userId) {
      return res.status(400).json({
        error: "Tu ne peux pas te suivre toi-même."
      });
    }

    const existing = await pool.query(
      `
      SELECT 1
      FROM follows
      WHERE follower_id=$1
      AND following_id=$2
      `,
      [
        req.session.userId,
        targetId
      ]
    );

    if (existing.rowCount) {
      await pool.query(
        `
        DELETE FROM follows
        WHERE follower_id=$1
        AND following_id=$2
        `,
        [
          req.session.userId,
          targetId
        ]
      );
    } else {
      await pool.query(
        `
        INSERT INTO follows(
          follower_id,
          following_id
        )
        VALUES($1,$2)
        ON CONFLICT DO NOTHING
        `,
        [
          req.session.userId,
          targetId
        ]
      );

      await pool.query(
        `
        INSERT INTO notifications(
          user_id,
          actor_id,
          type,
          message
        )
        VALUES($1,$2,'follow',$3)
        `,
        [
          targetId,
          req.session.userId,
          "a commencé à te suivre."
        ]
      );
    }

    res.json({
      following: !existing.rowCount
    });
  }
);

/* =====================================================
   MODIFIER PROFIL
===================================================== */

app.put(
  "/api/profile",
  auth,
  async (req, res) => {
    const bio = String(
      req.body.bio || ""
    ).trim();

    if (bio.length > 300) {
      return res.status(400).json({
        error: "La bio est trop longue."
      });
    }

    await pool.query(
      `
      UPDATE users
      SET bio=$1
      WHERE id=$2
      `,
      [
        bio,
        req.session.userId
      ]
    );

    res.json({
      ok: true
    });
  }
);

/* =====================================================
   NOTIFICATIONS
===================================================== */

app.get(
  "/api/notifications",
  auth,
  async (req, res) => {
    const result = await pool.query(
      `
      SELECT
        n.id,
        n.type,
        n.message,
        n.post_id,
        n.is_read,
        n.created_at,
        u.username,
        u.avatar,
        u.avatar_type
      FROM notifications n

      JOIN users u
        ON u.id=n.actor_id

      WHERE n.user_id=$1

      ORDER BY n.created_at DESC

      LIMIT 100
      `,
      [req.session.userId]
    );

    res.json({
      notifications: result.rows.map((n) => ({
        id: n.id,
        type: n.type,
        message: n.message,
        post_id: n.post_id,
        is_read: n.is_read,
        created_at: n.created_at,
        username: n.username,
        avatar: imageData(
          n.avatar,
          n.avatar_type
        )
      }))
    });
  }
);

app.post(
  "/api/notifications/read",
  auth,
  async (req, res) => {
    await pool.query(
      `
      UPDATE notifications
      SET is_read=true
      WHERE user_id=$1
      `,
      [req.session.userId]
    );

    res.json({
      ok: true
    });
  }
);

/* =====================================================
   CONVERSATIONS
===================================================== */

async function getConversation(user1, user2) {
  const result = await pool.query(
    `
    SELECT c.id

    FROM conversations c

    JOIN conversation_members a
      ON a.conversation_id=c.id

    JOIN conversation_members b
      ON b.conversation_id=c.id

    WHERE a.user_id=$1
    AND b.user_id=$2

    LIMIT 1
    `,
    [user1, user2]
  );

  return result.rows[0]?.id || null;
}

app.get(
  "/api/conversations",
  auth,
  async (req, res) => {
    const result = await pool.query(
      `
      SELECT
        c.id,
        u.id AS user_id,
        u.username,
        u.avatar,
        u.avatar_type,

        (
          SELECT content
          FROM messages m
          WHERE m.conversation_id=c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) AS last_message,

        (
          SELECT created_at
          FROM messages m
          WHERE m.conversation_id=c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) AS last_message_date

      FROM conversations c

      JOIN conversation_members cm
        ON cm.conversation_id=c.id
        AND cm.user_id=$1

      JOIN conversation_members other
        ON other.conversation_id=c.id
        AND other.user_id<>$1

      JOIN users u
        ON u.id=other.user_id

      ORDER BY last_message_date DESC NULLS LAST
      `,
      [req.session.userId]
    );

    res.json({
      conversations: result.rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        username: row.username,
        avatar: imageData(
          row.avatar,
          row.avatar_type
        ),
        last_message: row.last_message || ""
      }))
    });
  }
);

/* =====================================================
   CRÉER CONVERSATION
===================================================== */

app.post(
  "/api/conversations",
  auth,
  async (req, res) => {
    const userId = id(req.body.userId);

    if (!userId) {
      return res.status(400).json({
        error: "Utilisateur invalide."
      });
    }

    if (userId === req.session.userId) {
      return res.status(400).json({
        error: "Conversation invalide."
      });
    }

    const user = await pool.query(
      "SELECT id FROM users WHERE id=$1",
      [userId]
    );

    if (!user.rows[0]) {
      return res.status(404).json({
        error: "Utilisateur introuvable."
      });
    }

    let conversationId = await getConversation(
      req.session.userId,
      userId
    );

    if (!conversationId) {
      const conversation = await pool.query(
        "INSERT INTO conversations DEFAULT VALUES RETURNING id"
      );

      conversationId = conversation.rows[0].id;

      await pool.query(
        `
        INSERT INTO conversation_members(
          conversation_id,
          user_id
        )
        VALUES
        ($1,$2),
        ($1,$3)
        `,
        [
          conversationId,
          req.session.userId,
          userId
        ]
      );
    }

    res.json({
      id: conversationId
    });
  }
);

/* =====================================================
   MESSAGES
===================================================== */

app.get(
  "/api/messages/:userId",
  auth,
  async (req, res) => {
    const otherUser = id(req.params.userId);

    if (!otherUser) {
      return res.status(400).json({
        error: "Utilisateur invalide."
      });
    }

    const conversationId = await getConversation(
      req.session.userId,
      otherUser
    );

    if (!conversationId) {
      return res.json({
        messages: []
      });
    }

    const result = await pool.query(
      `
      SELECT
        m.id,
        m.content,
        m.sender_id,
        m.created_at,
        u.username

      FROM messages m

      JOIN users u
        ON u.id=m.sender_id

      WHERE m.conversation_id=$1

      ORDER BY m.created_at ASC
      `,
      [conversationId]
    );

    res.json({
      messages: result.rows
    });
  }
);

app.post(
  "/api/messages",
  auth,
  async (req, res) => {
    const userId = id(req.body.userId);
    const content = String(
      req.body.content || ""
    ).trim();

    if (!userId || !content) {
      return res.status(400).json({
        error: "Message invalide."
      });
    }

    if (content.length > 2000) {
      return res.status(400).json({
        error: "Message trop long."
      });
    }

    let conversationId = await getConversation(
      req.session.userId,
      userId
    );

    if (!conversationId) {
      const conversation = await pool.query(
        "INSERT INTO conversations DEFAULT VALUES RETURNING id"
      );

      conversationId = conversation.rows[0].id;

      await pool.query(
        `
        INSERT INTO conversation_members(
          conversation_id,
          user_id
        )
        VALUES
        ($1,$2),
        ($1,$3)
        `,
        [
          conversationId,
          req.session.userId,
          userId
        ]
      );
    }

    await pool.query(
      `
      INSERT INTO messages(
        conversation_id,
        sender_id,
        content
      )
      VALUES($1,$2,$3)
      `,
      [
        conversationId,
        req.session.userId,
        content
      ]
    );

    res.json({
      ok: true
    });
  }
);

/* =====================================================
   STORIES
===================================================== */

app.get(
  "/api/stories",
  auth,
  async (req, res) => {
    const result = await pool.query(
      `
      SELECT
        s.id,
        s.content,
        s.image,
        s.image_type,
        s.created_at,
        s.expires_at,
        u.id AS user_id,
        u.username,
        u.avatar,
        u.avatar_type

      FROM stories s

      JOIN users u
        ON u.id=s.user_id

      WHERE s.expires_at > NOW()

      ORDER BY s.created_at DESC
      `
    );

    res.json({
      stories: result.rows.map((story) => ({
        id: story.id,
        content: story.content,
        created_at: story.created_at,
        expires_at: story.expires_at,
        user_id: story.user_id,
        username: story.username,
        avatar: imageData(
          story.avatar,
          story.avatar_type
        ),
        image: imageData(
          story.image,
          story.image_type
        )
      }))
    });
  }
);

app.post(
  "/api/stories",
  auth,
  upload.single("image"),
  async (req, res) => {
    const content = String(
      req.body.content || ""
    ).trim();

    if (!content && !req.file) {
      return res.status(400).json({
        error: "Ajoute un texte ou une photo."
      });
    }

    await pool.query(
      `
      INSERT INTO stories(
        user_id,
        content,
        image,
        image_type
      )
      VALUES($1,$2,$3,$4)
      `,
      [
        req.session.userId,
        content,
        req.file ? req.file.buffer : null,
        req.file ? req.file.mimetype : null
      ]
    );

    res.json({
      ok: true
    });
  }
);

/* =====================================================
   ROUTE DE SECOURS POUR L'INTERFACE
===================================================== */

app.use((req, res, next) => {
  if (
    req.method === "GET" &&
    !req.path.startsWith("/api/")
  ) {
    return res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }

  next();
});

/* =====================================================
   DÉMARRAGE
===================================================== */

initDb()
  .then(() => {
    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          `🚀 Dina écoute sur le port ${PORT}`
        );
      }
    );
  })
  .catch((error) => {
    console.error(
      "❌ Impossible de démarrer Dina :"
    );

    console.error(error);

    process.exit(1);
  });
