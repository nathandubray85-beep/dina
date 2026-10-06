const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let me = null;
let currentView = "feed";
let currentConversationUser = null;

/* =========================
   OUTILS
========================= */

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[c]));
}

function initials(username) {
  return String(username || "D")[0].toUpperCase();
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
  const response = await fetch(url, options);

  let data = {};

  try {
    data = await response.json();
  } catch {}

  if (!response.ok) {
    const error = new Error(data.error || "Une erreur est survenue.");
    error.data = data;
    throw error;
  }

  return data;
}

function formatDate(date) {
  if (!date) return "";

  return new Date(date).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/* =========================
   AUTHENTIFICATION
========================= */

$$(".auth-tab").forEach(button => {
  button.addEventListener("click", () => {
    $$(".auth-tab").forEach(b => b.classList.remove("active"));
    button.classList.add("active");

    const login = button.dataset.tab === "login";

    $("#login").classList.toggle("hidden", !login);
    $("#register").classList.toggle("hidden", login);
    $("#authMsg").textContent = "";
  });
});


$("#login").addEventListener("submit", async e => {
  e.preventDefault();

  try {
    const body = Object.fromEntries(new FormData(e.target));

    const data = await api("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    enterApp(data.user);

  } catch (error) {

    $("#authMsg").textContent = error.message;

    if (error.data?.emailNotVerified) {
      showResendButton(bodyEmailFromLogin(e.target));
    }
  }
});


$("#register").addEventListener("submit", async e => {
  e.preventDefault();

  const body = Object.fromEntries(new FormData(e.target));

  if (!body.email) {
    $("#authMsg").textContent = "Ton adresse email est obligatoire.";
    return;
  }

  try {

    const data = await api("/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (data.verificationRequired) {

      $("#authMsg").innerHTML = "";

      const message = document.createElement("div");
      message.textContent =
        "Compte créé ! Vérifie ton adresse email avant de te connecter.";

      const resend = document.createElement("button");
      resend.type = "button";
      resend.className = "primary-btn";
      resend.style.marginTop = "15px";
      resend.textContent = "Renvoyer le mail";

      resend.onclick = () => resendVerification(body.email);

      $("#authMsg").appendChild(message);
      $("#authMsg").appendChild(resend);

      e.target.reset();

      return;
    }

    if (data.user) {
      enterApp(data.user);
    }

  } catch (error) {
    $("#authMsg").textContent = error.message;
  }
});


function bodyEmailFromLogin(form) {
  const input = form.querySelector('input[name="username"]');
  return input ? input.value.trim() : "";
}


function showResendButton(email) {

  const box = $("#authMsg");

  if (!box) return;

  const button = document.createElement("button");

  button.type = "button";
  button.className = "primary-btn";
  button.style.marginTop = "15px";
  button.textContent = "Renvoyer le mail de vérification";

  button.onclick = async () => {
    if (!email) {
      toast("Entre ton adresse email pour renvoyer le mail.");
      return;
    }

    await resendVerification(email);
  };

  box.appendChild(button);
}


async function resendVerification(email) {

  try {

    await api("/api/resend-verification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email
      })
    });

    toast("Email de vérification renvoyé ✉️");

  } catch (error) {
    toast(error.message);
  }
}


/* =========================
   APPLICATION
========================= */

async function enterApp(user) {

  me = user;

  $("#auth").classList.add("hidden");
  $("#app").classList.remove("hidden");

  updateUserInterface();

  await loadFeed();
  await loadStories();
  await loadNotifications();

  showView("feed");
}


function updateUserInterface() {

  if (!me) return;

  const letter = initials(me.username);

  if ($("#hello")) {
    $("#hello").textContent = me.username;
  }

  if ($("#headerAvatar")) {
    $("#headerAvatar").textContent = letter;
  }

  if ($("#composerAvatar")) {
    $("#composerAvatar").textContent = letter;
  }

  if ($("#sidebarAvatar")) {
    $("#sidebarAvatar").textContent = letter;
  }

  if ($("#sidebarUsername")) {
    $("#sidebarUsername").textContent = me.username;
  }

  const sidebarUser = document.querySelector("#sidebarUsername");

  if (
    sidebarUser &&
    sidebarUser.parentElement &&
    sidebarUser.parentElement.querySelector("span")
  ) {
    sidebarUser.parentElement.querySelector("span").textContent =
      "@" + me.username;
  }
}


