const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const NEXT_BLOCK = 24;

const COLORS = {
  I: '#00f0f0',
  O: '#f0f000',
  T: '#a000f0',
  S: '#00f000',
  Z: '#f00000',
  J: '#0000f0',
  L: '#f0a000',
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
const CLEAR_DURATION = 400;
const PARTICLES_PER_CELL = 4;
const PARTICLE_GRAVITY = 0.0015;

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
    board[y].forEach((type, x) => spawnParticles(x, y, COLORS[type]));
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

function spawnParticles(cellX, cellY, color) {
  for (let i = 0; i < PARTICLES_PER_CELL; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.05 + Math.random() * 0.25;
    const life = 500 + Math.random() * 500;
    particles.push({
      x: (cellX + Math.random()) * BLOCK,
      y: (cellY + Math.random()) * BLOCK,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.2,
      size: 3 + Math.random() * 4,
      life,
      maxLife: life,
      color,
    });
  }
}

function updateParticles(delta) {
  particles.forEach((p) => {
    p.vy += PARTICLE_GRAVITY * delta;
    p.x += p.vx * delta;
    p.y += p.vy * delta;
    p.life -= delta;
  });
  particles = particles.filter((p) => p.life > 0);
}

function drawParticles() {
  particles.forEach((p) => {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  });
  ctx.globalAlpha = 1;
}

function drawClearingRows() {
  const progress = Math.min(1, (performance.now() - clearing.start) / CLEAR_DURATION);
  const flash = Math.floor(progress * 6) % 2 === 0;
  const width = COLS * BLOCK * (1 - progress);
  const left = (COLS * BLOCK - width) / 2;
  clearing.rows.forEach((y) => {
    ctx.globalAlpha = 1;
    ctx.fillStyle = theme.boardBg;
    ctx.fillRect(0, y * BLOCK, COLS * BLOCK, BLOCK);
    ctx.fillStyle = flash ? theme.flashA : theme.flashB;
    ctx.globalAlpha = 1 - progress * 0.5;
    ctx.fillRect(left, y * BLOCK, width, BLOCK);
  });
  ctx.globalAlpha = 1;
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

  if (clearing) drawClearingRows();
  drawParticles();
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
    flashA: read('--flash-a'),
    flashB: read('--flash-b'),
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
