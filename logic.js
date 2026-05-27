import { activeDict, resourceConfig, player, enemy, projectiles, particles, activeEffects, playerStats, gameState } from './config.js';

const logDiv = document.getElementById("log");
const canvas = document.getElementById("gameCanvas");

export function addLog(msg) {
    logDiv.innerHTML += msg + "<br>";
    logDiv.scrollTop = logDiv.scrollHeight;
}

export function popElement() {
    if (player.queue.length > 0) {
        let removedEl = player.queue.pop(); 
        player.storage[removedEl]++;
        document.getElementById("player-elements").innerText = player.queue.length ? player.queue.join(" + ") : "-";
        
        let config = resourceConfig[removedEl];
        let maxStr = config.max === Infinity ? "∞" : config.max;
        let elName = removedEl === 'Br' ? '溴' : removedEl === 'H' ? '氫' : removedEl === 'Al' ? '鋁' : '氧';
        let boundKey = Object.keys(gameState.keyMap).find(k => gameState.keyMap[k] === removedEl) || "?";
        document.getElementById(`btn-${removedEl}`).innerHTML = `${elName} (${removedEl})<br>[${boundKey}] [${player.storage[removedEl]}/${maxStr}]`;
    }
}

export function injectElement(el) {
    if (player.hp <= 0 || enemy.hp <= 0) return;
    if (player.queue.length >= 3) {
        addLog(`⚠️ 槍膛已滿 3 個元素！請按 Enter 發射！`);
        return;
    }
    if (player.storage[el] > 0) {
        player.storage[el]--;
        player.queue.push(el);
        document.getElementById("player-elements").innerText = player.queue.join(" + ");
    } else {
        addLog(`❌ 元素 ${el} 還在冷卻中！`);
    }
}

export function manualFire(entity) {
    if (entity.queue.length === 0) return; 
    let q = entity.queue;
    let reactionData = null;

    if (q.length === 3) {
        let hCount = q.filter(x => x === 'H').length;
        let oCount = q.filter(x => x === 'O').length;
        let alCount = q.filter(x => x === 'Al').length;
        if (hCount === 2 && oCount === 1) reactionData = { name: "爆鳴水", type: "explosion_water" }; 
        else if (hCount === 1 && oCount === 1 && alCount === 1) reactionData = { name: "氫氧化鋁", type: "buff_debuff" }; 
    } 
    
    if (!reactionData && q.length >= 2) {
        let pair = [...q].slice(-2).sort().join("");
        if (pair === "AlBr") reactionData = { name: "溴化鋁", type: "albr" }; 
        else if (pair === "AlO") reactionData = { name: "氧化鋁", type: "alo" }; 
        else if (pair === "BrH") reactionData = { name: "氫溴酸", type: "hbr" }; 
        else if (pair === "HO") reactionData = { name: "雙氧水", type: "h2o2" }; 
    }

    if (!reactionData) reactionData = { name: "不穩定混雜物", type: "normal" };

    let target = (entity === player) ? enemy : player;
    let isPlayer = (entity === player);

    if (isPlayer) {
        playerStats.fired.total++;
        playerStats.fired.types[reactionData.name] = (playerStats.fired.types[reactionData.name] || 0) + 1;
    }

    if (reactionData.type === "explosion_water") {
        addLog(`💦 ${isPlayer ? '【玩家】' : '【電腦】'} 啟動了 爆鳴水！(全域瞬發)`);
        if (isPlayer) {
            playerStats.hit.total++;
            playerStats.hit.types[reactionData.name] = (playerStats.hit.types[reactionData.name] || 0) + 1;
        }
        activeEffects.push({ target: entity, type: "water_hot", tick: 0, maxTick: 2, effectValue: 5, lastTime: Date.now(), isBuff: true });
        activeEffects.push({ target: target, source: entity, type: "water_slow", tick: 0, maxTick: 2, effectValue: 0, lastTime: Date.now(), isBuff: false });
        createExplosion(entity.x, entity.y, "#00ffff", 25);
    } else {
        launchProjectile(entity, reactionData);
    }

    if (reactionData.type === "albr") {
        addLog(`⚠️ ${isPlayer ? '【玩家】' : '【電腦】'} 因合成溴化鋁，自身陷入移速衰減。`);
        activeEffects.push({ target: entity, type: "self_slow", tick: 0, maxTick: 3, effectValue: 0, lastTime: Date.now(), isBuff: false });
    }

    entity.queue = [];
    if (isPlayer) document.getElementById("player-elements").innerText = "-";
}