/* =========================
   NAVIGATION
========================= */

const views = [
  "feed",
  "search",
  "messages",
  "notifications",
  "saved",
  "profile",
  "settings"
];

$$("[data-view]").forEach(button => {
  button.addEventListener("click", () => {
    showView(button.dataset.view);
  });
});


function showView(view) {

  if (!views.includes(view)) return;

  currentView = view;

  views.forEach(name => {

    const element = $("#" + name + "View");

    if (element) {
      element.classList.toggle("hidden", name !== view);
    }

  });

  $$("[data-view]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.view === view
    );
  });

  if (view === "feed") loadFeed();
  if (view === "search") $("#globalSearch")?.focus();
  if (view === "messages") loadConversations();
  if (view === "notifications") loadNotifications();
  if (view === "saved") loadSaved();
  if (view === "profile") loadProfile();
  if (view === "settings") loadSettings();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/* =========================
   DECONNEXION
========================= */

async function logout() {

  try {
    await api("/api/logout", {
      method: "POST"
    });
  } catch {}

  location.reload();
}

$("#logout").addEventListener("click", logout);
$("#settingsLogout").addEventListener("click", logout);


/* =========================
   FEED
========================= */

async function loadFeed() {

  try {

    const data = await api("/api/feed");

    const feed = $("#feed");

    if (!data.posts || !data.posts.length) {

      feed.innerHTML = `
        <div class="card" style="padding:40px;text-align:center">
          <div style="font-size:40px;margin-bottom:12px">✨</div>
          <h3>Ton fil est vide</h3>
          <p style="color:var(--muted);margin-top:7px">
            Sois le premier à publier quelque chose !
          </p>
        </div>
      `;

      return;
    }

    feed.innerHTML = data.posts.map(renderPost).join("");

  } catch (error) {
    toast(error.message);
  }
}


function renderPost(post) {

  const image = post.image
    ? `
      <img
        src="${esc(post.image)}"
        alt="Publication de ${esc(post.username)}"
        loading="lazy"
      >
    `
    : "";

  return `
    <article class="post">

      <div class="postHead">

        <div class="avatar">
          ${initials(post.username)}
        </div>

        <div>
          <div class="user">@${esc(post.username)}</div>

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

      ${image}

      <div class="actions">

        <button
          class="${post.liked ? "liked" : ""}"
          onclick="likePost(${post.id})"
        >
          ${post.liked ? "♥" : "♡"} ${post.likes || 0}
        </button>

        <button onclick="toggleComments(${post.id})">
          💬 ${post.comments || 0}
        </button>

        <button onclick="savePost(${post.id})">
          🔖
        </button>

      </div>

      <div
        id="comments-${post.id}"
        class="comments hidden"
      ></div>

    </article>
  `;
}


/* =========================
   PUBLICATION
========================= */

$("#publish").addEventListener("click", async () => {

  const text = $("#postText").value.trim();
  const image = $("#postImage").files[0];

  if (!text && !image) {
    toast("Écris quelque chose ou ajoute une photo.");
    return;
  }

  try {

    const formData = new FormData();

    formData.append("content", text);

    if (image) {
      formData.append("image", image);
    }

    await api("/api/posts", {
      method: "POST",
      body: formData
    });

    $("#postText").value = "";
    $("#postImage").value = "";

    toast("Publication créée ✨");

    await loadFeed();

  } catch (error) {
    toast(error.message);
  }
});


/* =========================
   LIKES
========================= */

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


/* =========================
   COMMENTAIRES
========================= */

