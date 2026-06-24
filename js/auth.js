(function () {
  "use strict";

  var db = null;
  var profile = null;
  var changeCallbacks = [];

  function updateNav() {
    var loginBtn = document.getElementById("loginBtn");
    var authUser = document.getElementById("authUser");
    var navDashboard = document.getElementById("navDashboard");
    var navAdmin = document.getElementById("navAdmin");
    var navRecorder = document.getElementById("navRecorder");
    if (!loginBtn) return;

    if (!profile) {
      loginBtn.classList.remove("is-hidden");
      authUser.classList.add("is-hidden");
      navDashboard.classList.add("is-hidden");
      navAdmin.classList.add("is-hidden");
      navRecorder.classList.add("is-hidden");
      return;
    }

    loginBtn.classList.add("is-hidden");
    authUser.classList.remove("is-hidden");
    document.getElementById("authUserName").textContent = profile.display_name || profile.id.slice(0, 8);
    var badge = document.getElementById("authRoleBadge");
    badge.textContent = { admin: "管理員", recorder: "記錄員", user: "使用者", viewer: "使用者" }[profile.role] || "使用者";

    navDashboard.classList.remove("is-hidden");
    navAdmin.classList.toggle("is-hidden", profile.role !== "admin");
    navRecorder.classList.toggle("is-hidden", profile.role !== "recorder" && profile.role !== "admin");
  }

  async function fetchProfile(userId) {
    var res = await db.from("profiles").select("*").eq("id", userId).single();
    return res.data;
  }

  async function handleAuthChange(event, session) {
    if (session && session.user) {
      profile = await fetchProfile(session.user.id);
    } else {
      profile = null;
    }
    updateNav();
    changeCallbacks.forEach(function (cb) { cb(profile); });
  }

  function showLoginModal() {
    var modal = document.getElementById("loginModal");
    if (modal) modal.classList.remove("is-hidden");
  }

  function hideLoginModal() {
    var modal = document.getElementById("loginModal");
    if (modal) modal.classList.add("is-hidden");
    var loginErr = document.getElementById("loginError");
    var signupErr = document.getElementById("signupError");
    if (loginErr) loginErr.classList.add("is-hidden");
    if (signupErr) signupErr.classList.add("is-hidden");
  }

  function wireUI() {
    var loginBtn = document.getElementById("loginBtn");
    var logoutBtn = document.getElementById("logoutBtn");
    var closeBtn = document.querySelector("[data-close-login]");
    var toggleBtn = document.getElementById("toggleAuthMode");
    var loginForm = document.getElementById("loginForm");
    var signupForm = document.getElementById("signupForm");
    var overlay = document.getElementById("loginModal");

    if (loginBtn) loginBtn.addEventListener("click", showLoginModal);
    if (logoutBtn) logoutBtn.addEventListener("click", function () {
      db.auth.signOut();
    });
    if (closeBtn) closeBtn.addEventListener("click", hideLoginModal);
    if (overlay) overlay.addEventListener("click", function (e) {
      if (e.target === overlay) hideLoginModal();
    });

    if (toggleBtn) toggleBtn.addEventListener("click", function () {
      var showingLogin = signupForm.classList.contains("is-hidden");
      loginForm.classList.toggle("is-hidden", showingLogin);
      signupForm.classList.toggle("is-hidden", !showingLogin);
      toggleBtn.textContent = showingLogin ? "已有帳號？登入" : "還沒有帳號？註冊";
      document.getElementById("loginTitle").textContent = showingLogin ? "註冊" : "登入";
    });

    if (loginForm) loginForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var email = document.getElementById("loginEmail").value.trim();
      var password = document.getElementById("loginPassword").value;
      var errEl = document.getElementById("loginError");
      errEl.classList.add("is-hidden");
      var res = await db.auth.signInWithPassword({ email: email, password: password });
      console.log("login result:", JSON.stringify(res));
      if (res.error) {
        var rawMsg = res.error.message || res.error.msg || JSON.stringify(res.error);
        var authErrors = {
          "Invalid login credentials": "帳號或密碼錯誤",
          "Email not confirmed": "Email 尚未驗證，請查收驗證信",
          "User already registered": "此 Email 已註冊",
          "Password should be at least 6 characters": "密碼至少需要 6 個字元",
          "Unable to validate email address: invalid format": "Email 格式不正確",
          "For security purposes, you can only request this after": "操作太頻繁，請稍後再試",
        };
        var zhMsg = Object.keys(authErrors).find(function (k) { return rawMsg.indexOf(k) >= 0; });
        errEl.textContent = zhMsg ? authErrors[zhMsg] : rawMsg;
        errEl.classList.remove("is-hidden");
      } else {
        hideLoginModal();
      }
    });

    if (signupForm) signupForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var email = document.getElementById("signupEmail").value.trim();
      var password = document.getElementById("signupPassword").value;
      var displayName = document.getElementById("signupName").value.trim();
      var initial = document.getElementById("signupInitial").value.trim();
      var errEl = document.getElementById("signupError");
      errEl.classList.add("is-hidden");
      var res = await db.auth.signUp({
        email: email,
        password: password,
        options: { data: { display_name: displayName, initial: initial } },
      });
      if (res.error) {
        errEl.textContent = res.error.message;
        errEl.classList.remove("is-hidden");
      } else {
        errEl.textContent = "註冊成功！請查收驗證信，或直接登入。";
        errEl.style.color = "var(--green)";
        errEl.classList.remove("is-hidden");
      }
    });
  }

  window.DebateAuth = {
    get profile() { return profile; },
    get isLoggedIn() { return !!profile; },
    get isAdmin() { return profile && profile.role === "admin"; },
    get isRecorder() { return profile && profile.role === "recorder"; },
    get db() { return db; },

    init: function (supabaseClient) {
      db = supabaseClient;
      wireUI();
      db.auth.onAuthStateChange(handleAuthChange);
      db.auth.getSession().then(function (res) {
        if (res.data.session) handleAuthChange("INITIAL", res.data.session);
      });
    },

    onAuthChange: function (cb) { changeCallbacks.push(cb); },
    showLoginModal: showLoginModal,
    hideLoginModal: hideLoginModal,
  };
})();
