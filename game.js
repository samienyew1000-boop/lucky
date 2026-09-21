"use strict";

const BALANCE_KEY = "lucky-bingo-balance";
const START_BALANCE = 5;
const CARD_COUNT = 100;
const MAX_PICK = 4;
const CALL_MS = 1600;
const PICK_SECS = 22;
const ROOM_UPDATE_MS = 2400;
const COMMISSION_RATE = 0.2;

const ROOMS = [
  { stake: 10, players: 98, active: "Low balance" },
  { stake: 20, players: 106, active: "Low balance" },
  { stake: 50, players: 86, active: "Low balance" },
];

const LETTERS = ["B", "I", "N", "G", "O"];
const COL_RANGES = [
  [1, 15],
  [16, 30],
  [31, 45],
  [46, 60],
  [61, 75],
];

const $ = (id) => document.getElementById(id);
const views = {
  lobby: $("view-lobby"),
  pick: $("view-pick"),
  game: $("view-game"),
};

let balance = loadNum(BALANCE_KEY, START_BALANCE, 0);
let stake = 10;
let selected = new Set();
let selectedPreviewId = null;
let takenByOthers = new Set();
let cardDefs = {};
let called = [];
let callPool = [];
let callTimer = null;
let pickTimer = null;
let roomTimer = null;
let pickLeft = PICK_SECS;
let playing = false;
let claimed = false;
let botPlayers = 0;

function loadNum(key, fallback, minimum = 1) {
  const n = Number(localStorage.getItem(key));
  return Number.isFinite(n) && n >= minimum ? n : fallback;
}

function saveBalance() {
  localStorage.setItem(BALANCE_KEY, String(balance));
}

function fmtBal(n) {
  return Math.floor(n).toLocaleString("en-US").replace(/,/g, " ");
}

function fmt(n) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function letterFor(n) {
  for (let i = 0; i < COL_RANGES.length; i++) {
    if (n >= COL_RANGES[i][0] && n <= COL_RANGES[i][1]) return LETTERS[i];
  }
  return "";
}

function showView(name) {
  Object.entries(views).forEach(([key, el]) => el.classList.toggle("is-on", key === name));
  if (name === "lobby") startRoomUpdates();
  else stopRoomUpdates();
}

function toast(text, kind) {
  const el = $("toast");
  el.textContent = text;
  el.className = "lb-toast" + (kind ? " is-" + kind : "");
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 1800);
}

function renderBalance() {
  $("balance").textContent = fmtBal(balance);
  $("panel-balance").textContent = fmtBal(balance);
  renderRooms();
}

function makeCard(seed) {
  const cols = COL_RANGES.map(([lo, hi]) => {
    const nums = [];
    for (let n = lo; n <= hi; n++) nums.push(n);
    return shuffle(nums).slice(0, 5);
  });
  const cells = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (r === 2 && c === 2) cells.push("FREE");
      else cells.push(cols[c][r]);
    }
  }
  return { id: seed, cells };
}

function ensureCard(id) {
  if (!cardDefs[id]) cardDefs[id] = makeCard(id);
  return cardDefs[id];
}

function prizePool() {
  return stake * (selected.size + botPlayers);
}

function canAfford(roomStake) {
  return balance >= roomStake;
}

function calculateDerash(players, roomStake) {
  return Math.floor(players * roomStake * (1 - COMMISSION_RATE));
}

function updateRoomRegistrations() {
  if (!views.lobby.classList.contains("is-on")) return;

  // Simulate new registrations arriving in one of the live rooms.
  const room = ROOMS[Math.floor(Math.random() * ROOMS.length)];
  const newPlayers = 1 + Math.floor(Math.random() * 2);
  room.players += newPlayers;
  renderRooms();
}

function startRoomUpdates() {
  if (roomTimer !== null) return;
  roomTimer = setInterval(updateRoomRegistrations, ROOM_UPDATE_MS);
}

function stopRoomUpdates() {
  if (roomTimer === null) return;
  clearInterval(roomTimer);
  roomTimer = null;
}

