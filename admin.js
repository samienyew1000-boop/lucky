"use strict";

const ADMIN_STATE_KEY = "lucky-bingo-admin-state-v1";
const ADMIN_SETTINGS_KEY = "lucky-bingo-admin-settings-v1";

const $ = (id) => document.getElementById(id);

const DEFAULT_STATE = {
  metrics: {
    totalPlayers: 1284,
    verifiedPlayers: 1198,
    newPlayers: 38,
    blockedPlayers: 17,
    idlePlayers: 86,
    processedToday: 18460,
  },
  rooms: [
    {
      id: "10",
      stake: 10,
      players: 98,
      status: "live",
      enabled: true,
      roundId: "#LB-24090",
      prizePool: 980,
      lastCall: "B-32",
      called: ["O-71", "I-24", "G-53", "B-9", "N-38", "O-64"],
      color: "blue",
    },
    {
      id: "20",
      stake: 20,
      players: 106,
      status: "live",
      enabled: true,
      roundId: "#LB-24091",
      prizePool: 3240,
      lastCall: "G-47",
      called: ["B-7", "O-72", "I-19", "N-33", "G-46", "B-12", "O-68", "I-26", "N-42", "G-55", "B-2", "O-63"],
      color: "orange",
    },
    {
      id: "50",
      stake: 50,
      players: 86,
      status: "waiting",
      enabled: true,
      roundId: "#LB-24089",
      prizePool: 2150,
      lastCall: "—",
      called: [],
      color: "purple",
    },
  ],
  transactions: [
    { id: "TX-1048", playerId: "LB-00482", player: "Abebe Kebede", type: "deposit", method: "Telebirr", amount: 1200, requested: "18 min ago", status: "pending" },
    { id: "TX-1047", playerId: "LB-00631", player: "Hana Tesfaye", type: "withdraw", method: "Bank account", amount: 800, requested: "24 min ago", status: "pending" },
    { id: "TX-1046", playerId: "LB-00192", player: "Dawit Bekele", type: "deposit", method: "Bank transfer", amount: 850, requested: "31 min ago", status: "pending" },
    { id: "TX-1045", playerId: "LB-00814", player: "Selamawit Girma", type: "deposit", method: "M-Pesa", amount: 1500, requested: "38 min ago", status: "pending" },
    { id: "TX-1044", playerId: "LB-00271", player: "Yonas Alemu", type: "withdraw", method: "Telebirr", amount: 600, requested: "46 min ago", status: "pending" },
    { id: "TX-1043", playerId: "LB-00905", player: "Meron Worku", type: "deposit", method: "Telebirr", amount: 950, requested: "52 min ago", status: "pending" },
    { id: "TX-1042", playerId: "LB-00384", player: "Tariku Fikre", type: "withdraw", method: "Bank account", amount: 1050, requested: "1h ago", status: "pending" },
    { id: "TX-1041", playerId: "LB-00762", player: "Liya Solomon", type: "deposit", method: "M-Pesa", amount: 1300, requested: "1h ago", status: "pending" },
  ],
  players: [
    { id: "LB-00482", name: "Abebe Kebede", email: "abebe.k@example.com", phone: "+251 911 284 602", balance: 1245, games: 48, lastActive: "2 min ago", status: "active", avatar: "blue", note: "" },
    { id: "LB-00631", name: "Hana Tesfaye", email: "hana.t@example.com", phone: "+251 922 631 784", balance: 386, games: 32, lastActive: "8 min ago", status: "active", avatar: "purple", note: "" },
    { id: "LB-00192", name: "Dawit Bekele", email: "dawit.b@example.com", phone: "+251 911 192 440", balance: 92, games: 17, lastActive: "24 min ago", status: "idle", avatar: "orange", note: "" },
    { id: "LB-00814", name: "Selamawit Girma", email: "selamawit.g@example.com", phone: "+251 933 814 057", balance: 670, games: 64, lastActive: "31 min ago", status: "active", avatar: "green", note: "" },
    { id: "LB-00271", name: "Yonas Alemu", email: "yonas.a@example.com", phone: "+251 911 271 830", balance: 51, games: 9, lastActive: "46 min ago", status: "active", avatar: "pink", note: "" },
    { id: "LB-00905", name: "Meron Worku", email: "meron.w@example.com", phone: "+251 922 905 314", balance: 2180, games: 91, lastActive: "1 hour ago", status: "active", avatar: "blue", note: "High-value player" },
    { id: "LB-00384", name: "Tariku Fikre", email: "tariku.f@example.com", phone: "+251 911 384 119", balance: 0, games: 5, lastActive: "Yesterday", status: "blocked", avatar: "purple", note: "Payment verification required" },
    { id: "LB-00762", name: "Liya Solomon", email: "liya.s@example.com", phone: "+251 933 762 208", balance: 740, games: 26, lastActive: "Yesterday", status: "idle", avatar: "orange", note: "" },
  ],
  activities: [
    { kind: "finance", symbol: "↗", text: "Approved a deposit request for Hana Tesfaye", time: "8 min ago" },
    { kind: "game", symbol: "◉", text: "Started round #LB-24091 in the 20 ETB room", time: "14 min ago" },
    { kind: "security", symbol: "!", text: "Blocked player account LB-00384", time: "27 min ago" },
    { kind: "finance", symbol: "↙", text: "Paid 1,800 ETB in withdrawal requests", time: "42 min ago" },
    { kind: "game", symbol: "✦", text: "The 10 ETB room reached 100 players", time: "1 hour ago" },
  ],
};

