const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const targetScoreEl = document.getElementById("target-score");
const staminaBarEl = document.getElementById("stamina-bar");
const overlayEl = document.getElementById("overlay");
const overlayTitleEl = document.getElementById("overlay-title");
const overlayDescEl = document.getElementById("overlay-desc");
const startBtn = document.getElementById("start-btn");

// ゲーム設定
const TARGET_SCORE = 10;
targetScoreEl.textContent = TARGET_SCORE;

let score = 0;
let gameState = "START"; // START, PLAYING, GAMEOVER, CLEAR
let animationId;
let shakeIntensity = 0;

// プレイヤー設定
const player = {
  x: 100,
  y: 275,
  radius: 14,
  baseSpeed: 3.4,
  dashSpeed: 5.8,
  stamina: 100,
  maxStamina: 100,
  isExhausted: false,
  angle: 0
};

// 鬼（怖め）設定
const oni = {
  x: 700,
  y: 275,
  radius: 22,
  speed: 2.3,
  pulse: 0
};

// 星設定
const star = {
  x: 400,
  y: 275,
  radius: 13,
  angle: 0
};

// 障害物（壁・柱）を追加して鬼ごっこ感をアップ
const walls = [
  { x: 220, y: 110, w: 30, h: 140 },
  { x: 220, y: 310, w: 30, h: 140 },
  { x: 550, y: 110, w: 30, h: 140 },
  { x: 550, y: 310, w: 30, h: 140 },
  { x: 360, y: 210, w: 80, h: 30 },
  { x: 360, y: 310, w: 80, h: 30 }
];

// キー入力管理
const keys = {};
window.addEventListener("keydown", (e) => { keys[e.code] = true; });
window.addEventListener("keyup", (e) => { keys[e.code] = false; });

// --- サウンドエンジン（外部ファイル不要のWeb Audio API） ---
let audioCtx = null;
let heartbeatTimer = 0;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playStarSound() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
  osc.frequency.exponentialRampToValueAtTime(1174.66, audioCtx.currentTime + 0.15); // D6
  gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.3);
}

function playHeartbeat() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(65, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.12);
  gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.15);
}

function playScreamSound() {
  if (!audioCtx) return;
  [110, 116, 233, 466].forEach(freq => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(freq * 0.5, audioCtx.currentTime + 0.8);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.8);
  });
}

// --- 当たり判定ユーティリティ ---
function circleRectCollision(cx, cy, radius, rect) {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return (dx * dx + dy * dy) < (radius * radius);
}

function isCollidingWithWalls(x, y, radius) {
  if (x - radius < 0 || x + radius > canvas.width || y - radius < 0 || y + radius > canvas.height) {
    return true;
  }
  return walls.some(w => circleRectCollision(x, y, radius, w));
}

// 星のスポーン（壁に重ならない場所を選ぶ）
function spawnStar() {
  let valid = false;
  while (!valid) {
    star.x = Math.random() * (canvas.width - 80) + 40;
    star.y = Math.random() * (canvas.height - 80) + 40;
    if (!isCollidingWithWalls(star.x, star.y, star.radius + 10)) {
      valid = true;
    }
  }
}

// ゲーム初期化
function startGame() {
  initAudio();
  score = 0;
  scoreEl.textContent = score;
  player.x = 80;
  player.y = 275;
  player.stamina = 100;
  player.isExhausted = false;

  oni.x = 720;
  oni.y = 275;
  oni.speed = 2.3;

  spawnStar();
  gameState = "PLAYING";
  overlayEl.classList.add("hidden");
  cancelAnimationFrame(animationId);
  gameLoop();
}

startBtn.addEventListener("click", startGame);