export function launchProjectile(owner, reaction) {
    let target = (owner === player) ? enemy : player;
    let angle = Math.atan2(target.y - owner.y, target.x - owner.x);
    
    projectiles.push({
        x: owner.x, y: owner.y,
        vx: Math.cos(angle) * 5, vy: Math.sin(angle) * 5,
        owner: owner, reaction: reaction, radius: 8,
        color: getReactionColor(reaction.type)
    });
    addLog(`${owner === player ? '【玩家】' : '【電腦】'} 成功合成了 <span style="color:${getReactionColor(reaction.type)}">${reaction.name}</span> 彈並發射！`);
}

export function getReactionColor(type) {
    switch(type) {
        case "albr": return "#d2691e";
        case "explosion_water": return "#00ffff";
        case "alo": return "#ffffff";
        case "hbr": return "#ff00ff";
        case "h2o2": return "#e0eee0";
        case "buff_debuff": return "#98fb98";
        default: return "#ffff00";
    }
}

export function triggerEffect(proj, target) {
    let isTargetPlayer = (target === player);
    let owner = proj.owner;
    let type = proj.reaction.type;

    if (owner === player) {
        playerStats.hit.total++;
        playerStats.hit.types[proj.reaction.name] = (playerStats.hit.types[proj.reaction.name] || 0) + 1;
    }

    if (target.shield && type !== "normal") {
        target.shield = false;
        addLog(`${isTargetPlayer ? '【玩家】' : '【電腦】'} 的【氧化鋁盾】抵擋了本次化學傷害與效果！`);
        if (isTargetPlayer) {
            let blockedBaseDmg = (type === "albr" ? 5 : (type === "alo" ? 1 : 5));
            playerStats.tanked += blockedBaseDmg;
        }
        createExplosion(target.x, target.y, "#fff", 15);
        return;
    }

    switch(type) {
        case "albr": 
            damageEntity(target, 5, owner);
            let hasWater = activeEffects.some(e => e.target === target && e.type === "water_hot");
            if (hasWater) {
                damageEntity(target, 20, owner);
                addLog(`💥 連鎖反應！溴化鋁 接觸到 水，發生劇烈爆炸！ ${isTargetPlayer?'玩家':'電腦'} -20 生命！`);
                createExplosion(target.x, target.y, "#ff4500", 30);
            }
            break;
        case "alo": 
            damageEntity(target, 1, owner); 
            owner.shield = true; 
            addLog(`${owner === player ? '【玩家】' : '【電腦】'} 獲得【氧化鋁護盾】，並對敵方造成 1 點微量傷害。`);
            break;
        case "hbr": 
            activeEffects.push({ target: target, source: owner, type: "hbr_dot", tick: 0, maxTick: 5, effectValue: -3, lastTime: Date.now(), isBuff: false });
            break;
        case "h2o2": 
            activeEffects.push({ target: target, source: owner, type: "h2o2_dot", tick: 0, maxTick: 2, effectValue: -2, lastTime: Date.now(), isBuff: false });
            break;
        case "buff_debuff": 
            activeEffects.push({ target: target, source: owner, type: "aloh_dot", tick: 0, maxTick: 3, effectValue: -2, lastTime: Date.now(), isBuff: false });
            break;
        default: 
            damageEntity(target, 1, owner);
            createExplosion(target.x, target.y, "#ffff00", 8);
            break;
    }
}