const DEFAULT_SETTINGS = {
  commission: 20,
  threshold: 10,
  countdown: 60,
  startingBonus: 50,
  startingBonusEnabled: true,
  autoCall: true,
  maintenance: false,
  transactionAlerts: true,
  largeWithdrawal: true,
  timeout: "60",
};

let state = loadState();
let settings = loadSettings();
let selectedLiveRoomId = "20";
let transactionFilter = "all";
let transactionQuery = "";
let transactionStatusFilter = "all";
let playerQuery = "";
let playerStatusFilter = "all";
let liveTimer = null;
let toastTimer = null;

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(ADMIN_STATE_KEY) || "null");
    if (!saved) return copy(DEFAULT_STATE);
    return {
      ...copy(DEFAULT_STATE),
      ...saved,
      metrics: { ...copy(DEFAULT_STATE.metrics), ...(saved.metrics || {}) },
      rooms: Array.isArray(saved.rooms) && saved.rooms.length ? saved.rooms : copy(DEFAULT_STATE.rooms),
      transactions: Array.isArray(saved.transactions) ? saved.transactions : copy(DEFAULT_STATE.transactions),
      players: Array.isArray(saved.players) ? saved.players : copy(DEFAULT_STATE.players),
      activities: Array.isArray(saved.activities) ? saved.activities : copy(DEFAULT_STATE.activities),
    };
  } catch (error) {
    return copy(DEFAULT_STATE);
  }
}

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(ADMIN_SETTINGS_KEY) || "null") || {}) };
  } catch (error) {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveState() {
  localStorage.setItem(ADMIN_STATE_KEY, JSON.stringify(state));
}

function saveSettings() {
  localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settings));
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fmt(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function money(value) {
  return `${fmt(value)} ETB`;
}

function initials(name) {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function currentRoom() {
  return state.rooms.find((room) => room.id === selectedLiveRoomId) || state.rooms[0];
}

function pendingTransactions() {
  return state.transactions.filter((transaction) => transaction.status === "pending");
}

function addActivity(text, kind = "finance", symbol = "•") {
  state.activities.unshift({ kind, symbol, text, time: "just now" });
  state.activities = state.activities.slice(0, 12);
  saveState();
}

function showToast(text, kind = "success") {
  const toast = $("admin-toast");
  if (!toast) return;
  toast.textContent = text;
  toast.className = `admin-toast is-${kind}`;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

function showSection(name, updateHash = true) {
  const valid = ["overview", "live", "transactions", "players", "reports", "settings"];
  const page = valid.includes(name) ? name : "overview";
  document.querySelectorAll(".admin-section").forEach((section) => {
    section.classList.toggle("is-active", section.dataset.page === page);
  });
  document.querySelectorAll(".admin-nav-link[data-section]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.section === page);
  });
  const label = document.querySelector(`.admin-nav-link[data-section="${page}"] span:last-child`);
  if ($("current-section-label")) $("current-section-label").textContent = label ? label.textContent : page;
  if (updateHash && window.location.hash !== `#${page}`) history.replaceState(null, "", `#${page}`);
  if (page === "live") {
    renderLive();
    startLiveTimer();
  } else {
    stopLiveTimer();
  }
  $("admin-sidebar")?.classList.remove("is-open");
}

function renderDashboard() {
  const online = state.rooms.filter((room) => room.status === "live" && room.enabled).reduce((total, room) => total + room.players, 0);
  $("stat-players").textContent = fmt(state.metrics.totalPlayers);
  $("stat-online").textContent = fmt(online);
  $("stat-revenue").innerHTML = `${fmt(state.metrics.processedToday)} <small>ETB</small>`;
  $("stat-attention").textContent = String(pendingTransactions().length);
  $("active-count").textContent = fmt(Math.max(0, state.metrics.totalPlayers - state.metrics.blockedPlayers - state.metrics.idlePlayers));
  $("idle-count").textContent = fmt(state.metrics.idlePlayers);
  $("blocked-count").textContent = fmt(state.metrics.blockedPlayers);
  $("active-percent").textContent = String(Math.round(((state.metrics.totalPlayers - state.metrics.blockedPlayers) / state.metrics.totalPlayers) * 100));
  $("player-donut").style.background = `conic-gradient(#3e8de5 0 ${Math.max(0, 100 - state.metrics.idlePlayers / state.metrics.totalPlayers * 100 - state.metrics.blockedPlayers / state.metrics.totalPlayers * 100)}%, #f2b84b ${Math.max(0, 100 - state.metrics.idlePlayers / state.metrics.totalPlayers * 100 - state.metrics.blockedPlayers / state.metrics.totalPlayers * 100)}% ${Math.max(0, 100 - state.metrics.blockedPlayers / state.metrics.totalPlayers * 100)}%, #e56a76 ${Math.max(0, 100 - state.metrics.blockedPlayers / state.metrics.totalPlayers * 100)}% 100%)`;
  $("nav-live-badge").textContent = String(state.rooms.filter((room) => room.status === "live").length);
  $("nav-transaction-badge").textContent = String(pendingTransactions().length);
  $("notification-count").textContent = String(Math.min(9, Math.max(1, pendingTransactions().length)));
  $("queue-total").textContent = String(pendingTransactions().length);
  $("queue-age").textContent = pendingTransactions().length ? "oldest 18m" : "queue clear";
  $("dashboard-round-label").textContent = currentRoom() ? `Round ${currentRoom().roundId} in progress` : "No active round";
  renderDashboardRooms();
  renderDashboardTransactions();
  renderActivity();
}

function renderDashboardRooms() {
  const container = $("dashboard-rooms");
  if (!container) return;
  container.innerHTML = state.rooms.map((room) => {
    const statusLabel = room.status === "live" ? `Calling ${room.lastCall}` : room.status === "paused" ? "Paused by admin" : "Waiting for players";
    const statusClass = room.status === "live" ? "is-live" : room.status === "waiting" ? "is-waiting" : "is-paused";
    return `<div class="admin-room-row"><i class="admin-room-color admin-room-color-${escapeHTML(room.color)}"></i><div class="admin-room-copy"><strong>${money(room.stake)} room</strong><span>${escapeHTML(statusLabel)}</span></div><div class="admin-room-players"><span>${fmt(room.players)}</span><small>players</small></div><span class="admin-room-status ${statusClass}">${room.status === "live" ? "Live" : room.status === "paused" ? "Paused" : "Waiting"}</span></div>`;
  }).join("");
}

function renderDashboardTransactions() {
  const container = $("dashboard-transactions");
  if (!container) return;
  const rows = pendingTransactions().slice(0, 4);
  container.innerHTML = rows.length ? rows.map((transaction) => `<div class="admin-mini-transaction"><span class="admin-mini-icon is-${transaction.type}">${transaction.type === "deposit" ? "↗" : "↙"}</span><div class="admin-mini-copy"><strong>${escapeHTML(transaction.player)}</strong><span>${escapeHTML(transaction.type)} · ${escapeHTML(transaction.requested)}</span></div><strong class="admin-mini-amount">${money(transaction.amount)}</strong></div>`).join("") : `<p class="admin-empty-note">No requests are waiting for review.</p>`;
}

function renderActivity() {
  const container = $("activity-list");
  if (!container) return;
  container.innerHTML = state.activities.length ? state.activities.slice(0, 5).map((activity) => `<div class="admin-activity-item"><span class="admin-activity-icon is-${escapeHTML(activity.kind)}">${escapeHTML(activity.symbol)}</span><div class="admin-activity-copy">${escapeHTML(activity.text)}</div><time>${escapeHTML(activity.time)}</time></div>`).join("") : `<p class="admin-empty-note">Activity will appear here as actions are taken.</p>`;
}

function roomStatusLabel(status) {
  if (status === "live") return "LIVE";
  if (status === "paused") return "PAUSED";
  return "WAITING";
}

function renderLive() {
  const room = currentRoom();
  if (!room) return;
  const tabs = $("live-room-tabs");
  tabs.innerHTML = state.rooms.map((item) => `<button type="button" class="admin-room-tab${item.id === room.id ? " is-active" : ""}" data-live-room="${escapeHTML(item.id)}">${money(item.stake)} room <span>· ${item.status === "live" ? "Live" : item.status === "paused" ? "Paused" : "Waiting"}</span></button>`).join("");
  $("live-room-title").textContent = `${room.stake} ETB room`;
  $("live-round-state").className = `admin-round-state ${room.status === "paused" ? "is-paused" : room.status === "live" ? "is-live" : "is-paused"}`;
  $("live-round-state").innerHTML = `<i></i> ${roomStatusLabel(room.status)}`;
  $("live-call-ball").textContent = room.lastCall || "—";
  $("live-call-count").textContent = String(room.called.length);
  $("live-round-progress").style.width = `${Math.min(100, Math.round(room.called.length / 75 * 100))}%`;
  $("live-round-id").textContent = room.roundId;
  $("live-prize-pool").textContent = money(room.prizePool);
  $("live-player-count").textContent = fmt(room.players);
  $("live-card-count").textContent = fmt(room.players);
  $("live-callers").textContent = String(Math.max(1, Math.round(room.players / 27)));
  $("live-average-call").textContent = room.status === "live" ? "01:42" : "—";
  $("toggle-round-button").textContent = room.status === "live" ? "Pause round" : room.status === "paused" ? "Resume round" : "Start round";
  $("toggle-round-button").disabled = room.status === "waiting" && !room.enabled;
  renderCallHistory(room);
  renderRoomManagement();
}

function renderCallHistory(room) {
  const history = $("live-call-history");
  const values = room.called.slice(-10).reverse();
  history.innerHTML = values.length ? values.map((value) => `<span class="admin-call-ball">${escapeHTML(value)}</span>`).join("") : `<p class="admin-empty-note">No numbers have been called yet.</p>`;
  $("call-history-note").textContent = values.length ? `${values.length} most recent calls · newest first` : "Most recent calls appear here.";
}

function renderRoomManagement() {
  const container = $("live-room-management");
  if (!container) return;
  container.innerHTML = state.rooms.map((room) => `<div class="admin-management-row"><strong>${room.stake} ETB room</strong><span>${fmt(room.players)} players</span><button type="button" class="admin-room-toggle${room.enabled ? " is-on" : ""}" data-room-toggle="${escapeHTML(room.id)}" aria-label="${room.enabled ? "Disable" : "Enable"} ${room.stake} ETB room"></button></div>`).join("");
}

function randomCall(room) {
  const used = new Set(room.called);
  const letters = ["B", "I", "N", "G", "O"];
  const ranges = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];
  const available = [];
  ranges.forEach(([low, high], index) => {
    for (let value = low; value <= high; value++) {
      const label = `${letters[index]}-${value}`;
      if (!used.has(label)) available.push(label);
    }
  });
  const call = available[Math.floor(Math.random() * available.length)] || "—";
  if (call !== "—") {
    room.called.push(call);
    room.lastCall = call;
  }
  return call;
}

function callNext() {
  const room = currentRoom();
  if (!room || room.status !== "live") {
    showToast("Resume a live round before calling a number.", "error");
    return;
  }
  const call = randomCall(room);
  saveState();
  renderLive();
  renderDashboard();
  addActivity(`Called ${call} in the ${room.stake} ETB room`, "game", "◉");
  showToast(`${call} called in the ${room.stake} ETB room.`);
}

function startLiveTimer() {
  stopLiveTimer();
  if (!settings.autoCall) return;
  const interval = Number($("call-interval")?.value || 8) * 1000;
  liveTimer = setInterval(() => {
    const room = currentRoom();
    if (room && room.status === "live" && document.querySelector("#admin-live.is-active")) {
      randomCall(room);
      saveState();
      renderLive();
      renderDashboard();
    }
  }, interval);
}

function stopLiveTimer() {
  if (liveTimer !== null) {
    clearInterval(liveTimer);
    liveTimer = null;
  }
}

function startNewRound(room = currentRoom()) {
  if (!room) return;
  const roundNumber = Number(String(room.roundId).replace(/\D/g, "")) || 24090;
  room.roundId = `#LB-${roundNumber + 1}`;
  room.called = [];
  room.lastCall = "—";
  room.status = "live";
  room.prizePool = Math.max(room.stake * room.players, room.stake);
  addActivity(`Started ${room.roundId} in the ${room.stake} ETB room`, "game", "◉");
  saveState();
  renderAll();
  showSection("live");
  showToast(`${room.stake} ETB room is live with a fresh round.`);
}

function toggleRound() {
  const room = currentRoom();
  if (!room) return;
  if (room.status === "waiting") {
    startNewRound(room);
    return;
  }
  room.status = room.status === "live" ? "paused" : "live";
  addActivity(`${room.status === "paused" ? "Paused" : "Resumed"} ${room.stake} ETB room ${room.roundId}`, "game", room.status === "paused" ? "Ⅱ" : "▶");
  saveState();
  renderAll();
  showToast(`${room.stake} ETB room ${room.status === "live" ? "resumed" : "paused"}.`);
}

function endRound() {
  const room = currentRoom();
  if (!room) return;
  room.status = "waiting";
  addActivity(`Ended ${room.roundId} in the ${room.stake} ETB room`, "game", "■");
  saveState();
  renderAll();
  showToast(`${room.stake} ETB round ended. Payout review is ready.`);
}

function renderTransactions() {
  const table = $("transactions-table");
  if (!table) return;
  const filtered = state.transactions.filter((transaction) => {
    const matchesType = transactionFilter === "all" || transactionFilter === "processed" ? transactionFilter !== "processed" || transaction.status !== "pending" : transaction.type === transactionFilter;
    const matchesStatus = transactionStatusFilter === "all" || transaction.status === transactionStatusFilter;
    const haystack = `${transaction.id} ${transaction.player} ${transaction.playerId} ${transaction.method} ${transaction.amount}`.toLowerCase();
    return matchesType && matchesStatus && (!transactionQuery || haystack.includes(transactionQuery));
  });
  document.querySelectorAll("[data-transaction-filter]").forEach((button) => button.classList.toggle("is-active", button.dataset.transactionFilter === transactionFilter));
  $("filter-all-count").textContent = String(state.transactions.filter((item) => item.status === "pending").length);
  $("filter-deposit-count").textContent = String(state.transactions.filter((item) => item.type === "deposit" && item.status === "pending").length);
  $("filter-withdraw-count").textContent = String(state.transactions.filter((item) => item.type === "withdraw" && item.status === "pending").length);
  $("transaction-result-count").textContent = `Showing ${filtered.length} request${filtered.length === 1 ? "" : "s"}`;
  table.innerHTML = filtered.length ? filtered.map(transactionRow).join("") : `<tr><td colspan="7"><p class="admin-empty-note">No transactions match these filters.</p></td></tr>`;
  renderFinanceSummary();
}

function transactionRow(transaction) {
  const isPending = transaction.status === "pending";
  const statusLabel = transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1);
  const action = isPending ? `<button type="button" class="admin-table-action is-approve" data-transaction-action="approve" data-id="${escapeHTML(transaction.id)}">✓ Approve</button><button type="button" class="admin-table-action is-reject" data-transaction-action="reject" data-id="${escapeHTML(transaction.id)}">× Reject</button>` : `<span class="admin-small-muted">${escapeHTML(transaction.processedAt || "Processed")}</span>`;
  return `<tr><td><div class="admin-player-cell"><span class="admin-player-avatar avatar-${escapeHTML(playerForTransaction(transaction).avatar)}">${initials(transaction.player)}</span><span><strong>${escapeHTML(transaction.player)}</strong><small>${escapeHTML(transaction.id)}</small></span></div></td><td>${transaction.type === "deposit" ? "Deposit" : "Withdrawal"}</td><td>${escapeHTML(transaction.method)}</td><td><strong class="admin-table-amount is-${transaction.type}">${transaction.type === "withdraw" ? "−" : "+"}${money(transaction.amount)}</strong></td><td>${escapeHTML(transaction.requested)}</td><td><span class="admin-status-pill is-${escapeHTML(transaction.status)}">${escapeHTML(statusLabel)}</span></td><td><div class="admin-table-actions">${action}</div></td></tr>`;
}

