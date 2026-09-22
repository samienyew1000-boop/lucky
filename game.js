"use strict";

const BALANCE_KEY = "lucky-bingo-balance";
const ADMIN_STATE_KEY = "lucky-bingo-admin-state-v1";
const ADMIN_SETTINGS_KEY = "lucky-bingo-admin-settings-v1";
const CARD_DATA_URL = "card%20number.json";
const START_BALANCE = 5;
const CARD_COUNT = 1000;
const MAX_PICK = 4;
const CALL_MS = 1600;
const DEFAULT_PICK_SECS = 60;
const ROOM_UPDATE_MS = 2400;
const COMMISSION_RATE = 0.2;
const MIN_WALLET_AMOUNT = 50;
const PLAYER_ID = "LB-PLAYER";
const PLAYER_NAME = "Lucky Bingo Player";
const PAYMENT_METHODS = Object.freeze({
  Telebirr: { accountName: "Lucky Bingo", accountNumber: "0911 000 000" },
  "CBE Birr": { accountName: "Lucky Bingo CBE Birr", accountNumber: "1000 000 000" },
  "M-Pesa": { accountName: "Lucky Bingo M-Pesa", accountNumber: "0700 000 000" },
});

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
let cardNumbers = [];
let cardsReady = false;
let cardsLoadError = false;
let called = [];
let callPool = [];
let callTimer = null;
let pickTimer = null;
let roomTimer = null;
let pickLeft = DEFAULT_PICK_SECS;
let playing = false;
let claimed = false;
let botPlayers = 0;
let roundOutcome = null;
let roundWinnerName = "";
let roundWinKind = "";
let roundWinCardId = null;
let walletState = { deposit: "Telebirr", withdraw: "Telebirr" };

function loadNum(key, fallback, minimum = 1) {
  const n = Number(localStorage.getItem(key));
  return Number.isFinite(n) && n >= minimum ? n : fallback;
}

function getPickCountdownSeconds() {
  try {
    const saved = JSON.parse(localStorage.getItem(ADMIN_SETTINGS_KEY) || "null");
    const seconds = Number(saved?.countdown);
    return Number.isFinite(seconds) ? Math.min(600, Math.max(10, Math.round(seconds))) : DEFAULT_PICK_SECS;
  } catch (error) {
    return DEFAULT_PICK_SECS;
  }
}

function formatCountdown(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
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
  const lobbyBalance = $("balance");
  const pickBalance = $("pick-balance");
  if (lobbyBalance) lobbyBalance.textContent = fmtBal(balance);
  if (pickBalance) pickBalance.textContent = fmtBal(balance);
  updateWalletBalances();
  renderRooms();
}

function isValidCardValues(values) {
  return Array.isArray(values) && values.length === 25 && values[12] === 0 && values.every(
    (value, index) => index === 12 || Number.isInteger(value) && value >= 0 && value <= 75
  );
}

function importCard(id, values) {
  const cells = [];
  for (let row = 0; row < 5; row++) {
    for (let column = 0; column < 5; column++) {
      const value = values[column * 5 + row];
      cells.push(row === 2 && column === 2 ? "FREE" : value);
    }
  }
  return { id, cells };
}

function applyCardCatalog(source) {
  const ids = Object.keys(source || {});
  const expectedIds = Array.from({ length: CARD_COUNT }, (_, index) => String(index + 1));
  const hasEveryCard = expectedIds.every((id) => Object.prototype.hasOwnProperty.call(source, id));
  const hasOnlyExpectedCards = ids.length === CARD_COUNT && ids.every((id) => expectedIds.includes(id));
  if (!hasEveryCard || !hasOnlyExpectedCards || expectedIds.some((id) => !isValidCardValues(source[id]))) {
    throw new Error("Card data must contain 1,000 valid 5x5 cartelas");
  }

  cardNumbers = expectedIds.map(Number);
  cardDefs = Object.fromEntries(cardNumbers.map((id) => [id, importCard(id, source[String(id)])]));
  cardsReady = true;
  cardsLoadError = false;
  updatePickInfo();
}

