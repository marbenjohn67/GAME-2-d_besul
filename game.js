
"use strict";

/* ==========================================
   THE ENDLESS JUMP — Game Engine
   ========================================== */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// UI elements
const ui = {
  score: document.getElementById("score"),
  height: document.getElementById("height"),
  coins: document.getElementById("coins"),
  bestScore: document.getElementById("bestScore"),

  startScreen: document.getElementById("startScreen"),
  gameOverScreen: document.getElementById("gameOverScreen"),

  startButton: document.getElementById("startButton"),
  restartButton: document.getElementById("restartButton"),

  finalScore: document.getElementById("finalScore"),
  finalHeight: document.getElementById("finalHeight"),
  finalCoins: document.getElementById("finalCoins"),
  leaderboard: document.getElementById("leaderboard"),

  characterUpload: document.getElementById("characterUpload"),
  leftButton: document.getElementById("leftButton"),
  rightButton: document.getElementById("rightButton")
};

// Game configuration
const CONFIG = {
  gravity: 0.32,
  jumpVelocity: -10.8,
  horizontalSpeed: 4.8,
  bounceBoost: -12.3,
  platformHeight: 12,
  basePlatformWidth: 84,
  platformGapMin: 65,
  platformGapMax: 100,
  coinRadius: 10,
  coinBonus: 50,
  heightMultiplier: 0.1
};

// Persistent storage keys
const SCORE_KEY = "endlessJumpScores_v1";
const IMAGE_KEY = "endlessJumpCharacter_v1";

// Game state
let running = false;
let animationId = null;
let lastTime = 0;
let elapsedTime = 0;

let cameraY = 0;
let highestY = 0;
let startingY = 0;

let score = 0;
let coinCount = 0;
let bestScore = 0;

let platforms = [];
let coins = [];
let stars = [];

let leftPressed = false;
let rightPressed = false;

let player = null;
let characterImage = null;