function playerForTransaction(transaction) {
  return state.players.find((player) => player.id === transaction.playerId) || { avatar: "blue" };
}

function renderFinanceSummary() {
  const pending = pendingTransactions();
  const deposits = pending.filter((transaction) => transaction.type === "deposit");
  const withdrawals = pending.filter((transaction) => transaction.type === "withdraw");
  $("finance-deposits").innerHTML = `${fmt(deposits.reduce((sum, transaction) => sum + transaction.amount, 0))} <small>ETB</small>`;
  $("finance-withdrawals").innerHTML = `${fmt(withdrawals.reduce((sum, transaction) => sum + transaction.amount, 0))} <small>ETB</small>`;
  $("finance-processed").innerHTML = `${fmt(state.metrics.processedToday)} <small>ETB</small>`;
  $("finance-deposit-count").textContent = `${deposits.length} request${deposits.length === 1 ? "" : "s"}`;
  $("finance-withdrawal-count").textContent = `${withdrawals.length} request${withdrawals.length === 1 ? "" : "s"}`;
}

function updateTransaction(id, nextStatus) {
  const transaction = state.transactions.find((item) => item.id === id);
  if (!transaction || transaction.status !== "pending") return;
  transaction.status = nextStatus;
  transaction.processedAt = "just now";
  if (nextStatus === "approved") state.metrics.processedToday += transaction.amount;
  addActivity(`${nextStatus === "approved" ? "Approved" : "Rejected"} ${transaction.type} request ${transaction.id} for ${transaction.player}`, "finance", nextStatus === "approved" ? "✓" : "×");
  saveState();
  renderAll();
  showToast(`${transaction.type === "deposit" ? "Deposit" : "Withdrawal"} ${nextStatus}.`);
}