async function loadCardCatalog() {
  try {
    if (window.LUCKY_BINGO_CARD_DATA) {
      applyCardCatalog(window.LUCKY_BINGO_CARD_DATA);
      return;
    }

    const response = await fetch(CARD_DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Card data request failed with ${response.status}`);
    applyCardCatalog(await response.json());
  } catch (error) {
    cardNumbers = [];
    cardDefs = {};
    cardsReady = false;
    cardsLoadError = true;
    updatePickInfo();
    toast("CARD DATA UNAVAILABLE", "lose");
    console.error("Unable to load card number.json", error);
  }
}

function ensureCard(id) {
  return cardDefs[id] || null;
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
  if (!cardsReady) {
    toast(cardsLoadError ? "CARD DATA UNAVAILABLE" : "CARD DATA LOADING", "lose");
    return;
  }
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
  const waitingForStart = pickLeft > 0;
  const startButton = $("start-game");
  $("pick-count").textContent = String(selected.size);
  $("pick-limit").textContent = String(limit);
  $("pick-pool").textContent = fmt(prizePool());
  $("pick-cost").textContent = String(stake);
  $("pick-balance").textContent = fmtBal(balance);
  startButton.disabled = !cardsReady || selected.size === 0 || waitingForStart;
  startButton.innerHTML = waitingForStart
    ? '<span aria-hidden="true">⌛</span> WAITING…'
    : '<span aria-hidden="true">▶</span> START!';
  $("pick-state").textContent = !cardsReady ? "Cards unavailable" : waitingForStart ? "Round opening soon" : selected.size ? "Ready" : "Waiting…";
  $("pick-helper").textContent = !cardsReady
    ? cardsLoadError ? "The 1,000 card numbers could not be loaded." : "Loading all 1,000 card numbers…"
    : waitingForStart
      ? "Select your cartela. The round starts when the countdown reaches zero."
      : selected.size
        ? `${selected.size} cartela${selected.size === 1 ? "" : "s"} selected — starting now.`
        : "Pick a cartela number or use Random Pick.";
}

function buildCardGrid() {
  const grid = $("card-grid");
  grid.replaceChildren();
  cardNumbers.forEach((id) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lb-pick";
    btn.textContent = String(id);
    btn.dataset.id = String(id);
    btn.addEventListener("click", () => toggleCard(id));
    btn.addEventListener("mouseenter", () => previewCard(id));
    btn.addEventListener("focus", () => previewCard(id));
    grid.appendChild(btn);
  });
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
  if (!card) {
    empty.hidden = false;
    return;
  }
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
  if (!cardsReady || (takenByOthers.has(id) && !selected.has(id))) return;
  selectedPreviewId = id;
  paintPicks();
  renderCartelaPreview();
}

function toggleCard(id) {
  if (!cardsReady) return;
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
  const available = cardNumbers.filter((id) => !takenByOthers.has(id) && !selected.has(id));
  if (selected.size >= limit || !available.length) return null;
  return available[Math.floor(Math.random() * available.length)];
}

function randomPick(amount) {
  const limit = Math.min(MAX_PICK, Math.floor(balance / stake));
  if (!cardsReady) {
    toast(cardsLoadError ? "CARD DATA UNAVAILABLE" : "CARD DATA LOADING", "lose");
    return;
  }
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

function updatePickCountdownDisplay() {
  const seconds = $("pick-secs");
  const timer = $("pick-timer");
  if (seconds) seconds.textContent = formatCountdown(pickLeft);
  if (timer) timer.classList.toggle("is-urgent", pickLeft <= 10);
}

function startPickCountdown() {
  clearInterval(pickTimer);
  pickLeft = getPickCountdownSeconds();
  updatePickCountdownDisplay();
  updatePickInfo();
  pickTimer = setInterval(() => {
    pickLeft -= 1;
    updatePickCountdownDisplay();
    updatePickInfo();
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
      const id = cardNumbers[Math.floor(Math.random() * cardNumbers.length)];
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
  if (pickLeft > 0) {
    toast("ROUND STARTS WHEN THE COUNTDOWN ENDS", "lose");
    return;
  }
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
  roundOutcome = null;
  roundWinnerName = "";
  roundWinKind = "";
  roundWinCardId = null;
  hideRoundResult();
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

function hideRoundResult() {
  const result = $("round-result");
  if (!result) return;
  result.hidden = true;
  result.className = "lb-round-result";
  result.replaceChildren();
}

function showRoundResult(outcome, winnerName, kind = "LINE", cardId = null) {
  const result = $("round-result");
  if (!result) return;
  roundOutcome = outcome;
  roundWinnerName = winnerName;
  roundWinKind = kind;
  roundWinCardId = cardId;
  result.className = `lb-round-result is-${outcome}`;
  result.innerHTML = `
    <span class="lb-round-result-burst" aria-hidden="true">✦</span>
    <strong>${outcome === "win" ? "WON" : "ROUND OVER"}</strong>
    <span>${outcome === "win" ? `${winnerName} · ${kind}${cardId ? ` on card #${cardId}` : ""}` : `${winnerName} has won.`}</span>
  `;
  result.hidden = false;
  result.animate(
    [{ opacity: 0, transform: "translateY(-10px) scale(.92)" }, { opacity: 1, transform: "translateY(0) scale(1)" }],
    { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" }
  );
}

function winningCellIndexes(card, hit, kind) {
  const lines = [];
  for (let row = 0; row < 5; row++) lines.push([0, 1, 2, 3, 4].map((column) => row * 5 + column));
  for (let column = 0; column < 5; column++) lines.push([0, 1, 2, 3, 4].map((row) => row * 5 + column));
  lines.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  if (kind === "BLACKOUT") return Array.from({ length: 25 }, (_, index) => index);
  if (kind === "CORNERS") return [0, 4, 20, 24];
  const line = lines.find((indexes) => indexes.every((index) => cellHit(card, index, hit)));
  return line || [];
}

function markLoserCards() {
  const wrap = $("mine-cards");
  if (!wrap) return;
  wrap.classList.add("has-loser-cards");
  wrap.querySelectorAll(".lb-card").forEach((card) => card.classList.add("is-loser"));
}

function highlightWinningCard(cardId, kind) {
  const wrap = $("mine-cards");
  const card = wrap?.querySelector(`[data-id="${cardId}"]`);
  if (!card) return;
  card.classList.add("is-winner");
  const hit = new Set(called);
  const definition = ensureCard(cardId);
  const indexes = definition ? winningCellIndexes(definition, hit, kind) : [];
  [...card.querySelectorAll(".lb-cell")].forEach((cell, index) => cell.classList.toggle("is-win", indexes.includes(index)));
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
      if (!card) return null;
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
    }).filter(Boolean)
  );
  if (roundOutcome === "lose") markLoserCards();
  if (roundOutcome === "win" && roundWinCardId !== null) highlightWinningCard(roundWinCardId, roundWinKind);
}

function nextCall() {
  if (!playing || !callPool.length) {
    clearInterval(callTimer);
    if (!claimed) {
      playing = false;
      $("game-status").textContent = "No Bingo — round over";
      showRoundResult("lose", "No player");
      markLoserCards();
      toast("NO WINNER", "lose");
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
    const card = ensureCard(id);
    if (card && bestWinKind(card, hit)) return true;
  }
  return false;
}

function claimBingo() {
  if (claimed || !playing) return;
  const hit = new Set(called);
  let kind = null;
  let winCard = null;
  for (const id of selected) {
    const card = ensureCard(id);
    const currentKind = card ? bestWinKind(card, hit) : null;
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
  roundOutcome = "win";
  roundWinnerName = PLAYER_NAME;
  roundWinKind = kind;
  roundWinCardId = winCard;
  $("game-status").textContent = kind + " on card #" + winCard + " · +" + fmt(win) + " ETB";
  showRoundResult("win", PLAYER_NAME, kind, winCard);
  renderMineCards();
  toast("WON! +" + fmt(win), "win");
  $("bingo-btn").disabled = true;
}

function botWins() {
  claimed = true;
  playing = false;
  clearInterval(callTimer);
  roundOutcome = "lose";
  roundWinnerName = "Another player";
  $("bingo-btn").disabled = true;
  $("game-status").textContent = "Another player claimed Bingo";
  showRoundResult("lose", "Another player");
  renderMineCards();
  toast("SOMEONE ELSE WON", "lose");
}

function leaveGame() {
  clearInterval(callTimer);
  clearInterval(pickTimer);
  stopRoomUpdates();
  playing = false;
  claimed = false;
  roundOutcome = null;
  roundWinnerName = "";
  roundWinKind = "";
  roundWinCardId = null;
  hideRoundResult();
  selected = new Set();
  selectedPreviewId = null;
  showView("lobby");
  renderRooms();
}

function updateWalletBalances() {
  const panelBalance = $("panel-balance");
  const withdrawAvailable = $("withdraw-available");
  if (panelBalance) panelBalance.textContent = fmtBal(balance);
  if (withdrawAvailable) withdrawAvailable.textContent = fmtBal(balance);
}

function setWalletTab(tab) {
  const activeTab = tab === "withdraw" ? "withdraw" : "deposit";
  document.querySelectorAll("[data-wallet-tab]").forEach((button) => {
    const active = button.dataset.walletTab === activeTab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll("[data-wallet-view]").forEach((view) => {
    const active = view.dataset.walletView === activeTab;
    view.classList.toggle("is-active", active);
    view.hidden = !active;
  });
  clearWalletFeedback(activeTab);
}

function openWallet(tab = "deposit") {
  const activeTab = tab === "withdraw" ? "withdraw" : "deposit";
  renderBalance();
  updateDepositAccount();
  updateProviderButtons("deposit");
  updateProviderButtons("withdraw");
  setWalletTab(activeTab);
  $("wallet-panel").hidden = false;
  setTimeout(() => document.querySelector(`[data-wallet-tab="${activeTab}"]`)?.focus(), 40);
}

function closeWallet() {
  $("wallet-panel").hidden = true;
}

function clearWalletFeedback(action) {
  const feedback = action === "withdraw" ? $("withdraw-feedback") : $("deposit-feedback");
  if (!feedback) return;
  feedback.hidden = true;
  feedback.textContent = "";
  feedback.classList.remove("is-error");
}

function showWalletFeedback(action, message, isError = false) {
  const feedback = action === "withdraw" ? $("withdraw-feedback") : $("deposit-feedback");
  if (!feedback) return;
  feedback.textContent = message;
  feedback.classList.toggle("is-error", isError);
  feedback.hidden = false;
}

function updateDepositAccount() {
  const method = walletState.deposit;
  const account = PAYMENT_METHODS[method] || PAYMENT_METHODS.Telebirr;
  const methodLabel = $("deposit-selected-method");
  const accountName = $("deposit-account-name");
  const accountNumber = $("deposit-account-number");
  if (methodLabel) methodLabel.textContent = method;
  if (accountName) accountName.textContent = account.accountName;
  if (accountNumber) accountNumber.textContent = account.accountNumber;
}

function updateProviderButtons(action) {
  document.querySelectorAll(`[data-provider-action="${action}"]`).forEach((button) => {
    const selectedMethod = walletState[action];
    const active = button.dataset.method === selectedMethod;
    button.classList.toggle("is-selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function selectWalletMethod(action, method) {
  if (!walletState[action] || !PAYMENT_METHODS[method]) return;
  walletState[action] = method;
  updateProviderButtons(action);
  clearWalletFeedback(action);
  if (action === "deposit") updateDepositAccount();
  const actionLabel = action === "deposit" ? "Deposit" : "Withdraw";
  toast(`${actionLabel}: ${method} selected`, "win");
}

function normaliseWalletAmount(value) {
  const amount = Math.floor(Number(value));
  return Number.isFinite(amount) ? amount : 0;
}

function makeTransactionId() {
  return `TX-${String(Date.now()).slice(-6)}${Math.floor(10 + Math.random() * 90)}`;
}

function saveWalletRequest(request) {
  const transaction = {
    id: makeTransactionId(),
    playerId: PLAYER_ID,
    player: PLAYER_NAME,
    type: request.type,
    method: request.method,
    amount: request.amount,
    requested: "just now",
    status: "pending",
    phone: request.phone || "",
    reference: request.reference || "",
    accountName: request.accountName || "",
    accountNumber: request.accountNumber || "",
  };

  try {
    const saved = JSON.parse(localStorage.getItem(ADMIN_STATE_KEY) || "{}");
    const transactions = Array.isArray(saved.transactions) ? saved.transactions : [];
    saved.transactions = [transaction, ...transactions].slice(0, 100);
    localStorage.setItem(ADMIN_STATE_KEY, JSON.stringify(saved));
  } catch (error) {
    // The player request remains confirmed in the UI even if local admin storage is unavailable.
  }

  return transaction;
}

function handleDepositSubmit(event) {
  event.preventDefault();
  const amount = normaliseWalletAmount($("deposit-amount").value);
  const reference = $("deposit-reference").value.trim();
  const method = walletState.deposit;
  const account = PAYMENT_METHODS[method] || PAYMENT_METHODS.Telebirr;

  if (amount < MIN_WALLET_AMOUNT) {
    showWalletFeedback("deposit", `Minimum deposit amount is ${MIN_WALLET_AMOUNT} ETB.`, true);
    toast("MINIMUM 50 ETB", "lose");
    return;
  }
  if (reference.length < 4) {
    showWalletFeedback("deposit", "Paste a valid transaction reference or SMS confirmation.", true);
    toast("REFERENCE REQUIRED", "lose");
    return;
  }

  const transaction = saveWalletRequest({ type: "deposit", method, amount, reference, accountName: account.accountName, accountNumber: account.accountNumber });
  const bonus = amount >= 100 ? Math.floor(amount * 0.2) : 0;
  showWalletFeedback(
    "deposit",
    `Deposit request ${transaction.id} was sent via ${method}. ${bonus ? `Bonus pending: ${fmt(bonus)} ETB.` : "Admin approval is required."}`
  );
  event.currentTarget.reset();
  toast("DEPOSIT REQUEST SENT", "win");
}

function handleWithdrawSubmit(event) {
  event.preventDefault();
  const amount = normaliseWalletAmount($("withdraw-amount").value);
  const phone = $("withdraw-phone").value.trim();
  const method = walletState.withdraw;

  if (phone.replace(/\D/g, "").length < 9) {
    showWalletFeedback("withdraw", "Enter the registered phone number for this withdrawal.", true);
    toast("PHONE REQUIRED", "lose");
    return;
  }
  if (amount < MIN_WALLET_AMOUNT) {
    showWalletFeedback("withdraw", `Minimum withdrawal amount is ${MIN_WALLET_AMOUNT} ETB.`, true);
    toast("MINIMUM 50 ETB", "lose");
    return;
  }
  if (amount > balance) {
    showWalletFeedback("withdraw", `You can withdraw up to ${fmtBal(balance)} ETB from your available balance.`, true);
    toast("LOW BALANCE", "lose");
    return;
  }

  const transaction = saveWalletRequest({ type: "withdraw", method, amount, phone });
  showWalletFeedback("withdraw", `Withdrawal request ${transaction.id} was sent via ${method}. Admin approval is required before payment.`);
  event.currentTarget.reset();
  toast("WITHDRAWAL REQUEST SENT", "win");
}

function copyText(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(text);
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    area.remove();
  }
  return copied ? Promise.resolve() : Promise.reject(new Error("Copy unavailable"));
}

function copyDepositAccount() {
  const number = $("deposit-account-number").textContent.trim();
  copyText(number)
    .then(() => {
      showWalletFeedback("deposit", `${walletState.deposit} number copied: ${number}`);
      toast("NUMBER COPIED", "win");
    })
    .catch(() => {
      showWalletFeedback("deposit", `Copy failed. Use this number manually: ${number}`, true);
      toast("COPY FAILED", "lose");
    });
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
  document.querySelectorAll("[data-provider-action]").forEach((button) => {
    button.addEventListener("click", () => selectWalletMethod(button.dataset.providerAction, button.dataset.method));
  });
  $("copy-deposit-account").addEventListener("click", copyDepositAccount);
  $("deposit-form").addEventListener("submit", handleDepositSubmit);
  $("withdraw-form").addEventListener("submit", handleWithdrawSubmit);
  updateDepositAccount();
  updateProviderButtons("deposit");
  updateProviderButtons("withdraw");
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
loadCardCatalog();
