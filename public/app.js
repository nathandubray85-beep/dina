const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let me = null;
let currentConversation = null;

function toast(message) {
  const box = $("#toast");
  if (!box) return;

  box.textContent = message;
  box.style.display = "block";

  setTimeout(() => {
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
    throw new Error(data.error || "Une erreur est survenue.");
  }

  return data;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[c]));
}

function avatar(username, image = "") {
  if (image) {
    return `<img class="avatarImg" src="${esc(image)}" alt="">`;
  }

  return `<div class="avatar">
    ${esc((username || "?")[0].toUpperCase())}
  </div>`;
}

/* =========================
   AUTHENTIFICATION
========================= */

if ($("#login")) {
  $("#login").onsubmit = async (e) => {
    e.preventDefault();

    try {
      const body = Object.fromEntries(
        new FormData(e.target)
      );

      const data = await api("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      enter(data.user);
    } catch (error) {
      $("#authMsg").textContent = error.message;
    }
  };
}

if ($("#register")) {
  $("#register").onsubmit = async (e) => {
    e.preventDefault();

    try {
      const body = Object.fromEntries(
        new FormData(e.target)
      );

      const data = await api("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });

      enter(data.user);
    } catch (error) {
      $("#authMsg").textContent = error.message;
    }
  };
}

$$(".tabs button").forEach((button) => {
  button.onclick = () => {
    $$(".tabs button").forEach((b) =>
      b.classList.remove("active")
    );

    button.classList.add("active");

    if ($("#login")) {
      $("#login").classList.toggle(
        "hidden",
        button.dataset.tab !== "login"
      );
    }

    if ($("#register")) {
      $("#register").classList.toggle(
        "hidden",
        button.dataset.tab !== "register"
      );
    }

    if ($("#authMsg")) {
      $("#authMsg").textContent = "";
    }
  };
});

async function enter(user) {
  me = user;

  $("#auth")?.classList.add("hidden");
  $("#app")?.classList.remove("hidden");

  if ($("#hello")) {
    $("#hello").textContent = user.username;
  }

  if ($("#headerAvatar")) {
    $("#headerAvatar").innerHTML =
      avatar(user.username, user.avatar);
  }

  await loadFeed();
  await loadStories();
  await loadNotifications();
}

/* =========================
   DÉCONNEXION
========================= */

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

/* =========================
   NAVIGATION
========================= */

function showView(view) {
  const views = [
    "feedView",
    "searchView",
    "messagesView",
    "notificationsView",
    "profileView",
    "savedView",
    "settingsView"
  ];

  views.forEach((id) => {
    const element = $("#" + id);

    if (element) {
      element.classList.toggle(
        "hidden",
        id !== view + "View"
      );
    }
  });

  $$("[data-view]").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.view === view
    );
  });

  if (view === "feed") loadFeed();
  if (view === "search") loadSearch("");
  if (view === "messages") loadConversations();
  if (view === "notifications") loadNotifications();
  if (view === "profile") loadProfile();
  if (view === "saved") loadSaved();
}

$$("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    showView(button.dataset.view);
  });
});

/* =========================
   PUBLICATIONS
========================= */