function renderPlayers() {
  const table = $("players-table");
  if (!table) return;
  const filtered = state.players.filter((player) => {
    const matchesStatus = playerStatusFilter === "all" || player.status === playerStatusFilter;
    const haystack = `${player.id} ${player.name} ${player.email} ${player.phone}`.toLowerCase();
    return matchesStatus && (!playerQuery || haystack.includes(playerQuery));
  });
  $("player-total-count").textContent = fmt(state.metrics.totalPlayers);
  $("player-verified-count").textContent = fmt(state.metrics.verifiedPlayers);
  $("player-new-count").textContent = fmt(state.metrics.newPlayers);
  $("player-blocked-count").textContent = fmt(state.metrics.blockedPlayers);
  $("player-result-count").textContent = `Showing ${filtered.length} player${filtered.length === 1 ? "" : "s"}`;
  table.innerHTML = filtered.length ? filtered.map(playerRow).join("") : `<tr><td colspan="7"><p class="admin-empty-note">No players match this search.</p></td></tr>`;
}

function playerRow(player) {
  const isBlocked = player.status === "blocked";
  const statusLabel = player.status.charAt(0).toUpperCase() + player.status.slice(1);
  return `<tr><td><div class="admin-player-cell"><span class="admin-player-avatar avatar-${escapeHTML(player.avatar)}">${initials(player.name)}</span><span><strong>${escapeHTML(player.name)}</strong><small>${escapeHTML(player.id)}</small></span></div></td><td><div class="admin-contact-cell"><span>${escapeHTML(player.email)}</span><small>${escapeHTML(player.phone)}</small></div></td><td><strong class="admin-table-amount">${money(player.balance)}</strong></td><td>${fmt(player.games)}</td><td>${escapeHTML(player.lastActive)}</td><td><span class="admin-status-pill is-${escapeHTML(player.status)}">${escapeHTML(statusLabel)}</span></td><td><div class="admin-action-menu"><button type="button" class="admin-action-menu-button" data-player-menu="${escapeHTML(player.id)}" aria-label="Actions for ${escapeHTML(player.name)}">•••</button><div class="admin-action-menu-list"><button type="button" data-player-action="edit" data-id="${escapeHTML(player.id)}">Edit player</button><button type="button" data-player-action="password" data-id="${escapeHTML(player.id)}">Change password</button><button type="button" class="${isBlocked ? "" : "is-danger"}" data-player-action="${isBlocked ? "unblock" : "block"}" data-id="${escapeHTML(player.id)}">${isBlocked ? "Unblock account" : "Block account"}</button></div></div></td></tr>`;
}