function renderRooms() {
  const wrap = $("rooms");
  wrap.replaceChildren(
    ...ROOMS.map((room) => {
      const canPlay = canAfford(room.stake);
      const derash = calculateDerash(room.players, room.stake);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lb-room" + (canPlay ? "" : " is-locked");
      btn.setAttribute("aria-label", `${canPlay ? "Play" : "Insufficient balance for"} ${room.stake} ETB room with ${room.players} players and ${derash} ETB derash`);
      btn.innerHTML = `
        <span class="lb-room-stake">${room.stake} ETB</span>
        <span class="lb-room-active${canPlay ? " is-ready" : ""}">${canPlay ? "Active" : room.active}</span>
        <span class="lb-room-players">${fmt(room.players)}</span>
        <span class="lb-room-prize">${fmt(derash)} ETB</span>
        <span class="lb-room-play${canPlay ? " is-enabled" : ""}">${canPlay ? "Play" : "Play"}</span>
      `;
      btn.addEventListener("click", () => enterRoom(room.stake));
      wrap.appendChild(btn);
      return btn;
    })
  );
}

function enterRoom(roomStake) {
  if (!canAfford(roomStake)) {
    openWallet("deposit");
    toast("DEPOSIT TO PLAY", "lose");
    return;
  }

  clearInterval(pickTimer);
  stake = roomStake;
  selected = new Set();
  selectedPreviewId = null;
  takenByOthers = new Set();
  cardDefs = {};
  botPlayers = 8 + Math.floor(Math.random() * 16);
  showView("pick");
  $("pick-stake").textContent = String(stake);
  $("pick-balance").textContent = fmtBal(balance);
  $("pick-cost").textContent = String(stake);
  updatePickInfo();
  buildCardGrid();
  renderCartelaPreview();
  startPickCountdown();
  simulateOthersPicking();
}

function updatePickInfo() {
  const limit = Math.min(MAX_PICK, Math.floor(balance / stake));
  $("pick-count").textContent = String(selected.size);
  $("pick-limit").textContent = String(limit);
  $("pick-pool").textContent = fmt(prizePool());
  $("pick-cost").textContent = String(stake);
  $("pick-balance").textContent = fmtBal(balance);
  $("start-game").disabled = selected.size === 0;
  $("pick-state").textContent = selected.size ? "Ready" : "Waiting…";
  $("pick-helper").textContent = selected.size
    ? `${selected.size} cartela${selected.size === 1 ? "" : "s"} selected — start when ready.`
    : "Pick a cartela number or use Random Pick.";
}

function buildCardGrid() {
  const grid = $("card-grid");
  grid.replaceChildren();
  for (let i = 1; i <= CARD_COUNT; i++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lb-pick";
    btn.textContent = String(i);
    btn.dataset.id = String(i);
    btn.addEventListener("click", () => toggleCard(i));
    btn.addEventListener("mouseenter", () => previewCard(i));
    btn.addEventListener("focus", () => previewCard(i));
    grid.appendChild(btn);
  }
  paintPicks();
}

function paintPicks() {
  [...$("card-grid").children].forEach((el) => {
    const id = Number(el.dataset.id);
    el.classList.toggle("is-mine", selected.has(id));
    el.classList.toggle("is-preview", selectedPreviewId === id);
    el.classList.toggle("is-other", takenByOthers.has(id) && !selected.has(id));
    el.classList.toggle("is-taken", takenByOthers.has(id) && !selected.has(id));
  });
}