// ------------------------------------------
// Helpers
// ------------------------------------------

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function loadScores() {
  try {
    const saved = JSON.parse(localStorage.getItem(SCORE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveScores(scores) {
  try {
    localStorage.setItem(SCORE_KEY, JSON.stringify(scores));
  } catch (error) {
    console.warn("Could not save leaderboard:", error);
  }
}

function getBestScore() {
  return loadScores().reduce(
    (best, entry) => Math.max(best, Number(entry.score) || 0),
    0
  );
}

function updateHUD() {
  const currentHeight = Math.max(
    0,
    Math.floor((startingY - highestY) / 10)
  );

  score = Math.floor(currentHeight + coinCount * CONFIG.coinBonus);

  ui.score.textContent = score.toLocaleString();
  ui.height.textContent = currentHeight + " m";
  ui.coins.textContent = coinCount;
  ui.bestScore.textContent = bestScore.toLocaleString();
}

// ------------------------------------------
// Background
// ------------------------------------------

function createStars() {
  stars = [];

  for (let i = 0; i < 85; i++) {
    stars.push({
      x: random(0, WIDTH),
      y: random(-1200, HEIGHT + 1200),
      radius: random(0.6, 2),
      alpha: random(0.25, 0.9)
    });
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, "#101936");
  gradient.addColorStop(0.5, "#17264b");
  gradient.addColorStop(1, "#0a1125");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Slowly drifting space stars
  for (const star of stars) {
    let sy = ((star.y - cameraY * 0.18) % (HEIGHT + 80));

    if (sy < -40) sy += HEIGHT + 80;

    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = "#dce9ff";
    ctx.beginPath();
    ctx.arc(star.x, sy, star.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;

  // Soft background glow
  const glow = ctx.createRadialGradient(
    WIDTH / 2, HEIGHT * 0.3, 10,
    WIDTH / 2, HEIGHT * 0.3, HEIGHT * 0.75
  );

  glow.addColorStop(0, "#6d7dff12");
  glow.addColorStop(1, "#6d7dff00");

  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

// ------------------------------------------
// Platforms and coins
// ------------------------------------------

function difficulty() {
  // Increases gradually with height, capped for balance.
  return clamp(Math.max(0, startingY - highestY) / 5000, 0, 1);
}

function makePlatform(x, y, width, options = {}) {
  const moving = options.moving ?? (
    difficulty() > 0.18 && Math.random() < difficulty() * 0.65
  );

  return {
    x,
    y,
    width,
    height: CONFIG.platformHeight,
    moving,
    speed: moving ? random(0.5, 1.3) : 0,
    direction: Math.random() < 0.5 ? -1 : 1,
    amplitude: random(20, 55),
    originX: x,
    type: Math.random() < 0.15 ? "special" : "normal"
  };
}

function addCoin(x, y) {
  coins.push({
    x,
    y,
    radius: CONFIG.coinRadius,
    collected: false,
    phase: random(0, Math.PI * 2)
  });
}

function createInitialWorld() {
  platforms = [];
  coins = [];

  // The starting platform sits beneath the player.
  const base = makePlatform(
    WIDTH / 2 - 58,
    590,
    116,
    { moving: false }
  );

  platforms.push(base);

  // Create reachable platforms above the starting point.
  let y = 590;

  for (let i = 0; i < 10; i++) {
    const gap = random(65, 85);
    y -= gap;

    const width = random(70, 92);
    const x = random(10, WIDTH - width - 10);

    platforms.push(makePlatform(x, y, width, { moving: false }));

    if (Math.random() < 0.72) {
      addCoin(x + width / 2, y - random(25, 48));
    }
  }
}

function generatePlatforms() {
  const diff = difficulty();

  // Find the uppermost platform (smallest world Y).
  let topY = platforms.reduce(
    (min, p) => Math.min(min, p.y),
    Infinity
  );

  // Keep generating platforms ahead of the camera.
  while (topY > cameraY - 220) {
    const gap = random(
      CONFIG.platformGapMin + diff * 5,
      CONFIG.platformGapMax + diff * 28
    );

    topY -= gap;

    // Platforms gradually shrink.
    const width = clamp(
      CONFIG.basePlatformWidth - diff * 34 + random(-10, 12),
      42,
      96
    );

    const x = random(8, WIDTH - width - 8);

    const platform = makePlatform(x, topY, width);
    platforms.push(platform);

    // Fewer coins at higher difficulties.
    const coinChance = 0.72 - diff * 0.25;

    if (Math.random() < coinChance) {
      const coinX = clamp(
        x + random(8, Math.max(9, width - 8)),
        12,
        WIDTH - 12
      );

      addCoin(coinX, topY - random(25, 50));
    }
  }

  // Remove objects far below the visible world.
  platforms = platforms.filter(
    p => p.y - cameraY < HEIGHT + 200
  );

  coins = coins.filter(
    c => !c.collected && c.y - cameraY < HEIGHT + 150
  );
}

function updatePlatforms(dt) {
  for (const p of platforms) {
    if (!p.moving) continue;

    p.x += p.speed * p.direction * dt;

    // Reverse direction at the ends of the movement range.
    if (p.x > p.originX + p.amplitude) {
      p.x = p.originX + p.amplitude;
      p.direction = -1;
    }

    if (p.x < p.originX - p.amplitude) {
      p.x = p.originX - p.amplitude;
      p.direction = 1;
    }

    // Keep the platform within the canvas.
    if (p.x < 4 || p.x + p.width > WIDTH - 4) {
      p.x = clamp(p.x, 4, WIDTH - p.width - 4);
      p.originX = p.x;
      p.direction *= -1;
    }
  }
}

// ------------------------------------------
// Player
// ------------------------------------------

function createPlayer() {
  return {
    x: WIDTH / 2 - 16,
    y: 530,
    width: 32,
    height: 38,
    vx: 0,
    vy: CONFIG.jumpVelocity,
    facing: 1
  };
}

function updatePlayer(dt) {
  if (!player) return;

  const previousY = player.y;

  // Horizontal movement.
  let direction = 0;

  if (leftPressed) direction -= 1;
  if (rightPressed) direction += 1;

  player.vx = direction * CONFIG.horizontalSpeed;

  if (direction !== 0) {
    player.facing = direction;
  }

  player.x += player.vx * dt;

  // Wrap around screen edges.
  if (player.x + player.width < 0) {
    player.x = WIDTH;
  } else if (player.x > WIDTH) {
    player.x = -player.width;
  }

  // Gravity and vertical movement.
  player.vy += CONFIG.gravity * dt;
  player.y += player.vy * dt;

  // Land only when falling onto the top of a platform.
  if (player.vy > 0) {
    const previousBottom = previousY + player.height;
    const currentBottom = player.y + player.height;

    for (const p of platforms) {
      const horizontalOverlap =
        player.x + player.width > p.x &&
        player.x < p.x + p.width;

      const crossedPlatform =
        previousBottom <= p.y &&
        currentBottom >= p.y;

      if (horizontalOverlap && crossedPlatform) {
        player.y = p.y - player.height;
        player.vy = CONFIG.bounceBoost;

        // A slight bounce boost at greater heights.
        player.vy -= difficulty() * 0.4;

        break;
      }
    }
  }

  // Track the highest point reached.
  if (player.y < highestY) {
    highestY = player.y;
  }

  // Move the camera upward as the player climbs.
  const targetScreenY = HEIGHT * 0.38;
  const playerScreenY = player.y - cameraY;

  if (playerScreenY < targetScreenY) {
    cameraY = player.y - targetScreenY;
  }
}

// ------------------------------------------
// Coin collection
// ------------------------------------------

function updateCoins() {
  for (const coin of coins) {
    if (coin.collected) continue;

    const closestX = clamp(
      coin.x,
      player.x,
      player.x + player.width
    );

    const closestY = clamp(
      coin.y,
      player.y,
      player.y + player.height
    );

    const dx = coin.x - closestX;
    const dy = coin.y - closestY;

    if (dx * dx + dy * dy < coin.radius * coin.radius) {
      coin.collected = true;
      coinCount++;
      updateHUD();
    }
  }
}

// ------------------------------------------
// Drawing
// ------------------------------------------

function drawPlatform(p) {
  const y = p.y - cameraY;

  if (y < -30 || y > HEIGHT + 30) return;

  const isSpecial = p.type === "special";

  ctx.save();

  ctx.shadowColor = isSpecial ? "#ffd166" : "#3fffd0";
  ctx.shadowBlur = 10;

  const gradient = ctx.createLinearGradient(
    p.x, y, p.x, y + p.height
  );

  if (isSpecial) {
    gradient.addColorStop(0, "#ffe49b");
    gradient.addColorStop(1, "#d68d30");
  } else {
    gradient.addColorStop(0, "#70ffe0");
    gradient.addColorStop(1, "#20a995");
  }

  ctx.fillStyle = gradient;

  // Rounded platform shape.
  const radius = 5;

  ctx.beginPath();
  ctx.moveTo(p.x + radius, y);
  ctx.lineTo(p.x + p.width - radius, y);
  ctx.quadraticCurveTo(
    p.x + p.width, y,
    p.x + p.width, y + radius
  );
  ctx.lineTo(p.x + p.width, y + p.height);
  ctx.lineTo(p.x, y + p.height);
  ctx.lineTo(p.x, y + radius);
  ctx.quadraticCurveTo(p.x, y, p.x + radius, y);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  // Moving platform indicator.
  if (p.moving) {
    ctx.fillStyle = "#123a49";
    ctx.font = "bold 10px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("↔", p.x + p.width / 2, y + 10);
  }
}

function drawCoin(coin) {
  if (coin.collected) return;

  const y = coin.y - cameraY;

  if (y < -30 || y > HEIGHT + 30) return;

  const pulse = Math.sin(elapsedTime * 0.005 + coin.phase) * 1.5;
  const r = coin.radius + pulse;

  ctx.save();

  ctx.shadowColor = "#ffd54a";
  ctx.shadowBlur = 13;

  const gradient = ctx.createRadialGradient(
    coin.x - 3, y - 3, 1,
    coin.x, y, r + 2
  );

  gradient.addColorStop(0, "#fff9b2");
  gradient.addColorStop(0.5, "#ffd84d");
  gradient.addColorStop(1, "#e99b18");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(coin.x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#fff0a0";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#9b6410";
  ctx.font = "bold 13px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$", coin.x, y + 0.5);

  ctx.restore();
}

function drawPlayer() {
  if (!player) return;

  const x = player.x;
  const y = player.y - cameraY;
  const w = player.width;
  const h = player.height;

  ctx.save();

  // Soft character shadow.
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(
    x + w / 2,
    y + h + 3,
    w * 0.45,
    4,
    0, 0, Math.PI * 2
  );
  ctx.fill();
  ctx.globalAlpha = 1;

  // Use the uploaded photo when available.
  if (characterImage && characterImage.complete &&
      characterImage.naturalWidth > 0) {
    ctx.save();

    ctx.beginPath();
    ctx.arc(
      x + w / 2,
      y + h / 2,
      Math.min(w, h) / 2,
      0,
      Math.PI * 2
    );
    ctx.clip();

    // Cover the circle with the image.
    const side = Math.min(
      characterImage.naturalWidth,
      characterImage.naturalHeight
    );

    const sx = (characterImage.naturalWidth - side) / 2;
    const sy = (characterImage.naturalHeight - side) / 2;

    ctx.drawImage(
      characterImage,
      sx, sy, side, side,
      x, y, w, h
    );

    ctx.restore();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      x + w / 2,
      y + h / 2,
      Math.min(w, h) / 2,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  } else {
    // Default cute astronaut character.
    ctx.shadowColor = "#8be9ff";
    ctx.shadowBlur = 12;

    ctx.fillStyle = "#e7f4ff";
    ctx.beginPath();
    ctx.roundRect(x, y + 8, w, h - 8, 10);
    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.fillStyle = "#4dd9ff";
    ctx.beginPath();
    ctx.roundRect(x + 5, y + 2, w - 10, 23, 9);
    ctx.fill();

    // Helmet glass.
    ctx.fillStyle = "#192c53";
    ctx.beginPath();
    ctx.ellipse(
      x + w / 2,
      y + 14,
      9,
      9,
      0, 0, Math.PI * 2
    );
    ctx.fill();

    ctx.fillStyle = "#9df5ff";
    ctx.beginPath();
    ctx.arc(x + w / 2 + 3, y + 11, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Boots.
    ctx.fillStyle = "#ffb45e";
    ctx.fillRect(x + 2, y + h - 5, 11, 6);
    ctx.fillRect(x + w - 13, y + h - 5, 11, 6);
  }

  ctx.restore();
}

function drawHeightMarker() {
  const currentHeight = Math.max(
    0,
    Math.floor((startingY - highestY) / 10)
  );

  ctx.save();
  ctx.fillStyle = "#dce7ff";
  ctx.globalAlpha = 0.8;
  ctx.font = "12px system-ui";
  ctx.textAlign = "right";
  ctx.fillText(currentHeight + " m", WIDTH - 12, 24);
  ctx.restore();
}

function drawGame() {
  drawBackground();

  // Draw objects from back to front.
  for (const p of platforms) {
    drawPlatform(p);
  }

  for (const coin of coins) {
    drawCoin(coin);
  }

  drawPlayer();
  drawHeightMarker();
}

// ------------------------------------------
// Game lifecycle
// ------------------------------------------

function resetGame() {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  running = false;
  lastTime = 0;
  elapsedTime = 0;

  cameraY = 0;
  score = 0;
  coinCount = 0;

  leftPressed = false;
  rightPressed = false;

  player = createPlayer();

  // Establish the starting world coordinates.
  startingY = 530;
  highestY = startingY;

  createStars();
  createInitialWorld();

  bestScore = getBestScore();

  ui.score.textContent = "0";
  ui.height.textContent = "0 m";
  ui.coins.textContent = "0";
  ui.bestScore.textContent = bestScore.toLocaleString();

  ui.gameOverScreen.classList.add("hidden");
  ui.startScreen.classList.remove("hidden");

  drawGame();
}

function startGame() {
  if (running) return;

  ui.startScreen.classList.add("hidden");
  ui.gameOverScreen.classList.add("hidden");

  running = true;
  lastTime = 0;

  animationId = requestAnimationFrame(gameLoop);
}

function finishGame() {
  if (!running) return;

  running = false;
  leftPressed = false;
  rightPressed = false;

  const finalHeight = Math.max(
    0,
    Math.floor((startingY - highestY) / 10)
  );

  score = Math.floor(finalHeight + coinCount * CONFIG.coinBonus);

  // Record the run and keep the five highest scores.
  const scores = loadScores();

  scores.push({
    score,
    height: finalHeight,
    coins: coinCount,
    date: new Date().toLocaleDateString()
  });

  scores.sort((a, b) => b.score - a.score);

  const topScores = scores.slice(0, 5);
  saveScores(topScores);

  bestScore = Math.max(bestScore, score);

  ui.finalScore.textContent = score.toLocaleString();
  ui.finalHeight.textContent = finalHeight + " m";
  ui.finalCoins.textContent = coinCount;

  renderLeaderboard(topScores);

  ui.bestScore.textContent = bestScore.toLocaleString();
  ui.gameOverScreen.classList.remove("hidden");

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  drawGame();
}

function renderLeaderboard(scores) {
  ui.leaderboard.replaceChildren();

  if (scores.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No runs recorded yet.";
    ui.leaderboard.appendChild(li);
    return;
  }

  scores.forEach((entry, index) => {
    const li = document.createElement("li");
    const medal = ["🥇", "🥈", "🥉"][index] || "🏅";

    li.textContent =
      `${medal} ${entry.score.toLocaleString()} points ` +
      `— ${entry.height} m, ${entry.coins} coins`;

    ui.leaderboard.appendChild(li);
  });
}

// ------------------------------------------
// Main animation loop
// ------------------------------------------

function gameLoop(timestamp) {
  if (!running) return;

  // Cap elapsed time to avoid physics jumps after tab switching.
  let dt = lastTime === 0
    ? 1
    : Math.min((timestamp - lastTime) / 16.667, 2);

  lastTime = timestamp;
  elapsedTime += dt * 16.667;

  updatePlatforms(dt);
  updatePlayer(dt);
  updateCoins();
  generatePlatforms();
  updateHUD();

  drawGame();

  // Game over when the player falls below the viewport.
  const playerScreenY = player.y - cameraY;

  if (playerScreenY > HEIGHT + 45) {
    finishGame();
    return;
  }

  animationId = requestAnimationFrame(gameLoop);
}

// ------------------------------------------
// Keyboard controls
// ------------------------------------------

document.addEventListener("keydown", event => {
  if (
    ["ArrowLeft", "ArrowRight", " "].includes(event.key)
  ) {
    event.preventDefault();
  }

  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
    leftPressed = true;
  }

  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
    rightPressed = true;
  }

  if (
    event.key === " " &&
    !running &&
    ui.gameOverScreen.classList.contains("hidden")
  ) {
    startGame();
  }
});

document.addEventListener("keyup", event => {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
    leftPressed = false;
  }

  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
    rightPressed = false;
  }
});

window.addEventListener("blur", () => {
  leftPressed = false;
  rightPressed = false;
});

// ------------------------------------------
// Touch and on-screen buttons
// ------------------------------------------

function bindMovementButton(button, direction) {
  const press = event => {
    event.preventDefault();

    if (direction === "left") {
      leftPressed = true;
    } else {
      rightPressed = true;
    }

    button.classList.add("pressed");

    if (button.setPointerCapture && event.pointerId !== undefined) {
      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is optional.
      }
    }
  };

  const release = event => {
    if (event) event.preventDefault();

    if (direction === "left") {
      leftPressed = false;
    } else {
      rightPressed = false;
    }

    button.classList.remove("pressed");
  };

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  button.addEventListener("contextmenu", e => e.preventDefault());
}

bindMovementButton(ui.leftButton, "left");
bindMovementButton(ui.rightButton, "right");

// ------------------------------------------
// Character image upload
// ------------------------------------------

ui.characterUpload.addEventListener("change", event => {
  const file = event.target.files && event.target.files[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Please select an image file.");
    event.target.value = "";
    return;
  }

  // Avoid extremely large files causing unnecessary memory use.
  if (file.size > 10 * 1024 * 1024) {
    alert("Please choose an image smaller than 10 MB.");
    event.target.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    const img = new Image();

    img.onload = () => {
      characterImage = img;
      drawGame();

      // Persist the custom image for future visits when possible.
      try {
        localStorage.setItem(IMAGE_KEY, reader.result);
      } catch (error) {
        console.warn(
          "Image loaded, but could not be saved permanently.",
          error
        );
      }
    };

    img.onerror = () => {
      alert("The selected image could not be loaded.");
    };

    img.src = reader.result;
  };

  reader.onerror = () => {
    alert("Could not read the selected image.");
  };

  reader.readAsDataURL(file);
  event.target.value = "";
});

function restoreCharacterImage() {
  try {
    const savedImage = localStorage.getItem(IMAGE_KEY);

    if (!savedImage) return;

    const img = new Image();

    img.onload = () => {
      characterImage = img;
      drawGame();
    };

    img.src = savedImage;
  } catch (error) {
    console.warn("Could not restore the saved character image.", error);
  }
}

// ------------------------------------------
// Buttons and initialization
// ------------------------------------------

ui.startButton.addEventListener("click", startGame);

ui.restartButton.addEventListener("click", () => {
  resetGame();
  startGame();
});

// Initial setup
restoreCharacterImage();
resetGame();