function renderAll() {
  renderDashboard();
  renderLive();
  renderTransactions();
  renderPlayers();
}

function openModal(id) {
  const modal = $(id);
  if (modal) modal.hidden = false;
}

function closeModal(id) {
  const modal = $(id);
  if (modal) modal.hidden = true;
}

function openPlayerForm(player = null) {
  $("player-modal-title").textContent = player ? "Edit player" : "Add player";
  $("player-form-id").value = player?.id || "";
  $("player-form-name").value = player?.name || "";
  $("player-form-username").value = player?.id || "Generated after save";
  $("player-form-email").value = player?.email || "";
  $("player-form-phone").value = player?.phone || "";
  $("player-form-balance").value = player?.balance ?? 0;
  $("player-form-status").value = player?.status || "active";
  $("player-form-note").value = player?.note || "";
  openModal("player-modal");
  setTimeout(() => $("player-form-name").focus(), 40);
}

function openPasswordForm(player) {
  $("password-form-id").value = player.id;
  $("password-player-name").textContent = player.name;
  $("password-form-value").value = "";
  $("password-notify").checked = true;
  openModal("password-modal");
  setTimeout(() => $("password-form-value").focus(), 40);
}

function savePlayerFromForm(event) {
  event.preventDefault();
  const id = $("player-form-id").value;
  const existing = state.players.find((player) => player.id === id);
  const nextStatus = $("player-form-status").value;
  if (existing) {
    const previousStatus = existing.status;
    Object.assign(existing, {
      name: $("player-form-name").value.trim(),
      email: $("player-form-email").value.trim(),
      phone: $("player-form-phone").value.trim(),
      balance: Number($("player-form-balance").value) || 0,
      status: nextStatus,
      note: $("player-form-note").value.trim(),
    });
    if (previousStatus !== "blocked" && nextStatus === "blocked") state.metrics.blockedPlayers += 1;
    if (previousStatus === "blocked" && nextStatus !== "blocked") state.metrics.blockedPlayers = Math.max(0, state.metrics.blockedPlayers - 1);
    addActivity(`Updated the profile for ${existing.name}`, "security", "✎");
    showToast("Player profile updated.");
  } else {
    const nextId = makePlayerId();
    const newPlayer = {
      id: nextId,
      name: $("player-form-name").value.trim(),
      email: $("player-form-email").value.trim(),
      phone: $("player-form-phone").value.trim(),
      balance: Number($("player-form-balance").value) || 0,
      games: 0,
      lastActive: "Never",
      status: nextStatus,
      avatar: ["blue", "purple", "orange", "green", "pink"][state.players.length % 5],
      note: $("player-form-note").value.trim(),
    };
    state.players.unshift(newPlayer);
    state.metrics.totalPlayers += 1;
    state.metrics.newPlayers += 1;
    if (nextStatus === "blocked") state.metrics.blockedPlayers += 1;
    addActivity(`Added new player ${newPlayer.name}`, "security", "+");
    showToast(`${newPlayer.name} was added to the player directory.`);
  }
  saveState();
  closeModal("player-modal");
  renderAll();
}

