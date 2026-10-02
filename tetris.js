const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const NEXT_BLOCK = 24;

const COLORS = {
  I: '#5fb8b8',
  O: '#c9c35a',
  T: '#8f62b5',
  S: '#6bb26b',
  Z: '#c06060',
  J: '#5c6bb8',
  L: '#c9944f',
};

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};

const LINE_SCORES = [0, 100, 300, 500, 800];
const CLEAR_DURATION = 450;
const SPARKS_PER_CELL = 6;
const SPARK_COLORS = ['#e0cf8a', '#d9a25c', '#c97a5a', null];
const PARTICLE_GRAVITY = 0.0015;
const SHAKE_PER_ROW = 2.5;

const boardCanvas = document.getElementById('board');
const ctx = boardCanvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayText = document.getElementById('overlay-text');
const themeToggle = document.getElementById('theme-toggle');

let board;
let current;
let next;
let bag = [];
let score;
let lines;
let level;
let dropCounter;
let lastTime;
let state = 'idle';
let clearing = null;
let particles = [];
let theme = {};

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function nextType() {
  if (bag.length === 0) {
    bag = Object.keys(SHAPES);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop();
}

function createPiece(type) {
  const matrix = SHAPES[type].map((row) => row.slice());
  return {
    type,
    matrix,
    x: Math.floor((COLS - matrix[0].length) / 2),
    y: type === 'I' ? -1 : 0,
  };
}

function collides(piece, offsetX = 0, offsetY = 0, matrix = piece.matrix) {
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      if (!matrix[y][x]) continue;
      const nx = piece.x + x + offsetX;
      const ny = piece.y + y + offsetY;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotate(matrix) {
  return matrix[0].map((_, i) => matrix.map((row) => row[i]).reverse());
}

function tryRotate() {
  const rotated = rotate(current.matrix);
  for (const kick of [0, -1, 1, -2, 2]) {
    if (!collides(current, kick, 0, rotated)) {
      current.matrix = rotated;
      current.x += kick;
      return;
    }
  }
}

function move(dx) {
  if (!collides(current, dx, 0)) current.x += dx;
}

function softDrop() {
  if (!collides(current, 0, 1)) {
    current.y++;
    score += 1;
    updateStats();
  } else {
    lockPiece();
  }
  dropCounter = 0;
}

function hardDrop() {
  let distance = 0;
  while (!collides(current, 0, 1)) {
    current.y++;
    distance++;
  }
  score += distance * 2;
  lockPiece();
  dropCounter = 0;
}

function lockPiece() {
  let toppedOut = false;
  current.matrix.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (!cell) return;
      const by = current.y + y;
      if (by < 0) {
        toppedOut = true;
        return;
      }
      board[by][current.x + x] = current.type;
    });
  });
  if (toppedOut) {
    gameOver();
    return;
  }
  clearLines();
}

function clearLines() {
  const rows = [];
  board.forEach((row, y) => {
    if (row.every((cell) => cell)) rows.push(y);
  });
  if (rows.length === 0) {
    spawn();
    return;
  }
  current = null;
  clearing = { rows, start: performance.now() };
  rows.forEach((y) => {
    board[y].forEach((type, x) => spawnExplosion(x, y, COLORS[type]));
  });
}

function finishClear() {
  const { rows } = clearing;
  clearing = null;
  board = board.filter((_, y) => !rows.includes(y));
  while (board.length < ROWS) board.unshift(Array(COLS).fill(null));
  score += LINE_SCORES[rows.length] * level;
  lines += rows.length;
  level = Math.floor(lines / 10) + 1;
  updateStats();
  spawn();
}

function spawnExplosion(cellX, cellY, color) {
  const cx = (cellX + 0.5) * BLOCK;
  const cy = (cellY + 0.5) * BLOCK;
  const push = (cellX - (COLS - 1) / 2) / COLS;
  const debrisLife = 700 + Math.random() * 500;
  particles.push({
    kind: 'debris',
    x: cx,
    y: cy,
    vx: push * 0.8 + (Math.random() - 0.5) * 0.3,
    vy: -0.35 - Math.random() * 0.35,
    angle: 0,
    spin: (Math.random() - 0.5) * 0.03,
    size: BLOCK,
    life: debrisLife,
    maxLife: debrisLife,
    color,
  });
  for (let i = 0; i < SPARKS_PER_CELL; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.15 + Math.random() * 0.5;
    const life = 300 + Math.random() * 450;
    particles.push({
      kind: 'spark',
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.1,
      size: 2 + Math.random() * 3,
      life,
      maxLife: life,
      color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)] || color,
    });
  }
}

function updateParticles(delta) {
  particles.forEach((p) => {
    p.vy += PARTICLE_GRAVITY * delta;
    p.x += p.vx * delta;
    p.y += p.vy * delta;
    p.life -= delta;
    if (p.kind === 'debris') p.angle += p.spin * delta;
  });
  particles = particles.filter((p) => p.life > 0);
}

