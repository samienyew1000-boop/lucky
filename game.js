"use strict";

const BALANCE_KEY = "lucky-bingo-balance";
const STARTING_BONUS_CLAIMED_KEY = "lucky-bingo-starting-bonus-claimed";
const ADMIN_STATE_KEY = "lucky-bingo-admin-state-v1";
const ADMIN_SETTINGS_KEY = "lucky-bingo-admin-settings-v1";
const ROOM_LIFECYCLE_KEY = "lucky-bingo-room-lifecycle-v1";
const LAST_WINNING_CARDS_KEY = "lucky-bingo-last-winning-cards-v1";
const CARD_DATA_URL = "card%20number.json";
const START_BALANCE = 0;
const DEFAULT_STARTING_BONUS = 50;
const CARD_COUNT = 1000;
const MAX_PICK = 4;
const CALL_MS = 1600;
const DEFAULT_PICK_SECS = 60;
const ROOM_UPDATE_MS = 2400;
const ROOM_STATUS_UPDATE_MS = 1000;
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
  { id: "10", stake: 10, players: 98, status: "waiting" },
  { id: "20", stake: 20, players: 106, status: "waiting" },
  { id: "50", stake: 50, players: 86, status: "waiting" },
];

const DEFAULT_LAST_WINNING_CARDS = Object.freeze([
  { cardId: 157, name: "Mengistu", stake: 5, prize: 1155 },
  { cardId: 22, name: "Don Deva", stake: 5, prize: 362 },
  { cardId: 230, name: "Yilma Mamo", stake: 5, prize: 362 },
  { cardId: 268, name: "Abraha", stake: 5, prize: 362 },
]);

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

let startingBonusAwarded = 0;
let balance = loadInitialBalance();
let stake = 10;
let selected = new Set();
let selectedPreviewId = null;
let takenByOthers = new Set();
let cardDefs = {};
let cardNumbers = [];
let cardsReady = false;
let cardsLoadError = false;
let called = [];
let manualMarked = new Set();
let autoMarkingEnabled = true;
let callPool = [];
let callTimer = null;
let pickTimer = null;
let roomTimer = null;
let roomStatusTimer = null;
let roomLifecycle = loadRoomLifecycle();
let lastWinningCards = loadLastWinningCards();
let activeRoomId = null;
let pickLeft = DEFAULT_PICK_SECS;
let playing = false;
let gameWaiting = false;
let entryCharged = false;
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

function getStartingBonusSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(ADMIN_SETTINGS_KEY) || "null") || {};
    const amount = Number(saved.startingBonus);
    return {
      enabled: saved.startingBonusEnabled !== false,
      amount: Number.isFinite(amount) ? Math.max(0, amount) : DEFAULT_STARTING_BONUS,
    };
  } catch (error) {
    return { enabled: true, amount: DEFAULT_STARTING_BONUS };
  }
}

function loadInitialBalance() {
  const stored = Number(localStorage.getItem(BALANCE_KEY));
  const current = Number.isFinite(stored) && stored >= 0 ? stored : START_BALANCE;
  if (localStorage.getItem(STARTING_BONUS_CLAIMED_KEY) === "1") return current;

  const bonus = getStartingBonusSettings();
  startingBonusAwarded = bonus.enabled ? bonus.amount : 0;
  localStorage.setItem(STARTING_BONUS_CLAIMED_KEY, "1");
  const initialBalance = current + startingBonusAwarded;
  localStorage.setItem(BALANCE_KEY, String(initialBalance));
  return initialBalance;
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

function loadRoomLifecycle() {
  try {
    const saved = JSON.parse(localStorage.getItem(ROOM_LIFECYCLE_KEY) || "null");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch (error) {
    return {};
  }
}

function saveRoomLifecycle() {
  try {
    localStorage.setItem(ROOM_LIFECYCLE_KEY, JSON.stringify(roomLifecycle));
  } catch (error) {
    // The room indicator can continue to run for this page if storage is unavailable.
  }
}

function loadLastWinningCards() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_WINNING_CARDS_KEY) || "null");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch (error) {
    return {};
  }
}

