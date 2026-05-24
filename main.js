import { player, enemy, keys, projectiles, particles, resourceConfig, gameState } from './config.js';
import { getCurrentSpeed, updateAI, updateEffects, initStartScreen, toggleSidebar, popElement, injectElement, manualFire, triggerEffect, addLog } from './logic.js';

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// 綁定鍵盤事件
window.addEventListener("keydown", e => { 
    let key = e.key.toLowerCase();
    if(key in keys) keys[key] = true; 
    
    if (gameState.isGameStarted && gameState.keyMap[key]) {
        injectElement(gameState.keyMap[key]);
    }
    
    if(key === 'enter') manualFire(player);
    if(key === 'backspace') popElement();
});

window.addEventListener("keyup", e => { 
    let key = e.key.toLowerCase();
    if(key in keys) keys[key] = false; 
});

function update() {
    if (player.hp > 0) {
        let speed = getCurrentSpeed(player); 
        document.getElementById("player-text").innerText = `HP: ${player.hp} | 移速: ${getCurrentSpeed(player).toFixed(1)}`;
        document.getElementById("enemy-text").innerText = `HP: ${enemy.hp} | 移速: ${getCurrentSpeed(enemy).toFixed(1)}`;
        
        if (keys.w) player.y -= speed;
        if (keys.s) player.y += speed;
        if (keys.a) player.x -= speed;
        if (keys.d) player.x += speed;

        player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
        player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));
    }

    let now = Date.now();
    ["Br", "H", "O", "Al"].forEach(el => {
        let config = resourceConfig[el];
        if (now - config.lastUpdate >= config.cd) {
            config.lastUpdate = now;
            if (player.storage[el] < config.max) player.storage[el]++;
            if (enemy.storage[el] < config.max) enemy.storage[el]++;
        }
        
        let btn = document.getElementById(`btn-${el}`);
        if (btn) {
            let maxStr = config.max === Infinity ? "∞" : config.max;
            let elName = el === 'Br' ? '溴' : el === 'H' ? '氫' : el === 'Al' ? '鋁' : '氧';
            let boundKey = Object.keys(gameState.keyMap).find(k => gameState.keyMap[k] === el) || "?";
            btn.innerHTML = `${elName} (${el})<br>[${boundKey}] [${player.storage[el]}/${maxStr}]`;
        }
    });

    updateAI();
    updateEffects();

    for (let i = projectiles.length - 1; i >= 0; i--) {
        let p = projectiles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
            projectiles.splice(i, 1);
            continue;
        }

        let target = (p.owner === player) ? enemy : player;
        let dx = p.x - target.x;
        let dy = p.y - target.y;
        let dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < p.radius + target.radius) {
            if (target.hp > 0) triggerEffect(p, target);
            projectiles.splice(i, 1);
        }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        let pt = particles[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.alpha -= 0.02;
        if (pt.alpha <= 0) particles.splice(i, 1);
    }

    document.getElementById("player-hp").style.width = player.hp + "%";
    document.getElementById("enemy-hp").style.width = enemy.hp + "%";
    document.getElementById("player-shield").innerText = player.shield ? "氧化鋁盾 (有)" : "無";
    document.getElementById("enemy-shield").innerText = enemy.shield ? "氧化鋁盾 (有)" : "無";
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(pt => {
        ctx.save();
        ctx.globalAlpha = pt.alpha;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    if (player.hp > 0) {
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
        ctx.fillStyle = player.color;
        ctx.fill();
        ctx.closePath();
        
        if(player.shield) {
            ctx.beginPath();
            ctx.arc(player.x, player.y, player.radius + 5, 0, Math.PI * 2);
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    if (enemy.hp > 0) {
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fillStyle = enemy.color;
        ctx.fill();
        ctx.closePath();

        if(enemy.shield) {
            ctx.beginPath();
            ctx.arc(enemy.x, enemy.y, enemy.radius + 5, 0, Math.PI * 2);
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    projectiles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.closePath();
        ctx.shadowBlur = 0; 
    });
}

export function gameLoop() {
    if (gameState.isGameOver) return; 
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

export function startGame() {
    document.getElementById('start-overlay').style.display = 'none';
    const indexToKey = ['7', '8', '9', '4', '5', '6', '1', '2', '3'];
    const numpad = document.querySelector('.numpad-grid');
    numpad.innerHTML = ''; 
    gameState.keyMap = {};

    for (let i = 0; i < 9; i++) {
        let el = gameState.gridState[i];
        let key = indexToKey[i];

        if (el) {
            let btn = document.createElement('button');
            btn.id = `btn-${el}`;
            
            if(el==='Br') { btn.style.background = '#8b4513'; btn.style.color = 'white'; }
            if(el==='H') { btn.style.background = '#add8e6'; btn.style.color = 'black'; }
            if(el==='O') { btn.style.background = '#ff4500'; btn.style.color = 'white'; }
            if(el==='Al') { btn.style.background = '#a9a9a9'; btn.style.color = 'black'; }

            let elName = el === 'Br' ? '溴' : el === 'H' ? '氫' : el === 'Al' ? '鋁' : '氧';
            let maxStr = resourceConfig[el].max === Infinity ? "∞" : resourceConfig[el].max;

            btn.innerHTML = `${elName} (${el})<br>[${key}] [0/${maxStr}]`;
            btn.onclick = () => injectElement(el);

            numpad.appendChild(btn);
            gameState.keyMap[key] = el;
        } else {
            let btn = document.createElement('button');
            btn.disabled = true;
            btn.className = 'empty-btn';
            btn.setAttribute('aria-hidden', 'true');
            numpad.appendChild(btn);
        }
    }
    gameState.isGameStarted = true;
    gameLoop(); 
}

// 💥 解決跨域孤島效應：將模組內的函數強制綁定到全域 window 上
window.startGame = startGame;
window.toggleSidebar = toggleSidebar;
window.popElement = popElement;

// === 系統初始化點火 ===
addLog("🧪 歡迎來到元素煉金對戰！請用 WASD 控制移動，點擊按鈕調配你的化學武器。");
initStartScreen();