function renderCartelaPreview() {
  const preview = $("cartela-preview");
  const empty = $("cartela-empty");
  if (!preview || !empty) return;
  preview.querySelectorAll(".lb-cartela-card").forEach((card) => card.remove());

  if (selectedPreviewId === null) {
    empty.hidden = false;
    return;
  }

  const card = ensureCard(selectedPreviewId);
  empty.hidden = true;
  const cardEl = document.createElement("div");
  cardEl.className = "lb-cartela-card";
  cardEl.innerHTML = `
    <div class="lb-cartela-number">Card #${card.id}</div>
    <div class="lb-cartela-head">${LETTERS.map((letter) => `<span>${letter}</span>`).join("")}</div>
    <div class="lb-cartela-cells"></div>
  `;
  const cells = cardEl.querySelector(".lb-cartela-cells");
  card.cells.forEach((value) => {
    const cell = document.createElement("span");
    cell.className = "lb-cartela-cell" + (value === "FREE" ? " is-free" : "");
    cell.textContent = value === "FREE" ? "X" : String(value);
    cells.appendChild(cell);
  });
  preview.appendChild(cardEl);
}

function previewCard(id) {
  if (takenByOthers.has(id) && !selected.has(id)) return;
  selectedPreviewId = id;
  ensureCard(id);
  paintPicks();
  renderCartelaPreview();
}

function toggleCard(id) {
  if (takenByOthers.has(id) && !selected.has(id)) {
    toast("CARTELA ALREADY TAKEN", "lose");
    return;
  }
  if (selected.has(id)) {
    selected.delete(id);
    if (selectedPreviewId === id) selectedPreviewId = selected.size ? [...selected][selected.size - 1] : null;
  } else {
    if (selected.size >= Math.min(MAX_PICK, Math.floor(balance / stake))) {
      toast("NOT ENOUGH BALANCE", "lose");
      return;
    }
    selected.add(id);
    selectedPreviewId = id;
    ensureCard(id);
  }
  paintPicks();
  renderCartelaPreview();
  updatePickInfo();
}

function randomAvailableCard() {
  const limit = Math.min(MAX_PICK, Math.floor(balance / stake));
  const available = Array.from({ length: CARD_COUNT }, (_, index) => index + 1).filter(
    (id) => !takenByOthers.has(id) && !selected.has(id)
  );
  if (selected.size >= limit || !available.length) return null;
  return available[Math.floor(Math.random() * available.length)];
}

function randomPick(amount) {
  const limit = Math.min(MAX_PICK, Math.floor(balance / stake));
  if (limit <= 0) {
    toast("NOT ENOUGH BALANCE", "lose");
    return;
  }
  let added = 0;
  while (added < amount && selected.size < limit) {
    const id = randomAvailableCard();
    if (id === null) break;
    selected.add(id);
    selectedPreviewId = id;
    ensureCard(id);
    added += 1;
  }
  if (!added) {
    toast("NO CARTELA AVAILABLE", "lose");
    return;
  }
  paintPicks();
  renderCartelaPreview();
  updatePickInfo();
  toast(`${added} RANDOM CARTELA${added === 1 ? "" : "S"} PICKED`, "win");
}

function startPickCountdown() {
  clearInterval(pickTimer);
  pickLeft = PICK_SECS;
  $("pick-secs").textContent = String(pickLeft);
  pickTimer = setInterval(() => {
    pickLeft -= 1;
    $("pick-secs").textContent = String(pickLeft);
    if (pickLeft <= 0) {
      clearInterval(pickTimer);
      if (selected.size > 0) startGame();
      else {
        toast("NO CARD SELECTED", "lose");
        showView("lobby");
      }
    }
  }, 1000);
}

function simulateOthersPicking() {
  const tick = () => {
    if (!views.pick.classList.contains("is-on")) return;
    for (let n = 0; n < 2; n++) {
      const id = 1 + Math.floor(Math.random() * CARD_COUNT);
      if (!selected.has(id) && !takenByOthers.has(id) && takenByOthers.size < 55) {
        takenByOthers.add(id);
      }
    }
    paintPicks();
    updatePickInfo();
    setTimeout(tick, 700 + Math.random() * 900);
  };
  setTimeout(tick, 500);
}

