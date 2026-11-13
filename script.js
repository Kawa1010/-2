const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const hud = document.getElementById("hud");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayDesc = document.getElementById("overlay-desc");
const startBtn = document.getElementById("start-btn");
const backBtn = document.getElementById("back-btn");
const scoreEl = document.getElementById("score");
const staminaBarEl = document.getElementById("stamina-bar");
const dangerFlash = document.getElementById("danger-flash");

// 迷路マップ (1: 緑の垣根壁, 0: 通路)
const MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
  [1,0,1,0,1,0,1,1,0,1,0,1,1,0,1],
  [1,0,1,0,0,0,0,1,0,0,0,0,1,0,1],
  [1,0,1,1,1,1,0,1,1,1,1,0,1,0,1],
  [1,0,0,0,0,1,0,0,0,0,1,0,0,0,1],
  [1,1,1,1,0,1,0,1,1,0,1,1,1,0,1],
  [1,0,0,0,0,0,0,1,0,0,0,0,0,0,1],
  [1,0,1,1,1,1,0,1,0,1,1,1,1,0,1],
  [1,0,1,0,0,0,0,0,0,0,0,0,1,0,1],
  [1,0,1,0,1,1,1,1,1,1,1,0,1,0,1],
  [1,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,0,1,1,1,0,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

const TOTAL_STARS = 10;
let isPlaying = false;
let score = 0;
let stamina = 100;
let isExhausted = false;

// プレイヤー状態
let px = 1.5;
let py = 1.5;
let pDir = 0; // 向き（ラジアン）

// 鬼の状態
let oniX = 8.5;
let oniY = 7.5;
let oniDirX = 1;
let oniDirY = 0;
let oniCooldown = 0;

// 星のリスト
let stars = [];

// キー入力
const keys = {};
window.addEventListener("keydown", (e) => { keys[e.code] = true; });
window.addEventListener("keyup", (e) => { keys[e.code] = false; });

// マウス視点回転
document.addEventListener("mousemove", (e) => {
  if (isPlaying && document.pointerLockElement === canvas) {
    pDir += e.movementX * 0.003;
  }
});

// --- 「死刑実習」風ホラーBGMエンジン ---
let audioCtx = null;
let bgmTimer = null;
let noteIndex = 0;

const horrorMelody = [
  330.00, 311.13, 293.66, 311.13,
  330.00, 392.00, 440.00, 392.00,
  330.00, 277.18, 261.63, 277.18,
  220.00, 246.94, 277.18, 311.13
];

function initAudio() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  } catch (e) {}
}

function playBgmNote() {
  if (!audioCtx || !isPlaying) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(horrorMelody[noteIndex], audioCtx.currentTime);
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.2);
    noteIndex = (noteIndex + 1) % horrorMelody.length;
  } catch (e) {}
}

function startBgm() {
  stopBgm();
  noteIndex = 0;
  bgmTimer = setInterval(playBgmNote, 180);
}

function stopBgm() {
  if (bgmTimer) {
    clearInterval(bgmTimer);
    bgmTimer = null;
  }
}

function playJumpScareSound() {
  if (!audioCtx) return;
  try {
    [110, 120, 220, 240].forEach(freq => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, audioCtx.currentTime + 0.6);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.6);
    });
  } catch (e) {}
}

function playStarSound() {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.25);
  } catch (e) {}
}

// 壁判定
function isWall(x, y) {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  if (gy < 0 || gy >= MAP.length || gx < 0 || gx >= MAP[0].length) return true;
  return MAP[gy][gx] === 1;
}

// 視線が通っているか判定（角から急に現れる演出用）
function hasLineOfSight(x1, y1, x2, y2) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.ceil(dist * 5);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isWall(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
  }
  return true;
}

// 星の配置
function spawnStars() {
  const spots = [
    [5.5, 1.5], [13.5, 1.5], [1.5, 5.5], [9.5, 5.5], [3.5, 9.5],
    [11.5, 9.5], [5.5, 11.5], [13.5, 11.5], [1.5, 13.5], [7.5, 13.5]
  ];
  stars = spots.map(s => ({ x: s[0], y: s[1], collected: false }));
}

