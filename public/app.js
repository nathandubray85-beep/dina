const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let me = null;
let currentMessageUser = null;

/* =========================
   OUTILS
========================= */

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

function avatar(user, size = "") {
  if (user?.avatar) {
    return `<img class="avatarImg ${size}" src="${user.avatar}" alt="">`;
  }

  const letter = String(user?.username || "?")[0].toUpperCase();

  return `<div class="avatar ${size}">${esc(letter)}</div>`;
}

function formatDate(date) {
  return new Date(date).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/* =========================
   AUTH
========================= */

$$(".tabs button").forEach((button) => {
  button.onclick = () => {
    $$(".tabs button").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");

    $("#login")?.classList.toggle(
      "hidden",
      button.dataset.tab !== "login"
    );

    $("#register")?.classList.toggle(
      "hidden",
      button.dataset.tab !== "register"
    );

    if ($("#authMsg")) {
      $("#authMsg").textContent = "";
    }
  };
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

    enter(data.user);
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

    enter(data.user);
  } catch (error) {
    if ($("#authMsg")) {
      $("#authMsg").textContent = error.message;
    }
  }
});

/* =========================
   CONNEXION
========================= */

async function enter(user) {
  me = user;

  $("#auth")?.classList.add("hidden");
  $("#app")?.classList.remove("hidden");

  if ($("#hello")) {
    $("#hello").textContent = user.username;
  }

  updateHeader();

  await loadFeed();
  await loadStories();
  await loadNotificationCount();
}

function updateHeader() {
  if (!me) return;

  const avatarHTML = avatar(me);

  if ($("#headerAvatar")) {
    $("#headerAvatar").innerHTML = avatarHTML;
  }

  if ($("#composerAvatar")) {
    $("#composerAvatar").innerHTML = avatarHTML;
  }
}

$("#logout")?.addEventListener("click", logout);
$("#settingsLogout")?.addEventListener("click", logout);

async function logout() {
  try {
    await api("/api/logout", {
      method: "POST"
    });
  } catch {}

  location.reload();
}

/* =========================
   NAVIGATION
========================= */

function showView(view) {
  const views = {
    feed: "#feedView",
    search: "#searchView",
    messages: "#messagesView",
    notifications: "#notificationsView",
    profile: "#profileView",
    saved: "#savedView",
    settings: "#settingsView"
  };

  Object.values(views).forEach((selector) => {
    $(selector)?.classList.add("hidden");
  });

  if (views[view]) {
    $(views[view])?.classList.remove("hidden");
  }

  if (view === "feed") loadFeed();
  if (view === "search") {
    $("#globalSearch")?.focus();
  }
  if (view === "messages") loadConversations();
  if (view === "notifications") loadNotifications();
  if (view === "profile") loadProfile();
  if (view === "saved") loadSaved();
}

$$("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;

    if (!view) return;

    showView(view);
  });
});

/* =========================
   FEED
========================= */

async function loadFeed() {
  try {
    const data = await api("/api/feed");

    const feed = $("#feed");

    if (!feed) return;

    if (!data.posts?.length) {
      feed.innerHTML = `
        <div class="empty">
          <h3>Bienvenue sur Dina 👋</h3>
          <p>Aucune publication pour le moment.</p>
        </div>
      `;
      return;
    }

    feed.innerHTML = data.posts
      .map(renderPost)
      .join("");
  } catch (error) {
    toast(error.message);
  }
}

function renderPost(post) {
  return `
    <article class="post">

      <div class="postHead">

        ${avatar({
          username: post.username,
          avatar: post.avatar
        })}

        <div>
          <div class="user">
            @${esc(post.username)}
          </div>

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
          ? `<img
              class="postImage"
              src="${post.image}"
              alt="Publication"
            >`
          : ""
      }

      <div class="actions">

        <button
          class="${post.liked ? "liked" : ""}"
          onclick="likePost(${post.id})"
        >
          ♥ ${post.likes}
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
  `;
}

/* =========================
   PUBLICATION
========================= */

$("#publish")?.addEventListener("click", async () => {
  const text = $("#postText")?.value.trim();
  const image = $("#postImage")?.files?.[0];

  if (!text && !image) {
    toast("Ajoute un texte ou une photo.");
    return;
  }

  const form = new FormData();

  form.append("content", text || "");

  if (image) {
    form.append("image", image);
  }

  try {
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

    toast("Publication créée ✨");

    await loadFeed();
  } catch (error) {
    toast(error.message);
  }
});

