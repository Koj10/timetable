/* Glossmorphism schedule calendar
 * - Multiple color "dots" per date
 * - Each color has a list of tasks (meaning of the dot)
 * - Drag a color token onto a date to toggle dot
 * - Saves to localStorage
 */

(() => {
  const STORAGE_KEY = "glosmoSchedule-v1";
  const FALLBACK_GUEST_KEY = "glosmoSchedule-guest-v1";

  /** @type {{id:string,name:string,color:string,tasks:string[]}[]} */
  let colors = [];
  /** @type {{[dateKey:string]: {[colorId:string]: true}}} */
  let dotsByDate = {};
  /** @type {{[dateKey:string]: string}} заметки к конкретной дате */
  let dayNotes = {};
  /** папки заметок (notes.html) — подтягиваем из storage при save, чтобы не затирать */

  let currentYear = new Date().getFullYear();
  let currentMonthIndex = new Date().getMonth();
  /** @type {string|null} */
  let selectedColorId = null;

  /** открытое в модалке */
  let modalDateKey = null;
  let noteSaveTimer = null;
  const HOVER_MS = 700;
  let dayHoverTimer = null;
  let dayHoverTargetKey = null;

  const els = {
    monthLabel: document.getElementById("monthLabel"),
    monthHint: document.getElementById("monthHint"),
    btnPrev: document.getElementById("btnPrev"),
    btnNext: document.getElementById("btnNext"),
    calendarGrid: document.getElementById("calendarGrid"),
    colorsList: document.getElementById("colorsList"),
    btnAddColor: document.getElementById("btnAddColor"),
    newColorHex: document.getElementById("newColorHex"),
    newColorName: document.getElementById("newColorName"),
    btnReset: document.getElementById("btnReset"),
    dayModal: document.getElementById("dayModal"),
    dayModalTitle: document.getElementById("dayModalTitle"),
    dayModalSubtitle: document.getElementById("dayModalSubtitle"),
    dayModalDots: document.getElementById("dayModalDots"),
    dayModalNote: document.getElementById("dayModalNote"),
    dayModalClose: document.getElementById("dayModalClose"),
  };

  function uid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "id_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  }

  function dateKey(d) {
    // YYYY-MM-DD in local time
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function parseDateKey(key) {
    // key: YYYY-MM-DD (local)
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function formatMonthTitle(year, monthIndex) {
    const d = new Date(year, monthIndex, 1);
    const formatter = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" });
    return formatter.format(d).replace(/^./, (c) => c.toUpperCase());
  }

  function ensureDefaults() {
    if (colors.length > 0) return;
    colors = [
      { id: uid(), name: "Учёба", color: "#7c5cff", tasks: ["Проект", "Занятия"] },
      { id: uid(), name: "Работа", color: "#20c997", tasks: ["Встреча", "Планирование"] },
    ];
    selectedColorId = colors[0].id;
  }

  function storageKey() {
    if (typeof window !== "undefined" && window.authSync && typeof window.authSync.getStorageKey === "function") {
      return window.authSync.getStorageKey();
    }
    return STORAGE_KEY;
  }

  function save() {
    let noteFolders = [];
    let selectedNoteFolderId = null;
    let selectedNoteItemId = null;
    try {
      const raw = localStorage.getItem(storageKey());
      if (raw) {
        const p = JSON.parse(raw);
        if (p && Array.isArray(p.noteFolders)) noteFolders = p.noteFolders;
        if (p && typeof p.selectedNoteFolderId === "string") selectedNoteFolderId = p.selectedNoteFolderId;
        if (p && (typeof p.selectedNoteItemId === "string" || p.selectedNoteItemId === null))
          selectedNoteItemId = p.selectedNoteItemId;
      }
    } catch {
      /* ignore */
    }
    const payload = {
      v: 3,
      colors,
      dotsByDate,
      dayNotes,
      noteFolders,
      selectedNoteFolderId,
      selectedNoteItemId,
      selectedColorId,
      currentYear,
      currentMonthIndex,
    };
    localStorage.setItem(storageKey(), JSON.stringify(payload));
    if (typeof window !== "undefined" && window.authSync) {
      window.authSync.scheduleUpload();
      window.authSync.refreshUserLabel().catch(() => {});
    }
  }

  function load() {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return;
    try {
      const payload = JSON.parse(raw);
      if (payload && Array.isArray(payload.colors)) colors = payload.colors;
      if (payload && payload.dotsByDate && typeof payload.dotsByDate === "object") dotsByDate = payload.dotsByDate;
      if (payload && payload.dayNotes && typeof payload.dayNotes === "object") dayNotes = payload.dayNotes;
      if (payload && typeof payload.selectedColorId === "string") selectedColorId = payload.selectedColorId;
      if (payload && typeof payload.currentYear === "number") currentYear = payload.currentYear;
      if (payload && typeof payload.currentMonthIndex === "number") currentMonthIndex = payload.currentMonthIndex;
    } catch {
      // ignore corrupt storage
    }
  }

  function toggleDotForDate(dateK, colorId) {
    if (!colorId) return;
    if (!dotsByDate[dateK]) dotsByDate[dateK] = {};
    const exists = !!dotsByDate[dateK][colorId];
    if (exists) delete dotsByDate[dateK][colorId];
    else dotsByDate[dateK][colorId] = true;

    // cleanup empty
    if (dotsByDate[dateK] && Object.keys(dotsByDate[dateK]).length === 0) delete dotsByDate[dateK];
  }

  function getColorById(colorId) {
    return colors.find((c) => c.id === colorId) || null;
  }

  function getDotsColorsForDate(dateK) {
    const map = dotsByDate[dateK] || {};
    return Object.keys(map)
      .map((id) => getColorById(id))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  function formatLongDate(d) {
    const f = new Intl.DateTimeFormat("ru-RU", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const s = f.format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function isDayModalOpen() {
    return els.dayModal && !els.dayModal.hidden;
  }

  function flushDayNoteFromModal() {
    if (!modalDateKey || !els.dayModalNote) return;
    const v = els.dayModalNote.value;
    if (v.trim()) dayNotes[modalDateKey] = v;
    else delete dayNotes[modalDateKey];
  }

  function scrollbarWidthPx() {
    return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
  }

  function lockBodyForModal() {
    const pad = scrollbarWidthPx();
    document.documentElement.style.setProperty("--modal-scrollbar-pad", pad ? `${pad}px` : "0px");
    document.documentElement.classList.add("modal-open");
    document.body.classList.add("modal-open");
  }

  function unlockBodyForModal() {
    document.documentElement.classList.remove("modal-open");
    document.body.classList.remove("modal-open");
    document.documentElement.style.removeProperty("--modal-scrollbar-pad");
  }

  function closeDayModal() {
    clearTimeout(noteSaveTimer);
    noteSaveTimer = null;
    flushDayNoteFromModal();
    modalDateKey = null;
    if (els.dayModal) {
      els.dayModal.hidden = true;
      els.dayModal.setAttribute("aria-hidden", "true");
    }
    unlockBodyForModal();
    save();
  }

  function openDayModal(dKey, dateObj) {
    if (!els.dayModal || !dateObj) return;
    const todayKey = dateKey(new Date());
    modalDateKey = dKey;
    els.dayModal.hidden = false;
    els.dayModal.removeAttribute("aria-hidden");
    lockBodyForModal();

    els.dayModalTitle.textContent = formatLongDate(dateObj);
    els.dayModalSubtitle.textContent =
      dKey === todayKey ? `${dKey} · сегодня` : dKey;

    els.dayModalDots.innerHTML = "";
    const present = getDotsColorsForDate(dKey);
    if (present.length === 0) {
      const empty = document.createElement("div");
      empty.className = "day-detail-empty";
      empty.textContent = "На этот день пока нет цветных меток. Выберите цвет и кликните по ячейке в календаре.";
      els.dayModalDots.appendChild(empty);
    } else {
      for (const c of present) {
        const item = document.createElement("div");
        item.className = "day-detail-item";
        const sw = document.createElement("div");
        sw.className = "day-detail-swatch";
        sw.style.background = c.color;
        const col = document.createElement("div");
        const name = document.createElement("div");
        name.className = "day-detail-name";
        name.textContent = c.name || "Без названия";
        const tasks = document.createElement("div");
        tasks.className = "day-detail-tasks";
        const tlist = Array.isArray(c.tasks) && c.tasks.length ? c.tasks.join(" · ") : "Задачи к цвету не заданы.";
        tasks.textContent = tlist;
        col.appendChild(name);
        col.appendChild(tasks);
        item.appendChild(sw);
        item.appendChild(col);
        els.dayModalDots.appendChild(item);
      }
    }

    els.dayModalNote.value = dayNotes[dKey] || "";
    requestAnimationFrame(() => {
      try {
        if (typeof els.dayModalNote.focus === "function") {
          els.dayModalNote.focus({ preventScroll: true });
        }
      } catch {
        try {
          els.dayModalNote.focus();
        } catch {
          /* ignore */
        }
      }
    });
  }

  function clearDayHoverTimer() {
    if (dayHoverTimer) clearTimeout(dayHoverTimer);
    dayHoverTimer = null;
    dayHoverTargetKey = null;
  }

  function bindDayModal() {
    if (!els.dayModal || !els.dayModalClose) return;

    els.dayModalClose.addEventListener("click", () => closeDayModal());

    const backdrop = els.dayModal.querySelector("[data-modal-close]");
    if (backdrop) backdrop.addEventListener("click", () => closeDayModal());

    els.dayModalNote.addEventListener("input", () => {
      clearTimeout(noteSaveTimer);
      noteSaveTimer = setTimeout(() => {
        flushDayNoteFromModal();
        save();
      }, 400);
    });
  }

  function renderCalendar() {
    const y = currentYear;
    const m = currentMonthIndex;
    els.monthLabel.textContent = formatMonthTitle(y, m);
    els.monthHint.textContent = selectedColorId
      ? "Кликните по дате, чтобы поставить/снять кружок."
      : "Сначала выберите цвет.";

    const firstOfMonth = new Date(y, m, 1);
    const startDay = (firstOfMonth.getDay() + 6) % 7; // Monday=0 ... Sunday=6
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    // total cells: 6 weeks (42)
    const totalCells = 42;
    const cells = [];
    const startDate = new Date(y, m, 1 - startDay);
    for (let i = 0; i < totalCells; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      cells.push(d);
    }

    els.calendarGrid.innerHTML = "";

    const todayKey = dateKey(new Date());

    for (const d of cells) {
      const dKey = dateKey(d);
      const day = d.getDate();
      const isOut = d.getMonth() !== m;
      const isToday = dKey === todayKey;

      const dayEl = document.createElement("div");
      dayEl.className = "day" + (isOut ? " is-out" : "") + (isToday ? " is-today" : "");
      dayEl.dataset.dateKey = dKey;

      const numEl = document.createElement("div");
      numEl.className = "day-num";
      numEl.textContent = String(day);
      dayEl.appendChild(numEl);

      const dotsWrap = document.createElement("div");
      dotsWrap.className = "dots";

      const presentColors = getDotsColorsForDate(dKey);
      for (const c of presentColors) {
        const dot = document.createElement("div");
        dot.className = "dot token-draggable";
        dot.style.setProperty("--dotColor", c.color);
        dot.title = `${c.name}: ${c.tasks?.length ? c.tasks.join(", ") : "без задач"}`;
        dot.dataset.colorId = c.id;
        dot.dataset.dateKey = dKey;

        dot.draggable = true;
        dot.addEventListener("dragstart", (ev) => {
          ev.dataTransfer.setData("text/plain", JSON.stringify({ colorId: c.id, dateKey: dKey }));
          ev.dataTransfer.effectAllowed = "copy";
        });

        dotsWrap.appendChild(dot);
      }

      if (presentColors.length === 0) {
        dotsWrap.style.opacity = ".65";
      }

      dayEl.appendChild(dotsWrap);

      dayEl.addEventListener("mouseenter", () => {
        if (isOut) return;
        clearTimeout(dayHoverTimer);
        dayHoverTargetKey = dKey;
        dayHoverTimer = setTimeout(() => {
          dayHoverTimer = null;
          if (dayHoverTargetKey === dKey) openDayModal(dKey, d);
        }, HOVER_MS);
      });
      dayEl.addEventListener("mouseleave", () => {
        if (dayHoverTargetKey === dKey) clearDayHoverTimer();
      });
      dayEl.addEventListener("mousedown", () => {
        if (dayHoverTargetKey === dKey) clearDayHoverTimer();
      });

      dayEl.addEventListener("click", () => {
        if (isOut) return;
        if (!selectedColorId) return;
        toggleDotForDate(dKey, selectedColorId);
        renderCalendar();
        save();
      });

      dayEl.addEventListener("dragover", (ev) => {
        if (isOut) return;
        ev.preventDefault();
        dayEl.classList.add("is-drop");
        ev.dataTransfer.dropEffect = "copy";
      });

      dayEl.addEventListener("dragleave", () => {
        dayEl.classList.remove("is-drop");
      });

      dayEl.addEventListener("drop", (ev) => {
        if (isOut) return;
        ev.preventDefault();
        dayEl.classList.remove("is-drop");
        if (!selectedColorId && !ev.dataTransfer) return;

        let payload = null;
        const raw = ev.dataTransfer.getData("text/plain");
        if (raw) {
          try {
            payload = JSON.parse(raw);
          } catch {
            payload = null;
          }
        }
        const colorId = payload?.colorId || selectedColorId;
        if (!colorId) return;
        toggleDotForDate(dKey, colorId);
        renderCalendar();
        save();
      });

      els.calendarGrid.appendChild(dayEl);
    }
  }

  function renderColors() {
    els.colorsList.innerHTML = "";
    for (const c of colors) {
      const card = document.createElement("div");
      card.className = "color-card" + (c.id === selectedColorId ? " is-selected" : "");

      card.dataset.colorId = c.id;

      const head = document.createElement("div");
      head.className = "color-head";

      const left = document.createElement("div");
      left.className = "color-left";

      const swatch = document.createElement("div");
      swatch.className = "color-swatch";
      swatch.style.setProperty("--swatch", c.color);
      swatch.draggable = true;
      swatch.title = "Перетащите кружок на дату";
      swatch.dataset.colorId = c.id;
      swatch.addEventListener("dragstart", (ev) => {
        ev.dataTransfer.setData("text/plain", JSON.stringify({ colorId: c.id, dateKey: null }));
        ev.dataTransfer.effectAllowed = "copy";
      });

      const name = document.createElement("div");
      name.className = "color-name";
      name.textContent = c.name || "Без названия";

      left.appendChild(swatch);
      left.appendChild(name);

      const actions = document.createElement("div");
      actions.className = "color-actions";

      const btnSelect = document.createElement("button");
      btnSelect.type = "button";
      btnSelect.className = "mini-btn";
      btnSelect.title = "Сделать активным цветом (1)" ;
      btnSelect.textContent = "✓";
      btnSelect.addEventListener("click", () => {
        selectedColorId = c.id;
        renderColors();
        renderCalendar();
        save();
      });

      const btnDelete = document.createElement("button");
      btnDelete.type = "button";
      btnDelete.className = "mini-btn";
      btnDelete.title = "Удалить цвет";
      btnDelete.textContent = "×";
      btnDelete.addEventListener("click", () => {
        const ok = confirm(`Удалить цвет "${c.name || "без названия"}" и все кружки этого цвета?`);
        if (!ok) return;
        colors = colors.filter((x) => x.id !== c.id);
        for (const key of Object.keys(dotsByDate)) {
          if (dotsByDate[key] && dotsByDate[key][c.id]) delete dotsByDate[key][c.id];
          if (dotsByDate[key] && Object.keys(dotsByDate[key]).length === 0) delete dotsByDate[key];
        }
        if (selectedColorId === c.id) selectedColorId = colors[0]?.id || null;
        renderColors();
        renderCalendar();
        save();
      });

      actions.appendChild(btnSelect);
      actions.appendChild(btnDelete);

      head.appendChild(left);
      head.appendChild(actions);

      const body = document.createElement("div");
      body.className = "color-body";

      const tasksRow = document.createElement("div");
      tasksRow.className = "task-row";

      const input = document.createElement("input");
      input.className = "input task-input";
      input.type = "text";
      input.placeholder = "Добавить задачу для этого цвета";
      input.maxLength = 80;

      const btnAdd = document.createElement("button");
      btnAdd.type = "button";
      btnAdd.className = "btn";
      btnAdd.textContent = "+ Добавить";
      btnAdd.addEventListener("click", () => {
        const val = input.value.trim();
        if (!val) return;
        const target = colors.find((x) => x.id === c.id);
        if (!target) return;
        if (!Array.isArray(target.tasks)) target.tasks = [];
        target.tasks.push(val);
        input.value = "";
        renderColors();
        save();
      });

      tasksRow.appendChild(input);
      tasksRow.appendChild(btnAdd);

      const tasksWrap = document.createElement("div");
      tasksWrap.className = "tasks";

      const tasks = Array.isArray(c.tasks) ? c.tasks : [];
      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        const row = document.createElement("div");
        row.className = "task";

        const text = document.createElement("div");
        text.className = "task-text";
        text.textContent = t;

        const del = document.createElement("button");
        del.type = "button";
        del.className = "task-del";
        del.title = "Удалить задачу";
        del.textContent = "×";
        del.addEventListener("click", () => {
          const target = colors.find((x) => x.id === c.id);
          if (!target) return;
          target.tasks.splice(i, 1);
          renderColors();
          save();
        });

        row.appendChild(text);
        row.appendChild(del);
        tasksWrap.appendChild(row);
      }

      // Click anywhere on card selects color
      card.addEventListener("click", (ev) => {
        const isButton = ev.target && ev.target.tagName && ["BUTTON", "INPUT"].includes(ev.target.tagName);
        if (isButton) return;
        selectedColorId = c.id;
        renderColors();
        renderCalendar();
        save();
      });

      body.appendChild(tasksRow);
      body.appendChild(tasksWrap);

      card.appendChild(head);
      card.appendChild(body);
      els.colorsList.appendChild(card);
    }
  }

  function renderAddColor() {
    // reserved for future; actual logic in listeners
  }

  async function init() {
    load();
    if (typeof window !== "undefined" && window.authSync) {
      try {
        await window.authSync.refreshFromServerIfLoggedIn();
      } catch {
        /* ignore */
      }
      load();
    }
    ensureDefaults();
    renderColors();
    renderCalendar();
    save();

    if (typeof window !== "undefined" && window.authSync) {
      try {
        await window.authSync.refreshUserLabel();
        window.authSync.ensureLogoutDelegation();
      } catch {
        /* ignore */
      }
    }

    els.btnPrev.addEventListener("click", () => {
      currentMonthIndex -= 1;
      if (currentMonthIndex < 0) {
        currentMonthIndex = 11;
        currentYear -= 1;
      }
      renderCalendar();
      save();
    });

    els.btnNext.addEventListener("click", () => {
      currentMonthIndex += 1;
      if (currentMonthIndex > 11) {
        currentMonthIndex = 0;
        currentYear += 1;
      }
      renderCalendar();
      save();
    });

    els.btnAddColor.addEventListener("click", () => {
      const hex = (els.newColorHex.value || "#ffffff").toLowerCase();
      const name = (els.newColorName.value || "").trim();
      const color = {
        id: uid(),
        name: name || "Новый цвет",
        color: hex,
        tasks: [],
      };
      colors.push(color);
      selectedColorId = color.id;
      els.newColorName.value = "";
      renderColors();
      renderCalendar();
      save();
    });

    els.btnReset.addEventListener("click", () => {
      const ok = confirm("Сбросить все данные? Кружки, цвета, заметки к дням и папки с заметками будут удалены.");
      if (!ok) return;
      localStorage.removeItem(storageKey());
      localStorage.removeItem(FALLBACK_GUEST_KEY);
      colors = [];
      dotsByDate = {};
      dayNotes = {};
      selectedColorId = null;
      currentYear = new Date().getFullYear();
      currentMonthIndex = new Date().getMonth();
      ensureDefaults();
      renderColors();
      renderCalendar();
      save();
    });

    // keyboard shortcuts
    document.addEventListener("keydown", (ev) => {
      if (isDayModalOpen()) {
        if (ev.key === "Escape") {
          closeDayModal();
          ev.preventDefault();
        }
        return;
      }
      if (ev.key === "ArrowLeft") els.btnPrev.click();
      if (ev.key === "ArrowRight") els.btnNext.click();
      if (ev.key === "Escape") {
        // quick: clear current selected color (forces choosing again)
        selectedColorId = null;
        renderColors();
        renderCalendar();
        save();
      }
    });

    bindDayModal();
    renderAddColor();
  }

  init();
})();