// ゲーム開始処理
function startGame() {
  initAudio();
  score = 0;
  stamina = 100;
  isExhausted = false;
  scoreEl.textContent = "0";

  px = 1.5;
  py = 1.5;
  pDir = 0;

  oniX = 8.5;
  oniY = 7.5;
  oniDirX = 1;
  oniDirY = 0;
  oniCooldown = 0;

  spawnStars();

  isPlaying = true;
  overlay.classList.add("hidden");
  hud.classList.remove("hidden");
  dangerFlash.classList.remove("active");

  startBgm();

  try {
    canvas.requestPointerLock();
  } catch (e) {}
}

function endGame(isClear) {
  isPlaying = false;
  stopBgm();
  dangerFlash.classList.remove("active");
  try {
    document.exitPointerLock();
  } catch (e) {}

  hud.classList.add("hidden");
  overlay.classList.remove("hidden");

  if (isClear) {
    overlayTitle.textContent = "生 還 成 功 ！";
    overlayTitle.style.color = "#ffcc00";
    overlayDesc.innerHTML = "すべての星（10個）を集め、鬼から逃げ切った！";
  } else {
    playJumpScareSound();
    overlayTitle.textContent = "捕 ま っ た …";
    overlayTitle.style.color = "#ff2222";
    overlayDesc.innerHTML = `集めた星: ${score} ／ 10 個<br>角を曲がる時は視界に気をつけよう！`;
  }
  startBtn.textContent = "もう一度遊ぶ";
}

// ボタンのイベント登録（確実に反応するように設定）
startBtn.onclick = startGame;
backBtn.onclick = () => {
  isPlaying = false;
  stopBgm();
  dangerFlash.classList.remove("active");
  try { document.exitPointerLock(); } catch (e) {}
  hud.classList.add("hidden");
  overlay.classList.remove("hidden");
  overlayTitle.textContent = "鬼が追ってくる";
  overlayTitle.style.color = "#ff3333";
  startBtn.textContent = "ゲーム開始（BGMが流れます）";
};