async function toggleComments(id) {

  const box = $(`#comments-${id}`);

  if (!box) return;

  if (!box.classList.contains("hidden")) {
    box.classList.add("hidden");
    return;
  }

  try {

    const data = await api(`/api/posts/${id}/comments`);

    box.classList.remove("hidden");

    box.innerHTML = `

      ${
        data.comments.length
          ? data.comments.map(comment => `
              <div class="comment">
                <b>@${esc(comment.username)}</b>
                ${esc(comment.content)}
              </div>
            `).join("")
          : `
            <p style="color:var(--muted);font-size:13px">
              Aucun commentaire.
            </p>
          `
      }

      <div class="commentBox">

        <input
          id="ci-${id}"
          maxlength="500"
          placeholder="Écrire un commentaire..."
        >

        <button onclick="commentPost(${id})">
          Envoyer
        </button>

      </div>
    `;

  } catch (error) {
    toast(error.message);
  }
}


async function commentPost(id) {

  const input = $(`#ci-${id}`);

  if (!input || !input.value.trim()) return;

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

    await loadFeed();

    toast("Commentaire ajouté");

  } catch (error) {
    toast(error.message);
  }
}


/* =========================
   ENREGISTRÉS
========================= */

async function savePost(id) {

  try {

    const data = await api(`/api/posts/${id}/save`, {
      method: "POST"
    });

    toast(
      data.saved
        ? "Publication enregistrée 🔖"
        : "Publication retirée"
    );

  } catch (error) {
    toast(error.message);
  }
}


async function loadSaved() {

  try {

    const data = await api("/api/saved");

    const container = $("#savedPosts");

    if (!data.posts || !data.posts.length) {

      container.innerHTML = `
        <div class="card" style="padding:40px;text-align:center">
          <div style="font-size:38px">🔖</div>
          <h3 style="margin-top:10px">
            Aucune publication enregistrée
          </h3>
        </div>
      `;

      return;
    }

    container.innerHTML =
      data.posts.map(renderPost).join("");

  } catch (error) {
    toast(error.message);
  }
}


/* =========================
   RECHERCHE
========================= */

$("#searchButton").addEventListener(
  "click",
  performSearch
);

$("#globalSearch").addEventListener("keydown", e => {

  if (e.key === "Enter") {
    performSearch();
  }

});


$("#quickSearch").addEventListener("keydown", e => {

  if (e.key === "Enter") {

    const value = e.target.value.trim();

    if (!value) return;

    showView("search");

    $("#globalSearch").value = value;

    performSearch();
  }

});


async function performSearch() {

  const query = $("#globalSearch").value.trim();

  if (!query) {
    $("#searchResults").innerHTML = "";
    return;
  }

  try {

    const data = await api(
      `/api/search?q=${encodeURIComponent(query)}`
    );

    const results =
      data.users || data.results || [];

    if (!results.length) {

      $("#searchResults").innerHTML = `
        <div class="card" style="padding:30px;text-align:center">
          Aucun utilisateur trouvé.
        </div>
      `;

      return;
    }

    $("#searchResults").innerHTML =
      results.map(user => `

        <div class="search-result">

          <div class="search-user">

            <div class="avatar">
              ${initials(user.username)}
            </div>

            <div>
              <strong>@${esc(user.username)}</strong>

              ${
                user.bio
                  ? `
                    <div style="
                      font-size:12px;
                      color:var(--muted)
                    ">
                      ${esc(user.bio)}
                    </div>
                  `
                  : ""
              }

            </div>

          </div>

          <button
            class="primary-btn"
            onclick="openUserProfile('${encodeURIComponent(user.username)}')"
          >
            Voir
          </button>

        </div>

      `).join("");

  } catch (error) {
    toast(error.message);
  }
}