/* =========================
   LIKE
========================= */

async function likePost(postId) {
  try {
    await api(`/api/posts/${postId}/like`, {
      method: "POST"
    });

    loadFeed();
  } catch (error) {
    toast(error.message);
  }
}

/* =========================
   COMMENTAIRES
========================= */

async function toggleComments(postId) {
  const box = $(`#comments-${postId}`);

  if (!box) return;

  if (!box.classList.contains("hidden")) {
    box.classList.add("hidden");
    return;
  }

  try {
    const data = await api(
      `/api/posts/${postId}/comments`
    );

    box.classList.remove("hidden");

    box.innerHTML = `
      <div class="commentsList">

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
            : `<p>Aucun commentaire.</p>`
        }

      </div>

      <div class="commentBox">

        <input
          id="ci-${postId}"
          maxlength="500"
          placeholder="Écrire un commentaire..."
        >

        <button
          onclick="commentPost(${postId})"
        >
          Envoyer
        </button>

      </div>
    `;
  } catch (error) {
    toast(error.message);
  }
}

async function commentPost(postId) {
  const input = $(`#ci-${postId}`);

  if (!input || !input.value.trim()) return;

  try {
    await api(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: input.value.trim()
      })
    });

    await toggleComments(postId);

    setTimeout(() => {
      toggleComments(postId);
    }, 50);

    loadFeed();
  } catch (error) {
    toast(error.message);
  }
}

/* =========================
   ENREGISTRER
========================= */

async function savePost(postId) {
  try {
    const data = await api(
      `/api/posts/${postId}/save`,
      {
        method: "POST"
      }
    );

    toast(
      data.saved
        ? "Publication enregistrée 🔖"
        : "Publication retirée des favoris."
    );

    loadFeed();
  } catch (error) {
    toast(error.message);
  }
}

/* =========================
   RECHERCHE
========================= */

$("#searchButton")?.addEventListener(
  "click",
  searchUsers
);

$("#globalSearch")?.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Enter") {
      searchUsers();
    }
  }
);

$("#quickSearch")?.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Enter") {
      const value = event.target.value.trim();

      if (!value) return;

      showView("search");

      if ($("#globalSearch")) {
        $("#globalSearch").value = value;
      }

      searchUsers();
    }
  }
);

