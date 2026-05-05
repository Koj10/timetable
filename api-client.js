/**
 * Синхронизация с сервером после входа: тот же ключ localStorage, что у календаря и заметок.
 * Работает только при открытии сайта через http://localhost:3000 (не file://).
 */
(function (global) {
  const STORAGE_KEY = "glosmoSchedule-v1";
  const GUEST_STORAGE_KEY = "glosmoSchedule-guest-v1";
  const TOKEN_KEY = "glosmoAuthToken";

  let uploadTimer = null;
  let logoutBound = false;

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function isLoggedIn() {
    return !!getToken();
  }

  function hasMeaningfulPayload(payload) {
    if (!payload || typeof payload !== "object") return false;
    if (Array.isArray(payload.colors) && payload.colors.length > 0) return true;
    if (payload.dotsByDate && Object.keys(payload.dotsByDate).length > 0) return true;
    if (Array.isArray(payload.noteFolders) && payload.noteFolders.length > 0) return true;
    if (payload.dayNotes && Object.keys(payload.dayNotes).length > 0) return true;
    return false;
  }

  function getStorageKey() {
    return isLoggedIn() ? STORAGE_KEY : GUEST_STORAGE_KEY;
  }

  function readPayloadByKey(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      return payload && typeof payload === "object" ? payload : null;
    } catch {
      return null;
    }
  }

  function readActivePayload() {
    return readPayloadByKey(getStorageKey());
  }

  function writeActivePayload(payload) {
    const key = getStorageKey();
    localStorage.setItem(key, JSON.stringify(payload));
  }

  function clearActivePayload() {
    localStorage.removeItem(getStorageKey());
  }

  function hasGuestDraft() {
    return hasMeaningfulPayload(readPayloadByKey(GUEST_STORAGE_KEY));
  }

  function saveGuestDraftAndRedirectToRegister() {
    location.href = "./auth.html?mode=register&fromDraft=1";
  }

  async function refreshFromServerIfLoggedIn() {
    const token = getToken();
    if (!token) return;
    try {
      const r = await fetch("/api/data", { headers: { Authorization: "Bearer " + token } });
      if (r.status === 401) {
        clearToken();
        return;
      }
      if (!r.ok) return;
      const j = await r.json();
      if (j.payload && typeof j.payload === "object" && hasMeaningfulPayload(j.payload)) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(j.payload));
      }
    } catch {
      /* офлайн или сервер не запущен */
    }
  }

  function scheduleUpload() {
    if (!getToken()) return;
    clearTimeout(uploadTimer);
    uploadTimer = setTimeout(function () {
      uploadNow();
    }, 900);
  }

  async function uploadNow() {
    const token = getToken();
    if (!token) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const r = await fetch("/api/data", {
        method: "PUT",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: raw,
      });
      if (r.status === 401) clearToken();
    } catch {
      /* ignore */
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async function refreshUserLabel() {
    const slot = document.getElementById("authUser");
    if (!slot) return;

    const token = getToken();
    if (!token) {
      if (hasGuestDraft()) {
        slot.innerHTML =
          '<a href="./auth.html" class="nav-pill auth-action">Вход</a> <button type="button" class="btn btn-sm auth-action" data-auth-save-draft>Сохранить изменения</button>';
      } else {
        slot.innerHTML =
          '<a href="./auth.html" class="nav-pill auth-action">Вход</a>';
      }
      return;
    }

    try {
      const r = await fetch("/api/me", { headers: { Authorization: "Bearer " + token } });
      if (!r.ok) throw new Error("me");
      const j = await r.json();
      slot.innerHTML =
        '<span class="auth-email" title="' +
        escapeHtml(j.email) +
        '">' +
        escapeHtml(j.email) +
        '</span> <button type="button" class="btn btn-sm btn-ghost" data-auth-logout>Выйти</button>';
    } catch {
      slot.innerHTML =
        '<a href="./auth.html" class="nav-pill auth-action">Вход</a> <span class="auth-email" title="Офлайн">офлайн</span>';
    }
  }

  function ensureLogoutDelegation() {
    if (logoutBound) return;
    logoutBound = true;
    document.body.addEventListener("click", function (e) {
      const saveDraftBtn = e.target.closest("[data-auth-save-draft]");
      if (saveDraftBtn) {
        e.preventDefault();
        saveGuestDraftAndRedirectToRegister();
        return;
      }
      const t = e.target.closest("[data-auth-logout]");
      if (!t) return;
      e.preventDefault();
      clearToken();
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    });
  }

  async function syncAfterLogin(token) {
    setToken(token);
    const guestRaw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (guestRaw) {
      localStorage.setItem(STORAGE_KEY, guestRaw);
    }
    try {
      const r = await fetch("/api/data", { headers: { Authorization: "Bearer " + token } });
      if (r.ok) {
        const j = await r.json();
        if (j.payload && typeof j.payload === "object" && hasMeaningfulPayload(j.payload)) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(j.payload));
          localStorage.removeItem(GUEST_STORAGE_KEY);
          return;
        }
      }
    } catch {
      /* ignore */
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        await fetch("/api/data", {
          method: "PUT",
          headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
          body: raw,
        });
        localStorage.removeItem(GUEST_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  global.authSync = {
    STORAGE_KEY: STORAGE_KEY,
    GUEST_STORAGE_KEY: GUEST_STORAGE_KEY,
    TOKEN_KEY: TOKEN_KEY,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    isLoggedIn: isLoggedIn,
    getStorageKey: getStorageKey,
    readActivePayload: readActivePayload,
    writeActivePayload: writeActivePayload,
    clearActivePayload: clearActivePayload,
    hasGuestDraft: hasGuestDraft,
    saveGuestDraftAndRedirectToRegister: saveGuestDraftAndRedirectToRegister,
    refreshFromServerIfLoggedIn: refreshFromServerIfLoggedIn,
    scheduleUpload: scheduleUpload,
    uploadNow: uploadNow,
    refreshUserLabel: refreshUserLabel,
    ensureLogoutDelegation: ensureLogoutDelegation,
    syncAfterLogin: syncAfterLogin,
  };
})(typeof window !== "undefined" ? window : global);