export function damageEntity(entity, amt, source) {
    let actualDmg = Math.min(entity.hp, amt);
    entity.hp -= actualDmg;
    
    if (source === player && entity === enemy) {
        playerStats.damageDealt += actualDmg;
    }

    if(entity.hp <= 0 && !gameState.isGameOver) {
        gameState.isGameOver = true;
        addLog(`💀 戰鬥結束！ ${entity === player ? '玩家' : '電腦 AI'} 已經倒下！`);
        showGameOverScreen(entity === enemy);
    }
}

export function showGameOverScreen(isVictory) {
    document.getElementById('end-title').innerText = isVictory ? "戰鬥勝利" : "戰鬥敗北";
    document.getElementById('end-title').style.color = isVictory ? "#4caf50" : "#f44336";
    
    let f = playerStats.fired.total;
    let h = playerStats.hit.total;
    let overallRate = f > 0 ? ((h / f) * 100).toFixed(1) : 0;
    let damageTaken = (100 - Math.max(0, player.hp)) + playerStats.healing + playerStats.tanked;

    let html = `
        <div class="stat-line"><span>總發射次數：</span><span class="val">${f} 發</span></div>
        <div class="stat-line"><span>整體命中率：</span><span class="val">${h} / ${f} (${overallRate}%)</span></div>
    `;
    
    if (f > 0) {
        html += `<div style="margin-top: 10px; font-size: 13px; color: #888;">各彈種發射與命中統計：</div>`;
        for (let type in playerStats.fired.types) {
            let tFired = playerStats.fired.types[type];
            let tHit = playerStats.hit.types[type] || 0;
            let tRate = ((tHit / tFired) * 100).toFixed(1);
            html += `<div class="stat-sub-line"><span>${type}</span><span class="val">${tHit}/${tFired} (${tRate}%)</span></div>`;
        }
    }

    html += `
        <div style="margin-top: 15px;"></div>
        <div class="stat-line"><span>造成總傷害：</span><span class="val">${playerStats.damageDealt.toFixed(1)}</span></div>
        <div class="stat-line"><span>獲得總治療：</span><span class="val">${playerStats.healing.toFixed(1)}</span></div>
        <div class="stat-line"><span>護盾吸收傷害：</span><span class="val">${playerStats.tanked.toFixed(1)}</span></div>
        <div class="stat-line"><span>總承受傷害：</span><span class="val">${damageTaken.toFixed(1)}</span></div>
    `;
    
    document.getElementById('stats-container').innerHTML = html;
    document.getElementById('gameOverModal').style.display = 'flex';
}

export function createExplosion(x, y, color, count) {
    for(let i=0; i<count; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6,
            radius: Math.random() * 3 + 1, color: color, alpha: 1
        });
    }
}

export function getCurrentSpeed(entity) {
    let enemySlows = 0, selfSlows = 0;
    activeEffects.forEach(eff => {
        if (eff.target === entity) {
            if (eff.type === "self_slow") selfSlows++;
            else if (["water_slow", "hbr_dot", "h2o2_dot", "aloh_dot"].includes(eff.type)) enemySlows++;
        }
    });
    let effectiveSelfSlow = Math.min(2, selfSlows);
    let totalSlow = enemySlows + effectiveSelfSlow;
    return Math.max(0.2, entity.baseSpeed - totalSlow);
}