// 更新処理
function update() {
  if (!isPlaying) return;

  // キーボード視点回転
  if (keys["ArrowLeft"]) pDir -= 0.045;
  if (keys["ArrowRight"]) pDir += 0.045;

  // ダッシュ＆スタミナ
  const wantsDash = keys["ShiftLeft"] || keys["ShiftRight"];
  const isMoving = keys["KeyW"] || keys["KeyS"] || keys["KeyA"] || keys["KeyD"] || keys["ArrowUp"] || keys["ArrowDown"];
  let speed = 0.042;

  if (isExhausted) {
    speed = 0.024;
    stamina += 0.35;
    if (stamina >= 35) isExhausted = false;
  } else if (wantsDash && isMoving) {
    speed = 0.072;
    stamina -= 0.75;
    if (stamina <= 0) {
      stamina = 0;
      isExhausted = true;
    }
  } else {
    stamina = Math.min(100, stamina + 0.45);
  }
  staminaBarEl.style.width = stamina + "%";
  staminaBarEl.style.background = isExhausted ? "#ff3333" : "#00e5ff";

  // プレイヤー移動
  let moveX = 0;
  let moveY = 0;
  const cos = Math.cos(pDir);
  const sin = Math.sin(pDir);

  if (keys["KeyW"] || keys["ArrowUp"]) { moveX += cos; moveY += sin; }
  if (keys["KeyS"] || keys["ArrowDown"]) { moveX -= cos; moveY -= sin; }
  if (keys["KeyD"]) { moveX -= sin; moveY += cos; }
  if (keys["KeyA"]) { moveX += sin; moveY -= cos; }

  const len = Math.hypot(moveX, moveY);
  if (len > 0) {
    moveX = (moveX / len) * speed;
    moveY = (moveY / len) * speed;
    const pad = 0.22;
    if (!isWall(px + moveX + Math.sign(moveX) * pad, py)) px += moveX;
    if (!isWall(px, py + moveY + Math.sign(moveY) * pad)) py += moveY;
  }

  // 星の取得
  stars.forEach(s => {
    if (!s.collected && Math.hypot(px - s.x, py - s.y) < 0.55) {
      s.collected = true;
      score++;
      scoreEl.textContent = score;
      playStarSound();
      if (score >= TOTAL_STARS) {
        endGame(true);
      }
    }
  });

  // 鬼のAI（角を曲がった瞬間にガッと超高速で襲いかかる）
  const distToPlayer = Math.hypot(px - oniX, py - oniY);
  const canSee = distToPlayer < 7.5 && hasLineOfSight(oniX, oniY, px, py);

  let oniSpeed = 0.032 + score * 0.002;
  if (canSee) {
    if (oniCooldown <= 0) {
      playJumpScareSound();
      oniCooldown = 150;
    }
    dangerFlash.classList.add("active");
    oniSpeed = 0.088 + score * 0.003; // 角から飛び出した瞬間の猛ダッシュ！
    oniDirX = (px - oniX) / distToPlayer;
    oniDirY = (py - oniY) / distToPlayer;
  } else {
    dangerFlash.classList.remove("active");
    const nextX = oniX + oniDirX * oniSpeed;
    const nextY = oniY + oniDirY * oniSpeed;
    if (isWall(nextX + Math.sign(oniDirX) * 0.25, nextY + Math.sign(oniDirY) * 0.25) || Math.random() < 0.02) {
      const dirs = [[1,0], [-1,0], [0,1], [0,-1]].filter(d => !isWall(oniX + d[0] * 0.6, oniY + d[1] * 0.6));
      if (dirs.length > 0) {
        const pick = dirs[Math.floor(Math.random() * dirs.length)];
        oniDirX = pick[0];
        oniDirY = pick[1];
      }
    }
  }
  if (oniCooldown > 0) oniCooldown--;

  const ovx = oniDirX * oniSpeed;
  const ovy = oniDirY * oniSpeed;
  if (!isWall(oniX + ovx + Math.sign(ovx) * 0.2, oniY)) oniX += ovx;
  if (!isWall(oniX, oniY + ovy + Math.sign(ovy) * 0.2)) oniY += ovy;

  if (distToPlayer < 0.48) {
    endGame(false);
  }
}