async function searchUsers() {
  const input = $("#globalSearch");

  if (!input) return;

  const q = input.value.trim();

  if (!q) {
    $("#searchResults").innerHTML = "";
    return;
  }

  try {
    const data = await api(
      `/api/search?q=${encodeURIComponent(q)}`
    );

    const results = $("#searchResults");

    if (!results) return;

    if (!data.users.length) {
      results.innerHTML = `
        <div class="empty">
          Aucun utilisateur trouvé.
        </div>
      `;
      return;
    }

    results.innerHTML = data.users
      .map(
        (user) => `
          <div class="searchUser">

            ${avatar(user)}

            <div>
              <b>@${esc(user.username)}</b>
              <p>${esc(user.bio || "")}</p>
            </div>

            <button
              onclick="openProfile('${esc(user.username)}')"
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

/* =========================
   PROFIL
========================= */

async function loadProfile(username = me?.username) {
  if (!username) return;

  try {
    const data = await api(
      `/api/users/${encodeURIComponent(username)}`
    );

    const box = $("#profileBox");

    if (!box) return;

    box.innerHTML = `
      <div class="profileCard">

        ${avatar(data.user)}

        <h2>@${esc(data.user.username)}</h2>

        <p>
          ${esc(
            data.user.bio ||
              "Bienvenue sur Dina 👋"
          )}
        </p>

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
          data.user.id !== me.id
            ? `
              <button
                onclick="followUser('${esc(
                  data.user.username
                )}')"
              >
                ${
                  data.isFollowing
                    ? "Ne plus suivre"
                    : "Suivre"
                }
              </button>
            `
            : `
              <button onclick="editProfile()">
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
                    <div class="profilePost">

                      ${
                        post.image
                          ? `<img src="${post.image}" alt="">`
                          : ""
                      }

                      ${
                        post.content
                          ? `<p>${esc(
                              post.content
                            )}</p>`
                          : ""
                      }

                    </div>
                  `
                )
                .join("")
            : `<p>Aucune publication.</p>`
        }

      </div>
    `;
  } catch (error) {
    toast(error.message);
  }
}

async function openProfile(username) {
  showView("profile");
  await loadProfile(username);
}

async function followUser(username) {
  try {
    await api(
      `/api/users/${encodeURIComponent(
        username
      )}/follow`,
      {
        method: "POST"
      }
    );

    await loadProfile(username);
  } catch (error) {
    toast(error.message);
  }
}

/* =========================
   MODIFIER PROFIL
========================= */

async function editProfile() {
  const bio = prompt(
    "Écris ta nouvelle bio :",
    me?.bio || ""
  );

  if (bio === null) return;

  try {
    await api("/api/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        bio
      })
    });

    me.bio = bio;

    toast("Profil modifié ✨");

    loadProfile();
  } catch (error) {
    toast(error.message);
  }
}

/* =========================
   PUBLICATIONS ENREGISTRÉES
========================= */

async function loadSaved() {
  try {
    const data = await api("/api/saved");

    const box = $("#savedPosts");

    if (!box) return;

    if (!data.posts.length) {
      box.innerHTML = `
        <div class="empty">
          <h3>Aucun favori 🔖</h3>
          <p>Les publications que tu enregistres apparaîtront ici.</p>
        </div>
      `;
      return;
    }

    box.innerHTML = data.posts
      .map(
        (post) => `
          <article class="post">

            <div class="postHead">

              ${avatar({
                username: post.username,
                avatar: post.avatar
              })}

              <div>
                <b>@${esc(post.username)}</b>
                <div class="date">
                  ${formatDate(post.created_at)}
                </div>
              </div>

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
                ? `<img class="postImage" src="${post.image}" alt="">`
                : ""
            }

          </article>
        `
      )
      .join("");
  } catch (error) {
    toast(error.message);
  }
}

/* =========================
   NOTIFICATIONS
========================= */

async function loadNotificationCount() {
  try {
    const data = await api(
      "/api/notifications"
    );

    const unread = data.notifications.filter(
      (notification) =>
        !notification.is_read
    ).length;

    const badge = $("#notificationBadge");

    if (!badge) return;

    badge.textContent = unread;

    badge.style.display =
      unread > 0 ? "inline-flex" : "none";
  } catch {}
}

async function loadNotifications() {
  try {
    const data = await api(
      "/api/notifications"
    );

    const box = $("#notificationsList");

    if (!box) return;

    if (!data.notifications.length) {
      box.innerHTML = `
        <div class="empty">
          <h3>Aucune notification 🔔</h3>
        </div>
      `;
    } else {
      box.innerHTML = data.notifications
        .map(
          (notification) => `
            <div class="notification ${
              notification.is_read
                ? ""
                : "unread"
            }">

              ${avatar({
                username:
                  notification.username,
                avatar:
                  notification.avatar
              })}

              <div>
                <b>
                  @${esc(
                    notification.username
                  )}
                </b>

                ${esc(
                  notification.message
                )}

                <small>
                  ${formatDate(
                    notification.created_at
                  )}
                </small>
              </div>

            </div>
          `
        )
        .join("");
    }

    await api("/api/notifications/read", {
      method: "POST"
    });

    loadNotificationCount();
  } catch (error) {
    toast(error.message);
  }
}

/* =========================
   MESSAGES
========================= */

async function loadConversations() {
  try {
    const data = await api(
      "/api/conversations"
    );

    const box = $("#conversationList");

    if (!box) return;

    if (!data.conversations.length) {
      box.innerHTML = `
        <div class="empty">
          <p>Aucune conversation.</p>
          <small>Recherche quelqu'un pour lui envoyer un message.</small>
        </div>
      `;

      return;
    }

    box.innerHTML = data.conversations
      .map(
        (conversation) => `
          <button
            class="conversationItem"
            onclick="openConversation(${conversation.user_id}, '${esc(
              conversation.username
            )}')"
          >

            ${avatar({
              username:
                conversation.username,
              avatar:
                conversation.avatar
            })}

            <div>
              <b>
                @${esc(
                  conversation.username
                )}
              </b>

              <p>
                ${esc(
                  conversation.last_message ||
                    "Nouvelle conversation"
                )}
              </p>
            </div>

          </button>
        `
      )
      .join("");
  } catch (error) {
    toast(error.message);
  }
}

async function openConversation(
  userId,
  username
) {
  currentMessageUser = userId;

  const conversation = $("#conversation");

  if (!conversation) return;

  try {
    const data = await api(
      `/api/messages/${userId}`
    );

    conversation.innerHTML = `
      <div class="conversationHeader">
        <h3>@${esc(username)}</h3>
      </div>

      <div class="messagesList">

        ${
          data.messages.length
            ? data.messages
                .map(
                  (message) => `
                    <div class="message ${
                      message.sender_id === me.id
                        ? "mine"
                        : ""
                    }">
                      ${esc(
                        message.content
                      )}
                    </div>
                  `
                )
                .join("")
            : `
              <p class="empty">
                Aucun message. Dis bonjour 👋
              </p>
            `
        }

      </div>

      <div class="messageComposer">

        <input
          id="messageInput"
          placeholder="Écrire un message..."
          maxlength="2000"
        >

        <button
          onclick="sendMessage()"
        >
          Envoyer
        </button>

      </div>
    `;

    $("#messageInput")?.focus();
  } catch (error) {
    toast(error.message);
  }
}

async function sendMessage() {
  const input = $("#messageInput");

  if (!input || !currentMessageUser) return;

  const content = input.value.trim();

  if (!content) return;

  try {
    await api("/api/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId: currentMessageUser,
        content
      })
    });

    const conversation = $("#conversation");

    if (conversation) {
      const user = await api(
        `/api/messages/${currentMessageUser}`
      );

      const messagesList =
        conversation.querySelector(
          ".messagesList"
        );

      if (messagesList) {
        messagesList.innerHTML =
          user.messages
            .map(
              (message) => `
                <div class="message ${
                  message.sender_id === me.id
                    ? "mine"
                    : ""
                }">
                  ${esc(message.content)}
                </div>
              `
            )
            .join("");
      }
    }

    input.value = "";

    loadConversations();
  } catch (error) {
    toast(error.message);
  }
}

/* =========================
   STORIES
========================= */

async function loadStories() {
  try {
    const data = await api("/api/stories");

    const box = $("#stories");

    if (!box) return;

    box.innerHTML = `
      <div
        class="story addStory"
        onclick="createStory()"
      >
        <div class="storyPlus">+</div>
        <span>Ma story</span>
      </div>

      ${
        data.stories
          .map(
            (story) => `
              <div
                class="story"
                onclick="viewStory(${story.id})"
              >

                ${
                  story.image
                    ? `<img src="${story.image}" alt="">`
                    : avatar(story)
                }

                <span>
                  @${esc(story.username)}
                </span>

              </div>
            `
          )
          .join("")
      }
    `;
  } catch {}
}

async function createStory() {
  const content = prompt(
    "Écris quelque chose pour ta story :"
  );

  if (content === null || !content.trim()) {
    return;
  }

  try {
    const form = new FormData();

    form.append(
      "content",
      content.trim()
    );

    await api("/api/stories", {
      method: "POST",
      body: form
    });

    toast("Story publiée ✨");

    loadStories();
  } catch (error) {
    toast(error.message);
  }
}

async function viewStory(storyId) {
  try {
    const data = await api("/api/stories");

    const story = data.stories.find(
      (item) => item.id === storyId
    );

    if (!story) return;

    alert(
      `@${story.username}\n\n${
        story.content || "📸 Photo"
      }`
    );
  } catch {}
}

/* =========================
   MODE SOMBRE
========================= */

function applyDarkMode(enabled) {
  document.body.classList.toggle(
    "dark",
    enabled
  );

  if ($("#darkMode")) {
    $("#darkMode").checked = enabled;
  }

  if ($("#settingsDarkMode")) {
    $("#settingsDarkMode").checked =
      enabled;
  }

  localStorage.setItem(
    "dinaDarkMode",
    enabled ? "1" : "0"
  );
}

const savedDarkMode =
  localStorage.getItem(
    "dinaDarkMode"
  ) === "1";

applyDarkMode(savedDarkMode);

$("#darkMode")?.addEventListener(
  "change",
  (event) => {
    applyDarkMode(
      event.target.checked
    );
  }
);

$("#settingsDarkMode")?.addEventListener(
  "change",
  (event) => {
    applyDarkMode(
      event.target.checked
    );
  }
);

/* =========================
   PROFIL / PARAMÈTRES
========================= */

$("#editProfile")?.addEventListener(
  "click",
  editProfile
);

$("#settingsLogout")?.addEventListener(
  "click",
  logout
);

/* =========================
   ACTUALISATION
========================= */

setInterval(() => {
  if (!me) return;

  loadNotificationCount();
}, 15000);

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
