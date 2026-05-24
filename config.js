// === 靜態資料字典 ===
export const activeDict = {
    1: { sym: 'H', desc: '萬能鍵結者，酸鹼還原溶劑基底' },
    8: { sym: 'O', desc: '氧化主導者，穩定鈍化能量載體' },
    13: { sym: 'Al', desc: '金屬兩性強，惰性耐腐易水解' },
    35: { sym: 'Br', desc: '鹵素活性高，腐蝕氧化遇水不穩' }
};

export const resourceConfig = {
    Br: { cd: 2000, max: 3, lastUpdate: Date.now() },
    H:  { cd: 1000, max: 1, lastUpdate: Date.now() },
    O:  { cd: 1000, max: 1, lastUpdate: Date.now() },
    Al: { cd: 3000, max: Infinity, lastUpdate: Date.now() }
};

const defaultGrid = [
    null, null, null,
    'Al', null, null,
    'Br', 'H',  'O'
];
const savedGrid = localStorage.getItem('alchemyGridState');

// === 動態遊戲狀態 ===
export const player = { 
    x: 100, y: 200, radius: 12, color: "#4caf50", hp: 100, maxHp: 100, baseSpeed: 3, speedMod: 0, shield: false, queue: [],
    storage: { Br: 0, H: 0, O: 0, Al: 0 }
};

export const enemy = { 
    x: 300, y: 200, radius: 12, color: "#f44336", hp: 100, maxHp: 100, baseSpeed: 3, speedMod: 0, shield: false, aiTimer: 0, queue: [],
    storage: { Br: 0, H: 0, O: 0, Al: 0 }
};

export const keys = { w: false, a: false, s: false, d: false };
export const projectiles = [];
export const particles = [];
export const activeEffects = [];

export const playerStats = {
    fired: { total: 0, types: {} },
    hit: { total: 0, types: {} },
    healing: 0,
    tanked: 0,
    damageDealt: 0
};

// 將基礎變數打包成物件，以利在不同模組間同步修改
export const gameState = {
    isGameOver: false,
    isGameStarted: false,
    gridState: savedGrid ? JSON.parse(savedGrid) : [...defaultGrid],
    keyMap: {},
    holdTimer: null
};