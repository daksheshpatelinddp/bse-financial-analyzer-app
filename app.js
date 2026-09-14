/*
 * BSE Financial Results Analyzer – Frontend
 * Dedicated app for managing watchlists and viewing Financial Result alerts.
 */

const WORKER_URL = "https://bse-financial-analyzer.daksheshpatelin.workers.dev";

let watchlist = [];
let announcements = [];

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("telegramToggle").addEventListener("change", saveNotificationSettings);
  document.getElementById("refreshBtn").addEventListener("click", () => {
    loadAnnouncements();
    loadWatchlist();
  });
  document.getElementById("checkNowBtn").addEventListener("click", checkNow);
  document.getElementById("addWatchBtn").addEventListener("click", addWatchlistItem);
  document.getElementById("watchInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") addWatchlistItem();
  });
  document.getElementById("clearWatchlistBtn").addEventListener("click", clearWatchlist);
  document.getElementById("csvFileInput").addEventListener("change", handleFileUpload);

  loadNotificationSettings();
  loadWatchlist();
  loadAnnouncements();
});

/* ---------- Notification Settings ---------- */

async function loadNotificationSettings() {
  try {
    const res = await fetch(`${WORKER_URL}/notification-settings`);
    const data = await res.json();
    const s = data.settings || {};
    document.getElementById("telegramToggle").checked = s.telegram !== false;
  } catch (err) {
    console.error("Failed to load notification settings:", err);
  }
}

async function saveNotificationSettings() {
  const body = {
    telegram: document.getElementById("telegramToggle").checked,
  };
  try {
    await fetch(`${WORKER_URL}/notification-settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("Failed to save notification settings:", err);
  }
}

/* ---------- Watchlist Logic ---------- */

async function loadWatchlist() {
  try {
    const res = await fetch(`${WORKER_URL}/watchlist`);
    const data = await res.json();
    watchlist = data.watchlist || [];
    renderWatchlist();
  } catch (err) {
    console.error("Failed to load watchlist:", err);
  }
}

let saveWatchlistTimer = null;

async function saveWatchlist() {
  renderWatchlist();

  if (saveWatchlistTimer) clearTimeout(saveWatchlistTimer);
  saveWatchlistTimer = setTimeout(async () => {
    saveWatchlistTimer = null;
    try {
      await fetch(`${WORKER_URL}/watchlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchlist }),
      });
    } catch (err) {
      console.error("Failed to save watchlist:", err);
    }
  }, 700);
}

function addWatchlistItem() {
  const raw = document.getElementById("watchInput").value.trim();
  if (!raw) return;
  const isScrip = /^\d{6}$/.test(raw);
  const newItem = isScrip ? { scrip: raw, name: "" } : { scrip: "", name: raw };
  const exists = watchlist.some(
    (w) =>
      (w.scrip && newItem.scrip && w.scrip === newItem.scrip) ||
      (w.name && newItem.name && w.name.toLowerCase() === newItem.name.toLowerCase())
  );
  if (!exists) {
    watchlist.push(newItem);
    saveWatchlist();
  }
  document.getElementById("watchInput").value = "";
}

function removeWatchlistItem(index) {
  watchlist.splice(index, 1);
  saveWatchlist();
}

function clearWatchlist() {
  if (!confirm("Clear entire watchlist?")) return;
  watchlist = [];
  saveWatchlist();
}

function handleFileUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (event) {
    const lines = String(event.target.result || "").split(/\r?\n/);
    lines.forEach((line) => {
      line.split(",").forEach((entry) => {
        const clean = entry.trim();
        if (!clean) return;
        const isScrip = /^\d{6}$/.test(clean);
        const newItem = isScrip ? { scrip: clean, name: "" } : { scrip: "", name: clean };
        if (
          !watchlist.some(
            (w) =>
              (w.scrip && newItem.scrip && w.scrip === newItem.scrip) ||
              (w.name && newItem.name && w.name.toLowerCase() === newItem.name.toLowerCase())
          )
        ) {
          watchlist.push(newItem);
        }
      });
    });
    saveWatchlist();
  };
  reader.readAsText(file);
  e.target.value = "";
}

function renderWatchlist() {
  const countEl = document.getElementById("watchlistCount");
  if (countEl) countEl.textContent = `(${watchlist.length})`;
  const container = document.getElementById("whitelistContainer");
  if (!watchlist.length) {
    container.innerHTML = '<span class="muted">No scrips added yet. Enter 6-digit code or company name.</span>';
    return;
  }
  container.innerHTML = watchlist
    .map(
      (item, index) => `
    <div class="watch-item">
      <span>${escapeHtml(item.name || item.scrip)}</span>
      <button type="button" class="remove-watch" data-index="${index}">&times;</button>
    </div>`
    )
    .join("");
  container.querySelectorAll(".remove-watch").forEach((btn) => {
    btn.addEventListener("click", () => removeWatchlistItem(Number(btn.dataset.index)));
  });
}

/* ---------- Financial Result Announcements Feed ---------- */

async function loadAnnouncements() {
  const feedCount = document.getElementById("feedCount");
  if (feedCount) feedCount.textContent = "Loading…";
  try {
    const res = await fetch(`${WORKER_URL}/announcements`);
    const data = await res.json();
    announcements = data.items || [];
    renderAnnouncements();
  } catch (err) {
    console.error("Failed to load announcements:", err);
    if (feedCount) feedCount.textContent = "Failed to load.";
  }
}

function renderAnnouncements() {
  const feedCount = document.getElementById("feedCount");
  const results = document.getElementById("results");
  if (feedCount) feedCount.textContent = `${announcements.length} result${announcements.length === 1 ? "" : "s"}`;

  if (!announcements.length) {
    results.innerHTML =
      '<p class="muted empty">No financial result alerts yet. Click “⚡ Check now” to scan BSE. Only quarterly result filings matching your watchlist will be listed here.</p>';
    return;
  }

  results.innerHTML = announcements
    .map((item) => {
      const fmt = (iso) => {
        if (!iso) return "—";
        try {
          return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        } catch (e) {
          return String(iso);
        }
      };
      const detected = fmt(item.fetchedAt);
      const link = item.link
        ? `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">📄 View Financial Result</a>`
        : "";
      return `
      <article class="alert-card is-alert">
        <div class="alert-top">
          <strong>${escapeHtml(item.company || "Company")} ${item.scrip ? `(${escapeHtml(item.scrip)})` : ""}</strong>
          <span class="badge alert">FINANCIAL RESULT</span>
        </div>
        <p class="title">${escapeHtml(item.title || "Financial Result Announcement")}</p>
        ${item.description ? `<p class="muted">${escapeHtml(item.description)}</p>` : ""}
        <div class="meta">
          <span><b>Detected:</b> ${escapeHtml(detected)}</span>
        </div>
        ${link}
      </article>`;
    })
    .join("");
}

/* ---------- Manual Poll Trigger ---------- */

async function checkNow() {
  const btn = document.getElementById("checkNowBtn");
  const last = document.getElementById("lastCheckText");
  btn.disabled = true;
  btn.textContent = "Checking…";
  try {
    const res = await fetch(`${WORKER_URL}/monitor`);
    const data = await res.json();
    if (last) {
      last.textContent = `Last check: ${new Date().toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
      })} · new filings ${data.newAnnouncements || 0} · matched results ${data.newAlerts || 0}`;
    }
    await loadAnnouncements();
  } catch (err) {
    console.error("Manual check error:", err);
    if (last) last.textContent = "Last check failed.";
  } finally {
    btn.disabled = false;
    btn.textContent = "⚡ Check now";
  }
}