function startGame() {
  clearInterval(pickTimer);
  const cost = stake * selected.size;
  if (cost > balance) {
    toast("NOT ENOUGH BALANCE", "lose");
    showView("lobby");
    return;
  }
  balance -= cost;
  saveBalance();
  renderBalance();

  playing = true;
  claimed = false;
  called = [];
  callPool = shuffle(Array.from({ length: 75 }, (_, i) => i + 1));
  showView("game");
  $("game-pool").textContent = "Prize " + fmt(prizePool()) + " ETB";
  $("bingo-btn").disabled = true;
  $("game-status").textContent = "Game started — marking automatically";
  $("call-ball").textContent = "—";
  $("call-count").textContent = "0";
  buildBoard();
  renderMineCards();
  clearInterval(callTimer);
  callTimer = setInterval(nextCall, CALL_MS);
}

function buildBoard() {
  const board = $("board");
  board.replaceChildren();
  for (let n = 1; n <= 75; n++) {
    const d = document.createElement("div");
    d.className = "lb-dot";
    d.dataset.n = String(n);
    d.textContent = String(n);
    board.appendChild(d);
  }
}

function paintBoard() {
  const set = new Set(called);
  [...$("board").children].forEach((el) => {
    el.classList.toggle("is-on", set.has(Number(el.dataset.n)));
  });
}

function renderMineCards() {
  const wrap = $("mine-cards");
  const hit = new Set(called);
  wrap.replaceChildren(
    ...[...selected].map((id) => {
      const card = ensureCard(id);
      const el = document.createElement("div");
      el.className = "lb-card";
      el.dataset.id = String(id);
      el.innerHTML = `
        <div class="lb-card-id">CARD #${id}</div>
        <div class="lb-binghead">${LETTERS.map((letter) => `<span>${letter}</span>`).join("")}</div>
        <div class="lb-cells"></div>
      `;
      const cells = el.querySelector(".lb-cells");
      card.cells.forEach((value) => {
        const cell = document.createElement("div");
        cell.className = "lb-cell";
        if (value === "FREE") {
          cell.classList.add("is-free", "is-hit");
          cell.textContent = "★";
        } else {
          cell.textContent = String(value);
          if (hit.has(value)) cell.classList.add("is-hit");
        }
        cells.appendChild(cell);
      });
      return el;
    })
  );
}

function nextCall() {
  if (!playing || !callPool.length) {
    clearInterval(callTimer);
    if (!claimed) {
      $("game-status").textContent = "No Bingo — round over";
      toast("NO WINNER", "lose");
      playing = false;
    }
    return;
  }
  const n = callPool.pop();
  called.push(n);
  const letter = letterFor(n);
  $("call-ball").textContent = letter + "-" + n;
  $("call-count").textContent = String(called.length);
  paintBoard();
  renderMineCards();

  const ready = playerHasBingo();
  $("bingo-btn").disabled = !ready || claimed;
  if (ready && !claimed) {
    $("game-status").textContent = "You have BINGO — claim now!";
  } else {
    $("game-status").textContent = "Called " + letter + "-" + n;
  }

  if (!claimed && called.length > 28 && Math.random() < 0.04) {
    botWins();
  }
}

function cellHit(card, index, hit) {
  const value = card.cells[index];
  return value === "FREE" || hit.has(value);
}

function bestWinKind(card, hit) {
  const all = Array.from({ length: 25 }, (_, i) => i);
  if (all.every((i) => cellHit(card, i, hit))) return "BLACKOUT";
  const hasX =
    [0, 6, 12, 18, 24].every((i) => cellHit(card, i, hit)) &&
    [4, 8, 12, 16, 20].every((i) => cellHit(card, i, hit));
  if (hasX) return "X";
  if ([0, 4, 20, 24].every((i) => cellHit(card, i, hit))) return "CORNERS";
  for (let r = 0; r < 5; r++) {
    if ([0, 1, 2, 3, 4].every((c) => cellHit(card, r * 5 + c, hit))) return "LINE";
  }
  for (let c = 0; c < 5; c++) {
    if ([0, 1, 2, 3, 4].every((r) => cellHit(card, r * 5 + c, hit))) return "LINE";
  }
  if ([0, 6, 12, 18, 24].every((i) => cellHit(card, i, hit))) return "LINE";
  if ([4, 8, 12, 16, 20].every((i) => cellHit(card, i, hit))) return "LINE";
  return null;
}

