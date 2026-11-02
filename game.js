const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreValue = document.getElementById('scoreValue');
const lineValue = document.getElementById('lineValue');
const levelValue = document.getElementById('levelValue');
const speedValue = document.getElementById('speedValue');
const goalText = document.getElementById('goalText');
const goalFill = document.getElementById('goalFill');
const statusText = document.getElementById('statusText');
const restartBtn = document.getElementById('restartBtn');
const pauseBtn = document.getElementById('pauseBtn');

// The playfield is a real voxel volume: x = left/right, z = near/far, y = height.
const BOARD_W = 8;
const BOARD_D = 6;
const BOARD_H = 12;
const GOAL_TARGET = 100;
const CELL_W = 44;
const CELL_H = 22;
const CELL_V = 28;
const COLORS = {
  I: '#5cc7ff', O: '#f7d66b', T: '#d290ff', S: '#7bdcb5',
  Z: '#ef6f6c', J: '#7aa2ff', L: '#ffb857'
};
const SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]]
};
const TYPES = Object.keys(SHAPES);
const SPACE_SHAPES = [
  [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }],
  [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 1, y: 1, z: 1 }],
  [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 1 }]
];

function emptyBoard() {
  return Array.from({ length: BOARD_H }, () =>
    Array.from({ length: BOARD_D }, () => Array(BOARD_W).fill(null))
  );
}
function fromMatrix(matrix) {
  const cells = [];
  matrix.forEach((row, r) => row.forEach((filled, x) => {
    if (filled) cells.push({ x, y: matrix.length - 1 - r, z: 0 });
  }));
  return cells;
}
function normalize(cells) {
  const minX = Math.min(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  const minZ = Math.min(...cells.map((c) => c.z));
  return cells.map((c) => ({ x: c.x - minX, y: c.y - minY, z: c.z - minZ }));
}
function makePiece(type) {
  // Mix in true 3-axis polycubes so some pieces occupy multiple depth layers.
  const cells = Math.random() < 0.3
    ? SPACE_SHAPES[Math.floor(Math.random() * SPACE_SHAPES.length)].map((cell) => ({ ...cell }))
    : fromMatrix(SHAPES[type]);
  return {
    type, cells, color: COLORS[type],
    x: Math.floor((BOARD_W - (Math.max(...cells.map((c) => c.x)) + 1)) / 2),
    y: BOARD_H - (Math.max(...cells.map((c) => c.y)) + 1),
    z: Math.floor((BOARD_D - 1) / 2)
  };
}
function randomType() { return TYPES[Math.floor(Math.random() * TYPES.length)]; }

let board = emptyBoard();
let current = null;
let nextType = randomType();
let score = 0;
let lines = 0;
let level = 1;
let dropInterval = 800;
let lastTime = 0;
let accumulator = 0;
let paused = false;
let gameOver = false;
let placedBlocks = 0;

function collides(piece, dx = 0, dy = 0, dz = 0, cells = piece.cells) {
  return cells.some((cell) => {
    const x = piece.x + cell.x + dx;
    const y = piece.y + cell.y + dy;
    const z = piece.z + cell.z + dz;
    if (x < 0 || x >= BOARD_W || z < 0 || z >= BOARD_D || y < 0) return true;
    return y < BOARD_H && Boolean(board[y][z][x]);
  });
}
function spawnPiece() {
  current = makePiece(nextType);
  nextType = randomType();
  if (collides(current)) endGame('The voxel tower reached the top. Press restart to build again.');
}
function endGame(message) {
  gameOver = true;
  paused = true;
  statusText.textContent = message;
}
function clearLayers() {
  let cleared = 0;
  for (let y = 0; y < BOARD_H; y++) {
    if (board[y].every((layer) => layer.every(Boolean))) {
      board.splice(y, 1);
      board.push(Array.from({ length: BOARD_D }, () => Array(BOARD_W).fill(null)));
      cleared++;
      y--;
    }
  }
  return cleared;
}
function lockPiece() {
  if (!current) return;
  for (const cell of current.cells) {
    const x = current.x + cell.x;
    const y = current.y + cell.y;
    const z = current.z + cell.z;
    if (y >= BOARD_H) {
      endGame('The voxel tower reached the top. Press restart to build again.');
      return;
    }
    board[y][z][x] = current.type;
    placedBlocks++;
  }
  const cleared = clearLayers();
  score += cleared * 100 * level;
  lines += cleared;
  level = 1 + Math.floor(lines / 4);
  dropInterval = Math.max(130, 800 - (level - 1) * 65);
  updateHud();
  if (placedBlocks >= GOAL_TARGET) {
    endGame('House complete! Your voxel cabin is ready. Press restart to build another.');
    return;
  }
  spawnPiece();
}
function move(dx, dy, dz) {
  if (!current || paused || gameOver) return false;
  if (collides(current, dx, dy, dz)) return false;
  current.x += dx;
  current.y += dy;
  current.z += dz;
  return true;
}
function dropOne() {
  if (!move(0, -1, 0)) lockPiece();
}
function hardDrop() {
  if (!current || paused || gameOver) return;
  let distance = 0;
  while (!collides(current, 0, -1, 0)) {
    current.y--;
    distance++;
  }
  score += distance * 2;
  lockPiece();
  updateHud();
}
function rotate(axis, direction) {
  if (!current || paused || gameOver) return;
  const rotated = normalize(current.cells.map((c) => {
    if (axis === 'z') return direction > 0
      ? { x: c.y, y: -c.x, z: c.z }
      : { x: -c.y, y: c.x, z: c.z };
    return direction > 0
      ? { x: c.z, y: c.y, z: -c.x }
      : { x: -c.z, y: c.y, z: c.x };
  }));
  // Small wall kicks keep rotations usable at the edges of the 3D well.
  const kicks = axis === 'z'
    ? [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, 1]]
    : [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dx, dz] of kicks) {
    if (!collides(current, dx, 0, dz, rotated)) {
      current.cells = rotated;
      current.x += dx;
      current.z += dz;
      return;
    }
  }
}
function resetGame() {
  board = emptyBoard();
  current = null;
  nextType = randomType();
  score = 0;
  lines = 0;
  level = 1;
  dropInterval = 800;
  lastTime = 0;
  accumulator = 0;
  paused = false;
  gameOver = false;
  placedBlocks = 0;
  statusText.textContent = 'Place blocks in all three dimensions. Every voxel helps build your cabin.';
  spawnPiece();
  updateHud();
}
function updateHud() {
  scoreValue.textContent = String(score);
  lineValue.textContent = String(lines);
  levelValue.textContent = String(level);
  speedValue.textContent = `${(800 / dropInterval).toFixed(1)}x`;
  const progress = Math.min(GOAL_TARGET, placedBlocks);
  goalText.textContent = `${progress} / ${GOAL_TARGET}`;
  goalFill.style.width = `${progress}%`;
}

