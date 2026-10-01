// Хуетрис: базовая логика игры
const COLS = 10;
const ROWS = 20;
const BLOCK = 30; // размер клетки в px (совпадает с canvas 300x600)

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas.getContext("2d");

// DOM-элементы
const scoreEl = document.getElementById("score");
const highScoreEl = document.getElementById("highScore");
const linesEl = document.getElementById("lines");
const levelEl = document.getElementById("level");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");

// Фигуры (координаты клеток) + цвет
const PIECES = [
    { shape: [[1, 1, 1, 1]], color: "#2ec4b6" }, // I
    { shape: [[1, 1], [1, 1]], color: "#ffd166" }, // O
    { shape: [[0, 1, 0], [1, 1, 1]], color: "#5b8cff" }, // T
    { shape: [[1, 1, 0], [0, 1, 1]], color: "#ef476f" }, // S
    { shape: [[0, 1, 1], [1, 1, 0]], color: "#06d6a0" }, // Z
    { shape: [[1, 0, 0], [1, 1, 1]], color: "#ff9f1c" }, // J
    { shape: [[0, 0, 1], [1, 1, 1]], color: "#c77dff" } // L
];

// Состояние игры
let board = [];
let currentPiece = null;
let nextPiece = null;
let score = 0;
let highScore = 0;
let lines = 0;
let level = 1;
let dropInterval = 800; // мс
let lastDrop = 0;
let dropCounter = 0;
let gameRunning = false;
let paused = false;
let animationId = null;

// Создание пустого поля
function createBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

// Случайная фигура
function randomPiece() {
    const p = PIECES[Math.floor(Math.random() * PIECES.length)];
    return {
        shape: p.shape.map((row) => row.slice()),
        color: p.color,
        x: Math.floor(COLS / 2) - Math.floor(p.shape[0].length / 2),
        y: 0
    };
}

// Проверка столкновения
function collision(piece) {
    for (let r = 0; r < piece.shape.length; r++) {
        for (let c = 0; c < piece.shape[r].length; c++) {
            if (!piece.shape[r][c]) continue;
            const x = piece.x + c;
            const y = piece.y + r;
            if (x < 0 || x >= COLS || y >= ROWS) return true;
            if (y >= 0 && board[y][x]) return true;
        }
    }
    return false;
}

// Закрепление фигуры на поле
function merge() {
    currentPiece.shape.forEach((row, r) => {
        row.forEach((val, c) => {
            if (val) {
                const y = currentPiece.y + r;
                const x = currentPiece.x + c;
                if (y >= 0) board[y][x] = currentPiece.color;
            }
        });
    });
}

// Поворот фигуры
function rotate() {
    if (!gameRunning || paused) return;
    const rotated = currentPiece.shape[0].map((_, i) =>
        currentPiece.shape.map((row) => row[i]).reverse()
    );
    const prev = currentPiece.shape;
    currentPiece.shape = rotated;

    // Простая проверка столкновения с откатом (wall kick)
    if (collision(currentPiece)) {
        currentPiece.x++;
        if (collision(currentPiece)) {
            currentPiece.x -= 2;
            if (collision(currentPiece)) {
                currentPiece.shape = prev;
                return;
            }
        }
    }
}

// Опускание на одну клетку
function drop() {
    currentPiece.y++;
    if (collision(currentPiece)) {
        currentPiece.y--;
        merge();
        clearLines();
        spawnPiece();
        if (collision(currentPiece)) {
            endGame();
        }
    }
    dropCounter = 0;
}

// Удаление заполненных линий
function clearLines() {
    let cleared = 0;
    outer: for (let r = ROWS - 1; r >= 0; r--) {
        for (let c = 0; c < COLS; c++) {
            if (!board[r][c]) continue outer;
        }
        board.splice(r, 1);
        board.unshift(Array(COLS).fill(0));
        cleared++;
    }
    if (cleared > 0) {
        const points = [0, 100, 300, 500, 800][cleared] * level;
        score += points;
        lines += cleared;
        level = Math.floor(lines / 10) + 1;
        dropInterval = Math.max(100, 800 - (level - 1) * 70);
        updateScore();
    }
}

// Создание новой фигуры
function spawnPiece() {
    currentPiece = nextPiece || randomPiece();
    nextPiece = randomPiece();
    drawNext();
}

// Обновление счётчиков в интерфейсе
function updateScore() {
    scoreEl.textContent = score;
    linesEl.textContent = lines;
    levelEl.textContent = level;
    if (score > highScore) {
        highScore = score;
        highScoreEl.textContent = highScore;
    }
}