function saveLastWinningCards() {
  try {
    localStorage.setItem(LAST_WINNING_CARDS_KEY, JSON.stringify(lastWinningCards));
  } catch (error) {
    // Recent winner history is supplemental and can continue in memory if storage is unavailable.
  }
}

function getLastWinningCards(stakeValue) {
  const saved = lastWinningCards[String(stakeValue)];
  return Array.isArray(saved) && saved.length ? saved : DEFAULT_LAST_WINNING_CARDS;
}

function rememberWinningCard(stakeValue, cardId, name, prize) {
  const history = getLastWinningCards(stakeValue).filter((item) => Number(item.cardId) !== Number(cardId));
  lastWinningCards[String(stakeValue)] = [
    { cardId: Number(cardId), name: String(name), stake: Number(stakeValue), prize: Number(prize) },
    ...history,
  ].slice(0, 4);
  saveLastWinningCards();
}

function loadAdminRooms() {
  try {
    const saved = JSON.parse(localStorage.getItem(ADMIN_STATE_KEY) || "null");
    return saved && Array.isArray(saved.rooms) ? saved.rooms : null;
  } catch (error) {
    return null;
  }
}

function savePlayerRoomPlayers(roomId, players) {
  const adminRooms = loadAdminRooms();
  if (!adminRooms) return;
  const room = adminRooms.find((item) => String(item.id) === String(roomId));
  if (!room) return;
  room.players = players;
  try {
    const savedState = JSON.parse(localStorage.getItem(ADMIN_STATE_KEY) || "{}");
    localStorage.setItem(ADMIN_STATE_KEY, JSON.stringify({ ...savedState, rooms: adminRooms }));
  } catch (error) {
    // Player registration animation is non-critical when storage is unavailable.
  }
}

function getLobbyRooms() {
  const adminRooms = loadAdminRooms();
  if (adminRooms === null) return ROOMS;
  return adminRooms
    .map((room) => ({
      ...room,
      id: String(room.id),
      stake: Math.max(1, Math.round(Number(room.stake) || 0)),
      players: Math.max(0, Math.floor(Number(room.players) || 0)),
    }))
    .filter((room) => room.stake > 0);
}

function getLobbyRoom(roomId) {
  return getLobbyRooms().find((room) => String(room.id) === String(roomId)) || null;
}

function roomSourceStatus(room) {
  const adminRooms = loadAdminRooms();
  const adminRoom = adminRooms?.find((item) => String(item.id) === String(room.id));
  if (adminRoom) {
    if (adminRoom.enabled === false) return "paused";
    if (adminRoom.status === "live" || adminRoom.status === "paused") return adminRoom.status;
    if (adminRoom.status === "waiting") return "waiting";
  }
  return room.status || "waiting";
}

