/* ===== Mini Feed 逻辑：发布 / 查看 / 详情 / 个人中心 / 删除 / 持久化 ===== */
(function () {
  "use strict";

  var POSTS_KEY = "minifeed.posts.v1";
  var PROFILE_KEY = "minifeed.profile.v1";
  var MAX_LEN = 280;
  var AVATARS = ["🙂", "😀", "🐱", "🐼", "🦊", "🚀", "🌙", "🍀", "🎧", "📚"];

  var DAY = 24 * 60 * 60 * 1000;

  /* ==================== 存储层（localStorage 不可用时降级为内存） ==================== */

  var memoryStore = {};

  function probeStorage() {
    try {
      var key = "__minifeed_probe__";
      window.localStorage.setItem(key, "1");
      window.localStorage.removeItem(key);
      return true;
    } catch (e) {
      return false;
    }
  }

  var storageOK = probeStorage();

  function readRaw(key) {
    if (storageOK) {
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        storageOK = false;
      }
    }
    return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
  }

  function writeRaw(key, value) {
    if (storageOK) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch (e) {
        storageOK = false;
      }
    }
    memoryStore[key] = value;
  }

  function removeRaw(key) {
    if (storageOK) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) {
        storageOK = false;
      }
    }
    delete memoryStore[key];
  }

  /* ==================== 数据层 ==================== */

  function loadPosts() {
    var raw = readRaw(POSTS_KEY);
    if (!raw) return [];
    try {
      var list = JSON.parse(raw);
      if (!Array.isArray(list)) return [];
      return list.filter(function (p) {
        return p && typeof p.text === "string" && typeof p.createdAt === "number";
      });
    } catch (e) {
      console.warn("动态数据解析失败，已忽略：", e);
      return [];
    }
  }

  function savePosts(posts) {
    writeRaw(POSTS_KEY, JSON.stringify(posts));
  }

  function defaultProfile() {
    return {
      name: "我",
      bio: "这个人很懒，什么都没写。",
      avatar: "🙂",
      joinedAt: Date.now()
    };
  }

  function loadProfile() {
    var base = defaultProfile();
    var raw = readRaw(PROFILE_KEY);
    if (!raw) {
      writeRaw(PROFILE_KEY, JSON.stringify(base));
      return base;
    }
    try {
      var obj = JSON.parse(raw) || {};
      return {
        name: typeof obj.name === "string" && obj.name ? obj.name : base.name,
        bio: typeof obj.bio === "string" ? obj.bio : base.bio,
        avatar: typeof obj.avatar === "string" && obj.avatar ? obj.avatar : base.avatar,
        joinedAt: typeof obj.joinedAt === "number" ? obj.joinedAt : Date.now()
      };
    } catch (e) {
      return base;
    }
  }

  function saveProfile(profile) {
    writeRaw(PROFILE_KEY, JSON.stringify(profile));
  }

  /* ==================== 工具 ==================== */

  function createId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function formatRelative(ts) {
    var diff = Date.now() - ts;
    var minute = 60 * 1000;
    var hour = 60 * minute;

    if (diff < minute) return "刚刚";
    if (diff < hour) return Math.floor(diff / minute) + " 分钟前";
    if (diff < DAY) return Math.floor(diff / hour) + " 小时前";
    if (diff < 7 * DAY) return Math.floor(diff / DAY) + " 天前";

    var d = new Date(ts);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function formatExact(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  /* ==================== DOM 引用 ==================== */

  var input = document.getElementById("composer-input");
  var publishBtn = document.getElementById("publish-btn");
  var counter = document.getElementById("char-counter");
  var timeline = document.getElementById("timeline");
  var emptyState = document.getElementById("empty-state");
  var postCount = document.getElementById("post-count");

  var myTimeline = document.getElementById("my-timeline");
  var myEmpty = document.getElementById("my-empty");
  var myPostCount = document.getElementById("my-post-count");

  var profileAvatar = document.getElementById("profile-avatar");
  var profileName = document.getElementById("profile-name");
  var profileBio = document.getElementById("profile-bio");
  var profileSince = document.getElementById("profile-since");
  var profileForm = document.getElementById("profile-form");
  var profileNameInput = document.getElementById("profile-name-input");
  var profileBioInput = document.getElementById("profile-bio-input");
  var avatarPicker = document.getElementById("avatar-picker");
  var editProfileBtn = document.getElementById("edit-profile-btn");
  var cancelProfileBtn = document.getElementById("cancel-profile");

  var statPosts = document.getElementById("stat-posts");
  var statChars = document.getElementById("stat-chars");
  var statDays = document.getElementById("stat-days");

  var detailPost = document.getElementById("detail-post");
  var backBtn = document.getElementById("back-btn");
  var clearAllBtn = document.getElementById("clear-all-btn");
  var storageWarning = document.getElementById("storage-warning");
  var storageText = document.getElementById("storage-text");
  var storageFill = document.getElementById("storage-fill");
  var storageBar = storageFill ? storageFill.parentNode : null;
  var exportBtn = document.getElementById("export-btn");
  var importBtn = document.getElementById("import-btn");
  var importFile = document.getElementById("import-file");
  var toastEl = document.getElementById("toast");
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  var views = {
    home: document.getElementById("view-home"),
    profile: document.getElementById("view-profile"),
    detail: document.getElementById("view-detail")
  };

  /* ==================== 状态 ==================== */

  var state = {
    view: "home",
    detailId: null,
    draftAvatar: "🙂",
    highlightId: null
  };

  /* ==================== 渲染：动态卡片 ==================== */

  function renderPostCard(post, options) {
    var opts = options || {};
    var profile = loadProfile();

    var card = document.createElement("article");
    card.className = "post card";
    if (post.id === state.highlightId) card.classList.add("is-new");
    card.dataset.id = post.id;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", "查看动态详情");

    var header = document.createElement("div");
    header.className = "post-header";

    var authorWrap = document.createElement("span");
    authorWrap.className = "post-author";

    var avatar = document.createElement("span");
    avatar.className = "avatar avatar-sm";
    avatar.textContent = profile.avatar;

    var name = document.createElement("span");
    name.textContent = profile.name;

    authorWrap.appendChild(avatar);
    authorWrap.appendChild(name);

    var time = document.createElement("time");
    time.className = "post-time";
    time.dateTime = new Date(post.createdAt).toISOString();
    time.textContent = formatRelative(post.createdAt);

    header.appendChild(authorWrap);
    header.appendChild(time);

    var text = document.createElement("p");
    text.className = "post-text";
    text.textContent = post.text; // textContent 渲染，天然防 XSS

    var actions = document.createElement("div");
    actions.className = "post-actions";

    var openBtn = document.createElement("button");
    openBtn.className = "btn-link";
    openBtn.type = "button";
    openBtn.textContent = "查看详情";
    openBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      openDetail(post.id);
    });

    var delBtn = document.createElement("button");
    delBtn.className = "btn-delete";
    delBtn.type = "button";
    delBtn.textContent = "删除";
    delBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (window.confirm("确定删除这条动态吗？")) removePost(post.id);
    });

    actions.appendChild(openBtn);
    actions.appendChild(delBtn);

    card.appendChild(header);
    card.appendChild(text);
    card.appendChild(actions);

    function openFromCard() {
      openDetail(post.id);
    }
    card.addEventListener("click", openFromCard);
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openFromCard();
      }
    });

    if (opts.compact) {
      actions.removeChild(openBtn);
    }
    return card;
  }

  /* ==================== 渲染：时间线 ==================== */

  function renderTimeline() {
    var posts = loadPosts();
    timeline.innerHTML = "";
    posts.forEach(function (post) {
      timeline.appendChild(renderPostCard(post));
    });
    emptyState.classList.toggle("hidden", posts.length > 0);
    postCount.textContent = posts.length + " 条";
  }

  function renderMyTimeline(posts) {
    myTimeline.innerHTML = "";
    posts.forEach(function (post) {
      myTimeline.appendChild(renderPostCard(post, { compact: true }));
    });
    myEmpty.classList.toggle("hidden", posts.length > 0);
    myPostCount.textContent = posts.length + " 条";
  }

  /* ==================== 渲染：个人中心 ==================== */

  function buildAvatarPicker() {
    avatarPicker.innerHTML = "";
    AVATARS.forEach(function (emoji) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "avatar-option";
      btn.textContent = emoji;
      btn.dataset.avatar = emoji;
      if (emoji === state.draftAvatar) btn.classList.add("is-selected");
      btn.addEventListener("click", function () {
        state.draftAvatar = emoji;
        Array.prototype.forEach.call(avatarPicker.children, function (child) {
          child.classList.toggle("is-selected", child.dataset.avatar === emoji);
        });
      });
      avatarPicker.appendChild(btn);
    });
  }

  function renderProfile() {
    var profile = loadProfile();
    var posts = loadPosts();

    profileAvatar.textContent = profile.avatar;
    profileName.textContent = profile.name;
    profileBio.textContent = profile.bio;

    var days = Math.max(1, Math.floor((Date.now() - profile.joinedAt) / DAY) + 1);
    profileSince.textContent = "加入于 " + formatExact(profile.joinedAt) + " · 第 " + days + " 天";

    var chars = posts.reduce(function (sum, p) { return sum + p.text.length; }, 0);
    statPosts.textContent = posts.length;
    statChars.textContent = chars;
    statDays.textContent = days;

    renderMyTimeline(posts);
  }

  /* ==================== 视图切换 ==================== */

  function setView(name) {
    state.view = name;
    Object.keys(views).forEach(function (key) {
      views[key].classList.toggle("hidden", key !== name);
    });
    tabs.forEach(function (tab) {
      var active = tab.dataset.view === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openDetail(id) {
    var post = loadPosts().filter(function (p) { return p.id === id; })[0];
    if (!post) {
      setView("home");
      return;
    }
    state.detailId = id;
    var profile = loadProfile();

    detailPost.innerHTML = "";

    var head = document.createElement("div");
    head.className = "detail-head";

    var avatar = document.createElement("span");
    avatar.className = "avatar avatar-lg";
    avatar.textContent = profile.avatar;

    var headMeta = document.createElement("div");
    var nameEl = document.createElement("h2");
    nameEl.className = "profile-name";
    nameEl.textContent = profile.name;
    var timeEl = document.createElement("p");
    timeEl.className = "profile-since";
    timeEl.textContent = formatExact(post.createdAt) + " · " + post.text.length + " 字";
    headMeta.appendChild(nameEl);
    headMeta.appendChild(timeEl);

    head.appendChild(avatar);
    head.appendChild(headMeta);

    var body = document.createElement("p");
    body.className = "detail-text";
    body.textContent = post.text;

    var actions = document.createElement("div");
    actions.className = "detail-actions";

    var delBtn = document.createElement("button");
    delBtn.className = "btn-danger";
    delBtn.type = "button";
    delBtn.textContent = "删除这条动态";
    delBtn.addEventListener("click", function () {
      if (window.confirm("确定删除这条动态吗？")) removePost(post.id);
    });

    actions.appendChild(delBtn);

    detailPost.appendChild(head);
    detailPost.appendChild(body);
    detailPost.appendChild(actions);

    setView("detail");
  }

  /* ==================== 业务操作 ==================== */

  function publish() {
    var text = input.value.trim();
    if (!text) return;

    var posts = loadPosts();
    var post = {
      id: createId(),
      text: text.slice(0, MAX_LEN),
      createdAt: Date.now()
    };
    posts.unshift(post);
    savePosts(posts);

    state.highlightId = post.id;
    input.value = "";
    updateCounter();
    renderAll();
    input.focus();

    window.setTimeout(function () {
      state.highlightId = null;
    }, 1200);
  }

  function removePost(id) {
    savePosts(loadPosts().filter(function (p) { return p.id !== id; }));
    if (state.detailId === id) {
      state.detailId = null;
      setView("home");
    }
    renderAll();
  }

  function clearAll() {
    if (!window.confirm("确定清空所有数据吗？所有动态和个人资料都会被删除，且无法恢复。")) return;
    removeRaw(POSTS_KEY);
    removeRaw(PROFILE_KEY);
    state.detailId = null;
    state.highlightId = null;
    renderAll();
    setView("home");
  }

  function updateCounter() {
    var len = input.value.length;
    counter.textContent = len + " / " + MAX_LEN;
    counter.classList.toggle("warn", len >= MAX_LEN - 20);
    publishBtn.disabled = input.value.trim().length === 0;
  }

  function renderAll() {
    renderTimeline();
    renderProfile();
    renderStorage();
  }

  /* ==================== 存储用量 ==================== */

  var QUOTA_BYTES = 5 * 1024 * 1024; // 浏览器 Local Storage 常见配额约 5MB

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
  }

  function storageUsage() {
    var bytes = 0;
    if (!storageOK) return 0;
    try {
      Object.keys(window.localStorage).forEach(function (key) {
        if (key.indexOf("minifeed.") !== 0) return;
        var value = window.localStorage.getItem(key) || "";
        bytes += (key.length + value.length) * 2; // UTF-16 每字符占 2 字节
      });
    } catch (e) {
      bytes = 0;
    }
    return bytes;
  }

  function renderStorage() {
    if (!storageFill || !storageText) return;

    var used = storageUsage();
    var pct = Math.min(100, (used / QUOTA_BYTES) * 100);

    storageFill.style.width = (used > 0 ? Math.max(pct, 2) : 0) + "%";
    if (storageBar) {
      storageBar.classList.toggle("is-warn", pct >= 70 && pct < 90);
      storageBar.classList.toggle("is-full", pct >= 90);
    }

    if (!storageOK) {
      storageText.textContent = "本地存储不可用，当前为内存模式";
    } else if (pct >= 90) {
      storageText.textContent = "占用 " + formatBytes(used) + " / 约 5 MB · 接近上限";
    } else {
      storageText.textContent = "占用 " + formatBytes(used) + " / 约 5 MB";
    }
  }

  /* ==================== 提示条 ==================== */

  var toastTimer = null;

  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("is-show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove("is-show");
    }, 2600);
  }

  /* ==================== 导出 / 导入 ==================== */

  function exportData() {
    var posts = loadPosts();
    var payload = {
      app: "minifeed",
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: loadProfile(),
      posts: posts
    };

    if (typeof window.Blob !== "function" || !window.URL || !window.URL.createObjectURL) {
      toast("当前浏览器不支持导出");
      return;
    }

    var blob = new window.Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = window.URL.createObjectURL(blob);
    var d = new Date();
    var a = document.createElement("a");
    a.href = url;
    a.download = "minifeed-backup-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
      "-" + pad(d.getHours()) + pad(d.getMinutes()) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { window.URL.revokeObjectURL(url); }, 1000);

    toast(posts.length ? "已导出 " + posts.length + " 条动态" : "已导出空备份");
  }

  function normalizeImportedPosts(list) {
    var out = [];
    list.forEach(function (item) {
      if (!item || typeof item.text !== "string") return;
      var text = item.text.trim().slice(0, MAX_LEN);
      if (!text) return;
      out.push({
        id: typeof item.id === "string" && item.id ? item.id : createId(),
        text: text,
        createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now()
      });
    });
    return out;
  }

  function mergePosts(incoming) {
    var existing = loadPosts();
    var seen = {};
    existing.forEach(function (p) { seen[p.text + "@" + p.createdAt] = true; });

    var added = 0;
    incoming.forEach(function (p) {
      var sig = p.text + "@" + p.createdAt;
      if (seen[sig]) return;
      seen[sig] = true;
      existing.push(p);
      added += 1;
    });

    existing.sort(function (a, b) { return b.createdAt - a.createdAt; });
    savePosts(existing);
    return added;
  }

  function importData(file) {
    var reader = new window.FileReader();

    reader.onload = function () {
      var payload;
      try {
        payload = JSON.parse(String(reader.result));
      } catch (e) {
        toast("导入失败：不是合法的 JSON 文件");
        return;
      }

      var list = payload && payload.posts;
      if (!Array.isArray(list)) {
        toast("导入失败：文件缺少 posts 数组");
        return;
      }

      var incoming = normalizeImportedPosts(list);
      if (!incoming.length) {
        toast("导入失败：没有可用的动态");
        return;
      }

      var added = mergePosts(incoming);

      // 资料：仅在本地仍为默认资料时才导入，避免覆盖用户已改过的信息
      var local = loadProfile();
      var isDefault = local.name === "我" && local.bio === "这个人很懒，什么都没写。";
      if (isDefault && payload.profile && typeof payload.profile === "object") {
        saveProfile({
          name: typeof payload.profile.name === "string" && payload.profile.name ? payload.profile.name : local.name,
          bio: typeof payload.profile.bio === "string" ? payload.profile.bio : local.bio,
          avatar: typeof payload.profile.avatar === "string" && payload.profile.avatar ? payload.profile.avatar : local.avatar,
          joinedAt: typeof payload.profile.joinedAt === "number" ? payload.profile.joinedAt : local.joinedAt
        });
      }

      renderAll();
      toast(added > 0 ? "已导入 " + added + " 条动态" : "没有新动态（内容已存在）");
    };

    reader.onerror = function () {
      toast("导入失败：文件读取失败");
    };

    reader.readAsText(file);
  }

  /* ==================== 事件绑定 ==================== */

  publishBtn.addEventListener("click", publish);

  input.addEventListener("input", updateCounter);

  input.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      publish();
    }
  });

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      setView(tab.dataset.view);
    });
  });

  editProfileBtn.addEventListener("click", function () {
    var profile = loadProfile();
    state.draftAvatar = profile.avatar;
    profileNameInput.value = profile.name;
    profileBioInput.value = profile.bio;
    buildAvatarPicker();
    profileForm.classList.remove("hidden");
    profileNameInput.focus();
  });

  cancelProfileBtn.addEventListener("click", function () {
    profileForm.classList.add("hidden");
  });

  profileForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var profile = loadProfile();
    var name = profileNameInput.value.trim();
    var bio = profileBioInput.value.trim();
    profile.name = name || "我";
    profile.bio = bio || "这个人很懒，什么都没写。";
    profile.avatar = state.draftAvatar;
    saveProfile(profile);
    profileForm.classList.add("hidden");
    renderAll();
  });

  backBtn.addEventListener("click", function () {
    setView("home");
  });

  clearAllBtn.addEventListener("click", clearAll);

  exportBtn.addEventListener("click", exportData);

  importBtn.addEventListener("click", function () {
    importFile.value = "";
    importFile.click();
  });

  importFile.addEventListener("change", function () {
    var file = importFile.files && importFile.files[0];
    if (file) importData(file);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (!profileForm.classList.contains("hidden")) {
        profileForm.classList.add("hidden");
      } else if (state.view === "detail") {
        setView("home");
      }
    }
  });

  /* ==================== 启动 ==================== */

  if (!storageOK) {
    storageWarning.classList.remove("hidden");
  }

  updateCounter();
  renderAll();
  setView("home");
})();