export function updateAI() {
    if (enemy.hp <= 0 || player.hp <= 0) return;
    enemy.aiTimer++;
    let dx = player.x - enemy.x;
    let dy = player.y - enemy.y;
    let dist = Math.sqrt(dx*dx + dy*dy);
    let moveSpeed = getCurrentSpeed(enemy);

    if (dist > 180) {
        enemy.x += (dx / dist) * moveSpeed;
        enemy.y += (dy / dist) * moveSpeed;
    } else if (dist < 100) {
        enemy.x -= (dx / dist) * moveSpeed;
        enemy.y -= (dy / dist) * moveSpeed;
    } else {
        enemy.y += (Math.sin(enemy.aiTimer / 20) * moveSpeed);
    }

    enemy.x = Math.max(15, Math.min(canvas.width - 15, enemy.x));
    enemy.y = Math.max(15, Math.min(canvas.height - 15, enemy.y));

    if (enemy.aiTimer % 45 === 0) { 
        let q = enemy.storage;
        if (q.H >= 1 && q.O >= 1 && q.Al >= 1) {
            enemy.storage.H--; enemy.storage.O--; enemy.storage.Al--;
            ["H", "O", "Al"].forEach(el => enemy.queue.push(el));
        } else if (q.H >= 1 && q.O >= 1) {
            enemy.storage.H--; enemy.storage.O--;
            ["H", "O"].forEach(el => enemy.queue.push(el));
        } else if (q.Al >= 1 && q.O >= 1) {
            enemy.storage.Al--; enemy.storage.O--;
            ["Al", "O"].forEach(el => enemy.queue.push(el));
        } else if (q.H >= 1 && q.Br >= 1) {
            enemy.storage.H--; enemy.storage.Br--;
            ["H", "Br"].forEach(el => enemy.queue.push(el));
        }
        if (enemy.queue.length > 0) manualFire(enemy);
    }
}

export function updateEffects() {
    let now = Date.now();
    for(let i = activeEffects.length - 1; i >= 0; i--) {
        let eff = activeEffects[i];
        if (now - eff.lastTime >= 1000) { 
            eff.tick++;
            eff.lastTime = now;

            if (eff.isBuff) {
                let actualHeal = Math.min(eff.target.maxHp - eff.target.hp, eff.effectValue);
                eff.target.hp += actualHeal;
                if (eff.target === player) playerStats.healing += actualHeal;
                addLog(`✨ 狀態新生：${eff.target === player ? '玩家' : '電腦'} 恢復了 ${eff.effectValue} 生命。`);
            } else {
                if (eff.target.shield) {
                    eff.target.shield = false;
                    if (eff.target === player) playerStats.tanked += Math.abs(eff.effectValue);
                    addLog(`🛡️ 護盾抵消了一次持續傷害！`);
                } else {
                    let actualDmg = Math.min(eff.target.hp, Math.abs(eff.effectValue));
                    eff.target.hp -= actualDmg;
                    if (eff.source === player && eff.target === enemy) playerStats.damageDealt += actualDmg;
                    addLog(`🧪 元素侵蝕：${eff.target === player ? '玩家' : '電腦'} 受到持續效果，生命改變 ${eff.effectValue}。`);
                    
                    if(eff.target.hp <= 0 && !gameState.isGameOver) {
                        gameState.isGameOver = true;
                        addLog(`💀 戰鬥結束！ ${eff.target === player ? '玩家' : '電腦 AI'} 已經倒下！`);
                        showGameOverScreen(eff.target === enemy);
                    }
                }
            }
            if (eff.tick >= eff.maxTick) activeEffects.splice(i, 1);
        }
    }
}

export function toggleSidebar() {
    const sidebar = document.getElementById("reference-sidebar");
    const btn = document.getElementById("toggleSidebarBtn");
    sidebar.classList.toggle("open");
    btn.classList.toggle("open");
    if (sidebar.classList.contains("open")) {
        btn.innerText = "關閉圖鑑 ❯";
    } else {
        btn.innerText = "❮ 化學圖鑑";
    }
}

export function updateGridUI() {
    const grid = document.getElementById('nine-grid');
    for (let i = 0; i < 9; i++) {
        let cell = grid.children[i];
        cell.innerText = gameState.gridState[i] ? gameState.gridState[i] : '';
        if (gameState.gridState[i]) {
            cell.setAttribute('draggable', 'true');
            cell.style.cursor = 'grab';
        } else {
            cell.removeAttribute('draggable');
            cell.style.cursor = 'default';
        }
    }
    localStorage.setItem('alchemyGridState', JSON.stringify(gameState.gridState));
}