function roomDisplayState(room, now = Date.now()) {
  const sourceStatus = roomSourceStatus(room);
  const roundId = String(room.roundId || "");
  let lifecycle = roomLifecycle[room.id];

  if (sourceStatus === "live") {
    if (!lifecycle || lifecycle.sourceStatus !== sourceStatus || lifecycle.roundId !== roundId || lifecycle.phase !== "live") {
      lifecycle = { sourceStatus, roundId, phase: "live", startedAt: now };
      roomLifecycle[room.id] = lifecycle;
      saveRoomLifecycle();
    }
    return { type: "live", label: "Active game", ariaLabel: "Active game" };
  }

  if (sourceStatus === "paused") {
    if (!lifecycle || lifecycle.sourceStatus !== sourceStatus || lifecycle.roundId !== roundId || lifecycle.phase !== "paused") {
      lifecycle = { sourceStatus, roundId, phase: "paused", updatedAt: now };
      roomLifecycle[room.id] = lifecycle;
      saveRoomLifecycle();
    }
    return { type: "paused", label: "Paused", ariaLabel: "Game paused" };
  }

  if (
    !lifecycle ||
    lifecycle.sourceStatus !== sourceStatus ||
    lifecycle.roundId !== roundId ||
    !["countdown", "live"].includes(lifecycle.phase) ||
    (lifecycle.phase === "countdown" && !Number.isFinite(Number(lifecycle.startsAt)))
  ) {
    lifecycle = {
      sourceStatus,
      roundId,
      phase: "countdown",
      startsAt: now + getPickCountdownSeconds() * 1000,
    };
    roomLifecycle[room.id] = lifecycle;
    saveRoomLifecycle();
  }

  if (lifecycle.phase === "countdown" && now >= Number(lifecycle.startsAt)) {
    lifecycle = { sourceStatus, roundId, phase: "live", startedAt: now };
    roomLifecycle[room.id] = lifecycle;
    saveRoomLifecycle();
  }

  if (lifecycle.phase === "live") {
    return { type: "live", label: "Active game", ariaLabel: "Active game" };
  }

  const seconds = Math.max(0, Math.ceil((Number(lifecycle.startsAt) - now) / 1000));
  return {
    type: "countdown",
    label: formatCountdown(seconds),
    ariaLabel: `Game starts in ${formatCountdown(seconds)}`,
  };
}

function saveBalance() {
  localStorage.setItem(BALANCE_KEY, String(balance));
}

