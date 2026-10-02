(() => {
    "use strict";

    const canvas = document.getElementById("game-canvas");
    const ctx = canvas.getContext("2d");
    const scoreEl = document.getElementById("score");
    const highScoreEl = document.getElementById("high-score");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayText = document.getElementById("overlay-text");
    const startBtn = document.getElementById("start-btn");

    const COLS = 20;
    const ROWS = 20;
    const BASE_SPEED = 160; // ms per step
    const MIN_SPEED = 60;
    const SPEED_STEP = 4;

    let cellSize = 0;
    let snake = [];
    let dir = { x: 1, y: 0 };
    let nextDir = { x: 1, y: 0 };
    let food = { x: 10, y: 10 };
    let score = 0;
    let highScore = parseInt(localStorage.getItem("snakeHighScore") || "0", 10);
    let speed = BASE_SPEED;
    let running = false;
    let paused = false;
    let lastTime = 0;
    let accumulator = 0;
    let rafId = null;
    let particles = [];

    highScoreEl.textContent = highScore;

    // ---- Canvas sizing (HiDPI) ----
    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cellSize = rect.width / COLS;
    }

    window.addEventListener("resize", () => {
        resizeCanvas();
        draw();
    });

    // ---- Game state helpers ----
    function resetGame() {
        const cy = Math.floor(ROWS / 2);
        snake = [
            { x: 8, y: cy },
            { x: 7, y: cy },
            { x: 6, y: cy },
        ];
        dir = { x: 1, y: 0 };
        nextDir = { x: 1, y: 0 };
        score = 0;
        speed = BASE_SPEED;
        particles = [];
        placeFood();
        updateScore();
    }

    function placeFood() {
        while (true) {
            const f = {
                x: Math.floor(Math.random() * COLS),
                y: Math.floor(Math.random() * ROWS),
            };
            if (!snake.some((s) => s.x === f.x && s.y === f.y)) {
                food = f;
                return;
            }
        }
    }

    function updateScore() {
        scoreEl.textContent = score;
        if (score > highScore) {
            highScore = score;
            localStorage.setItem("snakeHighScore", String(highScore));
            highScoreEl.textContent = highScore;
        }
    }

    // ---- Input ----
    function setDirection(x, y) {
        // Prevent reversing into self
        if (x === -dir.x && y === -dir.y) return;
        nextDir = { x, y };
    }

    const keyMap = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        w: [0, -1],
        s: [0, 1],
        a: [-1, 0],
        d: [1, 0],
        W: [0, -1],
        S: [0, 1],
        A: [-1, 0],
        D: [1, 0],
    };

    document.addEventListener("keydown", (e) => {
        if (e.key === " " || e.code === "Space") {
            e.preventDefault();
            if (running && !paused) togglePause();
            return;
        }
        const m = keyMap[e.key];
        if (m) {
            e.preventDefault();
            if (!running) {
                startGame();
            }
            if (running && !paused) setDirection(m[0], m[1]);
        }
    });

    const dirMap = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    document.querySelectorAll(".ctrl-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const d = dirMap[btn.dataset.dir];
            if (!running) startGame();
            if (running && !paused) setDirection(d[0], d[1]);
        });
    });

    startBtn.addEventListener("click", startGame);

    // ---- Core loop ----
    function loop(time) {
        rafId = requestAnimationFrame(loop);
        if (!running || paused) {
            lastTime = time;
            return;
        }
        if (!lastTime) lastTime = time;
        const delta = time - lastTime;
        lastTime = time;
        accumulator += delta;

        while (accumulator >= speed) {
            accumulator -= speed;
            step();
            if (!running) break;
        }

        draw();
        updateParticles(delta);
    }

    function step() {
        dir = nextDir;
        const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

        // Wall collision
        if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
            return gameOver();
        }
        // Self collision
        if (snake.some((s) => s.x === head.x && s.y === head.y)) {
            return gameOver();
        }

        snake.unshift(head);

        if (head.x === food.x && head.y === food.y) {
            score++;
            speed = Math.max(MIN_SPEED, BASE_SPEED - score * SPEED_STEP);
            spawnParticles(head.x, head.y);
            placeFood();
            updateScore();
        } else {
            snake.pop();
        }
    }

    function gameOver() {
        running = false;
        overlayTitle.textContent = "Игра окончена!";
        overlayText.textContent = `Твой счёт: ${score}`;
        startBtn.textContent = "Ещё раз";
        overlay.classList.add("visible");
    }

    function startGame() {
        resetGame();
        running = true;
        paused = false;
        lastTime = 0;
        accumulator = 0;
        overlay.classList.remove("visible");
    }

    function togglePause() {
        paused = !paused;
        if (paused) {
            overlayTitle.textContent = "Пауза";
            overlayText.textContent = "Нажми пробел, чтобы продолжить";
            startBtn.textContent = "Продолжить";
            overlay.classList.add("visible");
        } else {
            overlay.classList.remove("visible");
            lastTime = 0;
        }
    }

    // ---- Particles ----
    function spawnParticles(cx, cy) {
        const px = (cx + 0.5) * cellSize;
        const py = (cy + 0.5) * cellSize;
        for (let i = 0; i < 14; i++) {
            const angle = Math.random() * Math.PI * 2;
            const sp = 1 + Math.random() * 3;
            particles.push({
                x: px,
                y: py,
                vx: Math.cos(angle) * sp,
                vy: Math.sin(angle) * sp,
                life: 1,
                size: 2 + Math.random() * 3,
            });
        }
    }

    function updateParticles(delta) {
        if (particles.length === 0) return;
        const dt = delta / 16;
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= 0.03 * dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    // ---- Drawing ----
    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function draw() {
        const w = canvas.width / (window.devicePixelRatio || 1);
        const h = canvas.height / (window.devicePixelRatio || 1);
        ctx.clearRect(0, 0, w, h);

        // Grid
        ctx.strokeStyle = "rgba(74, 222, 128, 0.06)";
        ctx.lineWidth = 1;
        for (let i = 1; i < COLS; i++) {
            const p = i * cellSize;
            ctx.beginPath();
            ctx.moveTo(p, 0);
            ctx.lineTo(p, h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, p);
            ctx.lineTo(w, p);
            ctx.stroke();
        }

        // Food (glowing apple)
        const fx = (food.x + 0.5) * cellSize;
        const fy = (food.y + 0.5) * cellSize;
        ctx.save();
        ctx.shadowColor = "#f87171";
        ctx.shadowBlur = 16;
        ctx.fillStyle = "#f87171";
        ctx.beginPath();
        ctx.arc(fx, fy, cellSize * 0.38, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // leaf
        ctx.fillStyle = "#4ade80";
        ctx.beginPath();
        ctx.ellipse(fx + cellSize * 0.12, fy - cellSize * 0.34, cellSize * 0.12, cellSize * 0.06, -0.6, 0, Math.PI * 2);
        ctx.fill();

        // Snake
        for (let i = snake.length - 1; i >= 0; i--) {
            const seg = snake[i];
            const x = seg.x * cellSize;
            const y = seg.y * cellSize;
            const isHead = i === 0;

            ctx.save();
            if (isHead) {
                ctx.shadowColor = "#4ade80";
                ctx.shadowBlur = 18;
                ctx.fillStyle = "#4ade80";
            } else {
                // gradient fade toward tail
                const t = i / snake.length;
                ctx.fillStyle = `rgba(${34 - t * 10}, ${197 - t * 90}, ${94 - t * 40}, ${1 - t * 0.4})`;
            }
            const pad = cellSize * 0.08;
            roundRect(x + pad, y + pad, cellSize - pad * 2, cellSize - pad * 2, cellSize * 0.3);
            ctx.fill();
            ctx.restore();

            if (isHead) {
                // eyes
                ctx.fillStyle = "#052e16";
                const ex = cellSize * 0.5;
                const ey = cellSize * 0.5;
                const off = cellSize * 0.18;
                let e1, e2;
                if (dir.x === 1) { e1 = [x + ex + off, y + ey - off]; e2 = [x + ex + off, y + ey + off]; }
                else if (dir.x === -1) { e1 = [x + ex - off, y + ey - off]; e2 = [x + ex - off, y + ey + off]; }
                else if (dir.y === -1) { e1 = [x + ex - off, y + ey - off]; e2 = [x + ex + off, y + ey - off]; }
                else { e1 = [x + ex - off, y + ey + off]; e2 = [x + ex + off, y + ey + off]; }
                ctx.beginPath(); ctx.arc(e1[0], e1[1], cellSize * 0.09, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(e2[0], e2[1], cellSize * 0.09, 0, Math.PI * 2); ctx.fill();
            }
        }

        // Particles
        for (const p of particles) {
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = "#fbbf24";
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ---- Init ----
    function init() {
        resizeCanvas();
        resetGame();
        draw();
        rafId = requestAnimationFrame(loop);
    }

    init();
})();