// 3D一人称視点の描画（レイキャスティング）
function draw() {
  const w = canvas.width = window.innerWidth;
  const h = canvas.height = window.innerHeight;

  // 青空と白い雲の背景
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h / 2);
  skyGrad.addColorStop(0, "#3b8eea");
  skyGrad.addColorStop(1, "#bfe2ff");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h / 2);

  // 木目調の床
  const floorGrad = ctx.createLinearGradient(0, h / 2, 0, h);
  floorGrad.addColorStop(0, "#c8ad7f");
  floorGrad.addColorStop(1, "#f0dcb8");
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, h / 2, w, h / 2);

  const fov = Math.PI / 3;
  const numRays = Math.floor(w / 3);
  const zBuffer = new Array(numRays);

  // 壁（緑の垣根）の描画
  for (let i = 0; i < numRays; i++) {
    const rayAngle = pDir - fov / 2 + (i / numRays) * fov;
    const rayCos = Math.cos(rayAngle);
    const raySin = Math.sin(rayAngle);

    let dist = 0;
    let hit = false;
    let side = 0;

    while (!hit && dist < 20) {
      dist += 0.04;
      const rx = px + rayCos * dist;
      const ry = py + raySin * dist;
      if (isWall(rx, ry)) {
        hit = true;
        const fx = rx - Math.floor(rx);
        const fy = ry - Math.floor(ry);
        side = (Math.min(fx, 1 - fx) < Math.min(fy, 1 - fy)) ? 1 : 0;
      }
    }

    const perpDist = dist * Math.cos(rayAngle - pDir);
    zBuffer[i] = perpDist;

    const wallH = (h / perpDist) * 0.75;
    const drawStart = h / 2 - wallH * 0.35;

    ctx.fillStyle = side === 1 ? "#1a7a1a" : "#249e24";
    ctx.fillRect(i * 3, drawStart, 3.5, wallH);
  }

  // スプライト（星＋光の柱、そして怖い鬼）を遠い順に描画
  const sprites = [];
  stars.forEach(s => {
    if (!s.collected) {
      sprites.push({ type: "star", x: s.x, y: s.y, dist: Math.hypot(s.x - px, s.y - py) });
    }
  });
  sprites.push({ type: "oni", x: oniX, y: oniY, dist: Math.hypot(oniX - px, oniY - py) });
  sprites.sort((a, b) => b.dist - a.dist);

  sprites.forEach(sp => {
    const dx = sp.x - px;
    const dy = sp.y - py;
    let angle = Math.atan2(dy, dx) - pDir;
    while (angle < -Math.PI) angle += Math.PI * 2;
    while (angle > Math.PI) angle -= Math.PI * 2;

    if (Math.abs(angle) < fov * 0.7) {
      const screenX = (0.5 + angle / fov) * w;
      const rayIdx = Math.floor(screenX / 3);

      if (rayIdx >= 0 && rayIdx < numRays && sp.dist < zBuffer[rayIdx]) {
        const size = (h / sp.dist) * 0.75;

        if (sp.type === "star") {
          // 空へ伸びる白い光の柱
          ctx.fillStyle = "rgba(255, 255, 255, 0.38)";
          ctx.fillRect(screenX - size * 0.08, 0, size * 0.16, h / 2 + size * 0.3);

          // 輝く星（★）
          ctx.fillStyle = "#ffdd00";
          ctx.font = `bold ${Math.max(14, size * 0.45)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText("★", screenX, h / 2 + size * 0.2);
        } else if (sp.type === "oni") {
          // 角からガッと迫り来る怖い鬼の描画
          const oniYPos = h / 2 + size * 0.12;
          const r = size * 0.42;

          // 赤黒いオーラ
          ctx.fillStyle = "rgba(180, 0, 0, 0.35)";
          ctx.beginPath();
          ctx.arc(screenX, oniYPos, r * 1.3, 0, Math.PI * 2);
          ctx.fill();

          // 2本の鋭い角
          ctx.fillStyle = "#eeeeee";
          ctx.beginPath();
          ctx.moveTo(screenX - r * 0.5, oniYPos - r * 0.6);
          ctx.lineTo(screenX - r * 0.85, oniYPos - r * 1.45);
          ctx.lineTo(screenX - r * 0.15, oniYPos - r * 0.8);
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(screenX + r * 0.5, oniYPos - r * 0.6);
          ctx.lineTo(screenX + r * 0.85, oniYPos - r * 1.45);
          ctx.lineTo(screenX + r * 0.15, oniYPos - r * 0.8);
          ctx.fill();

          // 鬼の顔
          ctx.fillStyle = "#880808";
          ctx.beginPath();
          ctx.arc(screenX, oniYPos, r, 0, Math.PI * 2);
          ctx.fill();

          // 光る吊り目
          ctx.fillStyle = "#ffff00";
          ctx.beginPath();
          ctx.arc(screenX - r * 0.35, oniYPos - r * 0.15, r * 0.16, 0, Math.PI * 2);
          ctx.arc(screenX + r * 0.35, oniYPos - r * 0.15, r * 0.16, 0, Math.PI * 2);
          ctx.fill();

          // 牙のある口
          ctx.fillStyle = "#110000";
          ctx.beginPath();
          ctx.arc(screenX, oniYPos + r * 0.25, r * 0.48, 0, Math.PI);
          ctx.fill();

          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.moveTo(screenX - r * 0.3, oniYPos + r * 0.25);
          ctx.lineTo(screenX - r * 0.2, oniYPos + r * 0.55);
          ctx.lineTo(screenX - r * 0.1, oniYPos + r * 0.25);
          ctx.moveTo(screenX + r * 0.3, oniYPos + r * 0.25);
          ctx.lineTo(screenX + r * 0.2, oniYPos + r * 0.55);
          ctx.lineTo(screenX + r * 0.1, oniYPos + r * 0.25);
          ctx.fill();
        }
      }
    }
  });
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// 初期画面描画開始
spawnStars();
loop();