$("#publish")?.addEventListener("click", async () => {
  const text = $("#postText")?.value.trim();
  const image = $("#postImage")?.files?.[0];

  if (!text && !image) {
    toast("Écris quelque chose ou ajoute une photo.");
    return;
  }

  const formData = new FormData();

  formData.append("content", text || "");

  if (image) {
    formData.append("image", image);
  }

  try {
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

async function loadFeed() {
  try {
    const data = await api("/api/feed");

    if (!$("#feed")) return;

    if (!data.posts.length) {
      $("#feed").innerHTML = `
        <div class="empty">
          Aucune publication pour le moment.
        </div>
      `;
      return;
    }

    $("#feed").innerHTML = data.posts
      .map((post) => `
        <article class="post">

          <div class="postHead">
            ${avatar(post.username)}

            <div>
              <strong>@${esc(post.username)}</strong>
              <div class="date">
                ${new Date(post.created_at).toLocaleString("fr-FR")}
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
                  alt="Publication"
                >
              `
              : ""
          }

          <div class="actions">

            <button
              class="${post.liked ? "liked" : ""}"
              onclick="likePost(${post.id})"
            >
              ❤️ ${post.likes}
            </button>

            <button
              onclick="toggleComments(${post.id})"
            >
              💬 ${post.comments}
            </button>

            <button
              class="${post.saved ? "saved" : ""}"
              onclick="savePost(${post.id})"
            >
              🔖
            </button>

          </div>

          <div
            id="comments-${post.id}"
            class="comments hidden"
          ></div>

        </article>
      `)
      .join("");

  } catch (error) {
    toast(error.message);
  }
}

async function likePost(id) {
  try {
    await api(`/api/posts/${id}/like`, {
      method: "POST"
    });

    loadFeed();
  } catch (error) {
    toast(error.message);
  }
}

async function savePost(id) {
  try {
    const data = await api(`/api/posts/${id}/save`, {
      method: "POST"
    });

    toast(
      data.saved
        ? "Publication enregistrée 🔖"
        : "Publication retirée des enregistrées."
    );

    loadFeed();
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
    const data = await api(
      `/api/posts/${id}/comments`
    );

    box.classList.remove("hidden");

    box.innerHTML = `
      ${
        data.comments.length
          ? data.comments
              .map(
                (comment) => `
                  <div class="comment">
                    <b>@${esc(comment.username)}</b>
                    ${esc(comment.content)}
                  </div>
                `
              )
              .join("")
          : `<div class="empty">Aucun commentaire.</div>`
      }

      <div class="commentBox">
        <input
          id="commentInput-${id}"
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
  } catch (error) {
    toast(error.message);
  }
}

async function commentPost(id) {
  const input = $(`#commentInput-${id}`);

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

    await toggleComments(id);
    await toggleComments(id);

    loadFeed();
  } catch (error) {
    toast(error.message);
  }
}

/* =========================
   RECHERCHE
========================= */

async function loadSearch(query) {
  if (!$("#searchResults")) return;

  if (!query.trim()) {
    $("#searchResults").innerHTML = `
      <div class="empty">
        Recherche un utilisateur sur Dina 🔎
      </div>
    `;
    return;
  }

  try {
    const data = await api(
      `/api/search?q=${encodeURIComponent(query)}`
    );

    if (!data.users.length) {
      $("#searchResults").innerHTML = `
        <div class="empty">
          Aucun utilisateur trouvé.
        </div>
      `;
      return;
    }

    $("#searchResults").innerHTML = data.users
      .map(
        (user) => `
          <div class="userResult">

            ${avatar(user.username, user.avatar)}

            <div class="userInfo">
              <strong>@${esc(user.username)}</strong>
              <span>${esc(user.bio || "")}</span>
            </div>

            <button
              onclick="openUser('${esc(user.username)}')"
            >
              Voir
            </button>

          </div>
        `
      )
      .join("");
  } catch (error) {
    toast(error.message);
  }
}

$("#searchButton")?.addEventListener("click", () => {
  loadSearch($("#globalSearch").value);
});

$("#globalSearch")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    loadSearch(e.target.value);
  }
});

$("#quickSearch")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    showView("search");

    if ($("#globalSearch")) {
      $("#globalSearch").value = e.target.value;
    }

    loadSearch(e.target.value);
  }
});

async function openUser(username) {
  showView("profile");

  try {
    const data = await api(
      `/api/users/${encodeURIComponent(username)}`
    );

    renderProfile(data);
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

    renderProfile(data);
  } catch (error) {
    toast(error.message);
  }
}