function playerHasBingo() {
  const hit = new Set(called);
  for (const id of selected) {
    if (bestWinKind(ensureCard(id), hit)) return true;
  }
  return false;
}

function claimBingo() {
  if (claimed || !playing) return;
  const hit = new Set(called);
  let kind = null;
  let winCard = null;
  for (const id of selected) {
    const currentKind = bestWinKind(ensureCard(id), hit);
    if (currentKind) {
      kind = currentKind;
      winCard = id;
      break;
    }
  }
  if (!kind) {
    toast("FALSE CLAIM", "lose");
    $("bingo-btn").disabled = true;
    return;
  }
  claimed = true;
  playing = false;
  clearInterval(callTimer);

  const mult = kind === "BLACKOUT" ? 1 : kind === "X" ? 0.55 : kind === "CORNERS" ? 0.35 : 0.22;
  const win = Math.max(stake, Math.round(prizePool() * mult));
  balance += win;
  saveBalance();
  renderBalance();
  $("game-status").textContent = kind + " on card #" + winCard + " · +" + fmt(win) + " ETB";
  toast("BINGO! +" + fmt(win), "win");
  $("bingo-btn").disabled = true;
}

function botWins() {
  claimed = true;
  playing = false;
  clearInterval(callTimer);
  $("bingo-btn").disabled = true;
  $("game-status").textContent = "Another player claimed Bingo";
  toast("SOMEONE ELSE WON", "lose");
}

function leaveGame() {
  clearInterval(callTimer);
  clearInterval(pickTimer);
  stopRoomUpdates();
  playing = false;
  claimed = false;
  selected = new Set();
  selectedPreviewId = null;
  showView("lobby");
  renderRooms();
}

function setWalletTab(tab) {
  document.querySelectorAll("[data-wallet-tab]").forEach((button) => {
    const active = button.dataset.walletTab === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-wallet-view]").forEach((view) => {
    const active = view.dataset.walletView === tab;
    view.classList.toggle("is-active", active);
    view.hidden = !active;
  });
}

function openWallet(tab = "deposit") {
  renderBalance();
  setWalletTab(tab);
  $("wallet-panel").hidden = false;
}

function closeWallet() {
  $("wallet-panel").hidden = true;
}

function selectWalletMethod(action, method) {
  const actionLabel = action === "deposit" ? "Deposit" : "Withdraw";
  toast(`${actionLabel}: ${method} selected`, "win");
}

function bind() {
  $("back-lobby").addEventListener("click", () => {
    clearInterval(pickTimer);
    selectedPreviewId = null;
    showView("lobby");
    renderRooms();
  });
  $("start-game").addEventListener("click", startGame);
  $("random-one").addEventListener("click", () => randomPick(1));
  $("random-two").addEventListener("click", () => randomPick(2));
  $("bingo-btn").addEventListener("click", claimBingo);
  $("leave-game").addEventListener("click", leaveGame);
  $("balance-trigger").addEventListener("click", () => openWallet("deposit"));
  $("close-wallet").addEventListener("click", closeWallet);
  $("wallet-panel").addEventListener("click", (event) => {
    if (event.target === $("wallet-panel")) closeWallet();
  });
  $("refresh-rooms").addEventListener("click", () => {
    renderRooms();
    toast("ROOMS REFRESHED", "win");
  });
  document.querySelectorAll("[data-wallet-tab]").forEach((button) => {
    button.addEventListener("click", () => setWalletTab(button.dataset.walletTab));
  });
  document.querySelectorAll("[data-wallet-action]").forEach((button) => {
    button.addEventListener("click", () => selectWalletMethod(button.dataset.walletAction, button.dataset.method));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("wallet-panel").hidden) closeWallet();
  });
}

function startClock() {
  // Kept as a small lifecycle hook for the game shell; the lobby intentionally has no clock.
}

renderBalance();
bind();
startClock();
showView("lobby");