export function initStartScreen() {
    const pt = document.getElementById('periodic-table');
    const tooltip = document.getElementById('tooltip');
    
    for (let i = 1; i <= 118; i++) {
        let box = document.createElement('div');
        box.className = 'element-box';
        
        if (i === 2) box.style.gridColumn = '18';
        else if (i === 5 || i === 13) box.style.gridColumn = '13';
        else if (i === 72 || i === 104) box.style.gridColumn = '4';
        else if (i >= 57 && i <= 71) {
            box.style.gridRow = '8';
            box.style.gridColumn = (i - 57 + 4).toString();
        }
        else if (i >= 89 && i <= 103) {
            box.style.gridRow = '9';
            box.style.gridColumn = (i - 89 + 4).toString();
        }

        let isActive = activeDict[i] !== undefined;
        let sym = isActive ? activeDict[i].sym : i;
        box.innerText = sym;
        
        if (isActive) {
            box.classList.add('active');
            if (i === 13) {
                box.style.background = 'orange';
                box.style.color = 'black';
            }
        }
        
        box.addEventListener('mousedown', (e) => {
            let desc = isActive ? activeDict[i].desc : (i > 4 ? "未知" : "敬請期待");
            tooltip.innerHTML = `<strong>${sym}</strong><br>${desc}`;
            tooltip.style.left = e.pageX + 15 + 'px';
            tooltip.style.top = e.pageY + 15 + 'px';
            tooltip.style.opacity = 1;

            if (isActive) {
                gameState.holdTimer = setTimeout(() => {
                    box.setAttribute('draggable', 'true');
                    box.classList.add('draggable-ready');
                    tooltip.innerHTML = "已解鎖拖曳！請拖入下方九宮格";
                }, 300);
            } else {
                tooltip.innerHTML += "<br><span style='color:red'>(敬請期待，無法拖曳)</span>";
            }
        });

        box.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', sym);
            tooltip.style.opacity = 0;
        });

        box.addEventListener('dragend', () => {
            box.removeAttribute('draggable');
            box.classList.remove('draggable-ready');
        });

        box.addEventListener('mouseup', () => { 
            clearTimeout(gameState.holdTimer); 
            box.removeAttribute('draggable');
            box.classList.remove('draggable-ready');
        });
        
        box.addEventListener('mouseleave', () => { 
            clearTimeout(gameState.holdTimer); 
            tooltip.style.opacity = 0; 
            box.removeAttribute('draggable');
            box.classList.remove('draggable-ready');
        });

        pt.appendChild(box);
    }

    const grid = document.getElementById('nine-grid');
    for (let i = 0; i < 9; i++) {
        let cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.index = i;
        grid.appendChild(cell);

        cell.addEventListener('dragstart', (e) => {
            if (gameState.gridState[i]) {
                e.dataTransfer.setData('text/plain', gameState.gridState[i]);
                e.dataTransfer.setData('source-index', i.toString());
            }
        });

        cell.addEventListener('dragover', (e) => {
            e.preventDefault();
            cell.classList.add('drag-over');
        });

        cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));

        cell.addEventListener('drop', (e) => {
            e.preventDefault();
            cell.classList.remove('drag-over');
            
            let sym = e.dataTransfer.getData('text/plain');
            let sourceIndex = e.dataTransfer.getData('source-index');

            if (sourceIndex !== "") {
                let fromIdx = parseInt(sourceIndex);
                if (fromIdx === i) return; 
                // 交換兩個格子的內容：先保存目標格子原本的値
                let temp = gameState.gridState[i];
                gameState.gridState[i] = sym;
                gameState.gridState[fromIdx] = temp;
            } else {
                let existingIndex = gameState.gridState.indexOf(sym);
                if (existingIndex !== -1) {
                    gameState.gridState[existingIndex] = null;
                }
                gameState.gridState[i] = sym;
            }
            updateGridUI();
        });
    }
    updateGridUI();
}