// Isometric projection shared by the well, falling pieces, and the growing house.
const originX = 380;
const floorY = 520;
function project(x, y, z, size = 1) {
  return {
    x: originX + (x - z) * CELL_W * size / 2,
    y: floorY - y * CELL_V * size + (x + z) * CELL_H * size / 2
  };
}
function polygon(points, fill, stroke = 'rgba(10,25,35,.42)') {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
function drawCube(x, y, z, color, size = 1, alpha = 1) {
  // Grid coordinates mark the cube's bottom; its top face is one voxel higher.
  const p = project(x, y + 1, z, size);
  const w = CELL_W * size / 2;
  const h = CELL_H * size / 2;
  const v = CELL_V * size;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Visible left and right walls, then the top face.
  polygon([{ x: p.x, y: p.y }, { x: p.x, y: p.y + v }, { x: p.x - w, y: p.y + v + h }, { x: p.x - w, y: p.y + h }], shade(color, -28));
  polygon([{ x: p.x, y: p.y }, { x: p.x, y: p.y + v }, { x: p.x + w, y: p.y + v + h }, { x: p.x + w, y: p.y + h }], shade(color, -12));
  polygon([{ x: p.x, y: p.y }, { x: p.x + w, y: p.y + h }, { x: p.x, y: p.y + 2 * h }, { x: p.x - w, y: p.y + h }], shade(color, 18));
  ctx.restore();
}
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (n & 255) + amount));
  return `rgb(${r},${g},${b})`;
}
function drawBackdrop() {
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#78bfe8');
  sky.addColorStop(0.65, '#d7efff');
  sky.addColorStop(1, '#a7d68c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath(); ctx.arc(790, 105, 46, 0, Math.PI * 2); ctx.fill();
  // Distant blocky hills.
  ctx.fillStyle = '#8bc98e';
  ctx.beginPath(); ctx.moveTo(0, 385); ctx.lineTo(120, 280); ctx.lineTo(235, 385); ctx.lineTo(350, 300); ctx.lineTo(500, 400); ctx.lineTo(650, 290); ctx.lineTo(820, 390); ctx.lineTo(960, 310); ctx.lineTo(960, 720); ctx.lineTo(0, 720); ctx.fill();
  ctx.fillStyle = 'rgba(44,91,61,.20)';
  ctx.fillRect(0, 630, 960, 90);
}
function drawWell() {
  // Isometric floor and faint cell grid.
  const a = project(0, 0, 0), b = project(BOARD_W, 0, 0);
  const c = project(BOARD_W, 0, BOARD_D), d = project(0, 0, BOARD_D);
  polygon([a, b, c, d], 'rgba(25,57,65,.58)', 'rgba(255,255,255,.55)');
  ctx.strokeStyle = 'rgba(236,250,255,.24)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= BOARD_W; x++) {
    const p1 = project(x, 0, 0), p2 = project(x, 0, BOARD_D);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  }
  for (let z = 0; z <= BOARD_D; z++) {
    const p1 = project(0, 0, z), p2 = project(BOARD_W, 0, z);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  }
  // Back and side guides outline the height of the volume.
  const top = project(0, BOARD_H, BOARD_D);
  const rightTop = project(BOARD_W, BOARD_H, BOARD_D);
  const farTop = project(BOARD_W, BOARD_H, 0);
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.setLineDash([5, 6]);
  [[d, top], [c, rightTop], [b, farTop], [top, rightTop], [rightTop, farTop]].forEach(([p1, p2]) => {
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  });
  ctx.setLineDash([]);
  // Draw far-to-near so the front voxels naturally overlay the back ones.
  for (let y = 0; y < BOARD_H; y++) {
    for (let sum = 0; sum <= BOARD_W + BOARD_D - 2; sum++) {
      for (let z = 0; z < BOARD_D; z++) {
        const x = sum - z;
        if (x < 0 || x >= BOARD_W || !board[y][z][x]) continue;
        drawCube(x, y, z, COLORS[board[y][z][x]]);
      }
    }
  }
  if (current) current.cells.forEach((cell) => {
    const x = current.x + cell.x, y = current.y + cell.y, z = current.z + cell.z;
    if (y >= 0 && y < BOARD_H) drawCube(x, y, z, current.color, 1, .98);
  });
}
function drawHouse() {
  // Place the decorative cabin beside the playfield in projected voxel coordinates.
  const x = 15, z = 0, size = 1.08;
  const progress = Math.min(1, placedBlocks / GOAL_TARGET);
  ctx.save();
  ctx.translate(0, -185);
  ctx.fillStyle = 'rgba(16,54,54,.16)';
  ctx.beginPath(); ctx.ellipse(730, 737, 120, 28, 0, 0, Math.PI * 2); ctx.fill();
  // Foundation and timber frame appear first.
  const foundation = progress > 0.02;
  const walls = Math.floor(Math.max(0, progress - .12) * 7);
  const roof = progress > .72;
  if (foundation) {
    for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 4; dx++)
      drawCube(x + dx, 0, z + dz, '#9b7049', size);
  }
  for (let levelY = 0; levelY < Math.min(4, walls); levelY++) {
    for (let dx = 0; dx < 4; dx++) {
      for (const dz of [0, 2]) drawCube(x + dx, levelY + 1, z + dz, '#d6a467', size);
    }
    for (const dz of [0, 1, 2]) {
      for (const dx of [0, 3]) drawCube(x + dx, levelY + 1, z + dz, '#c58a51', size);
    }
  }
  if (progress > .42) {
    drawCube(x + 1, 1, z, '#75c9e8', size, .95);
    drawCube(x + 2, 1, z, '#75c9e8', size, .95);
  }
  if (progress > .56) {
    drawCube(x + 1, 1, z + 2, '#75c9e8', size, .95);
    drawCube(x + 2, 1, z + 2, '#75c9e8', size, .95);
  }
  if (progress > .62) drawCube(x + 2, 1, z + 1, '#805332', size);
  if (roof) {
    for (let dx = -1; dx < 5; dx++) {
      for (let dz = -1; dz < 4; dz++) {
        drawCube(x + dx, 5, z + dz, '#bd5149', size);
      }
    }
  }
  ctx.restore();
  ctx.fillStyle = '#234a42';
  ctx.font = '700 19px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('YOUR VOXEL CABIN', 730, 220);
  ctx.font = '600 13px Inter, sans-serif';
  ctx.fillStyle = '#285a50';
  ctx.fillText(`${Math.round(progress * 100)}% BUILT`, 730, 242);
}
function drawScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackdrop();
  // View captions
  ctx.fillStyle = 'rgba(18,55,72,.82)';
  ctx.font = '700 17px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('3D BUILD ZONE', 52, 48);
  drawHouse();
  drawWell();
  if (paused && !gameOver) drawOverlay('PAUSED', 'Press P or Pause to continue');
  if (gameOver) drawOverlay(placedBlocks >= GOAL_TARGET ? 'HOUSE COMPLETE!' : 'BUILD ENDED', 'Press Restart to play again');
}
function drawOverlay(title, subtitle) {
  ctx.fillStyle = 'rgba(8,21,30,.56)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '800 38px Inter, sans-serif';
  ctx.fillText(title, canvas.width / 2, 320);
  ctx.font = '600 17px Inter, sans-serif';
  ctx.fillText(subtitle, canvas.width / 2, 354);
}
function update(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const delta = timestamp - lastTime;
  lastTime = timestamp;
  if (!paused && !gameOver) {
    accumulator += delta;
    if (accumulator >= dropInterval) {
      accumulator %= dropInterval;
      dropOne();
      updateHud();
    }
  }
  drawScene();
  requestAnimationFrame(update);
}
function togglePause() {
  if (gameOver) return;
  paused = !paused;
  statusText.textContent = paused ? 'Paused. Press P or Pause when you are ready.' : 'Back to building!';
}
function keyHandler(event) {
  const key = event.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(key)) event.preventDefault();
  if (event.repeat && key !== 'arrowleft' && key !== 'arrowright') return;
  if (key === 'p') { togglePause(); return; }
  if (gameOver) { if (key === 'r') resetGame(); return; }
  if (paused) return;
  if (key === 'arrowleft' || key === 'a') move(-1, 0, 0);
  else if (key === 'arrowright' || key === 'd') move(1, 0, 0);
  else if (key === 'w') move(0, 0, -1);
  else if (key === 's') move(0, 0, 1);
  else if (key === 'arrowdown') dropOne();
  else if (key === ' ' || key === 'spacebar') hardDrop();
  else if (key === 'q') rotate('z', -1);
  else if (key === 'e') rotate('z', 1);
  else if (key === 'f') rotate('y', -1);
  else if (key === 'g') rotate('y', 1);
  else if (key === 'r') resetGame();
  updateHud();
}
window.addEventListener('keydown', keyHandler);
restartBtn.addEventListener('click', resetGame);
pauseBtn.addEventListener('click', togglePause);
document.querySelectorAll('.touch-controls [data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    if (paused || gameOver) return;
    switch (button.dataset.action) {
      case 'left': move(-1, 0, 0); break;
      case 'right': move(1, 0, 0); break;
      case 'near': move(0, 0, -1); break;
      case 'far': move(0, 0, 1); break;
      case 'rotate-left': rotate('z', -1); break;
      case 'rotate-right': rotate('z', 1); break;
      case 'drop': dropOne(); break;
      case 'hard-drop': hardDrop(); break;
    }
    updateHud();
  });
});
resetGame();
requestAnimationFrame(update);