function renderProfile(data) {
  if (!$("#profileBox")) return;

  const user = data.user;

  $("#profileBox").innerHTML = `
    <div class="profileCard">

      <div class="profileTop">
        ${avatar(user.username, user.avatar)}

        <div>
          <h2>@${esc(user.username)}</h2>

          <p>
            ${esc(user.bio || "Bienvenue sur Dina 👋")}
          </p>
        </div>
      </div>

      <div class="profileStats">
        <span>
          <b>${data.posts.length}</b>
          publications
        </span>

        <span>
          <b>${data.followers}</b>
          abonnés
        </span>

        <span>
          <b>${data.following}</b>
          abonnements
        </span>
      </div>

      ${
        user.id !== me.id
          ? `
            <button
              onclick="toggleFollow('${esc(user.username)}')"
            >
              ${
                data.isFollowing
                  ? "Se désabonner"
                  : "Suivre"
              }
            </button>
          `
          : `
            <button onclick="openProfileEditor()">
              Modifier mon profil
            </button>
          `
      }

    </div>

    <div class="profilePosts">
      ${
        data.posts.length
          ? data.posts
              .map(
                (post) => `
                  <article class="post">

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
                            alt=""
                          >
                        `
                        : ""
                    }

                  </article>
                `
              )
              .join("")
          : `<div class="empty">Aucune publication.</div>`
      }
    </div>
  `;
}

async function toggleFollow(username) {
  try {
    await api(
      `/api/users/${encodeURIComponent(username)}/follow`,
      {
        method: "POST"
      }
    );

    openUser(username);
  } catch (error) {
    toast(error.message);
  }
}

/* =========================
   MODIFICATION PROFIL
========================= */

function openProfileEditor() {
  if (!$("#modal") || !$("#modalContent")) return;

  $("#modalContent").innerHTML = `
    <div class="modalBox">

      <h2>Modifier mon profil</h2>

      <textarea
        id="bioInput"
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

    </div>
  `;

  $("#modal").classList.remove("hidden");
}

async function saveProfile() {
  try {
    const bio = $("#bioInput").value;

    const data = await api("/api/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ bio })
    });

    me = {
      ...me,
      ...data.user
    };

    closeModal();
    loadProfile();

    toast("Profil modifié ✨");
  } catch (error) {
    toast(error.message);
  }
}

function closeModal() {
  $("#modal")?.classList.add("hidden");
}

/* =========================
   NOTIFICATIONS
========================= */

async function loadNotifications() {
  if (!$("#notificationsList")) return;

  try {
    const data = await api("/api/notifications");

    $("#notificationsList").innerHTML =
      data.notifications.length
        ? data.notifications
            .map(
              (notification) => `
                <div class="notification ${
                  notification.read ? "" : "unread"
                }">

                  ${avatar(
                    notification.username,
                    notification.avatar
                  )}

                  <div>
                    <b>@${esc(notification.username)}</b>
                    ${esc(notification.message)}

                    <small>
                      ${new Date(
                        notification.created_at
                      ).toLocaleString("fr-FR")}
                    </small>
                  </div>

                </div>
              `
            )
            .join("")
        : `
          <div class="empty">
            Aucune notification.
          </div>
        `;

    updateNotificationBadge(data.notifications);

  } catch (error) {
    toast(error.message);
  }
}

function updateNotificationBadge(notifications) {
  const count = notifications.filter(
    (n) => !n.read
  ).length;

  const badge = $("#notificationBadge");

  if (!badge) return;

  badge.textContent = count > 99 ? "99+" : count;
  badge.classList.toggle("hidden", count === 0);
}

$("#notificationsView")?.addEventListener(
  "click",
  async () => {
    try {
      await api("/api/notifications/read", {
        method: "POST"
      });

      loadNotifications();
    } catch {}
  }
);

/* =========================
   MESSAGES
========================= */

async function loadConversations() {
  if (!$("#conversationList")) return;

  try {
    const data = await api(
      "/api/conversations"
    );

    $("#conversationList").innerHTML =
      data.conversations.length
        ? data.conversations
            .map(
              (conversation) => `
                <button
                  class="conversationItem"
                  onclick="openConversation(${conversation.id}, '${esc(
                    conversation.username || "Conversation"
                  )}')"
                >
                  <strong>
                    @${esc(
                      conversation.username ||
                        "Conversation"
                    )}
                  </strong>

                  <span>
                    ${esc(
                      conversation.last_message ||
                        "Nouvelle conversation"
                    )}
                  </span>
                </button>
              `
            )
            .join("")
        : `
          <div class="empty">
            Aucune conversation.
          </div>
        `;
  } catch (error) {
    toast(error.message);
  }
}

async function openConversation(id, username) {
  currentConversation = id;

  if ($("#conversation")) {
    $("#conversation").innerHTML = `
      <div class="conversationHeader">
        <h3>@${esc(username)}</h3>
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
          placeholder="Écrire un message..."
          autocomplete="off"
        >

        <button>
          Envoyer
        </button>
      </form>
    `;

    $("#messageForm").onsubmit = async (e) => {
      e.preventDefault();

      const input = $("#messageInput");

      if (!input.value.trim()) return;

      try {
        await api(
          `/api/conversations/${id}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              content: input.value.trim()
            })
          }
        );

        input.value = "";

        loadMessages(id);
      } catch (error) {
        toast(error.message);
      }
    };
  }

  loadMessages(id);
}