async function openUserProfile(encodedUsername) {

  const username =
    decodeURIComponent(encodedUsername);

  try {

    const data = await api(
      `/api/users/${encodeURIComponent(username)}`
    );

    openModal(`

      <div style="text-align:center">

        <div
          class="profile-avatar"
          style="margin:0 auto"
        >
          ${initials(data.user.username)}
        </div>

        <h2 style="margin-top:15px">
          @${esc(data.user.username)}
        </h2>

        <p style="
          color:var(--muted);
          margin-top:7px
        ">
          ${esc(
            data.user.bio ||
            "Bienvenue sur Dina 👋"
          )}
        </p>

        <div
          class="profile-stats"
          style="justify-content:center"
        >

          <div class="profile-stat">
            <strong>${data.posts?.length || 0}</strong>
            <span>Publications</span>
          </div>

        </div>

        <button
          class="primary-btn"
          style="margin-top:22px"
          onclick="startConversation('${encodeURIComponent(username)}')"
        >
          Envoyer un message
        </button>

      </div>

    `);

  } catch (error) {
    toast(error.message);
  }
}


/* =========================
   PROFIL
========================= */

async function loadProfile() {

  if (!me) return;

  try {

    const data = await api(
      `/api/users/${encodeURIComponent(me.username)}`
    );

    const posts = data.posts || [];

    $("#profileBox").innerHTML = `

      <div class="profile-card">

        <div class="profile-cover"></div>

        <div class="profile-info">

          <div class="profile-avatar">
            ${initials(me.username)}
          </div>

          <h2>@${esc(data.user.username)}</h2>

          <p>
            ${esc(
              data.user.bio ||
              "Bienvenue sur Dina 👋"
            )}
          </p>

          <div class="profile-stats">

            <div class="profile-stat">
              <strong>${posts.length}</strong>
              <span>Publications</span>
            </div>

            <div class="profile-stat">
              <strong>${data.followers || 0}</strong>
              <span>Abonnés</span>
            </div>

            <div class="profile-stat">
              <strong>${data.following || 0}</strong>
              <span>Abonnements</span>
            </div>

          </div>

          <button
            class="primary-btn"
            style="margin-top:20px"
            onclick="editProfile()"
          >
            Modifier mon profil
          </button>

        </div>

      </div>

      <div style="margin-top:25px">

        <h2 style="margin-bottom:15px">
          Mes publications
        </h2>

        <div class="feed-list">

          ${
            posts.length
              ? posts.map(renderPost).join("")
              : `
                <div
                  class="card"
                  style="padding:35px;text-align:center"
                >
                  Aucune publication.
                </div>
              `
          }

        </div>

      </div>
    `;

  } catch (error) {
    toast(error.message);
  }
}


function editProfile() {

  openModal(`

    <h2>Modifier mon profil</h2>

    <div style="margin-top:20px">

      <label
        style="
          display:block;
          font-weight:700;
          margin-bottom:7px
        "
      >
        Bio
      </label>

      <textarea
        id="editBio"
        maxlength="300"
        style="
          width:100%;
          min-height:120px;
          padding:12px;
          border:1px solid var(--border);
          border-radius:12px;
          resize:vertical;
          background:transparent;
          color:var(--text);
        "
        placeholder="Parle un peu de toi..."
      ></textarea>

      <button
        class="primary-btn"
        style="margin-top:15px;width:100%"
        onclick="saveProfile()"
      >
        Enregistrer
      </button>

    </div>

  `);
}


async function saveProfile() {

  const bio = $("#editBio")?.value || "";

  try {

    await api("/api/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        bio
      })
    });

    closeModal();

    toast("Profil mis à jour ✨");

    await loadProfile();

  } catch (error) {
    toast(error.message);
  }
}


/* =========================
   NOTIFICATIONS
========================= */

async function loadNotifications() {

  try {

    const data = await api("/api/notifications");

    const notifications =
      data.notifications || [];

    const badge = $("#notificationBadge");

    if (notifications.length) {

      badge.textContent =
        notifications.length;

      badge.classList.remove("hidden");

    } else {

      badge.classList.add("hidden");

    }

    const container =
      $("#notificationsList");

    if (!notifications.length) {

      container.innerHTML = `
        <div style="
          padding:40px;
          text-align:center;
          color:var(--muted)
        ">
          <div style="font-size:35px">🔔</div>
          <p style="margin-top:10px">
            Aucune notification.
          </p>
        </div>
      `;

      return;
    }

    container.innerHTML =
      notifications.map(notification => `

        <div class="notification">

          <div class="notification-icon">
            ♡
          </div>

          <div>

            <strong>
              ${esc(
                notification.message ||
                "Nouvelle activité"
              )}
            </strong>

            <small>
              ${formatDate(
                notification.created_at
              )}
            </small>

          </div>

        </div>

      `).join("");

  } catch (error) {
    console.log(
      "Notifications:",
      error.message
    );
  }
}


