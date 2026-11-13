/* ===== Mini Feed 逻辑：发布 / 查看 / 删除 / LocalStorage 持久化 ===== */
(function () {
  "use strict";

  var STORAGE_KEY = "minifeed.posts.v1";
  var MAX_LEN = 280;

  var input = document.getElementById("composer-input");
  var publishBtn = document.getElementById("publish-btn");
  var counter = document.getElementById("char-counter");
  var timeline = document.getElementById("timeline");
  var emptyState = document.getElementById("empty-state");

  /* ---------- 数据层 ---------- */

  function loadPosts() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      console.warn("读取本地数据失败，已重置：", e);
      return [];
    }
  }

  function savePosts(posts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  }

  /* ---------- 工具 ---------- */

  function createId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function formatTime(ts) {
    var diff = Date.now() - ts;
    var minute = 60 * 1000;
    var hour = 60 * minute;
    var day = 24 * hour;

    if (diff < minute) return "刚刚";
    if (diff < hour) return Math.floor(diff / minute) + " 分钟前";
    if (diff < day) return Math.floor(diff / hour) + " 小时前";
    if (diff < 7 * day) return Math.floor(diff / day) + " 天前";

    var d = new Date(ts);
    var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  /* ---------- 渲染 ---------- */

  function renderPost(post) {
    var card = document.createElement("article");
    card.className = "post card";
    card.dataset.id = post.id;

    var header = document.createElement("div");
    header.className = "post-header";

    var author = document.createElement("span");
    author.className = "post-author";
    author.textContent = "我";

    var time = document.createElement("time");
    time.className = "post-time";
    time.dateTime = new Date(post.createdAt).toISOString();
    time.textContent = formatTime(post.createdAt);

    header.appendChild(author);
    header.appendChild(time);

    var text = document.createElement("p");
    text.className = "post-text";
    text.textContent = post.text; // textContent 防止 XSS

    var actions = document.createElement("div");
    actions.className = "post-actions";

    var delBtn = document.createElement("button");
    delBtn.className = "btn-delete";
    delBtn.type = "button";
    delBtn.textContent = "删除";
    delBtn.addEventListener("click", function () {
      if (window.confirm("确定删除这条动态吗？")) {
        removePost(post.id);
      }
    });

    actions.appendChild(delBtn);

    card.appendChild(header);
    card.appendChild(text);
    card.appendChild(actions);
    return card;
  }

  function renderTimeline() {
    var posts = loadPosts();
    timeline.innerHTML = "";

    posts.forEach(function (post) {
      timeline.appendChild(renderPost(post));
    });

    emptyState.classList.toggle("hidden", posts.length > 0);
  }

  /* ---------- 操作 ---------- */

  function publish() {
    var text = input.value.trim();
    if (!text) return;

    var posts = loadPosts();
    posts.unshift({
      id: createId(),
      text: text.slice(0, MAX_LEN),
      createdAt: Date.now()
    });
    savePosts(posts);

    input.value = "";
    updateCounter();
    renderTimeline();
    input.focus();
  }

  function removePost(id) {
    var posts = loadPosts().filter(function (p) { return p.id !== id; });
    savePosts(posts);
    renderTimeline();
  }

  function updateCounter() {
    var len = input.value.length;
    counter.textContent = len + " / " + MAX_LEN;
    counter.classList.toggle("warn", len >= MAX_LEN - 20);
    publishBtn.disabled = input.value.trim().length === 0;
  }

  /* ---------- 事件绑定 ---------- */

  publishBtn.addEventListener("click", publish);

  input.addEventListener("input", updateCounter);

  input.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      publish();
    }
  });

  /* ---------- 启动 ---------- */

  updateCounter();
  renderTimeline();
})();