async function loadMessages(id) {
  try {
    const data = await api(
      `/api/conversations/${id}/messages`
    );

    if (!$("#messagesList")) return;

    $("#messagesList").innerHTML =
      data.messages.length
        ? data.messages
            .map(
              (message) => `
                <div class="message ${
                  message.sender_id === me.id
                    ? "mine"
                    : ""
                }">

                  <b>@${esc(message.username)}</b>

                  <div>
                    ${esc(message.content)}
                  </div>

                  <small>
                    ${new Date(
                      message.created_at
                    ).toLocaleTimeString(
                      "fr-FR",
                      {
                        hour: "2-digit",
                        minute: "2-digit"
                      }
                    )}
                  </small>

                </div>
              `
            )
            .join("")
        : `
          <div class="empty">
            Aucun message.
          </div>
        `;

    $("#messagesList").scrollTop =
      $("#messagesList").scrollHeight;

  } catch (error) {
    toast(error.message);
  }
}

async function startConversation() {
  const username = prompt(
    "Nom d'utilisateur avec qui discuter :"
  );

  if (!username) return;

  try {
    const data = await api(
      "/api/conversations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username
        })
      }
    );

    showView("messages");

    await loadConversations();

    openConversation(
      data.conversationId,
      username
    );
  } catch (error) {
    toast(error.message);
  }
}

/* =========================
   PUBLICATIONS ENREGISTRÉES
========================= */

async function loadSaved() {
  if (!$("#savedPosts")) return;

  try {
    const data = await api("/api/saved");

    $("#savedPosts").innerHTML =
      data.posts.length
        ? data.posts
            .map(
              (post) => `
                <article class="post">

                  <div class="postHead">
                    ${avatar(post.username)}

                    <strong>
                      @${esc(post.username)}
                    </strong>
                  </div>

                  ${
                    post.content
                      ? `<div class="content">${esc(
                          post.content
                        )}</div>`
                      : ""
                  }

                  ${
                    post.image
                      ? `
                        <img
                          class="postImage"
                          src="${esc(post.image)}"
                          alt=""
                        >
                      `
                      : ""
                  }

                  <button
                    onclick="savePost(${post.id})"
                  >
                    🔖 Retirer
                  </button>

                </article>
              `
            )
            .join("")
        : `
          <div class="empty">
            Tu n'as aucune publication enregistrée.
          </div>
        `;
  } catch (error) {
    toast(error.message);
  }
}

/* =========================
   STORIES
========================= */

async function loadStories() {
  if (!$("#stories")) return;

  try {
    const data = await api("/api/stories");

    $("#stories").innerHTML =
      data.stories.length
        ? data.stories
            .map(
              (story) => `
                <div class="story">

                  <img
                    src="${esc(story.image)}"
                    alt=""
                  >

                  <span>
                    @${esc(story.username)}
                  </span>

                </div>
              `
            )
            .join("")
        : `
          <div class="empty">
            Aucun story pour le moment.
          </div>
        `;
  } catch (error) {
    // Les stories ne doivent pas bloquer Dina.
  }
}

/* =========================
   AJOUT STORY
========================= */

async function publishStory(file) {
  if (!file) return;

  const formData = new FormData();

  formData.append("image", file);

  try {
    await api("/api/stories", {
      method: "POST",
      body: formData
    });

    toast("Story publiée 📸");

    loadStories();
  } catch (error) {
    toast(error.message);
  }
}

$("#storyImage")?.addEventListener(
  "change",
  (e) => {
    publishStory(e.target.files[0]);
  }
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
    "dinaDarkMode",
    enabled ? "1" : "0"
  );

  if ($("#darkMode")) {
    $("#darkMode").checked = enabled;
  }

  if ($("#settingsDarkMode")) {
    $("#settingsDarkMode").checked =
      enabled;
  }
}

const savedDarkMode =
  localStorage.getItem("dinaDarkMode") === "1";

setDarkMode(savedDarkMode);

$("#darkMode")?.addEventListener(
  "change",
  (e) => {
    setDarkMode(e.target.checked);
  }
);

$("#settingsDarkMode")?.addEventListener(
  "change",
  (e) => {
    setDarkMode(e.target.checked);
  }
);

/* =========================
   BOUTON NOUVELLE CONVERSATION
========================= */

$("#newConversation")?.addEventListener(
  "click",
  startConversation
);

/* =========================
   MODAL
========================= */

$("#modal")?.addEventListener(
  "click",
  (e) => {
    if (e.target.id === "modal") {
      closeModal();
    }
  }
);

/* =========================
   DÉMARRAGE
========================= */

api("/api/me")
  .then((data) => {
    enter(data.user);
  })
  .catch(() => {
    $("#auth")?.classList.remove("hidden");
    $("#app")?.classList.add("hidden");
  });