/* =========================
   MESSAGES PRIVÉS
========================= */

async function loadConversations() {

  try {

    const data =
      await api("/api/conversations");

    const conversations =
      data.conversations || [];

    const list =
      $("#conversationList");

    if (!conversations.length) {

      list.innerHTML = `
        <div class="empty-small">
          Aucune conversation.<br><br>
          Utilise la recherche pour envoyer
          un message.
        </div>
      `;

      return;
    }

    list.innerHTML =
      conversations.map(conversation => `

        <div
          class="conversation-item"
          onclick="
            openConversation(
              ${conversation.user_id},
              '${encodeURIComponent(conversation.username)}'
            )
          "
        >

          <div class="avatar">
            ${initials(conversation.username)}
          </div>

          <div>

            <strong>
              @${esc(conversation.username)}
            </strong>

            ${
              conversation.last_message
                ? `
                  <div style="
                    color:var(--muted);
                    font-size:11px;
                    margin-top:3px;
                  ">
                    ${esc(
                      conversation.last_message
                    )}
                  </div>
                `
                : ""
            }

          </div>

        </div>

      `).join("");

  } catch (error) {
    console.log(
      "Conversations:",
      error.message
    );
  }
}


async function startConversation(encodedUsername) {

  const username =
    decodeURIComponent(encodedUsername);

  closeModal();

  showView("messages");

  try {

    const data = await api(
      `/api/users/${encodeURIComponent(username)}`
    );

    openConversation(
      data.user.id,
      encodeURIComponent(data.user.username)
    );

  } catch (error) {
    toast(error.message);
  }
}


async function openConversation(
  userId,
  encodedUsername
) {

  const username =
    decodeURIComponent(encodedUsername);

  currentConversationUser = {
    id: userId,
    username
  };

  const container =
    $("#conversation");

  container.innerHTML = `

    <div class="message-header">
      @${esc(username)}
    </div>

    <div
      id="messagesBody"
      class="messages-body"
    >
      <div style="
        text-align:center;
        color:var(--muted)
      ">
        Chargement...
      </div>
    </div>

    <form
      id="messageForm"
      class="message-form"
    >

      <input
        id="messageInput"
        maxlength="2000"
        placeholder="Écrire un message..."
        autocomplete="off"
      >

      <button
        class="primary-btn"
        type="submit"
      >
        Envoyer
      </button>

    </form>

  `;

  $("#messageForm")
    .addEventListener(
      "submit",
      sendMessage
    );

  await loadMessages(userId);
}


async function loadMessages(userId) {

  try {

    const data =
      await api(`/api/messages/${userId}`);

    const messages =
      data.messages || [];

    const body =
      $("#messagesBody");

    body.innerHTML = messages.length
      ? messages.map(message => `

          <div class="message ${
            message.sender_id === me.id
              ? "mine"
              : ""
          }">

            ${esc(message.content)}

            <div class="message-time">
              ${formatDate(
                message.created_at
              )}
            </div>

          </div>

        `).join("")

      : `
        <div style="
          text-align:center;
          color:var(--muted);
          margin-top:30px;
        ">
          Aucun message.
          Commence la conversation !
        </div>
      `;

    body.scrollTop =
      body.scrollHeight;

  } catch (error) {
    toast(error.message);
  }
}


async function sendMessage(event) {

  event.preventDefault();

  if (!currentConversationUser) return;

  const input =
    $("#messageInput");

  const content =
    input.value.trim();

  if (!content) return;

  try {

    await api("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId:
          currentConversationUser.id,
        content
      })
    });

    input.value = "";

    await loadMessages(
      currentConversationUser.id
    );

    await loadConversations();

  } catch (error) {
    toast(error.message);
  }
}


