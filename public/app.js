/* =========================================================
   DINA — APP.JS
   Instagram × Facebook
   ========================================================= */

let me = null;
let currentConversation = null;
let messagesTimer = null;

/* =========================================================
   OUTILS
   ========================================================= */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[c]));
}

function toast(message) {
  const box = $("#toast");
  if (!box) return;

  box.textContent = message;
  box.style.display = "block";

  clearTimeout(window.toastTimer);

  window.toastTimer = setTimeout(() => {
    box.style.display = "none";
  }, 2500);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || "Une erreur est survenue.");
  }

  return data;
}

function formatDate(date) {
  const d = new Date(date);

  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatShortDate(date) {
  const d = new Date(date);

  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit"
  });
}

/* =========================================================
   AUTHENTIFICATION
   ========================================================= */

function initAuth() {

  $$(".tabs button").forEach((button) => {

    button.addEventListener("click", () => {

      $$(".tabs button").forEach((b) => {
        b.classList.remove("active");
      });

      button.classList.add("active");

      const tab = button.dataset.tab;

      $("#login")?.classList.toggle(
        "hidden",
        tab !== "login"
      );

      $("#register")?.classList.toggle(
        "hidden",
        tab !== "register"
      );

      if ($("#authMsg")) {
        $("#authMsg").textContent = "";
      }
    });
  });

  $("#login")?.addEventListener("submit", async (event) => {

    event.preventDefault();

    try {

      const body = Object.fromEntries(
        new FormData(event.target)
      );

      const data = await api("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      enterApp(data.user);

    } catch (error) {

      if ($("#authMsg")) {
        $("#authMsg").textContent = error.message;
      }
    }
  });

  $("#register")?.addEventListener("submit", async (event) => {

    event.preventDefault();

    try {

      const body = Object.fromEntries(
        new FormData(event.target)
      );

      const data = await api("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      enterApp(data.user);

    } catch (error) {

      if ($("#authMsg")) {
        $("#authMsg").textContent = error.message;
      }
    }
  });
}

/* =========================================================
   ENTRÉE DANS L'APPLICATION
   ========================================================= */

async function enterApp(user) {

  me = user;

  $("#auth")?.classList.add("hidden");
  $("#app")?.classList.remove("hidden");

  if ($("#hello")) {
    $("#hello").textContent = user.username;
  }

  updateUserInterface();

  await loadFeed();
  await loadStories();
  await loadNotifications();

  setDarkMode(localStorage.getItem("dina-dark") === "true");
}

function updateUserInterface() {

  const avatar = userAvatar(me);

  if ($("#headerAvatar")) {
    $("#headerAvatar").src = avatar;
  }

  const nameElements = $$("[data-current-user]");

  nameElements.forEach((element) => {
    element.textContent = me.username;
  });
}

function userAvatar(user) {

  if (user?.avatar) {
    return user.avatar;
  }

  const letter = (user?.username || "D")[0].toUpperCase();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <rect width="100" height="100" fill="#1877f2"/>
      <text x="50" y="58"
        text-anchor="middle"
        font-size="48"
        fill="white"
        font-family="Arial"
        font-weight="bold">${letter}</text>
    </svg>
  `)}`;
}

/* =========================================================
   NAVIGATION
   ========================================================= */

function initNavigation() {

  $$("[data-view]").forEach((button) => {

    button.addEventListener("click", () => {

      const view = button.dataset.view;

      showView(view);
    });
  });

  $("#mobile-nav")?.querySelectorAll("[data-view]")
    .forEach((button) => {

      button.addEventListener("click", () => {
        showView(button.dataset.view);
      });

    });
}

function showView(view) {

  const views = [
    "feed",
    "search",
    "messages",
    "notifications",
    "saved",
    "profile",
    "settings"
  ];

  views.forEach((name) => {

    const element = $(`#${name}View`);

    if (element) {
      element.classList.toggle(
        "hidden",
        name !== view
      );
    }
  });

  $$("[data-view]").forEach((button) => {

    button.classList.toggle(
      "active",
      button.dataset.view === view
    );
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  if (view === "feed") {
    loadFeed();
    loadStories();
  }

  if (view === "search") {
    $("#globalSearch")?.focus();
  }

  if (view === "messages") {
    loadConversations();
  }

  if (view === "notifications") {
    loadNotifications();
  }

  if (view === "saved") {
    loadSavedPosts();
  }

  if (view === "profile") {
    loadProfile();
  }
}

/* =========================================================
   DÉCONNEXION
   ========================================================= */

async function logout() {

  try {

    await api("/api/logout", {
      method: "POST"
    });

    location.reload();

  } catch (error) {
    toast(error.message);
  }
}

$("#logout")?.addEventListener("click", logout);
$("#settingsLogout")?.addEventListener("click", logout);

/* =========================================================
   FIL D'ACTUALITÉ
   ========================================================= */

async function loadFeed() {

  const feed = $("#feed");

  if (!feed) return;

  try {

    const data = await api("/api/feed");

    const posts = data.posts || [];

    if (!posts.length) {

      feed.innerHTML = `
        <div class="post">
          <div style="text-align:center;padding:30px;color:var(--muted)">
            <div style="font-size:40px;margin-bottom:10px">📱</div>
            <b>Ton fil est encore vide</b>
            <p style="margin-top:6px">
              Publie quelque chose pour commencer !
            </p>
          </div>
        </div>
      `;

      return;
    }

    feed.innerHTML = posts.map(renderPost).join("");

  } catch (error) {

    toast(error.message);
  }
}

function renderPost(post) {

  const avatar = post.avatar || userAvatar({
    username: post.username
  });

  const likedClass = post.liked ? "liked" : "";
  const savedClass = post.saved ? "saved" : "";

  return `
    <article class="post" data-post="${post.id}">

      <div class="postHead">

        <img
          class="avatarImg"
          src="${esc(avatar)}"
          alt=""
          onerror="this.style.display='none'"
        >

        <div style="min-width:0;flex:1">

          <strong>
            <button
              onclick="openUser('${esc(post.username)}')"
              style="
                border:0;
                background:none;
                padding:0;
                color:inherit;
                font-weight:700;
                cursor:pointer;
              "
            >
              @${esc(post.username)}
            </button>
          </strong>

          <div class="date">
            ${formatDate(post.created_at)}
          </div>

        </div>

      </div>

      ${
        post.content
          ? `<div class="content">${esc(post.content)}</div>`
          : ""
      }

      ${
        post.image
          ? `
            <img
              class="postImage"
              src="${esc(post.image)}"
              alt="Publication de ${esc(post.username)}"
              loading="lazy"
            >
          `
          : ""
      }

      <div class="actions">

        <button
          class="${likedClass}"
          onclick="likePost(${post.id})"
        >
          ${post.liked ? "❤️" : "♡"}
          <span>${post.likes || 0}</span>
        </button>

        <button
          onclick="toggleComments(${post.id})"
        >
          💬
          <span>${post.comments || 0}</span>
        </button>

        <button
          class="${savedClass}"
          onclick="savePost(${post.id})"
        >
          ${post.saved ? "🔖" : "🔖"}
          <span>${post.saved ? "Enregistré" : "Enregistrer"}</span>
        </button>

      </div>

      <div
        id="comments-${post.id}"
        class="comments hidden"
      ></div>

    </article>
  `;
}

/* =========================================================
   PUBLIER
   ========================================================= */

$("#publish")?.addEventListener("click", publishPost);

async function publishPost() {

  const text = $("#postText")?.value.trim();
  const image = $("#postImage")?.files?.[0];
  const video = $("#postVideo")?.files?.[0];

  if (!text && !image && !video) {

    toast("Écris quelque chose ou ajoute une photo 📸");

    return;
  }

  try {

    const form = new FormData();

    if (text) {
      form.append("content", text);
    }

    if (image) {
      form.append("image", image);
    }

    if (video) {
      form.append("video", video);
    }

    await api("/api/posts", {
      method: "POST",
      body: form
    });

    if ($("#postText")) {
      $("#postText").value = "";
    }

    if ($("#postImage")) {
      $("#postImage").value = "";
    }

    if ($("#postVideo")) {
      $("#postVideo").value = "";
    }

    toast("Publication publiée 🎉");

    await loadFeed();

  } catch (error) {

    toast(error.message);
  }
}

/* =========================================================
   LIKES
   ========================================================= */

async function likePost(id) {

  try {

    await api(`/api/posts/${id}/like`, {
      method: "POST"
    });

    await loadFeed();

  } catch (error) {

    toast(error.message);
  }
}

/* =========================================================
   ENREGISTRER
   ========================================================= */

async function savePost(id) {

  try {

    await api(`/api/posts/${id}/save`, {
      method: "POST"
    });

    toast("Publication enregistrée 🔖");

    await loadFeed();

  } catch (error) {

    toast(error.message);
  }
}

/* =========================================================
   COMMENTAIRES
   ========================================================= */

async function toggleComments(id) {

  const box = $(`#comments-${id}`);

  if (!box) return;

  if (!box.classList.contains("hidden")) {

    box.classList.add("hidden");

    return;
  }

  try {

    const data = await api(
      `/api/posts/${id}/comments`
    );

    const comments = data.comments || [];

    box.innerHTML = `

      ${
        comments.length
          ? comments.map(comment => `
              <div class="comment">

                <b>
                  @${esc(comment.username)}
                </b>

                ${esc(comment.content)}

              </div>
            `).join("")
          : `
            <div
              style="
                color:var(--muted);
                padding:8px 0;
              "
            >
              Aucun commentaire.
            </div>
          `
      }

      <div class="commentBox">

        <input
          id="comment-input-${id}"
          maxlength="500"
          placeholder="Écrire un commentaire..."
        >

        <button
          onclick="commentPost(${id})"
        >
          Envoyer
        </button>

      </div>
    `;

    box.classList.remove("hidden");

    $(`#comment-input-${id}`)?.focus();

  } catch (error) {

    toast(error.message);
  }
}

async function commentPost(id) {

  const input = $(`#comment-input-${id}`);

  if (!input || !input.value.trim()) {
    return;
  }

  try {

    await api(`/api/posts/${id}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: input.value.trim()
      })
    });

    await toggleComments(id);
    await toggleComments(id);

    toast("Commentaire ajouté 💬");

  } catch (error) {

    toast(error.message);
  }
}

/* =========================================================
   STORIES
   ========================================================= */

async function loadStories() {

  const stories = $("#stories");

  if (!stories) return;

  try {

    const data = await api("/api/stories");

    const list = data.stories || [];

    stories.innerHTML = list.map(story => `

      <div
        class="story"
        onclick="openStory(${story.id})"
      >

        ${
          story.image
            ? `
              <img
                src="${esc(story.image)}"
                alt=""
              >
            `
            : ""
        }

        <span>
          @${esc(story.username)}
        </span>

      </div>

    `).join("");

  } catch {
    stories.innerHTML = "";
  }
}

async function openStory(id) {

  try {

    const data = await api(`/api/stories/${id}`);

    const story = data.story || data;

    openModal(`
      <div style="text-align:center">

        ${
          story.image
            ? `
              <img
                src="${esc(story.image)}"
                style="
                  max-width:100%;
                  max-height:70vh;
                  border-radius:12px;
                  object-fit:contain;
                "
              >
            `
            : ""
        }

        ${
          story.content
            ? `
              <p style="margin-top:12px">
                ${esc(story.content)}
              </p>
            `
            : ""
        }

      </div>
    `);

  } catch (error) {

    toast(error.message);
  }
}

async function publishStory() {

  const input = $("#storyImage");

  if (!input?.files?.[0]) {
    toast("Choisis une photo pour ta story.");
    return;
  }

  try {

    const form = new FormData();

    form.append(
      "image",
      input.files[0]
    );

    await api("/api/stories", {
      method: "POST",
      body: form
    });

    input.value = "";

    await loadStories();

    toast("Story publiée 📸");

  } catch (error) {

    toast(error.message);
  }
}

/* =========================================================
   PROFIL
   ========================================================= */

async function loadProfile(username = me?.username) {

  const box = $("#profileBox");

  if (!box || !username) return;

  try {

    const data = await api(
      `/api/users/${encodeURIComponent(username)}`
    );

    const user = data.user;
    const posts = data.posts || [];

    const isMe =
      user.username === me.username;

    const avatar =
      user.avatar ||
      userAvatar(user);

    box.innerHTML = `

      <div class="profileCard">

        <div class="profileTop">

          <img
            class="avatarImg"
            src="${esc(avatar)}"
            alt=""
          >

          <div style="min-width:0">

            <h2>
              @${esc(user.username)}
            </h2>

            <p>
              ${esc(
                user.bio ||
                "Bienvenue sur Dina 👋"
              )}
            </p>

          </div>

        </div>

        <div class="profileStats">

          <span>
            <b>${posts.length}</b>
            Publications
          </span>

          <span>
            <b>${user.followers || 0}</b>
            Abonnés
          </span>

          <span>
            <b>${user.following || 0}</b>
            Abonnements
          </span>

        </div>

        ${
          isMe
            ? `
              <button onclick="openProfileEditor()">
                Modifier le profil
              </button>
            `
            : `
              <button onclick="toggleFollow('${esc(user.username)}')">
                ${user.following_me ? "Ne plus suivre" : "Suivre"}
              </button>
            `
        }

      </div>

      ${
        posts.length
          ? posts.map(renderPost).join("")
          : `
            <div class="post">
              <div style="
                text-align:center;
                padding:25px;
                color:var(--muted)
              ">
                Aucune publication.
              </div>
            </div>
          `
      }

    `;

  } catch (error) {

    toast(error.message);
  }
}

async function openUser(username) {

  showView("profile");

  await loadProfile(username);
}

/* =========================================================
   ABONNEMENTS
   ========================================================= */

async function toggleFollow(username) {

  try {

    const data = await api(
      `/api/users/${encodeURIComponent(username)}/follow`,
      {
        method: "POST"
      }
    );

    toast(
      data.following
        ? `Tu suis @${username} maintenant 👍`
        : `Tu ne suis plus @${username}`
    );

    await loadProfile(username);
    await loadNotifications();

  } catch (error) {

    toast(error.message);
  }
}

/* =========================================================
   MODIFIER PROFIL
   ========================================================= */

function openProfileEditor() {

  openModal(`

    <h2>Modifier mon profil</h2>

    <textarea
      id="editBioInput"
      maxlength="300"
      placeholder="Ta bio..."
    >${esc(me.bio || "")}</textarea>

    <div class="modalActions">

      <button onclick="closeModal()">
        Annuler
      </button>

      <button onclick="saveProfile()">
        Enregistrer
      </button>

    </div>
  `);
}

async function saveProfile() {

  const bio =
    $("#editBioInput")?.value.trim() || "";

  try {

    const data = await api("/api/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        bio
      })
    });

    me = {
      ...me,
      ...data.user
    };

    closeModal();

    await loadProfile();

    toast("Profil modifié ✅");

  } catch (error) {

    toast(error.message);
  }
}

/* =========================================================
   RECHERCHE
   ========================================================= */

async function performSearch() {

  const input =
    $("#globalSearch") ||
    $("#quickSearch");

  if (!input) return;

  const query = input.value.trim();

  if (!query) return;

  const results = $("#searchResults");

  if (!results) return;

  try {

    const data = await api(
      `/api/search?q=${encodeURIComponent(query)}`
    );

    const users = data.users || [];

    if (!users.length) {

      results.innerHTML = `
        <div class="post">
          Aucun utilisateur trouvé.
        </div>
      `;

      return;
    }

    results.innerHTML = users.map(user => `

      <div class="userResult">

        <img
          class="avatarImg"
          src="${esc(
            user.avatar ||
            userAvatar(user)
          )}"
          alt=""
        >

        <div class="userInfo">

          <strong>
            @${esc(user.username)}
          </strong>

          <span>
            ${esc(user.bio || "Utilisateur Dina")}
          </span>

        </div>

        <button
          onclick="openUser('${esc(user.username)}')"
        >
          Voir
        </button>

      </div>

    `).join("");

  } catch (error) {

    toast(error.message);
  }
}

$("#searchButton")?.addEventListener(
  "click",
  performSearch
);

$("#globalSearch")?.addEventListener(
  "keydown",
  (event) => {

    if (event.key === "Enter") {
      performSearch();
    }

  }
);

$("#quickSearch")?.addEventListener(
  "keydown",
  (event) => {

    if (event.key === "Enter") {

      if ($("#globalSearch")) {
        $("#globalSearch").value =
          event.target.value;
      }

      showView("search");
      performSearch();
    }

  }
);

/* =========================================================
   NOTIFICATIONS
   ========================================================= */

async function loadNotifications() {

  const box = $("#notificationsList");

  try {

    const data = await api(
      "/api/notifications"
    );

    const notifications =
      data.notifications || [];

    if (box) {

      box.innerHTML =
        notifications.length

          ? notifications.map(n => `

              <div class="
                notification
                ${n.read ? "" : "unread"}
              ">

                <div style="font-size:22px">
                  ${
                    n.type === "like"
                      ? "❤️"
                      : n.type === "comment"
                        ? "💬"
                        : n.type === "follow"
                          ? "👤"
                          : "🔔"
                  }
                </div>

                <div>

                  <div>
                    ${esc(n.message)}
                  </div>

                  <small>
                    ${formatDate(n.created_at)}
                  </small>

                </div>

              </div>

            `).join("")

          : `
              <div class="post">
                <div style="
                  text-align:center;
                  color:var(--muted);
                  padding:20px;
                ">
                  Aucune notification 🔔
                </div>
              </div>
            `;
    }

    updateNotificationBadge(
      notifications.filter(n => !n.read).length
    );

  } catch {
    // Pas de blocage de l'application
  }
}

function updateNotificationBadge(number) {

  const badge = $("#notificationBadge");

  if (!badge) return;

  badge.textContent =
    number > 99 ? "99+" : number;

  badge.style.display =
    number ? "inline-flex" : "none";
}

/* =========================================================
   MESSAGES
   ========================================================= */

async function loadConversations() {

  const list = $("#conversationList");

  if (!list) return;

  try {

    const data =
      await api("/api/conversations");

    const conversations =
      data.conversations || [];

    if (!conversations.length) {

      list.innerHTML = `
        <div style="
          padding:20px;
          color:var(--muted);
          text-align:center;
        ">
          Aucun message.
        </div>
      `;

      return;
    }

    list.innerHTML =
      conversations.map(c => `

        <button
          class="conversationItem"
          onclick="openConversation(${c.user_id}, '${esc(c.username)}')"
        >

          <div style="
            display:flex;
            align-items:center;
            gap:10px;
          ">

            <img
              class="avatarImg"
              src="${esc(
                c.avatar ||
                userAvatar({
                  username:c.username
                })
              )}"
              alt=""
            >

            <div style="min-width:0">

              <strong>
                @${esc(c.username)}
              </strong>

              <span>
                ${esc(c.last_message || "")}
              </span>

            </div>

          </div>

        </button>

      `).join("");

  } catch (error) {

    toast(error.message);
  }
}

async function openConversation(
  userId,
  username
) {

  currentConversation = {
    userId,
    username
  };

  showView("messages");

  const conversation = $("#conversation");

  if (!conversation) return;

  conversation.innerHTML = `

    <div style="
      padding:14px;
      border-bottom:1px solid var(--border);
      font-weight:700;
    ">
      @${esc(username)}
    </div>

    <div
      id="messagesList"
      class="messagesList"
    ></div>

    <form
      id="messageForm"
      class="messageForm"
    >

      <input
        id="messageInput"
        maxlength="2000"
        placeholder="Écrire un message..."
        autocomplete="off"
      >

      <button>
        Envoyer
      </button>

    </form>
  `;

  $("#messageForm")?.addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();

      const input = $("#messageInput");

      if (!input?.value.trim()) return;

      try {

        await api("/api/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            user_id: userId,
            content: input.value.trim()
          })
        });

        input.value = "";

        await loadMessages();

      } catch (error) {

        toast(error.message);
      }
    }
  );

  await loadMessages();

  clearInterval(messagesTimer);

  messagesTimer =
    setInterval(loadMessages, 5000);
}

async function loadMessages() {

  if (!currentConversation) return;

  const box = $("#messagesList");

  if (!box) return;

  try {

    const data = await api(
      `/api/messages/${currentConversation.userId}`
    );

    const messages =
      data.messages || [];

    box.innerHTML = messages.map(m => `

      <div class="
        message
        ${m.sender_id === me.id ? "mine" : ""}
      ">

        ${esc(m.content)}

        <small>
          ${formatShortDate(m.created_at)}
        </small>

      </div>

    `).join("");

    box.scrollTop = box.scrollHeight;

  } catch {
    // On laisse la conversation fonctionner
  }
}

/* =========================================================
   ENREGISTRÉS
   ========================================================= */

async function loadSavedPosts() {

  const box = $("#savedPosts");

  if (!box) return;

  try {

    const data =
      await api("/api/saved");

    const posts =
      data.posts || [];

    box.innerHTML =
      posts.length
        ? posts.map(renderPost).join("")
        : `
            <div class="post">
              <div style="
                text-align:center;
                padding:25px;
                color:var(--muted)
              ">
                Tu n'as encore rien enregistré 🔖
              </div>
            </div>
          `;

  } catch (error) {

    toast(error.message);
  }
}

/* =========================================================
   MODE SOMBRE
   ========================================================= */

function setDarkMode(enabled) {

  document.body.classList.toggle(
    "dark",
    enabled
  );

  localStorage.setItem(
    "dina-dark",
    enabled ? "true" : "false"
  );

  if ($("#darkMode")) {
    $("#darkMode").checked = enabled;
  }

  if ($("#settingsDarkMode")) {
    $("#settingsDarkMode").checked = enabled;
  }
}

$("#darkMode")?.addEventListener(
  "change",
  (event) => {
    setDarkMode(event.target.checked);
  }
);

$("#settingsDarkMode")?.addEventListener(
  "change",
  (event) => {
    setDarkMode(event.target.checked);
  }
);

/* =========================================================
   MODAL
   ========================================================= */

function openModal(content) {

  const modal = $("#modal");

  if (!modal) return;

  const contentBox =
    $("#modalContent");

  if (contentBox) {
    contentBox.innerHTML = content;
  }

  modal.classList.remove("hidden");
}

function closeModal() {

  $("#modal")?.classList.add("hidden");
}

$("#modal")?.addEventListener(
  "click",
  (event) => {

    if (event.target.id === "modal") {
      closeModal();
    }

  }
);

/* =========================================================
   NOUVELLE CONVERSATION
   ========================================================= */

async function startConversation() {

  const username =
    prompt("Nom d'utilisateur :");

  if (!username?.trim()) return;

  try {

    const data = await api(
      `/api/users/${encodeURIComponent(username.trim())}`
    );

    if (!data.user) {
      toast("Utilisateur introuvable.");
      return;
    }

    openConversation(
      data.user.id,
      data.user.username
    );

  } catch (error) {

    toast(error.message);
  }
}

$("#newConversation")?.addEventListener(
  "click",
  startConversation
);

/* =========================================================
   RACCOURCIS
   ========================================================= */

document.addEventListener(
  "keydown",
  (event) => {

    if (
      event.key === "Escape" &&
      !$("#modal")?.classList.contains("hidden")
    ) {
      closeModal();
    }

  }
);

/* =========================================================
   INITIALISATION
   ========================================================= */

async function init() {

  initAuth();
  initNavigation();

  try {

    const data = await api("/api/me");

    if (data.user) {
      await enterApp(data.user);
    }

  } catch {
    // Pas connecté : écran de connexion
  }
}

init();

/* =========================================================
   FONCTIONS GLOBALES
   ========================================================= */

window.likePost = likePost;
window.savePost = savePost;
window.toggleComments = toggleComments;
window.commentPost = commentPost;
window.openUser = openUser;
window.toggleFollow = toggleFollow;
window.openProfileEditor = openProfileEditor;
window.saveProfile = saveProfile;
window.openStory = openStory;
window.publishStory = publishStory;
window.openConversation = openConversation;
window.loadMessages = loadMessages;
window.startConversation = startConversation;
window.closeModal = closeModal;
window.setDarkMode = setDarkMode;