function makePlayerId() {
  const ids = state.players.map((player) => Number(player.id.replace(/\D/g, ""))).filter(Number.isFinite);
  return `LB-${String(Math.max(10000, ...ids, 0) + 1).padStart(5, "0")}`;
}

function togglePlayerStatus(id) {
  const player = state.players.find((item) => item.id === id);
  if (!player) return;
  const wasBlocked = player.status === "blocked";
  player.status = wasBlocked ? "active" : "blocked";
  state.metrics.blockedPlayers += wasBlocked ? -1 : 1;
  state.metrics.blockedPlayers = Math.max(0, state.metrics.blockedPlayers);
  addActivity(`${wasBlocked ? "Unblocked" : "Blocked"} player account ${player.id}`, "security", wasBlocked ? "✓" : "!");
  saveState();
  renderAll();
  showToast(`${player.name} is now ${player.status}.`);
}

function savePassword(event) {
  event.preventDefault();
  const player = state.players.find((item) => item.id === $("password-form-id").value);
  if (!player) return;
  player.passwordUpdatedAt = new Date().toISOString();
  addActivity(`Changed the password for ${player.name}`, "security", "⌁");
  saveState();
  closeModal("password-modal");
  showToast(`Password updated for ${player.name}.`);
}

function downloadCSV(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/\"/g, "\"\"")}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast(`${filename} downloaded.`);
}