/* =========================
   STORIES
========================= */

async function loadStories() {

  try {

    const data =
      await api("/api/stories");

    const stories =
      data.stories || [];

    const container =
      $("#stories");

    container.innerHTML = `
      <button
        class="story add-story"
        onclick="addStory()"
      >
        <div class="story-avatar">＋</div>
        <span>Ton moment</span>
      </button>
    `;

    stories.forEach(story => {

      const element =
        document.createElement("button");

      element.className = "story";

      element.innerHTML = `
        <div class="story-avatar">
          ${initials(story.username)}
        </div>

        <span>
          @${esc(story.username)}
        </span>
      `;

      element.onclick = () => {

        openModal(`

          <div style="text-align:center">

            <div
              class="avatar"
              style="
                width:70px;
                height:70px;
                margin:auto;
                font-size:25px;
              "
            >
              ${initials(story.username)}
            </div>

            <h2 style="margin-top:15px">
              @${esc(story.username)}
            </h2>

            <p style="
              margin-top:15px;
              font-size:18px;
              line-height:1.5;
            ">
              ${esc(story.content)}
            </p>

          </div>

        `);

      };

      container.appendChild(element);

    });

  } catch (error) {
    console.log(
      "Stories:",
      error.message
    );
  }
}


function addStory() {

  openModal(`

    <h2>Ajouter un moment ✨</h2>

    <textarea
      id="storyContent"
      maxlength="500"
      placeholder="Que veux-tu partager ?"
      style="
        width:100%;
        min-height:120px;
        margin-top:20px;
        padding:12px;
        border:1px solid var(--border);
        border-radius:12px;
        resize:vertical;
        background:transparent;
        color:var(--text);
      "
    ></textarea>

    <button
      class="primary-btn"
      style="
        width:100%;
        margin-top:15px
      "
      onclick="publishStory()"
    >
      Publier le moment
    </button>

  `);
}


async function publishStory() {

  const input =
    $("#storyContent");

  if (!input || !input.value.trim()) {
    toast("Écris quelque chose.");
    return;
  }

  try {

    await api("/api/stories", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: input.value.trim()
      })
    });

    closeModal();

    toast("Moment publié ✨");

    await loadStories();

  } catch (error) {
    toast(error.message);
  }
}


$("#addStory").addEventListener(
  "click",
  addStory
);


/* =========================
   MODE SOMBRE
========================= */

function setDarkMode(enabled) {

  document.body.classList.toggle(
    "dark",
    enabled
  );

  localStorage.setItem(
    "dina-dark-mode",
    enabled ? "1" : "0"
  );

  if ($("#settingsDarkMode")) {
    $("#settingsDarkMode").checked =
      enabled;
  }
}


function loadSettings() {

  const enabled =
    localStorage.getItem(
      "dina-dark-mode"
    ) === "1";

  $("#settingsDarkMode").checked =
    enabled;
}


$("#darkMode").addEventListener(
  "click",
  () => {

    const enabled =
      !document.body.classList.contains("dark");

    setDarkMode(enabled);

  }
);


$("#settingsDarkMode").addEventListener(
  "change",
  e => {
    setDarkMode(e.target.checked);
  }
);


const savedDarkMode =
  localStorage.getItem(
    "dina-dark-mode"
  ) === "1";

setDarkMode(savedDarkMode);


/* =========================
   MODAL
========================= */

function openModal(content) {

  $("#modalContent").innerHTML =
    content;

  $("#modal").classList.remove(
    "hidden"
  );
}


function closeModal() {

  $("#modal").classList.add(
    "hidden"
  );

  $("#modalContent").innerHTML = "";
}


$("#closeModal")
  .addEventListener(
    "click",
    closeModal
  );


document
  .querySelector(".modal-overlay")
  ?.addEventListener(
    "click",
    closeModal
  );


/* =========================
   INITIALISATION
========================= */

api("/api/me")
  .then(data => {

    if (data.user) {
      enterApp(data.user);
    }

  })
  .catch(() => {
    // Personne n'est connecté.
  });
