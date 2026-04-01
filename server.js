/**
 * Локальный сервер: статика + API регистрации/входа + хранение данных в JSON (без нативных модулей).
 * Запуск: npm install && npm start → http://localhost:3000
 */
const path = require("path");
const fs = require("fs");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-замените-в-продакшене";
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadStore() {
  if (!fs.existsSync(STORE_FILE)) {
    return { nextId: 1, users: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
    return { nextId: 1, users: [] };
  }
}

function saveStore(store) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store), "utf8");
}

function getUserById(store, id) {
  const n = Number(id);
  return store.users.find((u) => u.id === n) || null;
}

function getUserByEmail(store, email) {
  const e = normalizeEmail(email);
  return store.users.find((u) => u.email === e) || null;
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

const app = express();
app.use(express.json({ limit: "5mb" }));

function authMiddleware(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    res.status(401).json({ error: "Нужна авторизация" });
    return;
  }
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    req.userId = payload.sub;
    req.userEmail = payload.email;
    next();
  } catch {
    res.status(401).json({ error: "Сессия недействительна" });
  }
}

app.post("/api/register", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Укажите корректный email" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Пароль не короче 6 символов" });
    return;
  }

  const store = loadStore();
  if (getUserByEmail(store, email)) {
    res.status(409).json({ error: "Этот email уже зарегистрирован" });
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  const id = store.nextId++;
  store.users.push({
    id,
    email,
    password_hash: hash,
    payload: null,
    updated_at: null,
  });
  saveStore(store);

  const token = jwt.sign({ sub: id, email }, JWT_SECRET, { expiresIn: "60d" });
  res.status(201).json({ token, email });
});

app.post("/api/login", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");

  const store = loadStore();
  const row = getUserByEmail(store, email);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    res.status(401).json({ error: "Неверный email или пароль" });
    return;
  }

  const token = jwt.sign({ sub: row.id, email: row.email }, JWT_SECRET, { expiresIn: "60d" });
  res.json({ token, email: row.email });
});

app.get("/api/me", authMiddleware, (req, res) => {
  res.json({ email: req.userEmail });
});

app.get("/api/data", authMiddleware, (req, res) => {
  const store = loadStore();
  const u = getUserById(store, req.userId);
  if (!u || u.payload == null) {
    res.json({ payload: null, updatedAt: null });
    return;
  }
  res.json({ payload: u.payload, updatedAt: u.updated_at });
});

app.put("/api/data", authMiddleware, (req, res) => {
  const body = req.body;
  if (body == null || typeof body !== "object") {
    res.status(400).json({ error: "Нужен JSON-объект данных" });
    return;
  }
  const now = Date.now();
  const store = loadStore();
  const u = getUserById(store, req.userId);
  if (!u) {
    res.status(401).json({ error: "Пользователь не найден" });
    return;
  }
  u.payload = body;
  u.updated_at = now;
  saveStore(store);
  res.json({ ok: true, updatedAt: now });
});

app.use(express.static(ROOT));

app.listen(PORT, () => {
  console.log(`Сервер: http://localhost:${PORT}`);
  console.log("Откройте в браузере этот адрес (не file://), чтобы работали вход и синхронизация.");
});