function drawParticles() {
  particles.forEach((p) => {
    const t = p.life / p.maxLife;
    ctx.globalAlpha = Math.min(1, t * 1.5);
    if (p.kind === 'debris') {
      const size = p.size * (0.3 + 0.7 * t);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.strokeStyle = theme.cellOutline;
      ctx.lineWidth = 2;
      ctx.strokeRect(-size / 2 + 1, -size / 2 + 1, size - 2, size - 2);
      ctx.restore();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * t), 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
}

function drawBlast() {
  const progress = Math.min(1, (performance.now() - clearing.start) / CLEAR_DURATION);
  const fade = 1 - progress;
  const cx = (COLS * BLOCK) / 2;
  clearing.rows.forEach((y) => {
    const cy = (y + 0.5) * BLOCK;
    const radius = BLOCK + progress * COLS * BLOCK * 0.75;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    glow.addColorStop(0, `rgba(240, 232, 210, ${0.9 * fade})`);
    glow.addColorStop(0.35, `rgba(220, 165, 90, ${0.6 * fade})`);
    glow.addColorStop(1, 'rgba(200, 110, 60, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(225, 195, 130, ${fade})`;
    ctx.lineWidth = 3 * fade + 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.9, 0, Math.PI * 2);
    ctx.stroke();
  });
}

function shakeBoard() {
  if (!clearing) {
    boardCanvas.style.transform = '';
    return;
  }
  const fade = 1 - Math.min(1, (performance.now() - clearing.start) / CLEAR_DURATION);
  const magnitude = SHAKE_PER_ROW * clearing.rows.length * fade;
  const dx = (Math.random() - 0.5) * 2 * magnitude;
  const dy = (Math.random() - 0.5) * 2 * magnitude;
  boardCanvas.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
}

function spawn() {
  current = next;
  next = createPiece(nextType());
  if (collides(current)) gameOver();
}

function dropInterval() {
  return Math.max(100, 1000 - (level - 1) * 90);
}

function updateStats() {
  scoreEl.textContent = score;
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawCell(context, x, y, size, color) {
  context.fillStyle = color;
  context.fillRect(x * size, y * size, size, size);
  context.strokeStyle = theme.cellOutline;
  context.lineWidth = 2;
  context.strokeRect(x * size + 1, y * size + 1, size - 2, size - 2);
}

function ghostY() {
  let offset = 0;
  while (!collides(current, 0, offset + 1)) offset++;
  return current.y + offset;
}

function draw() {
  ctx.fillStyle = theme.boardBg;
  ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  for (let x = 1; x < COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * BLOCK, 0);
    ctx.lineTo(x * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let y = 1; y < ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * BLOCK);
    ctx.lineTo(COLS * BLOCK, y * BLOCK);
    ctx.stroke();
  }

  board.forEach((row, y) => {
    if (clearing && clearing.rows.includes(y)) return;
    row.forEach((type, x) => {
      if (type) drawCell(ctx, x, y, BLOCK, COLORS[type]);
    });
  });

  if (current && state !== 'over') {
    const gy = ghostY();
    ctx.globalAlpha = 0.2;
    current.matrix.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell && gy + y >= 0) drawCell(ctx, current.x + x, gy + y, BLOCK, COLORS[current.type]);
      });
    });
    ctx.globalAlpha = 1;
    current.matrix.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell && current.y + y >= 0) {
          drawCell(ctx, current.x + x, current.y + y, BLOCK, COLORS[current.type]);
        }
      });
    });
  }

  if (clearing) drawBlast();
  drawParticles();
  shakeBoard();
  drawNext();
}

function drawNext() {
  nextCtx.fillStyle = theme.boardBg;
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!next) return;
  const m = next.matrix;
  const rows = m.filter((row) => row.some(Boolean));
  const firstRow = m.findIndex((row) => row.some(Boolean));
  const offsetX = (nextCanvas.width / NEXT_BLOCK - m[0].length) / 2;
  const offsetY = (nextCanvas.height / NEXT_BLOCK - rows.length) / 2 - firstRow;
  m.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell) drawCell(nextCtx, x + offsetX, y + offsetY, NEXT_BLOCK, COLORS[next.type]);
    });
  });
}

function showOverlay(text) {
  overlayText.innerHTML = text;
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

function start() {
  board = createBoard();
  bag = [];
  clearing = null;
  particles = [];
  score = 0;
  lines = 0;
  level = 1;
  dropCounter = 0;
  lastTime = performance.now();
  next = createPiece(nextType());
  spawn();
  updateStats();
  hideOverlay();
  state = 'playing';
  requestAnimationFrame(update);
}

function gameOver() {
  state = 'over';
  showOverlay(`Game Over<br>Score: ${score}<br><br>Press Enter to restart`);
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    showOverlay('Paused<br><br>Press P to resume');
  } else if (state === 'paused') {
    state = 'playing';
    hideOverlay();
    lastTime = performance.now();
    requestAnimationFrame(update);
  }
}

function update(time) {
  if (state !== 'playing') {
    draw();
    return;
  }
  const delta = time - lastTime;
  lastTime = time;
  updateParticles(delta);
  if (clearing) {
    if (time - clearing.start >= CLEAR_DURATION) finishClear();
    draw();
    requestAnimationFrame(update);
    return;
  }
  dropCounter += delta;
  if (dropCounter > dropInterval()) {
    if (!collides(current, 0, 1)) {
      current.y++;
    } else {
      lockPiece();
    }
    dropCounter = 0;
  }
  draw();
  requestAnimationFrame(update);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && state !== 'playing' && state !== 'paused') {
    start();
    return;
  }
  if (clearing) return;
  if (e.key === 'p' || e.key === 'P') {
    togglePause();
    return;
  }
  if (state !== 'playing') return;
  switch (e.key) {
    case 'ArrowLeft':
      move(-1);
      break;
    case 'ArrowRight':
      move(1);
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
      tryRotate();
      break;
    case ' ':
      hardDrop();
      break;
    default:
      return;
  }
  e.preventDefault();
  draw();
});

function loadTheme() {
  const css = getComputedStyle(document.documentElement);
  const read = (name) => css.getPropertyValue(name).trim();
  theme = {
    boardBg: read('--board-bg'),
    grid: read('--grid'),
    cellOutline: read('--cell-outline'),
  };
  const isDark = document.documentElement.dataset.theme === 'dark';
  themeToggle.textContent = isDark ? 'Light mode' : 'Dark mode';
}

themeToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
  loadTheme();
  draw();
  themeToggle.blur();
});

loadTheme();
board = createBoard();
draw();