// --- 更新処理 ---
function update() {
  if (gameState !== "PLAYING") return;

  // ダッシュ＆スタミナ処理
  const isShiftPressed = keys["ShiftLeft"] || keys["ShiftRight"];
  let currentSpeed = player.baseSpeed;

  if (player.isExhausted) {
    currentSpeed = player.baseSpeed * 0.6; // 息切れ時は遅くなる
    player.stamina += 0.35;
    if (player.stamina >= 40) player.isExhausted = false;
  } else if (isShiftPressed && (keys["KeyW"] || keys["KeyS"] || keys["KeyA"] || keys["KeyD"] || keys["ArrowUp"] || keys["ArrowDown"] || keys["ArrowLeft"] || keys["ArrowRight"])) {
    currentSpeed = player.dashSpeed;
    player.stamina -= 0.9;
    if (player.stamina <= 0) {
      player.stamina = 0;
      player.isExhausted = true;
    }
  } else {
    player.stamina = Math.min(player.maxStamina, player.stamina + 0.45);
  }

  staminaBarEl.style.width = `${player.stamina}%`;
  staminaBarEl.style.background = player.isExhausted ? "#ff3333" : "linear-gradient(90deg, #0088ff, #00ffcc)";

  // プレイヤー移動（X軸・Y軸別々に判定して壁沿いに滑れるようにする）
  let dx = 0;
  let dy = 0;
  if (keys["KeyW"] || keys["ArrowUp"]) dy -= 1;
  if (keys["KeyS"] || keys["ArrowDown"]) dy += 1;
  if (keys["KeyA"] || keys["ArrowLeft"]) dx -= 1;
  if (keys["KeyD"] || keys["ArrowRight"]) dx += 1;

  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    dx = (dx / len) * currentSpeed;
    dy = (dy / len) * currentSpeed;
    player.angle = Math.atan2(dy, dx);

    if (!isCollidingWithWalls(player.x + dx, player.y, player.radius)) {
      player.x += dx;
    }
    if (!isCollidingWithWalls(player.x, player.y + dy, player.radius)) {
      player.y += dy;
    }
  }

  // 鬼の追跡処理（壁をある程度避けながら追跡）
  const odx = player.x - oni.x;
  const ody = player.y - oni.y;
  const distToPlayer = Math.hypot(odx, ody);

  if (distToPlayer > 0) {
    const vx = (odx / distToPlayer) * oni.speed;
    const vy = (ody / distToPlayer) * oni.speed;

    if (!isCollidingWithWalls(oni.x + vx, oni.y, oni.radius - 4)) {
      oni.x += vx;
    }
    if (!isCollidingWithWalls(oni.x, oni.y + vy, oni.radius - 4)) {
      oni.y += vy;
    }
  }

  oni.pulse += 0.15;
  star.angle += 0.05;

  // 鬼との距離に応じた恐怖演出（心音＆画面揺れ）
  if (distToPlayer < 260) {
    const dangerRatio = 1 - (distToPlayer / 260);
    shakeIntensity = dangerRatio * 5;
    heartbeatTimer += 1 + dangerRatio * 2.5;
    if (heartbeatTimer > 45) {
      playHeartbeat();
      heartbeatTimer = 0;
    }
  } else {
    shakeIntensity = 0;
  }

  // 星の取得判定
  if (Math.hypot(player.x - star.x, player.y - star.y) < player.radius + star.radius) {
    score++;
    scoreEl.textContent = score;
    playStarSound();

    if (score >= TARGET_SCORE) {
      gameState = "CLEAR";
      showEndScreen("生還成功…！", `すべての星（${TARGET_SCORE}個）を集め、鬼の館から脱出した！`, "#ffd700");
      return;
    }

    oni.speed += 0.16; // 星を取るたびに鬼が本気を出す
    spawnStar();
  }

  // 鬼との接触判定（ゲームオーバー）
  if (distToPlayer < player.radius + oni.radius - 4) {
    gameState = "GAMEOVER";
    playScreamSound();
    showEndScreen("捕 マ ッ タ …", `集めた星: ${score} / ${TARGET_SCORE} 個`, "#ff1a1a");
  }
}

function showEndScreen(title, desc, color) {
  overlayTitleEl.textContent = title;
  overlayTitleEl.style.color = color;
  overlayDescEl.textContent = desc;
  startBtn.textContent = "もう一度挑戦する";
  overlayEl.classList.remove("hidden");
}

