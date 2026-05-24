const canvas = document.getElementById("gameCanvas");
        const ctx = canvas.getContext("2d");
        const logDiv = document.getElementById("log");

        // 遊戲主物件（擴充儲存量設定）
        const player = { 
            x: 100, y: 200, radius: 12, color: "#4caf50", hp: 100, maxHp: 100, baseSpeed: 3, speedMod: 0, shield: false, queue: [],
            storage: { Br: 0, H: 0, O: 0, Al: 0 } // 目前擁有的元素數量
        };
        const enemy = { 
            x: 300, y: 200, radius: 12, color: "#f44336", hp: 100, maxHp: 100, baseSpeed: 3, speedMod: 0, shield: false, aiTimer: 0, queue: [],
            storage: { Br: 0, H: 0, O: 0, Al: 0 } // 電腦同樣受資源限制
        };

        // 資源刷新規則設定 (單位：毫秒)
        const resourceConfig = {
            Br: { cd: 2000, max: 3, lastUpdate: Date.now() },
            H:  { cd: 1000, max: 1, lastUpdate: Date.now() },
            O:  { cd: 1000, max: 1, lastUpdate: Date.now() },
            Al: { cd: 3000, max: Infinity, lastUpdate: Date.now() } // 無上限
        };
        
        // 鍵盤狀態
        const keys = { w: false, a: false, s: false, d: false };
        // 投射物陣列（化學子彈）
        const projectiles = [];
        // 視覺特效陣列
        const particles = [];
        // 持續性狀態陣列 (DOT / HOT)
        const activeEffects = [];

        // 戰鬥數據統計
        const playerStats = {
            fired: { total: 0, types: {} },
            hit: { total: 0, types: {} },
            healing: 0,
            tanked: 0,
            damageDealt: 0
        };
        let isGameOver = false; // 用於凍結遊戲迴圈

        // 監聽鍵盤
        // 監聽鍵盤 (新增 1~4 裝填，Enter 發射)
        // 監聽鍵盤 (新增 Backspace 刪除單一元素)
        window.addEventListener("keydown", e => { 
            let key = e.key.toLowerCase();
            if(key in keys) keys[key] = true; 
            // 根據動態綁定的 keyMap 觸發對應元素
            if (isGameStarted && keyMap[key]) {
                injectElement(keyMap[key]);
            }
            
            if(key === 'enter') manualFire(player);
            if(key === 'backspace') popElement(); // 新增退回鍵
        });
        
        window.addEventListener("keyup", e => { 
            let key = e.key.toLowerCase();
            if(key in keys) keys[key] = false; 
        });
        // 移除最後一個輸入的元素，並返還資源
        function popElement() {
            if (player.queue.length > 0) {
                let removedEl = player.queue.pop(); // 彈出陣列最後一項
                
                // 返還背包資源
                player.storage[removedEl]++;
                
                // 更新 UI 顯示列
                document.getElementById("player-elements").innerText = player.queue.length ? player.queue.join(" + ") : "-";
                
                // 立即更新按鈕上的資源數量文字
                let config = resourceConfig[removedEl];
                let maxStr = config.max === Infinity ? "∞" : config.max;
                let elName = removedEl === 'Br' ? '溴' : removedEl === 'H' ? '氫' : removedEl === 'Al' ? '鋁' : '氧';
                
                // 動態抓取該元素目前綁定在哪個數字鍵上
                let boundKey = Object.keys(keyMap).find(k => keyMap[k] === removedEl) || "?";
                document.getElementById(`btn-${removedEl}`).innerHTML = `${elName} (${removedEl})<br>[${boundKey}] [${player.storage[removedEl]}/${maxStr}]`;
            }
        }
        function addLog(msg) {
            logDiv.innerHTML += msg + "<br>";
            logDiv.scrollTop = logDiv.scrollHeight;
        }

        // 玩家手動輸入元素（加入資源消耗判定）
        // 玩家手動裝填元素 (只裝填，不發射)
        function injectElement(el) {
            if (player.hp <= 0 || enemy.hp <= 0) return;
            
            // 限制槍膛最多只能塞 3 個
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
        // 手動發射判定
        function manualFire(entity) {
            if (entity.queue.length === 0) return; // 空槍不射擊
            
            let q = entity.queue;
            let reactionData = null;

            // 1. 三元素判定
            if (q.length === 3) {
                let hCount = q.filter(x => x === 'H').length;
                let oCount = q.filter(x => x === 'O').length;
                let alCount = q.filter(x => x === 'Al').length;
                
                if (hCount === 2 && oCount === 1) reactionData = { name: "爆鳴水", type: "explosion_water" }; 
                else if (hCount === 1 && oCount === 1 && alCount === 1) reactionData = { name: "氫氧化鋁", type: "buff_debuff" }; 
            } 
            
            // 2. 雙元素判定
            if (!reactionData && q.length >= 2) {
                let pair = [...q].slice(-2).sort().join("");
                if (pair === "AlBr") reactionData = { name: "溴化鋁", type: "albr" }; 
                else if (pair === "AlO") reactionData = { name: "氧化鋁", type: "alo" }; 
                else if (pair === "BrH") reactionData = { name: "氫溴酸", type: "hbr" }; 
                else if (pair === "HO") reactionData = { name: "雙氧水", type: "h2o2" }; 
            }

            // 若皆無符合，則為普通雜質
            if (!reactionData) reactionData = { name: "不穩定混雜物", type: "normal" };

            let target = (entity === player) ? enemy : player;
            let isPlayer = (entity === player);
            // 統計：記錄發射
            if (isPlayer) {
                playerStats.fired.total++;
                playerStats.fired.types[reactionData.name] = (playerStats.fired.types[reactionData.name] || 0) + 1;
            }
            // 💥 特殊瞬發處理：爆鳴水
            if (reactionData.type === "explosion_water") {
                addLog(`💦 ${isPlayer ? '【玩家】' : '【電腦】'} 啟動了 爆鳴水！(全域瞬發)`);
                // 統計：瞬發必中
                if (isPlayer) {
                    playerStats.hit.total++;
                    playerStats.hit.types[reactionData.name] = (playerStats.hit.types[reactionData.name] || 0) + 1;
                }
                // 給自己掛水並回血 (HOT)
                activeEffects.push({ target: entity, type: "water_hot", tick: 0, maxTick: 2, effectValue: 5, lastTime: Date.now(), isBuff: true });
                
                // 給敵人掛降速狀態 (2秒，獨立標籤)
                activeEffects.push({ target: target, type: "water_slow", tick: 0, maxTick: 2, effectValue: 0, lastTime: Date.now(), isBuff: false });
                
                createExplosion(entity.x, entity.y, "#00ffff", 25);
            } else {
                // 其他配方照常發射子彈
                launchProjectile(entity, reactionData);
            }

            // 處理自身減速 (溴化鋁)
            if (reactionData.type === "albr") {
                addLog(`⚠️ ${isPlayer ? '【玩家】' : '【電腦】'} 因合成溴化鋁，自身陷入移速衰減。`);
                activeEffects.push({ target: entity, type: "self_slow", tick: 0, maxTick: 3, effectValue: 0, lastTime: Date.now(), isBuff: false });
            }

            // 清空槍膛
            entity.queue = [];
            if (isPlayer) document.getElementById("player-elements").innerText = "-";
        }
        // 發射化學子彈
        function launchProjectile(owner, reaction) {
            let target = (owner === player) ? enemy : player;
            // 計算朝向敵人的角度
            let angle = Math.atan2(target.y - owner.y, target.x - owner.x);
            
            projectiles.push({
                x: owner.x,
                y: owner.y,
                vx: Math.cos(angle) * 5,
                vy: Math.sin(angle) * 5,
                owner: owner,
                reaction: reaction,
                radius: 8,
                color: getReactionColor(reaction.type)
            });
            
            addLog(`${owner === player ? '【玩家】' : '【電腦】'} 成功合成了 <span style="color:${getReactionColor(reaction.type)}">${reaction.name}</span> 彈並發射！`);

        }

        function getReactionColor(type) {
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

        // 子彈命中觸發化學效果
        function triggerEffect(proj, target) {
            let isTargetPlayer = (target === player);
            let owner = proj.owner;
            let type = proj.reaction.type;
            // 統計：記錄命中
            if (owner === player) {
                playerStats.hit.total++;
                playerStats.hit.types[proj.reaction.name] = (playerStats.hit.types[proj.reaction.name] || 0) + 1;
            }
            // 處理護盾 (氧化鋁防禦機制)
            if (target.shield && type !== "normal") {
                target.shield = false;
                addLog(`${isTargetPlayer ? '【玩家】' : '【電腦】'} 的【氧化鋁盾】抵擋了本次化學傷害與效果！`);
                // 統計：預估護盾擋下的基礎傷害量
                if (isTargetPlayer) {
                    let blockedBaseDmg = (type === "albr" ? 5 : (type === "alo" ? 1 : 5));
                    playerStats.tanked += blockedBaseDmg;
                }
                createExplosion(target.x, target.y, "#fff", 15);
                return;
            }

            switch(type) {
                case "albr": // 溴化鋁
                    // 沒擊中水，僅造成基礎撞擊
                    damageEntity(target, 5);
                    // 如果場上有水（這裡簡化為如果目標身上有爆鳴水的水氣狀態，則觸發隱藏劇烈爆炸）
                    let hasWater = activeEffects.some(e => e.target === target && e.type === "water_hot");
                    if (hasWater) {
                        damageEntity(target, 20);
                        addLog(`💥 連鎖反應！溴化鋁 接觸到 水，發生劇烈爆炸！ ${isTargetPlayer?'玩家':'電腦'} -20 生命！`);
                        createExplosion(target.x, target.y, "#ff4500", 30);
                    }
                    break;

                case "alo": // 鋁+氧 -> 氧化鋁
                    damageEntity(target, 1); // 攻擊：-1生命
                    owner.shield = true;    // 防禦：我方自身獲得抵擋一次傷害的盾
                    addLog(`${owner === player ? '【玩家】' : '【電腦】'} 獲得【氧化鋁護盾】，並對敵方造成 1 點微量傷害。`);
                    break;

                case "hbr": // 氫+溴 -> 氫溴酸
                    activeEffects.push({
                        target: target, type: "hbr_dot", tick: 0, maxTick: 5, 
                        effectValue: -3, lastTime: Date.now(), isBuff: false
                    });
                    break;

                case "h2o2": // 氫+氧 -> 雙氧水
                    activeEffects.push({
                        target: target, type: "h2o2_dot", tick: 0, maxTick: 2, 
                        effectValue: -2, lastTime: Date.now(), isBuff: false
                    });
                    break;

                case "buff_debuff": // 氫+氧+鋁 -> 氫氧化鋁
                    activeEffects.push({
                        target: target, type: "aloh_dot", tick: 0, maxTick: 3, 
                        effectValue: -2, lastTime: Date.now(), isBuff: false
                    });
                    break;

                default: // 普通雜質
                    damageEntity(target, 5);
                    createExplosion(target.x, target.y, "#ffff00", 8);
                    break;
            }
        }

        // 傷害結算與死亡判定
        function damageEntity(entity, amt, source) {
            let actualDmg = Math.min(entity.hp, amt);
            entity.hp -= actualDmg;
            
            // 記錄對敵人造成的傷害
            if (source === player && entity === enemy) {
                playerStats.damageDealt += actualDmg;
            }

            if(entity.hp <= 0 && !isGameOver) {
                isGameOver = true;
                addLog(`💀 戰鬥結束！ ${entity === player ? '玩家' : '電腦 AI'} 已經倒下！`);
                showGameOverScreen(entity === enemy);
            }
        }

        // 產生並顯示結算數據
        function showGameOverScreen(isVictory) {
            document.getElementById('end-title').innerText = isVictory ? "戰鬥勝利" : "戰鬥敗北";
            document.getElementById('end-title').style.color = isVictory ? "#4caf50" : "#f44336";
            
            let f = playerStats.fired.total;
            let h = playerStats.hit.total;
            let overallRate = f > 0 ? ((h / f) * 100).toFixed(1) : 0;
            
            let html = `
                <div class="stat-line"><span>總發射次數：</span><span class="val">${f} 發</span></div>
                <div class="stat-line"><span>整體命中率：</span><span class="val">${h} / ${f} (${overallRate}%)</span></div>
            `;
            
            // 各彈種統計
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
            `;
            
            document.getElementById('stats-container').innerHTML = html;
            document.getElementById('gameOverModal').style.display = 'flex';
        }

        // 產生爆炸粒子
        function createExplosion(x, y, color, count) {
            for(let i=0; i<count; i++) {
                particles.push({
                    x: x, y: y,
                    vx: (Math.random() - 0.5) * 6,
                    vy: (Math.random() - 0.5) * 6,
                    radius: Math.random() * 3 + 1,
                    color: color,
                    alpha: 1
                });
            }
        }
        function getCurrentSpeed(entity) {
            let enemySlows = 0; // 被敵人上的緩速
            let selfSlows = 0;  // 自己上的緩速 (溴化鋁)
            
            // 掃描目前身上的所有狀態
            activeEffects.forEach(eff => {
                if (eff.target === entity) {
                    if (eff.type === "self_slow") selfSlows++;
                    else if (["water_slow", "hbr_dot", "h2o2_dot", "aloh_dot"].includes(eff.type)) enemySlows++;
                }
            });

            // 自己給的 debuff 最多只算 2 層
            let effectiveSelfSlow = Math.min(2, selfSlows);
            
            // 計算總扣速
            let totalSlow = enemySlows + effectiveSelfSlow;
            
            // 回傳計算結果 (保底最慢 0.2)
            return Math.max(0.2, entity.baseSpeed - totalSlow);
        }
        // 簡易電腦 AI 行為
        function updateAI() {
            if (enemy.hp <= 0 || player.hp <= 0) return;

            enemy.aiTimer++;
            // 1. 簡易走位：與玩家保持一定距離，並上下游走
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
                // 隨機上下繞步
                enemy.y += (Math.sin(enemy.aiTimer / 20) * moveSpeed);
            }

            // 邊界防禦
            enemy.x = Math.max(15, Math.min(canvas.width - 15, enemy.x));
            enemy.y = Math.max(15, Math.min(canvas.height - 15, enemy.y));

            // 2. 智慧煉金決策機制 (AI 依據手頭現有資源出牌)
            if (enemy.aiTimer % 45 === 0) { // 加快檢查頻率
                let q = enemy.storage;
                // AI 優先順序策略
                if (q.H >= 1 && q.O >= 1 && q.Al >= 1) {
                    // 拼氫氧化鋁
                    enemy.storage.H--; enemy.storage.O--; enemy.storage.Al--;
                    ["H", "O", "Al"].forEach(el => enemy.queue.push(el));
                } else if (q.H >= 1 && q.O >= 1) {
                    // 拼雙氧水 (如果沒鋁)
                    enemy.storage.H--; enemy.storage.O--;
                    ["H", "O"].forEach(el => enemy.queue.push(el));
                } else if (q.Al >= 1 && q.O >= 1) {
                    // 拼氧化鋁盾
                    enemy.storage.Al--; enemy.storage.O--;
                    ["Al", "O"].forEach(el => enemy.queue.push(el));
                } else if (q.H >= 1 && q.Br >= 1) {
                    // 拼氫溴酸
                    enemy.storage.H--; enemy.storage.Br--;
                    ["H", "Br"].forEach(el => enemy.queue.push(el));
                }
                
                // 如果有觸發塞口袋，就進行反應檢查
                if (enemy.queue.length > 0) {
                    manualFire(enemy);
                }
            }
        }
        
        
        // 核心更新迴圈
        function update() {
            // 動態計算當前移速
            if (player.hp > 0) {
            // 玩家移動
            let speed = getCurrentSpeed(player); // 玩家移動用這個
            // 以及 UI 顯示也要改成：
            document.getElementById("player-text").innerText = `HP: ${player.hp} | 移速: ${getCurrentSpeed(player).toFixed(1)}`;
            document.getElementById("enemy-text").innerText = `HP: ${enemy.hp} | 移速: ${getCurrentSpeed(enemy).toFixed(1)}`;
            if (keys.w) player.y -= speed;
            if (keys.s) player.y += speed;
            if (keys.a) player.x -= speed;
            if (keys.d) player.x += speed;

            // 地圖邊界限制
            player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
            player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));
            }
            // === 元素資源自動刷新系統 ===
            let now = Date.now();
            ["Br", "H", "O", "Al"].forEach(el => {
                let config = resourceConfig[el];
                // 檢查是否到了刷新時間
                if (now - config.lastUpdate >= config.cd) {
                    config.lastUpdate = now;
                    
                    // 玩家增產
                    if (player.storage[el] < config.max) {
                        player.storage[el]++;
                    }
                    // 電腦 AI 同步增產
                    if (enemy.storage[el] < config.max) {
                        enemy.storage[el]++;
                    }
                }
                
                // 即時更新按鈕上面的文字，顯示剩餘數量 (例如: 溴 (Br) [2/3])
                let btn = document.getElementById(`btn-${el}`);
                if (btn) {
                    let maxStr = config.max === Infinity ? "∞" : config.max;
                    // 由於你之前 HTML 氧按鈕內可能殘留 font-weight，這裡統一單純改文字
                    let elName = el === 'Br' ? '溴' : el === 'H' ? '氫' : el === 'Al' ? '鋁' : '氧';
                    // 動態抓取該元素目前綁定在哪個數字鍵上
                    let boundKey = Object.keys(keyMap).find(k => keyMap[k] === el) || "?";
                    btn.innerHTML = `${elName} (${el})<br>[${boundKey}] [${player.storage[el]}/${maxStr}]`;
                }
            });
            updateAI();
            updateEffects();

            // 更新子彈位置與碰撞
            for (let i = projectiles.length - 1; i >= 0; i--) {
                let p = projectiles[i];
                p.x += p.vx;
                p.y += p.vy;

                // 檢查是否飛出邊界
                if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
                    projectiles.splice(i, 1);
                    continue;
                }

                // 檢查是否命中目標
                let target = (p.owner === player) ? enemy : player;
                let dx = p.x - target.x;
                let dy = p.y - target.y;
                let dist = Math.sqrt(dx*dx + dy*dy);

                if (dist < p.radius + target.radius) {
                    if (target.hp > 0) {
                        triggerEffect(p, target);
                    }
                    projectiles.splice(i, 1);
                }
            }

            // 更新粒子特效
            for (let i = particles.length - 1; i >= 0; i--) {
                let pt = particles[i];
                pt.x += pt.vx;
                pt.y += pt.vy;
                pt.alpha -= 0.02;
                if (pt.alpha <= 0) particles.splice(i, 1);
            }

            // 更新 UI 數據介面
            document.getElementById("player-hp").style.width = player.hp + "%";
            document.getElementById("enemy-hp").style.width = enemy.hp + "%";
            document.getElementById("player-text").innerText = `HP: ${player.hp} | 移速: ${getCurrentSpeed(player).toFixed(1)}`;
            document.getElementById("enemy-text").innerText = `HP: ${enemy.hp} | 移速: ${getCurrentSpeed(enemy).toFixed(1)}`;
            
            document.getElementById("player-shield").innerText = player.shield ? "氧化鋁盾 (有)" : "無";
            document.getElementById("enemy-shield").innerText = enemy.shield ? "氧化鋁盾 (有)" : "無";
        }

        // 渲染畫面
        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // 畫粒子特效
            particles.forEach(pt => {
                ctx.save();
                ctx.globalAlpha = pt.alpha;
                ctx.fillStyle = pt.color;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            });

            // 畫玩家 (綠色點)
            if (player.hp > 0) {
                ctx.beginPath();
                ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
                ctx.fillStyle = player.color;
                ctx.fill();
                ctx.closePath();
                
                // 如果有盾畫外圈
                if(player.shield) {
                    ctx.beginPath();
                    ctx.arc(player.x, player.y, player.radius + 5, 0, Math.PI * 2);
                    ctx.strokeStyle = "#ffffff";
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            }

            // 畫電腦 (紅色點)
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

            // 畫投射子彈
            projectiles.forEach(p => {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.fill();
                ctx.shadowBlur = 10;
                ctx.shadowColor = p.color;
                ctx.closePath();
                ctx.shadowBlur = 0; // 還原
            });
        }

        // 遊戲核心循環主線
        function gameLoop() {
            if (isGameOver) return; // 戰鬥結束直接凍結畫面
            update();
            draw();
            requestAnimationFrame(gameLoop);
        }

        // 更新持續性狀態 (HOT / DOT)
        function updateEffects() {
            let now = Date.now();
            for(let i = activeEffects.length - 1; i >= 0; i--) {
                let eff = activeEffects[i];
                if (now - eff.lastTime >= 1000) { // 每秒跳一次
                    eff.tick++;
                    eff.lastTime = now;

                    if (eff.isBuff) {
                        // 統計：計算不會溢出的實際治療量
                        let actualHeal = Math.min(eff.target.maxHp - eff.target.hp, eff.effectValue);
                        eff.target.hp += actualHeal;
                        if (eff.target === player) playerStats.healing += actualHeal;
                        addLog(`✨ 狀態新生：${eff.target === player ? '玩家' : '電腦'} 恢復了 ${eff.effectValue} 生命。`);
                    } else {
                        // 扣血前再檢查一次護盾
                        if (eff.target.shield) {
                            eff.target.shield = false;
                            // 統計：記錄護盾擋下的持續傷害量
                            if (eff.target === player) playerStats.tanked += Math.abs(eff.effectValue);
                            addLog(`🛡️ 護盾抵消了一次持續傷害！`);
                        } else {
                            let actualDmg = Math.min(eff.target.hp, Math.abs(eff.effectValue));
                            eff.target.hp -= actualDmg;
                            
                            // 統計：記錄 DOT 造成的傷害
                            if (eff.source === player && eff.target === enemy) {
                                playerStats.damageDealt += actualDmg;
                            }
                            addLog(`🧪 元素侵蝕：${eff.target === player ? '玩家' : '電腦'} 受到持續效果，生命改變 ${eff.effectValue}。`);
                            if(eff.target.hp <= 0 && !isGameOver) {
                                isGameOver = true;
                                addLog(`💀 戰鬥結束！ ${eff.target === player ? '玩家' : '電腦 AI'} 已經倒下！`);
                                showGameOverScreen(eff.target === enemy);
                            }
                        }
                    }

                    if (eff.tick >= eff.maxTick) {
                        // eff.target.speedMod = 0; // 效果結束，還原速度
                        activeEffects.splice(i, 1);
                    }
                }
            }
        }

        // 切換側邊圖鑑欄的展開與收合
        function toggleSidebar() {
            const sidebar = document.getElementById("reference-sidebar");
            const btn = document.getElementById("toggleSidebarBtn");
            
            sidebar.classList.toggle("open");
            btn.classList.toggle("open");
            
            // 動態更改按鈕文字
            if (sidebar.classList.contains("open")) {
                btn.innerText = "關閉圖鑑 ❯";
            } else {
                btn.innerText = "❮ 化學圖鑑";
            }
        }
        // 初始化日誌
        addLog("🧪 歡迎來到元素煉金對戰！請用 WASD 控制移動，點擊按鈕調配你的化學武器。");
        /* === 開始畫面與拖曳邏輯 === */
        const activeDict = {
            1: { sym: 'H', desc: '萬能鍵結者，酸鹼還原溶劑基底' },
            8: { sym: 'O', desc: '氧化主導者，穩定鈍化能量載體' },
            13: { sym: 'Al', desc: '金屬兩性強，惰性耐腐易水解' },
            35: { sym: 'Br', desc: '鹵素活性高，腐蝕氧化遇水不穩' }
        };

        // 預設九宮格狀態 (對應實體鍵盤的 789, 456, 123)
        let gridState = [
            null, null, null,
            'Al', null, null,
            'Br', 'H',  'O'
        ];
        let holdTimer = null;
        let keyMap = {}; // 用來記錄動態綁定的快捷鍵

        function initStartScreen() {
            const pt = document.getElementById('periodic-table');
            const tooltip = document.getElementById('tooltip');
            
            // 生成 118 個元素
            for (let i = 1; i <= 118; i++) {
                let box = document.createElement('div');
                box.className = 'element-box';
                
                let isActive = activeDict[i] !== undefined;
                let sym = isActive ? activeDict[i].sym : i;
                box.innerText = sym;
                
                if (isActive) box.classList.add('active');

                // 點擊顯示 Tooltip
                box.addEventListener('mousedown', (e) => {
                    let desc = isActive ? activeDict[i].desc : (i > 4 ? "未知" : "敬請期待");
                    tooltip.innerHTML = `<strong>${sym}</strong><br>${desc}`;
                    tooltip.style.left = e.pageX + 15 + 'px';
                    tooltip.style.top = e.pageY + 15 + 'px';
                    tooltip.style.opacity = 1;

                    // 長按 0.3 秒邏輯
                    if (isActive) {
                        holdTimer = setTimeout(() => {
                            box.setAttribute('draggable', 'true');
                            box.classList.add('draggable-ready');
                            tooltip.innerHTML = "已解鎖拖曳！請拖入下方九宮格";
                        }, 300);
                    } else {
                        tooltip.innerHTML += "<br><span style='color:red'>(敬請期待，無法拖曳)</span>";
                    }
                });

                // 拖曳開始
                box.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', sym);
                    tooltip.style.opacity = 0;
                });

                box.addEventListener('dragend', () => {
                    box.removeAttribute('draggable');
                    box.classList.remove('draggable-ready');
                });

                // 取消長按
                box.addEventListener('mouseup', () => { clearTimeout(holdTimer); });
                box.addEventListener('mouseleave', () => { clearTimeout(holdTimer); tooltip.style.opacity = 0; });

                pt.appendChild(box);
            }

            // 生成九宮格
            const grid = document.getElementById('nine-grid');
            for (let i = 0; i < 9; i++) {
                let cell = document.createElement('div');
                cell.className = 'grid-cell';
                cell.dataset.index = i;
                // 加上這行：如果有預設元素，直接顯示出來
                if (gridState[i]) cell.innerText = gridState[i];
                
                // 下面的 dragover 等監聽器保持不變...
                cell.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    cell.classList.add('drag-over');
                });

                cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));

                cell.addEventListener('drop', (e) => {
                    e.preventDefault();
                    cell.classList.remove('drag-over');
                    let sym = e.dataTransfer.getData('text/plain');
                    
                    // 查重：如果該元素已經在九宮格內，清空原本的位置
                    let existingIndex = gridState.indexOf(sym);
                    if (existingIndex !== -1) {
                        gridState[existingIndex] = null;
                        grid.children[existingIndex].innerText = '';
                    }

                    // 寫入新位置
                    gridState[i] = sym;
                    cell.innerText = sym;
                });

                grid.appendChild(cell);
            }
        }

        // 開始遊戲按鈕觸發
        function startGame() {
            document.getElementById('start-overlay').style.display = 'none';
            // 實體鍵盤的九宮格對應 (左上到右下)
            const indexToKey = ['7', '8', '9', '4', '5', '6', '1', '2', '3'];
            const numpad = document.querySelector('.numpad-grid');
            numpad.innerHTML = ''; // 確保清空
            keyMap = {};

            for (let i = 0; i < 9; i++) {
                let el = gridState[i];
                let key = indexToKey[i];

                if (el) {
                    let btn = document.createElement('button');
                    btn.id = `btn-${el}`;
                    
                    // 寫入元素專屬顏色
                    if(el==='Br') { btn.style.background = '#8b4513'; btn.style.color = 'white'; }
                    if(el==='H') { btn.style.background = '#add8e6'; btn.style.color = 'black'; }
                    if(el==='O') { btn.style.background = '#ff4500'; btn.style.color = 'white'; }
                    if(el==='Al') { btn.style.background = '#a9a9a9'; btn.style.color = 'black'; }

                    let elName = el === 'Br' ? '溴' : el === 'H' ? '氫' : el === 'Al' ? '鋁' : '氧';
                    let maxStr = resourceConfig[el].max === Infinity ? "∞" : resourceConfig[el].max;

                    btn.innerHTML = `${elName} (${el})<br>[${key}] [0/${maxStr}]`;
                    btn.onclick = () => injectElement(el);

                    numpad.appendChild(btn);
                    keyMap[key] = el; // 將該按鍵綁定給該元素
                } else {
                    let btn = document.createElement('button');
                    btn.disabled = true;
                    btn.className = 'empty-btn';
                    btn.setAttribute('aria-hidden', 'true');
                    numpad.appendChild(btn);
                }
            }
            isGameStarted = true;
            gameLoop(); // 正式啟動核心戰鬥迴圈
        }

        // 執行初始化
        let isGameStarted = false;
        initStartScreen();