// Отрисовка клетки
function drawCell(context, x, y, color, size) {
    context.fillStyle = color;
    context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    // лёгкий блик
    context.fillStyle = "rgba(255,255,255,0.18)";
    context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
}

// Отрисовка поля и текущей фигуры
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Сетка
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    for (let c = 0; c <= COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(c * BLOCK, 0);
        ctx.lineTo(c * BLOCK, canvas.height);
        ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * BLOCK);
        ctx.lineTo(canvas.width, r * BLOCK);
        ctx.stroke();
    }

    // Закреплённые блоки
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c]) drawCell(ctx, c, r, board[r][c], BLOCK);
        }
    }

    if (currentPiece) {
        // «Призрак» — тень места падения
        const ghost = { ...currentPiece, y: currentPiece.y };
        while (!collision({ ...ghost, y: ghost.y + 1 })) ghost.y++;
        ctx.globalAlpha = 0.25;
        ghost.shape.forEach((row, r) =>
            row.forEach((val, c) => {
                if (val) drawCell(ctx, ghost.x + c, ghost.y + r, currentPiece.color, BLOCK);
            })
        );
        ctx.globalAlpha = 1;

        // Текущая фигура
        currentPiece.shape.forEach((row, r) =>
            row.forEach((val, c) => {
                if (val) drawCell(ctx, currentPiece.x + c, currentPiece.y + r, currentPiece.color, BLOCK);
            })
        );
    }
}

// Отрисовка следующей фигуры
function drawNext() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (!nextPiece) return;
    const size = 24;
    const shape = nextPiece.shape;
    const w = shape[0].length * size;
    const h = shape.length * size;
    const offX = (nextCanvas.width - w) / 2;
    const offY = (nextCanvas.height - h) / 2;
    nextCtx.save();
    nextCtx.translate(offX, offY);
    shape.forEach((row, r) =>
        row.forEach((val, c) => {
            if (val) drawCell(nextCtx, c, r, nextPiece.color, size);
        })
    );
    nextCtx.restore();
}

// Игровой цикл
function update(time = 0) {
    if (!gameRunning) return;
    if (paused) {
        animationId = requestAnimationFrame(update);
        return;
    }
    dropCounter += time - lastDrop;
    lastDrop = time;
    if (dropCounter > dropInterval) {
        drop();
        dropCounter = 0;
    }
    draw();
    animationId = requestAnimationFrame(update);
}

// Старт / рестарт
function startGame() {
    board = createBoard();
    score = 0;
    lines = 0;
    level = 1;
    dropInterval = 800;
    dropCounter = 0;
    lastDrop = performance.now();
    paused = false;
    gameRunning = true;
    updateScore();
    nextPiece = null;
    spawnPiece();
    overlay.classList.add("hidden");
    if (animationId) cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(update);
}

// Пауза
function togglePause() {
    if (!gameRunning) return;
    paused = !paused;
    if (paused) {
        showOverlay("Пауза", "Нажмите «Пауза» для продолжения");
    } else {
        overlay.classList.add("hidden");
        lastDrop = performance.now();
    }
}

// Конец игры
function endGame() {
    gameRunning = false;
    paused = false;
    if (animationId) cancelAnimationFrame(animationId);
    showOverlay("Игра окончена", `Счёт: ${score} · Рекорд: ${highScore}`);
}

// Оверлей
function showOverlay(title, text) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlay.classList.remove("hidden");
}

// Движение фигурой влево/вправо
function move(dir) {
    if (!gameRunning || paused) return;
    currentPiece.x += dir;
    if (collision(currentPiece)) {
        currentPiece.x -= dir;
    }
}

// Ускоренное падение
function softDrop() {
    if (!gameRunning || paused) return;
    drop();
    score += 1;
    updateScore();
}

// Обработка клавиш
document.addEventListener("keydown", (e) => {
    if (e.key === "p" || e.key === "P" || e.key === "з" || e.key === "З") {
        togglePause();
        return;
    }
    if (!gameRunning || paused) return;
    switch (e.key) {
        case "ArrowLeft":
            e.preventDefault();
            move(-1);
            break;
        case "ArrowRight":
            e.preventDefault();
            move(1);
            break;
        case "ArrowUp":
            e.preventDefault();
            rotate();
            break;
        case "ArrowDown":
            e.preventDefault();
            softDrop();
            break;
    }
});

startBtn.addEventListener("click", startGame);
pauseBtn.addEventListener("click", togglePause);

// Инициализация (рисует пустое поле и экран старта)
board = createBoard();
draw();