// --- 描画処理 ---
function drawStarShape(cx, cy, spikes, outerR, innerR, rotation) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / spikes;
    if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.fillStyle = "#ffe600";
  ctx.shadowColor = "#ffaa00";
  ctx.shadowBlur = 20;
  ctx.fill();
  ctx.restore();
}

// 怖い鬼のイラスト描画
function drawScaryOni(x, y, radius) {
  ctx.save();
  ctx.translate(x, y);

  // 赤黒い禍々しいオーラ
  const auraRadius = radius + 12 + Math.sin(oni.pulse) * 6;
  const grad = ctx.createRadialGradient(0, 0, radius * 0.5, 0, 0, auraRadius);
  grad.addColorStop(0, "rgba(255, 0, 0, 0.8)");
  grad.addColorStop(1, "rgba(100, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, auraRadius, 0, Math.PI * 2);
  ctx.fill();

  // 2本の鋭い角
  ctx.fillStyle = "#ddd";
  ctx.beginPath();
  ctx.moveTo(-12, -14);
  ctx.lineTo(-22, -32);
  ctx.lineTo(-4, -18);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(12, -14);
  ctx.lineTo(22, -32);
  ctx.lineTo(4, -18);
  ctx.fill();

  // 鬼の顔（血のような赤黒さ）
  ctx.fillStyle = "#7a0000";
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#220000";
  ctx.stroke();

  // 吊り上がった光る目
  ctx.fillStyle = "#ffff00";
  ctx.shadowColor = "#ff0000";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(-13, -6);
  ctx.lineTo(-4, -2);
  ctx.lineTo(-11, 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(13, -6);
  ctx.lineTo(4, -2);
  ctx.lineTo(11, 2);
  ctx.fill();

  // 牙のある不気味な口
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#110000";
  ctx.beginPath();
  ctx.arc(0, 8, 10, 0, Math.PI, false);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(-7, 8); ctx.lineTo(-5, 14); ctx.lineTo(-3, 8);
  ctx.moveTo(7, 8); ctx.lineTo(5, 14); ctx.lineTo(3, 8);
  ctx.fill();

  ctx.restore();
}

function draw() {
  ctx.save();

  // 画面の微振動（鬼が近い時）
  if (shakeIntensity > 0 && gameState === "PLAYING") {
    const sx = (Math.random() - 0.5) * shakeIntensity;
    const sy = (Math.random() - 0.5) * shakeIntensity;
    ctx.translate(sx, sy);
  }

  // 床のタイル模様
  ctx.fillStyle = "#18181c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#222228";
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  // 壁の描画
  walls.forEach(w => {
    ctx.fillStyle = "#2d2d35";
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = "#454550";
    ctx.strokeRect(w.x, w.y, w.w, w.h);
  });

  // 星の描画
  drawStarShape(star.x, star.y, 5, star.radius, star.radius / 2.2, star.angle);

  // プレイヤーの描画
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.fillStyle = "#33ccff";
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
  ctx.fill();
  // 向いている方向の目印
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(Math.cos(player.angle) * 7, Math.sin(player.angle) * 7, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 鬼の描画
  drawScaryOni(oni.x, oni.y, oni.radius);

  // 視界制限（暗闇＆懐中電灯の恐怖演出）
  const darkness = ctx.createRadialGradient(
    player.x, player.y, 70,
    player.x, player.y, 290
  );
  darkness.addColorStop(0, "rgba(0, 0, 0, 0)");
  darkness.addColorStop(0.7, "rgba(0, 0, 0, 0.78)");
  darkness.addColorStop(1, "rgba(0, 0, 0, 0.96)");

  ctx.fillStyle = darkness;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 暗闇の中でも「鬼の光る目」と「星の輝き」だけはうっすら見える演出
  drawStarShape(star.x, star.y, 5, star.radius * 0.8, star.radius * 0.35, star.angle);
  drawScaryOni(oni.x, oni.y, oni.radius);

  ctx.restore();
}

function gameLoop() {
  update();
  draw();
  if (gameState === "PLAYING") {
    animationId = requestAnimationFrame(gameLoop);
  }
}

// 初期画面の背景描画
draw();