function fmtBal(n) {
  return Math.floor(n).toLocaleString("en-US").replace(/,/g, " ");
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
  if (name === "lobby") {
    startRoomUpdates();
    startRoomStatusUpdates();
  } else {
    stopRoomUpdates();
    stopRoomStatusUpdates();
  }
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
  if (lobbyBalance) lobbyBalance.textContent = fmtBal(balance);
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

function renderPickRoomSummary() {
  const room = activeRoomId ? getLobbyRoom(activeRoomId) : null;
  const roomStake = room?.stake || stake;
  const playerCount = room ? room.players + (selected.size ? 1 : 0) : 0;
  const available = cardNumbers.length ? Math.max(0, cardNumbers.length - takenByOthers.size - selected.size) : 0;
  const title = $("pick-room-title");
  const entry = $("pick-entry");
  const players = $("pick-players");
  const availableEl = $("pick-available");
  const time = $("pick-time");
  const bannerSeconds = $("pick-banner-secs");

  if (title) title.textContent = `${roomStake} birr Game Lobby`;
  if (entry) entry.textContent = `${roomStake} ETB`;
  if (players) players.textContent = room ? fmt(playerCount) : "—";
  if (availableEl) availableEl.textContent = cardNumbers.length ? fmt(available) : "—";
  if (time) time.textContent = formatCountdown(pickLeft);
  if (bannerSeconds) bannerSeconds.textContent = formatCountdown(pickLeft);
}

function renderWinningCards() {
  const wrap = $("pick-winning-cards");
  if (!wrap) return;
  const history = getLastWinningCards(stake);
  wrap.innerHTML = history.map((winner) => `
    <article class="lb-winning-card">
      <strong>#${escapeHTML(winner.cardId)}</strong>
      <div><b>${escapeHTML(winner.name)}</b><small>${escapeHTML(winner.stake)} birr · ${fmt(Number(winner.prize) || 0)} ETB</small></div>
    </article>
  `).join("");
}

function updateGameWaiting() {
  const countdown = $("game-waiting-countdown");
  const seconds = $("game-waiting-secs");
  const status = $("game-status");
  if (countdown) {
    countdown.hidden = !gameWaiting;
    countdown.classList.toggle("is-urgent", gameWaiting && pickLeft <= 10);
  }
  if (seconds && gameWaiting) seconds.textContent = formatCountdown(pickLeft);
  if (!gameWaiting) return;
  if (status) status.textContent = `Game starts in ${formatCountdown(pickLeft)}`;
  updateGameSummary();
}

function updateGameSummary() {
  const room = activeRoomId ? getLobbyRoom(activeRoomId) : null;
  const players = room ? room.players + (selected.size ? 1 : 0) : selected.size + botPlayers;
  const roomStake = room?.stake || stake;
  const derash = room ? calculateDerash(players, roomStake) : calculateDerash(players, roomStake);
  const roundId = room?.roundId || activeRoomId || "—";
  const derashEl = $("game-derash");
  const playersEl = $("game-players");
  const stakeEl = $("game-stake");
  const roundEl = $("game-round");
  if (derashEl) derashEl.textContent = `${fmt(derash)} ETB`;
  if (playersEl) playersEl.textContent = fmt(players);
  if (stakeEl) stakeEl.textContent = `${fmt(roomStake)} ETB`;
  if (roundEl) roundEl.textContent = String(roundId).replace(/^#/, "");
}

function updateRecentCalls() {
  const recent = $("recent-calls");
  if (!recent) return;
  recent.replaceChildren(
    ...called.slice(-3).reverse().map((number) => {
      const item = document.createElement("span");
      item.className = "lb-recent-call";
      item.innerHTML = `<b>${letterFor(number)}</b><i>${number}</i>`;
      return item;
    })
  );
  const latest = called[called.length - 1];
  const letter = $("call-letter");
  if (letter) letter.textContent = latest ? letterFor(latest) : "—";
}

function selectedCardNumbersText() {
  const ids = [...selected].map((id) => String(id));
  return ids.length ? ids.join(", ") : "—";
}

function selectedCardLabelText() {
  const numbers = selectedCardNumbersText();
  return numbers === "—" ? numbers : `CARD ${numbers}`;
}

function activeHitSet() {
  return autoMarkingEnabled ? new Set(called) : new Set(manualMarked);
}

function updateHeldCardPanel() {
  const panel = $("no-card-panel");
  const title = $("no-card-title");
  const message = $("no-card-message");
  const note = $("no-card-note");
  const dots = $("no-card-dots");
  const hasHeldCard = selected.size > 0;

  if (panel) panel.classList.toggle("has-held-card", hasHeldCard);
  if (title) title.textContent = hasHeldCard ? selectedCardLabelText() : "ካርድ ይያዙ";
  if (message) {
    message.hidden = hasHeldCard;
    message.textContent = "በፍጥነት ተጫወቱ:: ይህ ካርድ ለመጫወት ይጠበቃል";
  }
  if (note) {
    note.hidden = hasHeldCard;
    note.textContent = "ደስታ ይሁን::";
  }
  if (dots) dots.hidden = hasHeldCard;
}

function updateBingoButton() {
  const ready = playerHasBingo();
  const button = $("bingo-btn");
  if (button) button.disabled = !ready || claimed;
  return ready;
}

function setAutoMarking(enabled, announce = false) {
  autoMarkingEnabled = Boolean(enabled);
  manualMarked = new Set();
  const toggle = $("auto-mark-toggle");
  if (toggle) toggle.checked = autoMarkingEnabled;
  renderMineCards();

  if (playing && !claimed) {
    const ready = updateBingoButton();
    if (announce) {
      $("game-status").textContent = ready
        ? "You have BINGO — claim now!"
        : autoMarkingEnabled
          ? "Auto marking enabled — called numbers mark automatically"
          : "Manual marking enabled — tap called numbers on your card";
    }
  }
}

function handleAutoMarkToggle(event) {
  setAutoMarking(event.currentTarget.checked, true);
}

function setGameWaitingState(waiting) {
  gameWaiting = waiting;
  views.game.classList.toggle("is-game-waiting", waiting);
  updateGameWaiting();
  renderMineCards();
}

function updateRoomRegistrations() {
  if (!views.lobby.classList.contains("is-on")) return;

  const rooms = getLobbyRooms().filter((room) => roomSourceStatus(room) === "live");
  if (!rooms.length) return;

  const room = rooms[Math.floor(Math.random() * rooms.length)];
  room.players += 1 + Math.floor(Math.random() * 2);
  savePlayerRoomPlayers(room.id, room.players);
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

function startRoomStatusUpdates() {
  if (roomStatusTimer !== null) return;
  roomStatusTimer = setInterval(() => {
    if (views.lobby.classList.contains("is-on")) renderRooms();
  }, ROOM_STATUS_UPDATE_MS);
}

function stopRoomStatusUpdates() {
  if (roomStatusTimer === null) return;
  clearInterval(roomStatusTimer);
  roomStatusTimer = null;
}

function roomStatusMarkup(state) {
  if (state.type === "live") {
    return `<span class="lb-active-badge"><span>Active game</span><i aria-hidden="true"></i></span>`;
  }
  if (state.type === "paused") {
    return `<span class="lb-room-paused">Paused</span>`;
  }
  return `<span class="lb-countdown-badge">${state.label}</span>`;
}

function roomBalanceMessage(room, canPlay, state) {
  if (!canPlay) return balance <= 0 ? "Low balance" : `Need ${fmt(room.stake - balance)} ETB`;
  if (state.type === "countdown") return "Open";
  if (state.type === "live") return "In game";
  return "Closed";
}

function renderRooms() {
  const wrap = $("rooms");
  const rooms = getLobbyRooms();
  if (!rooms.length) {
    wrap.innerHTML = '<p class="lb-empty-rooms">No rooms are available right now.</p>';
    return;
  }

  wrap.replaceChildren(
    ...rooms.map((room) => {
      const canPlay = canAfford(room.stake);
      const state = roomDisplayState(room);
      const roomOpen = canPlay && state.type === "countdown";
      const roomClosed = state.type === "live" || state.type === "paused";
      const derash = calculateDerash(room.players, room.stake);
      const balanceMessage = roomBalanceMessage(room, canPlay, state);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lb-room" + (canPlay ? "" : " is-locked") + (roomClosed ? " is-closed" : "");
      btn.disabled = roomClosed;
      btn.setAttribute("aria-disabled", String(roomClosed));
      btn.setAttribute("aria-label", `${roomOpen ? "Play" : balanceMessage} ${room.stake} ETB room with ${room.players} players and ${derash} ETB derash. ${state.ariaLabel}.`);
      btn.innerHTML = `
        <span class="lb-room-stake">${room.stake} ETB</span>
        <span class="lb-room-active is-${state.type}" aria-live="polite">
          ${roomStatusMarkup(state)}
          <span class="lb-room-active-copy">${balanceMessage}</span>
        </span>
        <span class="lb-room-players">${fmt(room.players)}</span>
        <span class="lb-room-prize">${fmt(derash)} ETB</span>
        <span class="lb-room-play${roomOpen ? " is-enabled" : " is-disabled"}">${roomOpen ? "Play" : roomClosed ? "Closed" : "Play"}</span>
      `;
      btn.addEventListener("click", () => enterRoom(room.id));
      wrap.appendChild(btn);
      return btn;
    })
  );
}

function enterRoom(roomId) {
  const room = getLobbyRoom(roomId);
  if (!room) {
    toast("ROOM UNAVAILABLE", "lose");
    renderRooms();
    return;
  }

  const state = roomDisplayState(room);
  if (state.type !== "countdown") {
    toast(state.type === "live" ? "ROUND IN PROGRESS" : "ROOM CLOSED", "lose");
    renderRooms();
    return;
  }

  if (!cardsReady) {
    toast(cardsLoadError ? "CARD DATA UNAVAILABLE" : "CARD DATA LOADING", "lose");
    return;
  }
  if (!canAfford(room.stake)) {
    openWallet("deposit");
    toast("DEPOSIT TO PLAY", "lose");
    return;
  }

  clearInterval(pickTimer);
  clearInterval(callTimer);
  activeRoomId = String(room.id);
  gameWaiting = false;
  entryCharged = false;
  stake = room.stake;
  selected = new Set();
  selectedPreviewId = null;
  takenByOthers = new Set();
  botPlayers = 8 + Math.floor(Math.random() * 16);
  setGameWaitingState(false);
  showView("pick");
  $("pick-stake").textContent = String(stake);
  $("pick-cost").textContent = String(stake);
  renderWinningCards();
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
  startButton.disabled = !cardsReady || selected.size === 0;
  startButton.innerHTML = waitingForStart
    ? '<span aria-hidden="true">⌛</span> ENTER &amp; WAIT'
    : '<span aria-hidden="true">▶</span> START GAME';
  $("pick-helper").textContent = !cardsReady
    ? cardsLoadError ? "The 1,000 card numbers could not be loaded." : "Loading all 1,000 card numbers…"
    : waitingForStart
      ? selected.size
        ? "Enter the game now and wait inside until the countdown reaches zero."
        : "Select your cartela. The round starts when the countdown reaches zero."
      : selected.size
        ? `${selected.size} cartela${selected.size === 1 ? "" : "s"} selected — starting now.`
        : "Pick a cartela number or use Random Pick.";
  renderPickRoomSummary();
  updateGameWaiting();
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
  renderPickRoomSummary();
  updateGameWaiting();
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
      if (selected.size > 0) {
        if (gameWaiting) beginLiveGame();
        else startGame();
      } else {
        toast("NO CARD SELECTED", "lose");
        activeRoomId = null;
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
  if (!cardsReady || !selected.size) {
    toast("SELECT A CARTELA FIRST", "lose");
    return;
  }
  if (gameWaiting || playing) {
    toast("YOU ARE ALREADY IN THE GAME", "win");
    return;
  }

  const cost = stake * selected.size;
  if (cost > balance) {
    toast("NOT ENOUGH BALANCE", "lose");
    showView("lobby");
    return;
  }

  balance -= cost;
  entryCharged = true;
  saveBalance();
  renderBalance();
  hideRoundResult();
  called = [];
  manualMarked = new Set();
  callPool = [];
  claimed = false;
  roundOutcome = null;
  roundWinnerName = "";
  roundWinKind = "";
  roundWinCardId = null;
  setGameWaitingState(true);
  showView("game");
  buildBoard();
  paintBoard();
  $("call-ball").textContent = "—";
  $("call-letter").textContent = "—";
  $("call-count").textContent = "0";
  updateRecentCalls();
  updateGameWaiting();

  if (pickLeft <= 0) {
    beginLiveGame();
    return;
  }

  $("game-status").textContent = `Game starts in ${formatCountdown(pickLeft)}`;
  updateGameSummary();
  toast("YOU'RE IN — WAIT FOR THE COUNTDOWN", "win");
}

function beginLiveGame() {
  if (!selected.size || !entryCharged) return;
  clearInterval(pickTimer);
  setGameWaitingState(false);
  playing = true;
  claimed = false;
  roundOutcome = null;
  roundWinnerName = "";
  roundWinKind = "";
  roundWinCardId = null;
  hideRoundResult();
  called = [];
  manualMarked = new Set();
  callPool = shuffle(Array.from({ length: 75 }, (_, i) => i + 1));
  showView("game");
  updateGameSummary();
  $("bingo-btn").disabled = true;
  $("game-status").textContent = autoMarkingEnabled
    ? "Game started — marking automatically"
    : "Game started — tap called numbers on your card";
  $("call-ball").textContent = "—";
  $("call-count").textContent = "0";
  $("call-letter").textContent = "—";
  updateRecentCalls();
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
  const hit = activeHitSet();
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
  const noCardPanel = $("no-card-panel");
  const cardNumber = $("game-card-number");
  const hit = activeHitSet();
  const calledSet = new Set(called);
  if (noCardPanel) noCardPanel.hidden = !gameWaiting;
  updateHeldCardPanel();
  if (cardNumber) cardNumber.textContent = selectedCardNumbersText();
  wrap.replaceChildren(
    ...[...selected].map((id) => {
      const card = ensureCard(id);
      if (!card) return null;
      const el = document.createElement("div");
      el.className = "lb-card";
      el.dataset.id = String(id);
      el.innerHTML = `
        <div class="lb-card-id">CARD ${id}</div>
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
          const hasHit = hit.has(value);
          const hasBeenCalled = calledSet.has(value);
          cell.textContent = String(value);
          if (hasHit) cell.classList.add("is-hit");
          if (!autoMarkingEnabled && playing && !claimed && hasBeenCalled && !hasHit) {
            cell.classList.add("is-callable");
            cell.title = `Tap to mark ${letterFor(value)}-${value}`;
          }
          cell.addEventListener("click", () => toggleManualMark(value));
        }
        cells.appendChild(cell);
      });
      return el;
    }).filter(Boolean)
  );
  if (roundOutcome === "lose") markLoserCards();
  if (roundOutcome === "win" && roundWinCardId !== null) highlightWinningCard(roundWinCardId, roundWinKind);
}

function toggleManualMark(value) {
  if (autoMarkingEnabled || claimed || !playing || value === "FREE") return;

  if (!called.includes(value)) {
    toast(`WAIT FOR ${letterFor(value)}-${value}`, "lose");
    return;
  }

  const wasMarked = manualMarked.has(value);
  if (wasMarked) manualMarked.delete(value);
  else manualMarked.add(value);

  renderMineCards();
  const ready = updateBingoButton();
  $("game-status").textContent = ready && !claimed
    ? "You have BINGO — claim now!"
    : `${wasMarked ? "Unmarked" : "Marked"} ${letterFor(value)}-${value}`;
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
  if (!autoMarkingEnabled) manualMarked.delete(n);
  const letter = letterFor(n);
  $("call-ball").textContent = String(n);
  $("call-letter").textContent = letter;
  $("call-count").textContent = String(called.length);
  updateRecentCalls();
  updateGameSummary();
  paintBoard();
  renderMineCards();

  const ready = updateBingoButton();
  if (ready && !claimed) {
    $("game-status").textContent = "You have BINGO — claim now!";
  } else {
    $("game-status").textContent = autoMarkingEnabled
      ? "Called " + letter + "-" + n
      : "Called " + letter + "-" + n + " — tap it on your card";
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
  const hit = activeHitSet();
  for (const id of selected) {
    const card = ensureCard(id);
    if (card && bestWinKind(card, hit)) return true;
  }
  return false;
}

function claimBingo() {
  if (claimed || !playing) return;
  const hit = activeHitSet();
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
  rememberWinningCard(stake, winCard, PLAYER_NAME, win);
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
  const wasWaiting = gameWaiting;
  if (wasWaiting && entryCharged) {
    balance += stake * selected.size;
    saveBalance();
    renderBalance();
  }
  clearInterval(callTimer);
  clearInterval(pickTimer);
  stopRoomUpdates();
  playing = false;
  gameWaiting = false;
  entryCharged = false;
  manualMarked = new Set();
  activeRoomId = null;
  claimed = false;
  roundOutcome = null;
  roundWinnerName = "";
  roundWinKind = "";
  roundWinCardId = null;
  hideRoundResult();
  selected = new Set();
  selectedPreviewId = null;
  setGameWaitingState(false);
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
  $("start-game").addEventListener("click", startGame);
  $("random-one").addEventListener("click", () => randomPick(1));
  $("random-two").addEventListener("click", () => randomPick(2));
  $("bingo-btn").addEventListener("click", claimBingo);
  $("no-card-button").addEventListener("click", () => toast("SELECT A CARD BEFORE PLAYING", "lose"));
  $("leave-game").addEventListener("click", leaveGame);
  const autoToggle = $("auto-mark-toggle");
  if (autoToggle) {
    autoToggle.checked = true;
    autoMarkingEnabled = true;
    autoToggle.addEventListener("change", handleAutoMarkToggle);
  }
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
if (startingBonusAwarded > 0) toast(`STARTING BONUS +${fmt(startingBonusAwarded)} ETB`, "win");
startClock();
showView("lobby");
loadCardCatalog();
