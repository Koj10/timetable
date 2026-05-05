/* Папки заметок (Работа, Учёба, …) + отдельные заметки внутри. Общий STORAGE_KEY с календарём. */
(() => {
  const STORAGE_KEY = "glosmoSchedule-v1";

  /** @type {{ id: string, name: string, notes: { id: string, title: string, body: string, updatedAt: number }[] }[]} */
  let folders = [];
  /** @type {string|null} */
  let selectedFolderId = null;
  /** @type {string|null} */
  let selectedNoteId = null;

  let saveTimer = null;

  const els = {
    folderList: document.getElementById("folderList"),
    btnNewFolder: document.getElementById("btnNewFolder"),
    notesEmptyState: document.getElementById("notesEmptyState"),
    notesMainContent: document.getElementById("notesMainContent"),
    openFolderTitle: document.getElementById("openFolderTitle"),
    notesSaveStatus: document.getElementById("notesSaveStatus"),
    btnRenameFolder: document.getElementById("btnRenameFolder"),
    btnDeleteFolder: document.getElementById("btnDeleteFolder"),
    btnNewNote: document.getElementById("btnNewNote"),
    notesList: document.getElementById("notesList"),
    noteEditorWrap: document.getElementById("noteEditorWrap"),
    noteEditorTitle: document.getElementById("noteEditorTitle"),
    noteEditorBody: document.getElementById("noteEditorBody"),
    btnCloseEditor: document.getElementById("btnCloseEditor"),
  };

  function uid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "n_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  }

  function storageKey() {
    if (typeof window !== "undefined" && window.authSync && typeof window.authSync.getStorageKey === "function") {
      return window.authSync.getStorageKey();
    }
    return STORAGE_KEY;
  }

  function readRaw() {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function defaultAppShell() {
    return {
      v: 3,
      colors: [],
      dotsByDate: {},
      dayNotes: {},
      noteFolders: [],
      selectedNoteFolderId: null,
      selectedNoteItemId: null,
      selectedColorId: null,
      currentYear: new Date().getFullYear(),
      currentMonthIndex: new Date().getMonth(),
    };
  }

  function migrateNoteFolders(data) {
    if (!data) data = {};
    const hasFolders = Array.isArray(data.noteFolders) && data.noteFolders.length > 0;
    if (!hasFolders) {
      const next = [];
      const oldPad = typeof data.scratchPadNotes === "string" ? data.scratchPadNotes.trim() : "";
      if (oldPad) {
        next.push({
          id: uid(),
          name: "Импорт",
          notes: [{ id: uid(), title: "", body: data.scratchPadNotes, updatedAt: Date.now() }],
        });
      }
      if (next.length === 0) {
        next.push(
          { id: uid(), name: "Работа", notes: [] },
          { id: uid(), name: "Учёба", notes: [] }
        );
      }
      data.noteFolders = next;
      data.selectedNoteFolderId = next[0].id;
      data.selectedNoteItemId = null;
    }
    for (const f of data.noteFolders) {
      if (!f.id) f.id = uid();
      if (!Array.isArray(f.notes)) f.notes = [];
      for (const n of f.notes) {
        if (!n.id) n.id = uid();
        if (typeof n.title !== "string") n.title = "";
        if (typeof n.body !== "string") n.body = "";
        if (typeof n.updatedAt !== "number") n.updatedAt = Date.now();
      }
    }
    if (typeof data.selectedNoteFolderId !== "string" || !data.noteFolders.some((f) => f.id === data.selectedNoteFolderId)) {
      data.selectedNoteFolderId = data.noteFolders[0]?.id || null;
    }
    data.v = Math.max(Number(data.v) || 1, 3);
    return data;
  }

  function loadState() {
    let data = readRaw() || defaultAppShell();
    data = migrateNoteFolders(data);
    folders = data.noteFolders;
    selectedFolderId = data.selectedNoteFolderId;
    selectedNoteId =
      typeof data.selectedNoteItemId === "string" || data.selectedNoteItemId === null ? data.selectedNoteItemId : null;
    if (selectedNoteId && !getNoteById(selectedNoteId)) selectedNoteId = null;
    persistImmediate();
  }

  function persistImmediate() {
    const data = readRaw() || defaultAppShell();
    migrateNoteFolders(data);
    data.noteFolders = folders;
    data.selectedNoteFolderId = selectedFolderId;
    data.selectedNoteItemId = selectedNoteId;
    data.v = 3;
    delete data.scratchPadNotes;
    localStorage.setItem(storageKey(), JSON.stringify(data));
    if (typeof window !== "undefined" && window.authSync) {
      window.authSync.scheduleUpload();
      window.authSync.refreshUserLabel().catch(() => {});
    }
  }

  function getFolder(id) {
    return folders.find((f) => f.id === id) || null;
  }

  function getNoteById(noteId) {
    for (const f of folders) {
      const n = f.notes.find((x) => x.id === noteId);
      if (n) return { folder: f, note: n };
    }
    return null;
  }

  function truncateDisplay(s, max) {
    const t = (s || "").trim();
    if (!t) return "";
    return t.length > max ? t.slice(0, max - 1) + "…" : t;
  }

  /** Заголовок в списке: явное название или первая строка текста */
  function noteDisplayTitle(note) {
    const explicit = (note.title || "").trim();
    if (explicit) return truncateDisplay(explicit, 52);
    const line = (note.body || "").trim().split("\n")[0] || "";
    if (!line) return "Без названия";
    return truncateDisplay(line, 52);
  }

  function setStatus(msg, saved) {
    if (!els.notesSaveStatus) return;
    els.notesSaveStatus.textContent = msg;
    els.notesSaveStatus.classList.toggle("is-saved", !!saved);
  }

  function schedulePersist() {
    clearTimeout(saveTimer);
    setStatus("Сохранение…", false);
    saveTimer = setTimeout(() => {
      persistImmediate();
      setStatus("Сохранено", true);
      setTimeout(() => {
        if (els.notesSaveStatus && els.notesSaveStatus.textContent === "Сохранено") els.notesSaveStatus.textContent = "";
      }, 1800);
    }, 400);
  }

  function selectFolder(id) {
    selectedFolderId = id;
    const folder = getFolder(id);
    if (!folder) {
      selectedFolderId = folders[0]?.id || null;
    }
    if (selectedNoteId) {
      const hit = getNoteById(selectedNoteId);
      if (!hit || hit.folder.id !== selectedFolderId) selectedNoteId = null;
    }
    render();
    persistImmediate();
  }

  function selectNote(noteId) {
    selectedNoteId = noteId;
    const hit = getNoteById(noteId);
    if (hit) {
      els.noteEditorTitle.value = hit.note.title || "";
      els.noteEditorBody.value = hit.note.body;
      els.noteEditorWrap.hidden = false;
      els.noteEditorBody.dataset.boundNoteId = noteId;
      els.noteEditorTitle.dataset.boundNoteId = noteId;
    } else {
      els.noteEditorWrap.hidden = true;
      els.noteEditorTitle.value = "";
      els.noteEditorBody.value = "";
      els.noteEditorBody.dataset.boundNoteId = "";
      els.noteEditorTitle.dataset.boundNoteId = "";
    }
    renderFolderNotesList();
    persistImmediate();
  }

  function addFolder() {
    const name = prompt("Название папки (например: Работа)", "Новая папка");
    if (name === null) return;
    const trimmed = name.trim() || "Без названия";
    const f = { id: uid(), name: trimmed, notes: [] };
    folders.push(f);
    selectFolder(f.id);
    els.btnNewNote?.focus();
  }

  function renameFolder() {
    const f = getFolder(selectedFolderId);
    if (!f) return;
    const name = prompt("Новое название папки", f.name);
    if (name === null) return;
    f.name = name.trim() || f.name;
    render();
    persistImmediate();
  }

  function deleteFolder() {
    const f = getFolder(selectedFolderId);
    if (!f) return;
    const ok = confirm(`Удалить папку «${f.name}» и все заметки внутри?`);
    if (!ok) return;
    folders = folders.filter((x) => x.id !== f.id);
    selectedNoteId = null;
    selectedFolderId = folders[0]?.id || null;
    els.noteEditorTitle.value = "";
    els.noteEditorBody.value = "";
    els.noteEditorWrap.hidden = true;
    render();
    persistImmediate();
  }

  function addNote() {
    const f = getFolder(selectedFolderId);
    if (!f) return;
    const n = { id: uid(), title: "", body: "", updatedAt: Date.now() };
    f.notes.unshift(n);
    renderFolderList();
    selectNote(n.id);
    schedulePersist();
    requestAnimationFrame(() => {
      els.noteEditorTitle.focus();
    });
  }

  function deleteNote(noteId, ev) {
    if (ev) ev.stopPropagation();
    const hit = getNoteById(noteId);
    if (!hit) return;
    const ok = confirm("Удалить эту заметку?");
    if (!ok) return;
    hit.folder.notes = hit.folder.notes.filter((x) => x.id !== noteId);
    if (selectedNoteId === noteId) {
      selectedNoteId = null;
      els.noteEditorTitle.value = "";
      els.noteEditorBody.value = "";
      els.noteEditorWrap.hidden = true;
    }
    render();
    persistImmediate();
  }

  function onEditorInput() {
    const hit = selectedNoteId ? getNoteById(selectedNoteId) : null;
    if (!hit) return;
    hit.note.body = els.noteEditorBody.value;
    hit.note.updatedAt = Date.now();
    renderFolderNotesList();
    schedulePersist();
  }

  function onTitleInput() {
    const hit = selectedNoteId ? getNoteById(selectedNoteId) : null;
    if (!hit) return;
    hit.note.title = els.noteEditorTitle.value;
    hit.note.updatedAt = Date.now();
    renderFolderNotesList();
    schedulePersist();
  }

  function renderFolderList() {
    els.folderList.innerHTML = "";
    for (const f of folders) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "folder-row" + (f.id === selectedFolderId ? " is-active" : "");
      row.dataset.folderId = f.id;

      const name = document.createElement("span");
      name.className = "folder-row-name";
      name.textContent = f.name;

      const count = document.createElement("span");
      count.className = "folder-row-count";
      count.textContent = String(f.notes.length);

      row.appendChild(name);
      row.appendChild(count);
      row.addEventListener("click", () => selectFolder(f.id));
      els.folderList.appendChild(row);
    }
  }

  function renderFolderNotesList() {
    const f = getFolder(selectedFolderId);
    els.notesList.innerHTML = "";
    if (!f) return;

    const sorted = [...f.notes].sort((a, b) => b.updatedAt - a.updatedAt);
    for (const n of sorted) {
      const item = document.createElement("div");
      item.className = "note-row" + (n.id === selectedNoteId ? " is-active" : "");
      item.dataset.noteId = n.id;

      const main = document.createElement("button");
      main.type = "button";
      main.className = "note-row-main";
      const title = document.createElement("div");
      title.className = "note-row-title";
      title.textContent = noteDisplayTitle(n);
      const meta = document.createElement("div");
      meta.className = "note-row-meta";
      meta.textContent = new Date(n.updatedAt).toLocaleString("ru-RU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
      main.appendChild(title);
      main.appendChild(meta);
      main.addEventListener("click", () => selectNote(n.id));

      const del = document.createElement("button");
      del.type = "button";
      del.className = "note-row-del";
      del.textContent = "×";
      del.title = "Удалить заметку";
      del.addEventListener("click", (ev) => deleteNote(n.id, ev));

      item.appendChild(main);
      item.appendChild(del);
      els.notesList.appendChild(item);
    }
  }

  function render() {
    renderFolderList();
    const f = getFolder(selectedFolderId);
    if (!f) {
      els.notesEmptyState.hidden = false;
      els.notesMainContent.hidden = true;
      return;
    }
    els.notesEmptyState.hidden = true;
    els.notesMainContent.hidden = false;
    els.openFolderTitle.textContent = f.name;

    renderFolderNotesList();

    if (selectedNoteId) {
      const hit = getNoteById(selectedNoteId);
      if (hit) {
        els.noteEditorWrap.hidden = false;
        if (els.noteEditorBody.dataset.boundNoteId !== selectedNoteId) {
          els.noteEditorTitle.value = hit.note.title || "";
          els.noteEditorBody.value = hit.note.body;
          els.noteEditorBody.dataset.boundNoteId = selectedNoteId;
          els.noteEditorTitle.dataset.boundNoteId = selectedNoteId;
        }
      } else {
        els.noteEditorWrap.hidden = true;
        els.noteEditorTitle.value = "";
        els.noteEditorBody.value = "";
        els.noteEditorBody.dataset.boundNoteId = "";
        els.noteEditorTitle.dataset.boundNoteId = "";
      }
    } else {
      els.noteEditorWrap.hidden = true;
      els.noteEditorTitle.value = "";
      els.noteEditorBody.value = "";
      els.noteEditorBody.dataset.boundNoteId = "";
      els.noteEditorTitle.dataset.boundNoteId = "";
    }
  }

  function bind() {
    els.btnNewFolder.addEventListener("click", addFolder);
    els.btnRenameFolder.addEventListener("click", renameFolder);
    els.btnDeleteFolder.addEventListener("click", deleteFolder);
    els.btnNewNote.addEventListener("click", addNote);
    els.noteEditorBody.addEventListener("input", onEditorInput);
    els.noteEditorTitle.addEventListener("input", onTitleInput);
    els.btnCloseEditor.addEventListener("click", () => {
      selectedNoteId = null;
      els.noteEditorTitle.value = "";
      els.noteEditorBody.value = "";
      els.noteEditorBody.dataset.boundNoteId = "";
      els.noteEditorTitle.dataset.boundNoteId = "";
      els.noteEditorWrap.hidden = true;
      renderFolderNotesList();
      persistImmediate();
    });
  }

  async function init() {
    if (typeof window !== "undefined" && window.authSync) {
      try {
        await window.authSync.refreshFromServerIfLoggedIn();
      } catch {
        /* ignore */
      }
    }
    loadState();
    bind();
    render();
    if (typeof window !== "undefined" && window.authSync) {
      try {
        await window.authSync.refreshUserLabel();
        window.authSync.ensureLogoutDelegation();
      } catch {
        /* ignore */
      }
    }
  }

  init();
})();