function exportTransactions() {
  downloadCSV("lucky-bingo-transactions.csv", [
    ["Transaction ID", "Player ID", "Player", "Type", "Method", "Amount ETB", "Requested", "Status"],
    ...state.transactions.map((transaction) => [transaction.id, transaction.playerId, transaction.player, transaction.type, transaction.method, transaction.amount, transaction.requested, transaction.status]),
  ]);
}

function exportPlayers() {
  downloadCSV("lucky-bingo-players.csv", [
    ["Player ID", "Name", "Email", "Phone", "Balance ETB", "Games", "Last active", "Status"],
    ...state.players.map((player) => [player.id, player.name, player.email, player.phone, player.balance, player.games, player.lastActive, player.status]),
  ]);
}

function bindSettings() {
  const values = {
    "setting-commission": "commission",
    "setting-threshold": "threshold",
    "setting-countdown": "countdown",
    "setting-starting-bonus": "startingBonus",
    "setting-starting-bonus-enabled": "startingBonusEnabled",
    "setting-autocall": "autoCall",
    "setting-maintenance": "maintenance",
    "setting-transactions": "transactionAlerts",
    "setting-large-withdrawal": "largeWithdrawal",
    "setting-timeout": "timeout",
  };
  Object.entries(values).forEach(([id, key]) => {
    const input = $(id);
    if (!input) return;
    if (input.type === "checkbox") input.checked = Boolean(settings[key]);
    else input.value = settings[key];
    input.addEventListener("change", () => {
      settings[key] = input.type === "checkbox" ? input.checked : input.value;
      if (input.type === "number") settings[key] = Number(input.value);
      if (key === "countdown") settings[key] = Math.min(600, Math.max(10, Math.round(settings[key] || 60)));
      if (key === "startingBonus") settings[key] = Math.min(100000, Math.max(0, Math.round(settings[key] || 0)));
      saveSettings();
      $("settings-saved").textContent = "Saved just now";
      if (key === "autoCall") {
        if (settings.autoCall && document.querySelector("#admin-live.is-active")) startLiveTimer();
        else stopLiveTimer();
      }
      showToast("Settings saved.");
    });
  });
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-section]");
    if (nav) {
      event.preventDefault();
      showSection(nav.dataset.section);
      return;
    }

    const liveRoom = event.target.closest("[data-live-room]");
    if (liveRoom) {
      selectedLiveRoomId = liveRoom.dataset.liveRoom;
      renderLive();
      startLiveTimer();
      return;
    }

    const liveAction = event.target.closest("[data-live-action]");
    if (liveAction) {
      const action = liveAction.dataset.liveAction;
      if (action === "next-call") callNext();
      if (action === "toggle-round") toggleRound();
      if (action === "end-round") endRound();
      if (action === "new-round") startNewRound();
      if (action === "refresh") {
        renderAll();
        showToast("Live room data refreshed.");
      }
      if (action === "clear-history") {
        const room = currentRoom();
        if (room) {
          room.called = [];
          room.lastCall = "—";
          saveState();
          renderAll();
          showToast("Call history cleared.");
        }
      }
      return;
    }

    const roomToggle = event.target.closest("[data-room-toggle]");
    if (roomToggle) {
      const room = state.rooms.find((item) => item.id === roomToggle.dataset.roomToggle);
      if (room) {
        room.enabled = !room.enabled;
        if (!room.enabled && room.status === "live") room.status = "paused";
        addActivity(`${room.enabled ? "Enabled" : "Disabled"} the ${room.stake} ETB room`, "game", room.enabled ? "✓" : "Ⅱ");
        saveState();
        renderAll();
        showToast(`${room.stake} ETB room ${room.enabled ? "enabled" : "disabled"}.`);
      }
      return;
    }

    const transactionFilterButton = event.target.closest("[data-transaction-filter]");
    if (transactionFilterButton) {
      transactionFilter = transactionFilterButton.dataset.transactionFilter;
      renderTransactions();
      return;
    }

    const transactionAction = event.target.closest("[data-transaction-action]");
    if (transactionAction) {
      updateTransaction(transactionAction.dataset.id, transactionAction.dataset.transactionAction === "approve" ? "approved" : "rejected");
      return;
    }

    const playerMenu = event.target.closest("[data-player-menu]");
    if (playerMenu) {
      document.querySelectorAll(".admin-action-menu.is-open").forEach((menu) => menu.classList.remove("is-open"));
      playerMenu.closest(".admin-action-menu")?.classList.toggle("is-open");
      event.stopPropagation();
      return;
    }

    const playerAction = event.target.closest("[data-player-action]");
    if (playerAction) {
      const player = state.players.find((item) => item.id === playerAction.dataset.id);
      if (playerAction.dataset.playerAction === "add") openPlayerForm();
      else if (playerAction.dataset.playerAction === "edit" && player) openPlayerForm(player);
      else if (playerAction.dataset.playerAction === "password" && player) openPasswordForm(player);
      else if ((playerAction.dataset.playerAction === "block" || playerAction.dataset.playerAction === "unblock") && player) togglePlayerStatus(player.id);
      document.querySelectorAll(".admin-action-menu.is-open").forEach((menu) => menu.classList.remove("is-open"));
      return;
    }

    const closeButton = event.target.closest("[data-close-modal]");
    if (closeButton) {
      closeModal(closeButton.dataset.closeModal);
      return;
    }

    if (event.target.classList.contains("admin-modal-backdrop")) {
      event.target.hidden = true;
      return;
    }

    if (!event.target.closest(".admin-action-menu")) document.querySelectorAll(".admin-action-menu.is-open").forEach((menu) => menu.classList.remove("is-open"));
  });

  $("admin-menu-button").addEventListener("click", () => $("admin-sidebar").classList.toggle("is-open"));
  $("open-help").addEventListener("click", () => openModal("help-modal"));
  $("notification-button").addEventListener("click", () => {
    showSection("transactions");
    showToast(`${pendingTransactions().length} transaction request${pendingTransactions().length === 1 ? "" : "s"} need review.`);
  });
  $("admin-signout").addEventListener("click", () => {
    showToast("Signed out of the admin console.");
    setTimeout(() => { window.location.href = "index.html"; }, 700);
  });
  $("clear-activity").addEventListener("click", () => {
    state.activities = [];
    saveState();
    renderActivity();
    showToast("Activity list cleared.");
  });
  $("refresh-transactions").addEventListener("click", () => {
    renderTransactions();
    showToast("Transaction queue refreshed.");
  });
  $("export-transactions").addEventListener("click", exportTransactions);
  $("export-players").addEventListener("click", exportPlayers);
  $("export-report").addEventListener("click", () => downloadCSV("lucky-bingo-report.csv", [["Metric", "Value"], ["Total players", state.metrics.totalPlayers], ["Processed today", state.metrics.processedToday], ["Pending requests", pendingTransactions().length], ["Live rooms", state.rooms.filter((room) => room.status === "live").length]]));
  $("player-filter-button").addEventListener("click", () => showToast("Use the status menu or search field to narrow players."));
  $("player-form").addEventListener("submit", savePlayerFromForm);
  $("password-form").addEventListener("submit", savePassword);
  $("transaction-search").addEventListener("input", (event) => {
    transactionQuery = event.target.value.trim().toLowerCase();
    renderTransactions();
  });
  $("transaction-status-filter").addEventListener("change", (event) => {
    transactionStatusFilter = event.target.value;
    renderTransactions();
  });
  $("player-search").addEventListener("input", (event) => {
    playerQuery = event.target.value.trim().toLowerCase();
    renderPlayers();
  });
  $("player-status-filter").addEventListener("change", (event) => {
    playerStatusFilter = event.target.value;
    renderPlayers();
  });
  $("call-interval").addEventListener("change", startLiveTimer);
  window.addEventListener("hashchange", () => showSection(window.location.hash.slice(1), false));
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      showSection("players");
      $("player-search").focus();
    }
    if (event.key === "Escape") {
      document.querySelectorAll(".admin-modal-backdrop:not([hidden])").forEach((modal) => { modal.hidden = true; });
      document.querySelectorAll(".admin-action-menu.is-open").forEach((menu) => menu.classList.remove("is-open"));
    }
  });
}

function initialise() {
  bindSettings();
  bindEvents();
  renderAll();
  showSection(window.location.hash.slice(1) || "overview", false);
  setInterval(() => {
    const updated = $("last-updated");
    if (updated) updated.textContent = "Updated just now";
  }, 60000);
}

initialise();
