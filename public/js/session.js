import { 
    auth, db, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, getDocs, orderBy, serverTimestamp, addDoc, deleteDoc, arrayUnion, limit, deleteField 
} from "./firebase.js";

import { initClickSound } from "./ui-click.js";

import {
    getBuiltinCharacterAssets,
    BUILTIN_FLOOR_BASE_PATHS,
    BUILTIN_FLOOR_FILES,
    normalizeFloorUrl,
    getObjectBookCategories
} from "./asset-catalog.js";

const DEFAULT_ENEMIES = [
    { id: 'def_1', name: 'Goblin', type: 'Humanoide Pequeno', level: 1, hp: 15, atk: 4, def: 3, image_url: 'https://i.postimg.cc/J7c05S4m/Goblins.png' },
    { id: 'def_2', name: 'Esqueleto', type: 'Morto-Vivo Médio', level: 1, hp: 20, atk: 5, def: 4, image_url: 'https://i.postimg.cc/59qySDNJ/esqueleto.png' },
    { id: 'def_3', name: 'Lobo Atroz', type: 'Besta Média', level: 2, hp: 35, atk: 8, def: 5, image_url: 'https://wiki.runarcana.org/images/d/dc/Lobo_Atroz.png' },
    { id: 'def_4', name: 'Zumbi de Elite', type: 'Morto-Vivo Médio', level: 2, hp: 45, atk: 7, def: 6, image_url: 'https://i.postimg.cc/qRPdh6jk/Zumbi.png' },
    { id: 'def_5', name: 'Gárgula', type: 'Elemental Médio', level: 3, hp: 60, atk: 12, def: 15, image_url: 'https://i.postimg.cc/7YgqzXvY/Gargula.png' },
    { id: 'def_6', name: 'Aranha Gigante', type: 'Besta Grande', level: 3, hp: 55, atk: 14, def: 10, image_url: 'https://i.postimg.cc/hvmcp1fp/Aranha.png' },
    { id: 'def_7', name: 'Golem de Ferro', type: 'Construto Grande', level: 4, hp: 120, atk: 25, def: 30, image_url: 'https://i.postimg.cc/nLwxxPmj/Golem.png' },
    { id: 'def_8', name: 'Quimera', type: 'Monstruosidade Grande', level: 4, hp: 100, atk: 22, def: 18, image_url: 'https://i.postimg.cc/MKwhCS4p/Quimera.jpg' },
    { id: 'def_9', name: 'Observador', type: 'Aberração Grande', level: 5, hp: 180, atk: 35, def: 25, image_url: 'https://i.postimg.cc/13YfN6RG/Observador.png' },
    { id: 'def_10', name: 'Dragão Vermelho', type: 'Dragão Enorme', level: 5, hp: 250, atk: 45, def: 40, image_url: 'https://img.pikbest.com/origin/09/30/95/865pIkbEsTAcw.png!sw800' }
];

const clampNumber = (value, min, max) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
};

class GameSession {
    constructor() {
        const params = new URLSearchParams(window.location.search);
        this.sessionId = params.get('id') || params.get('join'); // Suporte para id ou join
        
        this.user = null;
        this.isMaster = false;
        this.sessionData = null;
        this.allEnemies = []; // Cache combinando padrões e sessão
        this.tokens = []; 
        this.selectedTokenId = null;
        this.unsubscribeSession = null;
        this.unsubscribeTokens = null;

        // Panning e Zoom do mapa
        this.isPanning = false;
        this.panX = 0;
        this.panY = 0;
        this.scale = 0.5; // Começa com zoom out para ver mais do mapa

        // Targeting System
        this.selectedAbility = null;
        this.currentTarget = null;
        this.isTargeting = false;

        // Movement System
        this.isMovingToken = false;
        this.tokenToMove = null;
        this.playerTrailColor = '#ffd700'; // Cor padrão do rastro
        this.didPan = false;
        this.lastPanTime = 0;

        // Mestre: ferramentas (toolbar)
        this.activeGmTool = null; // 'measure' | 'ping' | null
        this.isMeasuring = false;
        this.measureStart = null;
        this.measureEls = null;

        this.activeMapTool = 'pointer';
        this.drawOps = [];
        this.fogState = { covered: false, reveals: [] };
        this.pathState = { a: null, b: null, points: [], color: '#00ff88', mode: null };
        this.visionState = { enabled: false, radius: 220 };
        this.isOverlayDrawing = false;
        this.overlayPreview = null;
        this.overlayStart = null;
        this.overlayLastPointAt = 0;

        // Colocação rápida (ex: criar inimigo e posicionar)
        this.isPlacingToken = false;
        this.pendingTokenPlacement = null;
        this.isPlacingAsset = false;
        this.pendingAssetPlacement = null;
        this.selectedAssetId = null;

        // Áudio
        this.localVolume = 0.5; // Volume padrão 50%

        this.sessionStartTime = Date.now(); // Marca o início da sessão para evitar gatilhos de F5
        this.lastProcessedSfx = null; // Para evitar repetições do mesmo SFX

        // Combat System
        this.combatActive = false;
        this.turnOrder = [];
        this.currentTurnIndex = 0;
        this.hasRolledInitiative = false;
        this.lastProcessedPing = null;
        this.gmOpenModal = null;
        this.gmSelectedEnemyId = null;
        this.gmSelectedEnemy = null;

        this.mapContextTarget = null;

        this.floorTextures = [];
        this.floorTiles = [];
        this.floorActiveLayer = 0;
        this.selectedFloorTextureId = null;
        this.selectedFloorTileId = null;
        this.isFloorPainting = false;
        this.lastFloorPaintCellKey = null;
        this._floorTilesSaveTimer = null;
        this._floorTexSaveTimer = null;
        this.isMovingFloorTile = false;
        this.movingFloorTileId = null;

        this.floorSubMode = 'paint';
        this.floorRemoveMode = false;
        this._floorToolMenuOpen = false;
        this._floorPicker = {
            img: null,
            sourceUrl: null,
            canvasScale: 1,
            drawW: 0,
            drawH: 0,
            drawX: 0,
            drawY: 0,
            selecting: false,
            start: null,
            rect: null
        };

        this._floorBuiltinSelected = new Set();
        this._builtinFloorBase = null;
        this._builtinFloorResolving = false;

        let floorSize = 150;
        try {
            const stored = localStorage.getItem('floor_default_size_px');
            const n = Number(stored);
            if (Number.isFinite(n)) floorSize = n;
        } catch {}
        this.floorDefaultSizePx = Math.max(50, Math.min(3000, Math.round(floorSize / 50) * 50));

        this.mapObjects = [];
        this.selectedMapObjectId = null;
        this._mapObjectsSaveTimer = null;

        this.isMovingMapObject = false;
        this.movingMapObjectId = null;

        this.isPlacingMapObject = false;
        this.pendingMapObjectPlacement = null;

        this.deleteMode = false;
        this.deleteSelection = {
            floors: new Set(),
            assets: new Set(),
            objects: new Set(),
            tokens: new Set(),
            texts: new Set()
        };
        this.isDeleteMarqueeSelecting = false;
        this.deleteMarqueeStart = null;
        this.deleteMarqueeEnd = null;
        this._deleteClickBlockUntil = 0;
        this._deleteMarqueeRaf = null;
        this._deleteMarqueeLastClient = null;

        this._listenersBound = {
            eventListeners: false,
            mapContextMenu: false,
            floorToolUi: false,
            standby: false,
            mapNavigation: false
        };
        this._uiClickAudio = null;

        // Biblioteca de Sons (Fallback para quando os arquivos locais não existem)
        this.sfxLibrary = {
            thunder: 'assets/song/thunder.wav',
            explosion: 'assets/song/explosion.wav',
            suspense: 'assets/song/suspense.wav',
            wind: 'assets/song/wind.wav',
            footsteps: 'assets/song/footsteps.wav',
            slash: 'assets/song/slash.mp3',
            fire: 'assets/song/fire.wav',
            magic: 'assets/song/magic.wav',
            dice: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3'
        };

        if (!this.sessionId) {
            console.error("Session ID não encontrado na URL.");
            window.location.href = 'dashboard.html';
            return;
        }

        // Garante que o ID esteja em caixa alta se for o padrão de 6 caracteres
        if (this.sessionId.length === 6) {
            this.sessionId = this.sessionId.toUpperCase();
        }

        this.init();
    }

    async resolveBuiltinFloorBase() {
        if (this._builtinFloorBase) return this._builtinFloorBase;
        if (this._builtinFloorResolving) return null;
        this._builtinFloorResolving = true;
        try {
            const testFile = (Array.isArray(BUILTIN_FLOOR_FILES) ? BUILTIN_FLOOR_FILES : []).find(Boolean);
            const bases = Array.isArray(BUILTIN_FLOOR_BASE_PATHS) ? BUILTIN_FLOOR_BASE_PATHS : [];
            if (!testFile || !bases.length) return null;

            for (const base of bases) {
                const url = encodeURI(`${String(base || '')}${String(testFile || '').trim()}`);
                try {
                    const res = await fetch(url, { method: 'GET', cache: 'no-store' });
                    if (res && res.ok) {
                        this._builtinFloorBase = String(base || '');
                        break;
                    }
                } catch {}
            }
            return this._builtinFloorBase;
        } finally {
            this._builtinFloorResolving = false;
        }
    }

    async init() {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                this.user = user;
                await this.loadSession();
                this.setupEventListeners();
                this.setupDragAndDrop();
                this.setupMapNavigation();
                this.setupMapOverlays();
                this.setupMapToolsUI();
                this.setupZoomControl();
                this.centerMap();
                this.listenToChat(); // Inicia o chat
                this.setupStandbyLogic(); // Inicia lógica de inatividade
            } else {
                window.location.href = 'login.html';
            }
        });
    }

    toggleDeleteMode() {
        if (!this.isMaster) return;
        this.deleteMode = !this.deleteMode;
        this.clearDeleteSelection();
        this.hideMapContextMenu();
        this.hideFloorToolMenu();
        this.hideFloorTilePopover();
        this.hideObjectPopover();
        this.hideObjectsHoverPreview();
        if (this.deleteMode) {
            this.activeMapTool = 'pointer';
            this.floorRemoveMode = false;
            this.floorSubMode = 'paint';
            this.cancelTargeting();
        }
        this.updateMapToolUI();
        this.renderFloorTiles();
        this.renderMapAssets();
        this.renderMapObjects();
        this.renderTokens();
        this.renderDeleteBar();
    }

    openMasterKitTab(tabName) {
        if (!this.isMaster) return;
        const sidebarRight = document.getElementById('sidebar-right');
        if (sidebarRight && sidebarRight.classList.contains('collapsed')) {
            sidebarRight.classList.remove('collapsed');
            this.updateRightOverlayWidth?.();
        }
        document.querySelectorAll('.kit-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.kit-tab-panel').forEach(p => p.classList.remove('active'));
        const tab = document.querySelector(`.kit-tab[data-tab="${tabName}"]`);
        const panel = document.getElementById(`kit-${tabName}`);
        if (tab) tab.classList.add('active');
        if (panel) panel.classList.add('active');
    }

    clearDeleteSelection() {
        this.deleteSelection = {
            floors: new Set(),
            assets: new Set(),
            objects: new Set(),
            tokens: new Set(),
            texts: new Set()
        };
    }

    getDeleteSelectionCount() {
        const s = this.deleteSelection;
        if (!s) return 0;
        return (s.floors?.size || 0) + (s.assets?.size || 0) + (s.objects?.size || 0) + (s.tokens?.size || 0) + (s.texts?.size || 0);
    }

    toggleDeleteSelection(kind, id) {
        if (!this.isMaster || !this.deleteMode) return;
        if (Date.now() < (this._deleteClickBlockUntil || 0)) return;
        const key = String(id || '').trim();
        if (!key) return;
        const s = this.deleteSelection;
        const map = {
            floor: s.floors,
            asset: s.assets,
            object: s.objects,
            token: s.tokens,
            text: s.texts
        };
        const set = map[kind];
        if (!set) return;
        if (set.has(key)) set.delete(key);
        else set.add(key);
        this.renderDeleteBar();
        this.renderFloorTiles();
        this.renderMapAssets();
        this.renderMapObjects();
        this.renderTokens();
    }

    renderDeleteBar() {
        const bar = document.getElementById('delete-bar');
        if (!bar) return;
        if (!this.isMaster || !this.deleteMode) {
            bar.classList.remove('active');
            bar.innerHTML = '';
            return;
        }
        const count = this.getDeleteSelectionCount();
        bar.classList.add('active');
        bar.onmousedown = (e) => e.stopPropagation();
        bar.onclick = (e) => e.stopPropagation();
        bar.innerHTML = `
            <div class="info">Modo Deletar: ${count} selecionado(s)</div>
            <div class="actions">
                <button id="btn-delete-cancel" type="button" class="btn-secondary">Cancelar</button>
                <button id="btn-delete-confirm" type="button" class="btn-danger-small" ${count ? '' : 'disabled'}>Excluir (${count})</button>
            </div>
        `;
        const btnCancel = bar.querySelector('#btn-delete-cancel');
        const btnConfirm = bar.querySelector('#btn-delete-confirm');
        if (btnCancel) btnCancel.onclick = () => {
            this.deleteMode = false;
            this.clearDeleteSelection();
            this.updateMapToolUI();
            this.renderFloorTiles();
            this.renderMapAssets();
            this.renderMapObjects();
            this.renderTokens();
            this.renderDeleteBar();
        };
        if (btnConfirm) btnConfirm.onclick = async () => {
            await this.deleteSelectedItems();
        };
    }

    startDeleteMarquee(e) {
        if (!this.isMaster || !this.deleteMode) return;
        if (e.button !== 0) return;
        if (e.target.closest('#delete-bar')) return;
        if (e.target.closest('.control-btn') || e.target.closest('#map-context-menu')) return;
        e.preventDefault();
        e.stopPropagation();
        const p = this.getMapPointFromClient(e.clientX, e.clientY);
        if (!p) return;
        this.isDeleteMarqueeSelecting = true;
        this.deleteMarqueeStart = { x: p.x, y: p.y };
        this.deleteMarqueeEnd = { x: p.x, y: p.y };
        this.updateDeleteMarquee();
    }

    updateDeleteMarqueeFromMouse(e) {
        if (!this.isDeleteMarqueeSelecting) return;
        this._deleteMarqueeLastClient = { x: e.clientX, y: e.clientY };
        if (this._deleteMarqueeRaf) return;
        this._deleteMarqueeRaf = requestAnimationFrame(() => {
            this._deleteMarqueeRaf = null;
            const last = this._deleteMarqueeLastClient;
            if (!last) return;
            const p = this.getMapPointFromClient(last.x, last.y);
            if (!p) return;
            this.deleteMarqueeEnd = { x: p.x, y: p.y };
            this.updateDeleteMarquee();
        });
    }

    finishDeleteMarquee() {
        if (!this.isDeleteMarqueeSelecting) return;
        this.isDeleteMarqueeSelecting = false;
        this._deleteMarqueeLastClient = null;
        if (this._deleteMarqueeRaf) {
            cancelAnimationFrame(this._deleteMarqueeRaf);
            this._deleteMarqueeRaf = null;
        }
        this._deleteClickBlockUntil = Date.now() + 220;
        const el = document.getElementById('delete-marquee');
        if (el) {
            el.style.width = '0px';
            el.style.height = '0px';
        }
    }

    updateDeleteMarquee() {
        const el = document.getElementById('delete-marquee');
        const start = this.deleteMarqueeStart;
        const end = this.deleteMarqueeEnd;
        if (!el || !start || !end) return;

        const minX = Math.min(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxX = Math.max(start.x, end.x);
        const maxY = Math.max(start.y, end.y);

        const snap = (v, mode) => {
            const g = 50;
            return mode === 'down' ? Math.floor(v / g) * g : Math.ceil(v / g) * g;
        };

        const x1 = Math.max(0, Math.min(10000, snap(minX, 'down')));
        const y1 = Math.max(0, Math.min(10000, snap(minY, 'down')));
        const x2 = Math.max(0, Math.min(10000, snap(maxX, 'up')));
        const y2 = Math.max(0, Math.min(10000, snap(maxY, 'up')));
        const w = Math.max(0, x2 - x1);
        const h = Math.max(0, y2 - y1);

        el.style.left = `${x1}px`;
        el.style.top = `${y1}px`;
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;

        this.selectItemsInRect({ x: x1, y: y1, w, h });
    }

    selectItemsInRect(sel) {
        if (!this.isMaster || !this.deleteMode) return;
        const mapContainer = document.getElementById('map-container');
        if (!mapContainer) return;
        const mapRect = mapContainer.getBoundingClientRect();
        const scale = this.scale || 1;

        const toMapRect = (r) => {
            const x = (r.left - mapRect.left) / scale;
            const y = (r.top - mapRect.top) / scale;
            const w = r.width / scale;
            const h = r.height / scale;
            return { x, y, w, h };
        };

        const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

        const next = {
            floors: new Set(),
            assets: new Set(),
            objects: new Set(),
            tokens: new Set(),
            texts: new Set()
        };

        mapContainer.querySelectorAll('.floor-tile').forEach((node) => {
            const id = String(node.dataset.id || '').trim();
            if (!id) return;
            const r = toMapRect(node.getBoundingClientRect());
            if (overlap(sel, r)) next.floors.add(id);
        });

        mapContainer.querySelectorAll('.map-asset').forEach((node) => {
            const id = String(node.dataset.id || '').trim();
            if (!id) return;
            const r = toMapRect(node.getBoundingClientRect());
            if (overlap(sel, r)) next.assets.add(id);
        });

        mapContainer.querySelectorAll('.map-object').forEach((node) => {
            const id = String(node.dataset.id || '').trim();
            if (!id) return;
            const r = toMapRect(node.getBoundingClientRect());
            if (overlap(sel, r)) next.objects.add(id);
        });

        mapContainer.querySelectorAll('.token').forEach((node) => {
            const id = String(node.dataset.id || '').trim();
            if (!id) return;
            const r = toMapRect(node.getBoundingClientRect());
            if (overlap(sel, r)) next.tokens.add(id);
        });

        const ctx = this.drawCtx;
        const ops = Array.isArray(this.drawOps) ? this.drawOps : [];
        if (ctx) {
            ops.forEach((op, idx) => {
                if (!op || op.type !== 'text') return;
                const size = Number(op.size) || 22;
                ctx.font = `900 ${size}px Cinzel, serif`;
                const text = String(op.text || '');
                const pad = 8;
                const metrics = ctx.measureText(text);
                const w = metrics.width + pad * 2;
                const h = size + pad * 2;
                const x = (Number(op.x) || 0) - w / 2;
                const y = (Number(op.y) || 0) - h / 2;
                const r = { x, y, w, h };
                if (!overlap(sel, r)) return;
                const key = String(op.id || `idx_${idx}`);
                next.texts.add(key);
            });
        }

        this.deleteSelection = next;
        this.renderDeleteBar();
        this.renderFloorTiles();
        this.renderMapAssets();
        this.renderMapObjects();
        this.renderTokens();
        this.renderDrawLayer();
    }

    async deleteSelectedItems() {
        if (!this.isMaster || !this.deleteMode) return;
        const count = this.getDeleteSelectionCount();
        if (!count) return;
        const ok = confirm(`Excluir ${count} item(ns) selecionado(s)?`);
        if (!ok) return;

        const floors = Array.from(this.deleteSelection.floors || []);
        const assets = Array.from(this.deleteSelection.assets || []);
        const objects = Array.from(this.deleteSelection.objects || []);
        const tokens = Array.from(this.deleteSelection.tokens || []);
        const texts = Array.from(this.deleteSelection.texts || []);

        try {
            if (floors.length) {
                this.floorTiles = (Array.isArray(this.floorTiles) ? this.floorTiles : []).filter(t => t && !floors.includes(t.id));
                this.schedulePersistFloorTiles();
            }

            if (objects.length) {
                this.mapObjects = (Array.isArray(this.mapObjects) ? this.mapObjects : []).filter(o => o && !objects.includes(o.id));
                this.schedulePersistMapObjects();
            }

            if (assets.length) {
                const sessionRef = doc(db, "sessions", this.sessionId);
                const curr = Array.isArray(this.sessionData?.map_assets) ? this.sessionData.map_assets : [];
                const filtered = curr.filter(a => a && !assets.includes(a.id));
                await updateDoc(sessionRef, { map_assets: filtered });
                if (this.selectedAssetId && assets.includes(this.selectedAssetId)) this.selectedAssetId = null;
            }

            if (tokens.length) {
                const sessionRef = doc(db, "sessions", this.sessionId);
                const filtered = (Array.isArray(this.tokens) ? this.tokens : []).filter(t => t && !tokens.includes(t.id));
                await setDoc(sessionRef, { map_tokens: filtered }, { merge: true });
                if (this.selectedTokenId && tokens.includes(this.selectedTokenId)) this.selectedTokenId = null;
            }

            if (texts.length) {
                const ops = Array.isArray(this.drawOps) ? this.drawOps : [];
                this.drawOps = ops.filter((op, idx) => {
                    if (!op || op.type !== 'text') return true;
                    const key = String(op.id || `idx_${idx}`);
                    return !texts.includes(key);
                });
                await this.persistDrawOps();
            }
        } catch (e) {
            console.error(e);
        }

        this.clearDeleteSelection();
        this.renderFloorTiles();
        this.renderMapAssets();
        this.renderMapObjects();
        this.renderTokens();
        this.renderDrawLayer();
        this.renderDeleteBar();
    }

    updateRightOverlayWidth() {
        const sidebarRight = document.getElementById('sidebar-right');
        const root = document.documentElement;
        if (!sidebarRight) {
            root.style.setProperty('--right-overlay-width', '0px');
            return;
        }
        const style = window.getComputedStyle(sidebarRight);
        if (style.display === 'none' || style.visibility === 'hidden') {
            root.style.setProperty('--right-overlay-width', '0px');
            return;
        }
        const rect = sidebarRight.getBoundingClientRect();
        const visibleWidth = Math.max(0, Math.min(window.innerWidth, window.innerWidth - rect.left));
        root.style.setProperty('--right-overlay-width', `${Math.round(visibleWidth)}px`);
    }

    setupMapContextMenu() {
        if (this._listenersBound?.mapContextMenu) return;
        this._listenersBound.mapContextMenu = true;
        const menu = document.getElementById('map-context-menu');
        if (!menu) return;

        menu.addEventListener('mousedown', (e) => e.stopPropagation());
        menu.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        window.addEventListener('mousedown', () => this.hideMapContextMenu());
        window.addEventListener('blur', () => this.hideMapContextMenu());
        window.addEventListener('resize', () => {
            this.hideMapContextMenu();
            this.updateRightOverlayWidth();
        });
        window.addEventListener('scroll', () => this.hideMapContextMenu(), true);
    }

    setupFloorToolUi() {
        if (this._listenersBound?.floorToolUi) return;
        this._listenersBound.floorToolUi = true;
        const menu = document.getElementById('floor-tool-menu');
        const pop = document.getElementById('floor-tile-popover');
        const objPop = document.getElementById('object-popover');
        if (menu) {
            menu.addEventListener('mousedown', (e) => e.stopPropagation());
            menu.addEventListener('click', (e) => e.stopPropagation());
        }
        if (pop) {
            pop.addEventListener('mousedown', (e) => e.stopPropagation());
            pop.addEventListener('click', (e) => e.stopPropagation());
        }
        if (objPop) {
            objPop.addEventListener('mousedown', (e) => e.stopPropagation());
            objPop.addEventListener('click', (e) => e.stopPropagation());
        }

        window.addEventListener('mousedown', () => {
            this.hideFloorToolMenu();
            this.hideFloorTilePopover();
            this.hideObjectPopover();
        });
        window.addEventListener('blur', () => {
            this.hideFloorToolMenu();
            this.hideFloorTilePopover();
            this.hideObjectPopover();
        });
        window.addEventListener('resize', () => {
            this.hideFloorToolMenu();
            this.hideFloorTilePopover();
            this.hideObjectPopover();
            this.hideObjectsHoverPreview();
        });
    }

    hideObjectsHoverPreview() {
        const box = document.getElementById('objects-hover-preview');
        if (!box) return;
        box.classList.remove('active');
        box.style.left = '';
        box.style.top = '';
        box.style.visibility = '';
        box.replaceChildren();
    }

    showObjectsHoverPreview(imageUrl, name, anchorClientY) {
        const box = document.getElementById('objects-hover-preview');
        const sidebarRight = document.getElementById('sidebar-right');
        if (!box || !sidebarRight) return;
        const url = String(imageUrl || '').trim();
        if (!url) return;

        box.replaceChildren();
        const img = document.createElement('div');
        img.className = 'img';
        img.style.backgroundImage = `url("${url}")`;
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = String(name || '').trim();
        box.appendChild(img);
        box.appendChild(label);

        const sideRect = sidebarRight.getBoundingClientRect();
        box.classList.add('active');
        box.style.visibility = 'hidden';
        box.style.left = '0px';
        box.style.top = '0px';

        const rect = box.getBoundingClientRect();
        const left = Math.max(8, Math.min(sideRect.left - rect.width - 12, window.innerWidth - rect.width - 8));
        const centerY = Number(anchorClientY) || (sideRect.top + 120);
        const top = Math.max(70, Math.min(centerY - rect.height / 2, window.innerHeight - rect.height - 8));

        box.style.left = `${Math.round(left)}px`;
        box.style.top = `${Math.round(top)}px`;
        box.style.visibility = '';
    }

    hideFloorToolMenu() {
        const menu = document.getElementById('floor-tool-menu');
        if (!menu) return;
        menu.classList.remove('active');
        menu.style.left = '';
        menu.style.top = '';
        menu.style.visibility = '';
        this._floorToolMenuOpen = false;
    }

    openFloorToolMenu(anchorEl) {
        if (!this.isMaster) return;
        const menu = document.getElementById('floor-tool-menu');
        if (!menu) return;

        const layer = Math.max(0, Math.min(4, Number(this.floorActiveLayer) || 0));
        const labelMode = this.floorRemoveMode ? 'Remover pisos (ATIVO)' : (this.floorSubMode === 'edit' ? 'Ferramentas (ATIVO)' : 'Pintar (ATIVO)');

        menu.innerHTML = `
            <div class="floor-tool-row">
                <span style="font-weight:900; opacity:0.9;">Camada</span>
                <select id="floor-tool-layer" class="sidebar-search" style="height: 34px; padding: 0 10px;">
                    <option value="0" ${layer === 0 ? 'selected' : ''}>1</option>
                    <option value="1" ${layer === 1 ? 'selected' : ''}>2</option>
                    <option value="2" ${layer === 2 ? 'selected' : ''}>3</option>
                    <option value="3" ${layer === 3 ? 'selected' : ''}>4</option>
                    <option value="4" ${layer === 4 ? 'selected' : ''}>5</option>
                </select>
            </div>
            <div class="floor-tool-actions">
                <button type="button" data-action="choose">
                    <span>Escolher piso</span>
                    <i class="fas fa-image"></i>
                </button>
                <button type="button" data-action="tools">
                    <span>Ferramentas de piso</span>
                    <i class="fas fa-sliders-h"></i>
                </button>
                <button type="button" data-action="remove" class="danger">
                    <span>Remover pisos</span>
                    <i class="fas fa-eraser"></i>
                </button>
                <div style="font-size:0.78rem; opacity:0.75;">${labelMode}</div>
            </div>
        `;

        const sel = menu.querySelector('#floor-tool-layer');
        if (sel) {
            sel.onchange = (e) => {
                this.floorActiveLayer = Math.max(0, Math.min(4, Number(e.target.value) || 0));
            };
        }

        menu.onclick = (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const act = btn.dataset.action;

            if (act === 'choose') {
                this.floorRemoveMode = false;
                this.floorSubMode = 'paint';
                this.hideFloorToolMenu();
                this.openFloorPickerModal();
                return;
            }

            if (act === 'tools') {
                this.floorRemoveMode = false;
                this.floorSubMode = 'edit';
                this.hideFloorToolMenu();
                this.hideFloorTilePopover();
                this.renderFloorTiles();
                return;
            }

            if (act === 'remove') {
                this.floorRemoveMode = !this.floorRemoveMode;
                this.floorSubMode = 'paint';
                this.hideFloorToolMenu();
                this.hideFloorTilePopover();
                this.renderFloorTiles();
            }
        };

        menu.classList.add('active');
        menu.style.visibility = 'hidden';
        menu.style.left = '0px';
        menu.style.top = '0px';

        const rectA = anchorEl?.getBoundingClientRect?.() || { left: 80, top: 120, width: 0, height: 0 };
        const rectM = menu.getBoundingClientRect();
        const baseX = rectA.left + rectA.width + 10;
        const baseY = rectA.top;
        const left = Math.min(Math.max(8, baseX), Math.max(8, window.innerWidth - rectM.width - 8));
        const top = Math.min(Math.max(70, baseY), Math.max(70, window.innerHeight - rectM.height - 8));
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.visibility = '';
        this._floorToolMenuOpen = true;
    }

    hideFloorTilePopover() {
        const pop = document.getElementById('floor-tile-popover');
        if (!pop) return;
        pop.classList.remove('active');
        pop.style.left = '';
        pop.style.top = '';
        pop.style.visibility = '';
    }

    openFloorTilePopover(tileId, clientX, clientY) {
        if (!this.isMaster) return;
        const pop = document.getElementById('floor-tile-popover');
        if (!pop) return;
        const t = (Array.isArray(this.floorTiles) ? this.floorTiles : []).find(x => x && x.id === tileId);
        if (!t) return;

        const rot = Number(t.rot || 0) % 360;
        const opacity = Math.max(0.05, Math.min(1, Number(t.opacity ?? 1)));
        const scale = Math.max(0.5, Math.min(6, Number(t.w || 50) / 50));

        pop.innerHTML = `
            <div style="font-weight: 900;">Ferramentas do piso</div>
            <div class="row">
                <label>Rotação</label>
                <div style="display:flex; gap: 8px;">
                    <button id="floor-pop-rot-left" class="btn-secondary" type="button" style="padding: 10px;"><i class="fas fa-undo"></i></button>
                    <button id="floor-pop-rot-right" class="btn-secondary" type="button" style="padding: 10px;"><i class="fas fa-redo"></i></button>
                </div>
            </div>
            <div class="row">
                <label>Ângulo</label>
                <div style="display:flex; gap: 10px; align-items:center;">
                    <input id="floor-pop-rot" type="range" min="0" max="360" step="1" value="${rot}" style="flex:1;">
                    <div id="floor-pop-rot-value" style="min-width:52px; text-align:right; font-weight:900; opacity:0.9;">${rot}°</div>
                </div>
            </div>
            <div class="row">
                <label>Tamanho</label>
                <input id="floor-pop-scale" type="range" min="0.5" max="6" step="0.5" value="${scale}">
            </div>
            <div class="row">
                <label>Opacidade</label>
                <input id="floor-pop-opacity" type="range" min="0.05" max="1" step="0.05" value="${opacity}">
            </div>
            <div class="actions">
                <button id="floor-pop-delete" class="btn-danger-small" type="button">Remover</button>
            </div>
        `;

        const btnL = pop.querySelector('#floor-pop-rot-left');
        const btnR = pop.querySelector('#floor-pop-rot-right');
        const rangeRot = pop.querySelector('#floor-pop-rot');
        const rotValue = pop.querySelector('#floor-pop-rot-value');
        const rangeS = pop.querySelector('#floor-pop-scale');
        const rangeO = pop.querySelector('#floor-pop-opacity');
        const btnD = pop.querySelector('#floor-pop-delete');

        const normalizeDeg = (d) => {
            const n = Math.round(Number(d) || 0) % 360;
            return n < 0 ? n + 360 : n;
        };

        if (btnL) btnL.onclick = () => {
            const next = normalizeDeg((Number(rangeRot?.value) || rot) - 15);
            if (rangeRot) rangeRot.value = String(next);
            if (rotValue) rotValue.textContent = `${next}°`;
            this.patchFloorTile(t.id, { rot: next });
        };
        if (btnR) btnR.onclick = () => {
            const next = normalizeDeg((Number(rangeRot?.value) || rot) + 15);
            if (rangeRot) rangeRot.value = String(next);
            if (rotValue) rotValue.textContent = `${next}°`;
            this.patchFloorTile(t.id, { rot: next });
        };

        if (rangeRot) {
            rangeRot.oninput = () => {
                const next = normalizeDeg(rangeRot.value);
                if (rotValue) rotValue.textContent = `${next}°`;
                this.patchFloorTile(t.id, { rot: next });
            };
        }
        if (rangeS) rangeS.oninput = () => {
            const s = Math.max(0.5, Math.min(6, Number(rangeS.value) || 1));
            this.patchFloorTile(t.id, { w: s * 50, h: s * 50 }, true);
        };
        if (rangeO) rangeO.oninput = () => {
            const o = Math.max(0.05, Math.min(1, Number(rangeO.value) || 1));
            this.patchFloorTile(t.id, { opacity: o });
        };
        if (btnD) btnD.onclick = () => this.removeFloorTile(t.id);

        pop.classList.add('active');
        pop.style.visibility = 'hidden';
        pop.style.left = '0px';
        pop.style.top = '0px';
        const rectP = pop.getBoundingClientRect();
        const maxLeft = Math.max(8, window.innerWidth - rectP.width - 8);
        const maxTop = Math.max(70, window.innerHeight - rectP.height - 8);
        const left = Math.min(Math.max(8, clientX), maxLeft);
        const top = Math.min(Math.max(70, clientY), maxTop);
        pop.style.left = `${left}px`;
        pop.style.top = `${top}px`;
        pop.style.visibility = '';
    }

    openFloorPickerModal() {
        if (!this.isMaster) return;
        const modal = document.getElementById('floor-picker-modal');
        if (!modal) return;
        modal.style.display = 'flex';
        this.renderFloorPickerTextures();
        this.renderBuiltinFloorPicker();
        this.bindFloorPickerModalOnce();
        modal.onclick = (e) => {
            if (e.target === modal) this.closeFloorPickerModal();
        };
    }

    closeFloorPickerModal() {
        const modal = document.getElementById('floor-picker-modal');
        if (!modal) return;
        modal.style.display = 'none';
        this._floorBuiltinSelected = new Set();
        this.resetFloorPickerCrop();
    }

    bindFloorPickerModalOnce() {
        const modal = document.getElementById('floor-picker-modal');
        if (!modal || modal.dataset.bound === '1') return;
        modal.dataset.bound = '1';

        const btnClose = document.getElementById('btn-close-floor-picker');
        if (btnClose) btnClose.onclick = (e) => {
            e.stopPropagation();
            this.closeFloorPickerModal();
        };

        const btnLoad = document.getElementById('btn-floor-load');
        if (btnLoad) btnLoad.onclick = async () => {
            const url = String(document.getElementById('floor-picker-url')?.value || '').trim();
            const file = document.getElementById('floor-picker-file')?.files?.[0];
            await this.floorPickerLoadSource({ url, file });
        };

        const btnAddBuiltin = document.getElementById('btn-floor-add-builtin');
        if (btnAddBuiltin) btnAddBuiltin.onclick = async () => {
            await this.confirmBuiltinFloors();
        };

        const btnFull = document.getElementById('btn-floor-use-full');
        if (btnFull) btnFull.onclick = async () => {
            const img = this._floorPicker.img;
            if (!img) return;
            const name = String(document.getElementById('floor-picker-name')?.value || '').trim();
            const dataUrl = this.floorPickerExportFull();
            if (!dataUrl) return;
            await this.addFloorTextureFromDataUrl(dataUrl, name || 'Piso');
            this.closeFloorPickerModal();
        };

        const btnUseLink = document.getElementById('btn-floor-use-link');
        if (btnUseLink) btnUseLink.onclick = async () => {
            const url = String(this._floorPicker?.sourceUrl || '').trim();
            if (!url) return;
            const name = String(document.getElementById('floor-picker-name')?.value || '').trim();
            await this.addFloorTextureFromUrl(url, name || 'Piso');
            this.closeFloorPickerModal();
        };

        const btnCrop = document.getElementById('btn-floor-crop-save');
        if (btnCrop) btnCrop.onclick = async () => {
            const img = this._floorPicker.img;
            if (!img) return;
            const out = this.floorPickerExportCrop();
            if (!out) return;
            const name = String(document.getElementById('floor-picker-name')?.value || '').trim();
            await this.addFloorTextureFromDataUrl(out, name || 'Piso');
            this.closeFloorPickerModal();
        };

        const canvas = document.getElementById('floor-crop-canvas');
        if (canvas) {
            canvas.addEventListener('mousedown', (e) => this.floorPickerStartSelect(e));
            window.addEventListener('mousemove', (e) => this.floorPickerMoveSelect(e));
            window.addEventListener('mouseup', () => this.floorPickerEndSelect());
        }
    }



    resetFloorPickerCrop() {
        this._floorPicker = { img: null, sourceUrl: null, canvasScale: 1, drawW: 0, drawH: 0, drawX: 0, drawY: 0, selecting: false, start: null, rect: null };
        const wrap = document.getElementById('floor-crop-wrap');
        if (wrap) wrap.style.display = 'none';
        const corsHint = document.getElementById('floor-picker-cors-hint');
        if (corsHint) corsHint.style.display = 'none';
        const btnUseLink = document.getElementById('btn-floor-use-link');
        if (btnUseLink) btnUseLink.style.display = 'none';
        const btnFull = document.getElementById('btn-floor-use-full');
        if (btnFull) btnFull.disabled = false;
        const btnCrop = document.getElementById('btn-floor-crop-save');
        if (btnCrop) btnCrop.disabled = false;
        const canvas = document.getElementById('floor-crop-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
        const name = document.getElementById('floor-picker-name');
        if (name) name.value = '';
        const url = document.getElementById('floor-picker-url');
        if (url) url.value = '';
        const file = document.getElementById('floor-picker-file');
        try { if (file) file.value = ''; } catch {}
    }

    async floorPickerLoadSource({ url, file }) {
        if (!this.isMaster) return;
        let dataUrl = '';
        let name = '';

        this._floorPicker.sourceUrl = null;

        if (file) {
            if (file.size > 260000) {
                alert('Arquivo muito grande. Use imagens menores.');
                return;
            }
            name = String(file.name || '').replace(/\.(png|jpe?g|webp)$/i, '').trim();
            dataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => resolve('');
                reader.readAsDataURL(file);
            });

            if (!dataUrl) return;
            const img = new Image();
            img.onload = () => {
                this._floorPicker.img = img;
                const inputName = document.getElementById('floor-picker-name');
                if (inputName && !String(inputName.value || '').trim()) inputName.value = name;
                const wrap = document.getElementById('floor-crop-wrap');
                if (wrap) wrap.style.display = 'block';
                const btnUseLink = document.getElementById('btn-floor-use-link');
                if (btnUseLink) btnUseLink.style.display = 'none';
                const corsHint = document.getElementById('floor-picker-cors-hint');
                if (corsHint) corsHint.style.display = 'none';
                const btnFull = document.getElementById('btn-floor-use-full');
                if (btnFull) btnFull.disabled = false;
                const btnCrop = document.getElementById('btn-floor-crop-save');
                if (btnCrop) btnCrop.disabled = false;
                this.floorPickerDraw();
            };
            img.src = dataUrl;
            return;
        }

        if (!url) return;
        name = url.split('/').pop() || 'Piso';
        this._floorPicker.sourceUrl = url;

        const btnUseLink = document.getElementById('btn-floor-use-link');
        if (btnUseLink) btnUseLink.style.display = 'inline-flex';

        const loadImage = (useAnonymous) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                if (useAnonymous) img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('load_failed'));
                img.src = url;
            });
        };

        let img = null;
        try {
            img = await loadImage(true);
        } catch {
            try {
                img = await loadImage(false);
            } catch {
                alert('Não consegui carregar esse link (site bloqueou hotlink/CORS). Baixe a imagem e faça upload.');
                return;
            }
        }

        this._floorPicker.img = img;
        const inputName = document.getElementById('floor-picker-name');
        if (inputName && !String(inputName.value || '').trim()) inputName.value = name;
        const wrap = document.getElementById('floor-crop-wrap');
        if (wrap) wrap.style.display = 'block';
        this.floorPickerDraw();

        const canExport = this.floorPickerCanExport();
        const corsHint = document.getElementById('floor-picker-cors-hint');
        const btnFull = document.getElementById('btn-floor-use-full');
        const btnCrop = document.getElementById('btn-floor-crop-save');
        if (!canExport) {
            if (corsHint) corsHint.style.display = 'block';
            if (btnFull) btnFull.disabled = true;
            if (btnCrop) btnCrop.disabled = true;
        } else {
            if (corsHint) corsHint.style.display = 'none';
            if (btnFull) btnFull.disabled = false;
            if (btnCrop) btnCrop.disabled = false;
        }
    }

    floorPickerCanExport() {
        const img = this._floorPicker.img;
        if (!img) return false;
        try {
            const test = document.createElement('canvas');
            test.width = 2;
            test.height = 2;
            const ctx = test.getContext('2d');
            ctx.drawImage(img, 0, 0, 2, 2);
            test.toDataURL('image/png');
            return true;
        } catch {
            return false;
        }
    }

    floorPickerDraw() {
        const canvas = document.getElementById('floor-crop-canvas');
        const img = this._floorPicker.img;
        if (!canvas || !img) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const pad = 10;
        const maxW = canvas.width - pad * 2;
        const maxH = canvas.height - pad * 2;
        const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
        const drawW = Math.round(img.naturalWidth * scale);
        const drawH = Math.round(img.naturalHeight * scale);
        const drawX = Math.round((canvas.width - drawW) / 2);
        const drawY = Math.round((canvas.height - drawH) / 2);

        this._floorPicker.canvasScale = scale;
        this._floorPicker.drawW = drawW;
        this._floorPicker.drawH = drawH;
        this._floorPicker.drawX = drawX;
        this._floorPicker.drawY = drawY;

        ctx.drawImage(img, drawX, drawY, drawW, drawH);

        const r = this._floorPicker.rect;
        if (r) {
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(drawX, drawY, drawW, drawH);
            ctx.restore();

            ctx.save();
            ctx.beginPath();
            ctx.rect(r.x, r.y, r.w, r.h);
            ctx.clip();
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
            ctx.restore();

            ctx.save();
            ctx.strokeStyle = 'rgba(110,168,254,0.95)';
            ctx.lineWidth = 2;
            ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h);
            ctx.restore();
        }
    }

    floorPickerCanvasPoint(e) {
        const canvas = document.getElementById('floor-crop-canvas');
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);
        return { x, y };
    }

    floorPickerClampToImageRect(x, y) {
        const { drawX, drawY, drawW, drawH } = this._floorPicker;
        return {
            x: Math.max(drawX, Math.min(drawX + drawW, x)),
            y: Math.max(drawY, Math.min(drawY + drawH, y))
        };
    }

    floorPickerStartSelect(e) {
        const img = this._floorPicker.img;
        if (!img) return;
        const p = this.floorPickerCanvasPoint(e);
        if (!p) return;
        const c = this.floorPickerClampToImageRect(p.x, p.y);
        this._floorPicker.selecting = true;
        this._floorPicker.start = c;
        this._floorPicker.rect = { x: c.x, y: c.y, w: 0, h: 0 };
        this.floorPickerDraw();
    }

    floorPickerMoveSelect(e) {
        if (!this._floorPicker.selecting) return;
        const img = this._floorPicker.img;
        if (!img) return;
        const p = this.floorPickerCanvasPoint(e);
        if (!p) return;
        const c = this.floorPickerClampToImageRect(p.x, p.y);
        const s = this._floorPicker.start;
        if (!s) return;
        const x = Math.min(s.x, c.x);
        const y = Math.min(s.y, c.y);
        const w = Math.abs(c.x - s.x);
        const h = Math.abs(c.y - s.y);
        this._floorPicker.rect = { x, y, w, h };
        this.floorPickerDraw();
    }

    floorPickerEndSelect() {
        if (!this._floorPicker.selecting) return;
        this._floorPicker.selecting = false;
        const r = this._floorPicker.rect;
        if (r && (r.w < 10 || r.h < 10)) {
            this._floorPicker.rect = null;
            this.floorPickerDraw();
        }
    }

    floorPickerExportFull() {
        const img = this._floorPicker.img;
        if (!img) return '';
        const out = document.createElement('canvas');
        out.width = img.naturalWidth;
        out.height = img.naturalHeight;
        const ctx = out.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return out.toDataURL('image/png');
    }

    floorPickerExportCrop() {
        const img = this._floorPicker.img;
        const r = this._floorPicker.rect;
        if (!img) return '';
        if (!r) return this.floorPickerExportFull();

        const { drawX, drawY, canvasScale } = this._floorPicker;
        const sx = Math.max(0, Math.round((r.x - drawX) / canvasScale));
        const sy = Math.max(0, Math.round((r.y - drawY) / canvasScale));
        const sw = Math.max(1, Math.round(r.w / canvasScale));
        const sh = Math.max(1, Math.round(r.h / canvasScale));

        const out = document.createElement('canvas');
        out.width = sw;
        out.height = sh;
        const ctx = out.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        return out.toDataURL('image/png');
    }

    async addFloorTextureFromDataUrl(dataUrl, name) {
        if (!this.isMaster) return;
        const next = Array.isArray(this.floorTextures) ? [...this.floorTextures] : [];
        const id = `tex_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
        next.push({ id, name: String(name || 'Piso'), url: String(dataUrl) });
        this.floorTextures = next.slice(-80);
        this.selectedFloorTextureId = id;
        this.floorSubMode = 'paint';
        this.floorRemoveMode = false;
        this.activeMapTool = 'floor';
        this.updateMapToolUI();
        this.schedulePersistFloorTextures();
    }

    renderBuiltinFloorPicker() {
        const grid = document.getElementById('floor-builtin-grid');
        if (!grid) return;
        if (!this._builtinFloorBase) {
            grid.innerHTML = '<div style="opacity:0.75; font-size:0.85rem;">Carregando pisos...</div>';
            this.resolveBuiltinFloorBase().then(() => this.renderBuiltinFloorPicker());
            return;
        }

        const base = String(this._builtinFloorBase || '').trim();
        const files = Array.isArray(BUILTIN_FLOOR_FILES) ? BUILTIN_FLOOR_FILES : [];
        if (!base || !files.length) {
            grid.innerHTML = '<div style="opacity:0.75; font-size:0.85rem;">Nenhum piso encontrado na pasta.</div>';
            return;
        }

        const list = files.map((file) => {
            const rawFile = String(file || '').trim();
            const name = rawFile.replace(/\.(png|jpe?g|webp)$/i, '').trim();
            const url = encodeURI(`${base}${rawFile}`);
            const id = `builtin_${name.toLowerCase().replace(/\s+/g, '_')}`;
            return { id, name, url };
        });

        grid.innerHTML = list.map(t => {
            const selected = this._floorBuiltinSelected.has(t.id);
            const safeName = String(t.name || 'Piso').replace(/"/g, '&quot;');
            return `
                <div class="floor-picker-tile${selected ? ' multi-selected' : ''}" data-builtin-id="${t.id}" data-builtin-name="${safeName}" data-builtin-url="${t.url}">
                    <div class="floor-picker-thumb">
                        <img src="${t.url}" alt="" loading="lazy" />
                    </div>
                    <div style="min-width:0;">
                        <div class="floor-picker-name">${safeName}</div>
                        <div style="font-size:0.72rem; opacity:0.75;">Clique para selecionar</div>
                    </div>
                </div>
            `;
        }).join('');

        grid.querySelectorAll('.floor-picker-tile').forEach((tile) => {
            tile.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = String(tile.dataset.builtinId || '');
                if (!id) return;
                if (this._floorBuiltinSelected.has(id)) this._floorBuiltinSelected.delete(id);
                else this._floorBuiltinSelected.add(id);
                tile.classList.toggle('multi-selected', this._floorBuiltinSelected.has(id));
            });
        });
    }

    async confirmBuiltinFloors() {
        if (!this.isMaster) return;
        const selectedIds = Array.from(this._floorBuiltinSelected || []);
        if (!selectedIds.length) {
            alert('Selecione pelo menos um piso.');
            return;
        }

        const grid = document.getElementById('floor-builtin-grid');
        if (!grid) return;
        const tiles = Array.from(grid.querySelectorAll('.floor-picker-tile.multi-selected'));
        const selected = tiles.map((t) => {
            const name = String(t.dataset.builtinName || '').trim();
            const url = String(t.dataset.builtinUrl || t.dataset.builtinUrlPrimary || '').trim();
            const id = String(t.dataset.builtinId || '').trim();
            return { id, name, url };
        }).filter(x => x.id && x.name && x.url);
        if (!selected.length) return;

        const existing = Array.isArray(this.floorTextures) ? [...this.floorTextures] : [];
        const existingUrls = new Set(existing.map(x => String(x?.url || '')));

        const toAdd = selected
            .filter(x => !existingUrls.has(String(x.url || '')))
            .map(x => ({ id: x.id, name: x.name, url: x.url }));

        if (!toAdd.length) {
            this.activeMapTool = 'floor';
            this.floorSubMode = 'paint';
            this.floorRemoveMode = false;
            this.updateMapToolUI();
            this.closeFloorPickerModal();
            return;
        }

        this.floorTextures = [...existing, ...toAdd].slice(-120);
        if (!this.selectedFloorTextureId) this.selectedFloorTextureId = toAdd[0].id;
        this.activeMapTool = 'floor';
        this.floorSubMode = 'paint';
        this.floorRemoveMode = false;
        this.updateMapToolUI();
        this.schedulePersistFloorTextures();
        this.closeFloorPickerModal();
    }

    async addFloorTextureFromUrl(url, name) {
        if (!this.isMaster) return;
        const next = Array.isArray(this.floorTextures) ? [...this.floorTextures] : [];
        const id = `tex_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
        next.push({ id, name: String(name || 'Piso'), url: String(url) });
        this.floorTextures = next.slice(-80);
        this.selectedFloorTextureId = id;
        this.floorSubMode = 'paint';
        this.floorRemoveMode = false;
        this.activeMapTool = 'floor';
        this.updateMapToolUI();
        this.schedulePersistFloorTextures();
    }

    renderFloorPickerTextures() {
        const grid = document.getElementById('floor-picker-textures');
        if (!grid) return;
        const list = Array.isArray(this.floorTextures) ? this.floorTextures : [];
        if (!list.length) {
            grid.innerHTML = '<div style="opacity:0.75; font-size:0.85rem;">Nenhum piso salvo ainda.</div>';
            return;
        }

        grid.innerHTML = list.map(t => {
            const selected = this.selectedFloorTextureId === t.id;
            const safeName = String(t.name || 'Piso').replace(/"/g, '&quot;');
            return `
                <div class="floor-picker-tile${selected ? ' selected' : ''}" data-tex-id="${t.id}">
                    <div class="floor-picker-thumb" style="background-image: url('${t.url}')"></div>
                    <div style="min-width:0;">
                        <div class="floor-picker-name">${safeName}</div>
                        <div style="font-size:0.72rem; opacity:0.75;">Clique para equipar</div>
                    </div>
                </div>
            `;
        }).join('');

        grid.querySelectorAll('.floor-picker-tile').forEach((tile) => {
            tile.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = tile.dataset.texId;
                this.selectedFloorTextureId = id;
                this.floorSubMode = 'paint';
                this.floorRemoveMode = false;
                this.activeMapTool = 'floor';
                this.updateMapToolUI();
                this.closeFloorPickerModal();
            });
        });
    }

    hideMapContextMenu() {
        const menu = document.getElementById('map-context-menu');
        if (!menu) return;
        menu.classList.remove('active');
        menu.style.left = '';
        menu.style.top = '';
        menu.style.visibility = '';
        this.mapContextTarget = null;
    }

    openMapContextMenu(target, clientX, clientY) {
        const menu = document.getElementById('map-context-menu');
        if (!menu || !target) return;

        if (target.kind === 'object' || target.kind === 'fog') {
            this.mapContextTarget = target;
            menu.innerHTML = `
                <button type="button" data-action="move" ${target.canMove ? '' : 'disabled'}>
                    <span>Mover</span>
                    <i class="fas fa-arrows-alt"></i>
                </button>
                <button type="button" data-action="rotate" ${target.canMove ? '' : 'disabled'}>
                    <span>Girar</span>
                    <i class="fas fa-sync"></i>
                </button>
                <button type="button" data-action="delete" ${target.canDelete ? '' : 'disabled'}>
                    <span>Deletar</span>
                    <i class="fas fa-trash"></i>
                </button>
            `;
           
            

            menu.onclick = async (e) => {
                e.stopPropagation();
                const btn = e.target.closest('button');
                if (!btn) return;
                const act = btn.dataset.action;
                const t = this.mapContextTarget;
                if (!t) return;
                if (act === 'move') {
                    this.startMovingMapObject(t.id);
                    this.hideMapContextMenu();
                    return;
                }
                if (act === 'rotate') {
                    const o = (Array.isArray(this.mapObjects) ? this.mapObjects : []).find(x => x && x.id === t.id);
                    if (o && !o.locked) {
                        const next = (Math.round(Number(o.rot) || 0) + 90) % 360;
                        this.patchMapObject(t.id, { rot: next });
                    }
                    this.hideMapContextMenu();
                    return;
                }
                if (act === 'delete') {
                    this.removeMapObject(t.id);
                    this.hideMapContextMenu();
                    return;
                }
            };

            menu.classList.add('active');
            menu.style.visibility = 'hidden';
            menu.style.left = '0px';
            menu.style.top = '0px';

            const rect = menu.getBoundingClientRect();
            const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
            const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
            const left = Math.min(Math.max(8, clientX), maxLeft);
            const top = Math.min(Math.max(8, clientY), maxTop);
            menu.style.left = `${left}px`;
            menu.style.top = `${top}px`;
            menu.style.visibility = '';
            return;
        }

        const colors = [
            { label: 'none', c: 'transparent' },
            { label: 'gold', c: '#ffd700' },
            { label: 'blue', c: '#6ea8fe' },
            { label: 'green', c: '#2ecc71' },
            { label: 'red', c: '#ff4444' },
            { label: 'purple', c: '#a55eea' },
            { label: 'white', c: '#ffffff' },
            { label: 'black', c: '#111111' }
        ];

        this.mapContextTarget = target;

        menu.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 6px;">
            <button type="button" data-action="move" ${target.canMove ? '' : 'disabled'}>
                <span>Mover</span>
                <i class="fas fa-arrows-alt"></i>
            </button>
            <button type="button" data-action="duplicate" ${target.canDuplicate ? '' : 'disabled'}>
                <span>Duplicar</span>
                <i class="fas fa-clone"></i>
            </button>
            <button type="button" data-action="delete" ${target.canDelete ? '' : 'disabled'}>
                <span>Deletar</span>
                <i class="fas fa-trash"></i>
            </button>
            <div class="menu-sep" style="display: none;"></div>
            <div class="menu-colors" data-action="border" style="display: none;">
                ${colors.map(x => `<div class="menu-color" role="button" tabindex="0" data-color="${x.c}" style="--c: ${x.c};" title="${x.label}"></div>`).join('')}
            </div>
            </div>
        `;

        menu.onclick = async (e) => {
            e.stopPropagation();
            const btn = e.target.closest('button');
            const swatch = e.target.closest('.menu-color');
            const t = this.mapContextTarget;
            if (!t) return;

            if (btn) {
                const act = btn.dataset.action;
                if (act === 'move') {
                    if (t.kind === 'token') this.startMovingToken(t.id);
                    if (t.kind === 'asset') this.startMovingAsset(t.id);
                    if (t.kind === 'floor') this.startMovingFloorTile(t.id);
                    if (t.kind === 'object') this.startMovingMapObject(t.id);
                    this.hideMapContextMenu();
                    return;
                }
                if (act === 'duplicate') {
                    if (t.kind === 'token') await this.duplicateToken(t.id);
                    if (t.kind === 'asset') await this.duplicateMapAsset(t.id);
                    if (t.kind === 'floor') await this.duplicateFloorTile(t.id);
                    this.hideMapContextMenu();
                    return;
                }
                if (act === 'delete') {
                    if (t.kind === 'token') await this.removeToken(t.id);
                    if (t.kind === 'asset') await this.removeMapAsset(t.id);
                    if (t.kind === 'floor') await this.removeFloorTile(t.id);
                    this.hideMapContextMenu();
                    return;
                }
            }

            if (swatch && t.canBorderColor) {
                const color = String(swatch.dataset.color || '').trim();
                const next = (color === 'transparent') ? null : color;
                if (t.kind === 'token') await this.patchToken(t.id, { borderColor: next });
                if (t.kind === 'asset') await this.patchMapAsset(t.id, { borderColor: next });
                if (t.kind === 'floor') await this.patchFloorTile(t.id, { borderColor: next });
                this.hideMapContextMenu();
            }
        };

        menu.classList.add('active');
        menu.style.visibility = 'hidden';
        menu.style.left = '0px';
        menu.style.top = '0px';

        const rect = menu.getBoundingClientRect();
        const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
        const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
        const left = Math.min(Math.max(8, clientX), maxLeft);
        const top = Math.min(Math.max(8, clientY), maxTop);

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.visibility = '';
    }

    setupStandbyLogic() {
        if (this._listenersBound?.standby) return;
        this._listenersBound.standby = true;
        let timeout;
        const standbyOverlay = document.getElementById('standby-overlay');
        
        if (!standbyOverlay) return;

        const resetTimer = () => {
            if (standbyOverlay.classList.contains('active')) {
                standbyOverlay.classList.remove('active');
            }
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                standbyOverlay.classList.add('active');
            }, 600000);
        };

        // Eventos que resetam o timer
        window.addEventListener('mousemove', resetTimer);
        window.addEventListener('mousedown', resetTimer);
        window.addEventListener('keypress', resetTimer);
        window.addEventListener('touchstart', resetTimer);
        window.addEventListener('scroll', resetTimer);

        resetTimer(); // Inicia o timer na primeira vez
    }

    setupMapNavigation() {
        if (this._listenersBound?.mapNavigation) return;
        this._listenersBound.mapNavigation = true;
        const area = document.querySelector('.map-area');
        const mapContainer = document.getElementById('map-container');
        const measureLayer = document.getElementById('measure-layer');
        if (!area || !mapContainer) return;
        if (!this._listenersBound?.blockedFloorBtn) {
            this._listenersBound.blockedFloorBtn = true;
            const btnBlockedFloor = document.getElementById('btn-blocked-floor');
            if (btnBlockedFloor) {
                btnBlockedFloor.onclick = () => {
                    const measureLayer = document.querySelector('.measure-layer');
                    measureLayer.style.pointerEvents = this._blockedFloor ? 'none' : 'auto';
                    this._blockedFloor = !this._blockedFloor;
                    btnBlockedFloor.classList.toggle('active', !!this._blockedFloor);
                    if (this._blockedFloor) {
                        this.isMovingFloorTile = false;
                        this.movingFloorTile = null;
                        const overlay = document.getElementById('targeting-overlay');
                        if (overlay) overlay.style.display = 'none';
                        if (this.isFloorPainting) this.finishFloorPaint();
                    }
                };
            }
        }


        area.onmousedown = (e) => {
            if (this.isMaster  && this.deleteMode && e.button === 0) {
                this.startDeleteMarquee(e);
                return;
            }
            if (this.isMaster && e.button === 0 && this.activeMapTool === 'draw') {
                this.startOverlayDraw(e);
                return;
            }
            if (this.isMaster && e.button === 0 && this.activeMapTool === 'fog') {
                this.startOverlayFog(e);
                return;
            }
            if (this.isMaster && e.button === 0 && this.activeMapTool === 'path' && this.pathState?.mode === 'paint' && this.pathState?.a && this.pathState?.b) {
                this.startOverlayPath(e);
                return;
            }

            if (e.button === 0 && this.activeGmTool === 'measure' && this.isMaster) {
                e.preventDefault();
                this.isMeasuring = true;
                const rect = mapContainer.getBoundingClientRect();
                const x = (e.clientX - rect.left) / this.scale;
                const y = (e.clientY - rect.top) / this.scale;
                this.measureStart = { x, y };

                const line = document.createElement('div');
                line.className = 'measure-line';
                const label = document.createElement('div');
                label.className = 'measure-label';
                label.textContent = '0 ft';

                this.measureEls = { line, label };
                if (measureLayer) {
                    measureLayer.appendChild(line);
                    measureLayer.appendChild(label);
                }
                return;
            }

           

            this.didPan = false;
            const canPanLeft = !this.isMaster || this.activeMapTool === 'hand' || e.button === 0;
            const blocked = !!(e.target.closest('.token') || e.target.closest('.map-asset') || e.target.closest('.floor-tile') || e.target.closest('.control-btn') || e.target.closest('#map-context-menu'));
            // mobile hand tool touchstart / touchmove / touchend
            
            if (e.button === 1 || (e.button === 0 && canPanLeft && !blocked) || e.type === 'touchstart') {
                this.isPanning = true;
                this.didPan = false;
                area.style.cursor = 'grabbing';
            }
        };
        
        // Clique no mapa para mover ou selecionar alvo
        area.onclick = async (e) => {
            if (Date.now() - this.lastPanTime < 180) return;

            if (this.isMaster && this.deleteMode && Date.now() < (this._deleteClickBlockUntil || 0)) {
                return;
            }
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let lastX = 0;
        let lastY = 0;

        area.addEventListener('touchstart', (e) => {
            const mobile = true;
        
            if (mobile && this.isMaster && this.activeMapTool === 'hand') {
                const touch = e.touches[0];
            
                isDragging = true;
                startX = touch.clientX - lastX;
                startY = touch.clientY - lastY;
            }
        });

        area.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
        
            const touch = e.touches[0];      
        
            lastX = touch.clientX - startX;
            lastY = touch.clientY - startY;
        
            area.style.transform = `translate(${lastX}px, ${lastY}px)`;

        });

        area.addEventListener('touchend', () => {
            isDragging = false;
            // area.style.transform = `translate(${panX}px, ${panY}px)`;
        }
        
    );


            if (this.isMovingFloorTile && this.movingFloorTileId) {
                if (this._blockedFloor) return;
                const rect = mapContainer.getBoundingClientRect();
                const x = (e.clientX - rect.left) / this.scale;
                const y = (e.clientY - rect.top) / this.scale;
                const gridX = Math.floor(x / 50) * 50;
                const gridY = Math.floor(y / 50) * 50;
                await this.moveFloorTileTo(gridX, gridY);
                return;
            }

            if (this.isMovingMapObject && this.movingMapObjectId) {
                const rect = mapContainer.getBoundingClientRect();
                const x = (e.clientX - rect.left) / this.scale;
                const y = (e.clientY - rect.top) / this.scale;
                const gridX = Math.floor(x / 50) * 50;
                const gridY = Math.floor(y / 50) * 50;
                await this.moveMapObjectTo(gridX, gridY);
                return;
            }

            if (this.isMaster && this.activeMapTool === 'floor' && this.floorSubMode === 'paint' && !this.floorRemoveMode && !this.deleteMode) {
                if (this._blockedFloor) {
                    alert('Piso bloqueado.');
                    return;
                }
                if (!this.selectedFloorTextureId) {
                    alert('Selecione um piso primeiro.');
                    return;
                }
                const tex = this.getFloorTextureById(this.selectedFloorTextureId);
                if (!tex) return;
                this.paintFloorAtClient(e.clientX, e.clientY, tex);
                this.schedulePersistFloorTiles();
                return;
            }

            if (this.isMaster && this.activeMapTool === 'text') {
                const value = String(document.getElementById('text-value')?.value || '').trim();
                if (!value) return;
                const rect = mapContainer.getBoundingClientRect();
                const x = (e.clientX - rect.left) / this.scale;
                const y = (e.clientY - rect.top) / this.scale;
                this.addTextOp(value, x, y);
                return;
            }

            if (this.isMaster && this.activeMapTool === 'path' && (this.pathState?.mode === 'setA' || this.pathState?.mode === 'setB')) {
                const rect = mapContainer.getBoundingClientRect();
                const x = (e.clientX - rect.left) / this.scale;
                const y = (e.clientY - rect.top) / this.scale;
                if (this.pathState.mode === 'setA') this.pathState.a = { x, y };
                if (this.pathState.mode === 'setB') this.pathState.b = { x, y };
                this.pathState.mode = null;
                this.persistPathState();
                this.renderDrawLayer();
                return;
            }

            if (this.isMaster && this.activeGmTool === 'ping') {
                const rect = mapContainer.getBoundingClientRect();
                const x = (e.clientX - rect.left) / this.scale;
                const y = (e.clientY - rect.top) / this.scale;
                this.spawnPing(x, y);
                
                return;
            }

            if (this.isPlacingToken && this.pendingTokenPlacement) {
                const rect = mapContainer.getBoundingClientRect();
                const x = (e.clientX - rect.left) / this.scale;
                const y = (e.clientY - rect.top) / this.scale;
                const gridX = Math.floor(x / 50) * 50;
                const gridY = Math.floor(y / 50) * 50;
                await this.addTokenToMap(this.pendingTokenPlacement.data, gridX, gridY, this.pendingTokenPlacement.type);
                this.isPlacingToken = false;
                this.pendingTokenPlacement = null;
                document.getElementById('targeting-overlay').style.display = 'none';
                this.renderTokens();
                return;
            }

            if (this.isPlacingAsset && this.pendingAssetPlacement) {
                const rect = mapContainer.getBoundingClientRect();
                const x = (e.clientX - rect.left) / this.scale;
                const y = (e.clientY - rect.top) / this.scale;
                const gridX = Math.floor(x / 50) * 50;
                const gridY = Math.floor(y / 50) * 50;
                await this.addAssetToMap(this.pendingAssetPlacement.url, gridX, gridY);
                this.isPlacingAsset = false;
                this.pendingAssetPlacement = null;
                document.getElementById('targeting-overlay').style.display = 'none';
                return;
            }

            if (this.isPlacingMapObject && this.pendingMapObjectPlacement) {
                const rect = mapContainer.getBoundingClientRect();
                const x = (e.clientX - rect.left) / this.scale;
                const y = (e.clientY - rect.top) / this.scale;
                const gridX = Math.floor(x / 50) * 50;
                const gridY = Math.floor(y / 50) * 50;
                const name = String(this.pendingMapObjectPlacement.name || '').trim();
                const imageUrl = String(this.pendingMapObjectPlacement.image_url || '').trim();
                if (name && imageUrl) {
                    const obj = {
                        id: `obj_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`,
                        name,
                        image_url: imageUrl,
                        x: gridX,
                        y: gridY,
                        w: 120,
                        h: 120,
                        rot: 0,
                        scale: 1,
                        opacity: 1
                    };
                    this.mapObjects = [...(Array.isArray(this.mapObjects) ? this.mapObjects : []), obj];
                    this.selectedMapObjectId = obj.id;
                    this.renderMapObjects();
                    this.schedulePersistMapObjects();
                }
                this.isPlacingMapObject = false;
                this.pendingMapObjectPlacement = null;
                document.getElementById('targeting-overlay').style.display = 'none';
                return;
            }

            if (this.isMaster && this.selectedAssetId && document.getElementById('targeting-overlay').style.display === 'flex') {
                const rect = mapContainer.getBoundingClientRect();
                const x = (e.clientX - rect.left) / this.scale;
                const y = (e.clientY - rect.top) / this.scale;
                const gridX = Math.floor(x / 50) * 50;
                const gridY = Math.floor(y / 50) * 50;
                await this.moveAssetTo(gridX, gridY);
                document.getElementById('targeting-overlay').style.display = 'none';
                return;
            }

            if (e.target.closest('.token') || e.target.closest('.map-asset') || e.target.closest('.floor-tile') || e.target.closest('.map-object') || e.target.closest('.control-btn')) return;

            if (this.isMaster && this.deleteMode) {
                this.clearDeleteSelection();
                this.renderDeleteBar();
                this.renderFloorTiles();
                this.renderMapAssets();
                this.renderMapObjects();
                this.renderTokens();
                this.renderGmTokenPanel();
                // deletar texto
                
                return;
            }
            


            if (this.isMovingToken || this.isTargeting) {

                const rect = mapContainer.getBoundingClientRect();
                const x = (e.clientX - rect.left) / this.scale;
                const y = (e.clientY - rect.top) / this.scale;

                const gridX = Math.floor(x / 50) * 50;
                const gridY = Math.floor(y / 50) * 50;

                if (this.isMovingToken) {
                    await this.moveTokenTo(gridX, gridY);
                }
                return;
            }

            if (this.selectedTokenId) {
                this.selectedTokenId = null;
                this.renderTokens();
                this.renderGmTokenPanel();
            }
        };

        window.onmousemove = (e) => {
            if (this.isDeleteMarqueeSelecting) {
                this.updateDeleteMarqueeFromMouse(e);
                return;
            }
            if (this.isFloorPainting) {
                if (this._blockedFloor) {
                    this.finishFloorPaint();
                    return;
                }
                this.updateFloorPaint(e);
                return;
            }
            if (this.isOverlayDrawing) {
                this.updateOverlayDraw(e);
                return;
            }

            if (this.isMeasuring && this.measureStart && this.measureEls) {
                const rect = mapContainer.getBoundingClientRect();
                const x = (e.clientX - rect.left) / this.scale;
                const y = (e.clientY - rect.top) / this.scale;

                const dx = x - this.measureStart.x;
                const dy = y - this.measureStart.y;
                const distPx = Math.sqrt(dx * dx + dy * dy);
                const distSquares = distPx / 50;
                const distFt = Math.round(distSquares * 5);

                const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                this.measureEls.line.style.left = `${this.measureStart.x}px`;
                this.measureEls.line.style.top = `${this.measureStart.y}px`;
                this.measureEls.line.style.width = `${distPx}px`;
                this.measureEls.line.style.transform = `rotate(${angle}deg)`;

                this.measureEls.label.style.left = `${this.measureStart.x + dx / 2}px`;
                this.measureEls.label.style.top = `${this.measureStart.y + dy / 2}px`;
                this.measureEls.label.textContent = `${distFt} ft`;
                return;
            }
            if (!this.isPanning) return;
            this.didPan = true;
            this.lastPanTime = Date.now();
            this.panX += e.movementX;
            this.panY += e.movementY;
            this.updateMapTransform();
        };

        window.onmouseup = () => {
            if (this.isDeleteMarqueeSelecting) {
                this.finishDeleteMarquee();
            }
            if (this.isFloorPainting) {
                this.finishFloorPaint();
            }
            if (this.isOverlayDrawing) {
                this.finishOverlayDraw();
            }
            this.isPanning = false;
            this.updateMapToolUI();
            if (this.isMeasuring) {
                this.isMeasuring = false;
                // this.measureStart = null;
                const els = this.measureEls;
                this.measureEls = null;
                setTimeout(() => {
                    els?.line?.remove();
                    els?.label?.remove();
                }, 20000);
            }
        };

        area.onwheel = (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.setMapScale(this.scale * delta);
        };
    }

    setMapScale(next) {
        const n = Number(next);
        const base = Number.isFinite(n) ? n : (Number.isFinite(this.scale) ? this.scale : 0.1);
        this.newScale = Math.max(0.1, Math.min(base, 1));

        this.updateMapTransform();
        const r = document.getElementById('range-map-zoom');
        if (r) r.value = String(this.newScale);
        const label = document.getElementById('map-zoom-label');
        if (label) label.textContent = `${Math.round(this.newScale * 100)}%`;

        // Atualiza scale
        this.scale = this.newScale;
    }
    


    updateMapTransform() {
        const container = document.getElementById('map-container');
        if (container) {
            // Centraliza o mapa no meio da área visível
            // container.style.transform = `translate3d(${this.panX}px, ${this.panY}px, 0) scale(${this.newScale})`;
            container.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.newScale})`;
            
        }
    }

        centerMap() { 
        const area = document.querySelector('.map-area'); 
        if (!area) return; 
        const areaRect = area.getBoundingClientRect(); 
        // Centraliza o mapa de 3000px no meio da área visível 
        // this.newScale = Math.min(3, Math.max(0.2, areaRect.width / 2400)); 
        console.log(this.newScale); 
        this.newScale = Math.min(3, Math.max(0.2, areaRect.width / 2400)); 
        this.panX = (areaRect.width / 2) - (1900 * this.newScale / 2 - areaRect.left); 
        this.panY = (areaRect.height / 2) - (-1400 * this.newScale / 2 - areaRect.top); 
        const r = document.getElementById('range-map-zoom'); 
        if (r) r.value = String(this.newScale); 
        const label = document.getElementById('map-zoom-label'); 
        if (label) label.textContent = `${Math.round(this.newScale * 100)}%`; 
        this.updateMapTransform(); 
        }

        setupZoomControl() { 
        const btnIn = document.getElementById('btn-zoom-in'); 
        const btnOut = document.getElementById('btn-zoom-out'); 
        const range = document.getElementById('range-map-zoom'); 
        const centerBtn = document.getElementById('btn-center');
        if (centerBtn) centerBtn.onclick = () => this.centerMap();
        if (btnIn) btnIn.onclick = () => this.setMapScale(this.newScale * 1.2); 
        if (btnOut) btnOut.onclick = () => this.setMapScale(this.newScale * 0.9); 
        if (range) range.oninput = (e) => this.setMapScale(parseFloat(e.target.value || '0.2')); 
        this.setMapScale(this.newScale);    
    }




    setupMapOverlays() {
        this.drawCanvas = document.getElementById('draw-layer');
        this.fogCanvas = document.getElementById('fog-layer');

        this.drawCtx = this.drawCanvas?.getContext?.('2d') || null;
        this.fogCtx = this.fogCanvas?.getContext?.('2d') || null;

        this.fogStore = document.createElement('canvas');
        this.fogStore.width = 1000;
        this.fogStore.height = 3000;
        this.fogStoreCtx = this.fogStore.getContext('2d');

        this.renderDrawLayer();
        this.renderFogLayer();
        this.updateMapToolUI();
    }

    setupMapToolsUI() {
        const panel = document.getElementById('map-tools-panel');
        if (panel) {
            panel.onclick = (e) => e.stopPropagation();
            panel.onmousedown = (e) => e.stopPropagation();
            panel.onpointerdown = (e) => e.stopPropagation();
        }

        const drawMode = document.getElementById('draw-mode');
        const drawColor = document.getElementById('draw-color');
        const drawSize = document.getElementById('draw-size');
        const drawOpacity = document.getElementById('draw-opacity');
        const drawUndo = document.getElementById('draw-undo');
        const drawClear = document.getElementById('draw-clear');

        if (drawMode) drawMode.onchange = () => {};
        if (drawColor) drawColor.oninput = () => {};
        if (drawSize) drawSize.oninput = () => {};
        if (drawOpacity) drawOpacity.oninput = () => {};

        if (drawUndo) {
            drawUndo.onclick = async () => {
                if (!this.isMaster) return;
                if (!this.drawOps.length) return;
                this.drawOps.pop();
                await this.persistDrawOps();
                this.renderDrawLayer();
            };
        }

        if (drawClear) {
            drawClear.onclick = async () => {
                if (!this.isMaster) return;
                this.drawOps = [];
                await this.persistDrawOps();
                this.renderDrawLayer();
            };
        }


        const pathSetA = document.getElementById('path-set-a');
        const pathSetB = document.getElementById('path-set-b');
        const pathPaint = document.getElementById('path-paint');
        const pathClear = document.getElementById('path-clear');
        const pathColor = document.getElementById('path-color');

        if (pathColor) {
            pathColor.oninput = () => {
                this.pathState.color = String(pathColor.value || '#00ff88');
                this.persistPathState();
                this.renderDrawLayer();
            };
        }
        if (pathSetA) pathSetA.onclick = () => { this.pathState.mode = 'setA'; };
        if (pathSetB) pathSetB.onclick = () => { this.pathState.mode = 'setB'; };
        if (pathPaint) pathPaint.onclick = () => { this.pathState.mode = 'paint'; };
        if (pathClear) {
            pathClear.onclick = async () => {
                if (!this.isMaster) return;
                this.pathState = { a: null, b: null, points: [], color: this.pathState?.color || '#00ff88', mode: null };
                await this.persistPathState();
                this.renderDrawLayer();
            };
        }

        const fogCover = document.getElementById('fog-cover');
        const fogClear = document.getElementById('fog-clear');
        const fogSize = document.getElementById('fog-size');
        const fogOpacity = document.getElementById('fog-opacity');
        const fogSoft = document.getElementById('fog-soft');

        if (fogSize) fogSize.oninput = () => {};
        if (fogOpacity) fogOpacity.oninput = () => {};
        if (fogSoft) fogSoft.oninput = () => {};

        if (fogCover) {
            fogCover.onclick = async () => {
                if (!this.isMaster) return;
                this.fogState.covered = true;
                this.fogState.reveals = [];
                await this.persistFogState();
                this.renderFogLayer();
            };
        }

        if (fogClear) {
            fogClear.onclick = async () => {
                if (!this.isMaster) return;
                this.fogState.covered = false;
                this.fogState.reveals = [];
                await this.persistFogState();
                this.renderFogLayer();
            };
        }

        const visionEnabled = document.getElementById('vision-enabled');
        const visionRadius = document.getElementById('vision-radius');
        if (visionEnabled) {
            visionEnabled.onchange = async (e) => {
                if (!this.isMaster) return;
                const enabled = !!e.target.checked;
                const radius = parseFloat(visionRadius?.value || `${this.visionState.radius}`) || this.visionState.radius;
                await this.updateMapEditorConfig({ vision: { enabled, radius } });
            };
        }
        if (visionRadius) {
            visionRadius.oninput = async (e) => {
                if (!this.isMaster) return;
                const enabled = !!(visionEnabled?.checked);
                const radius = parseFloat(e.target.value || `${this.visionState.radius}`) || this.visionState.radius;
                await this.updateMapEditorConfig({ vision: { enabled, radius } });
            };
        }
        

    }

    updateMapToolUI() {
        const panel = document.getElementById('map-tools-panel');
        const title = document.getElementById('map-tools-panel-title');
        const area = document.querySelector('.map-area');
        const floorTilesLayer = document.getElementById('floor-tiles-layer');
        const mapContainer = document.getElementById('map-container');
        const drawSection = document.getElementById('panel-draw');
        const textSection = document.getElementById('panel-text');
        const pathSection = document.getElementById('panel-path');
        const fogSection = document.getElementById('panel-fog');
        const visionSection = document.getElementById('panel-vision');

        const showPanel = this.isMaster && (this.activeMapTool === 'draw' || this.activeMapTool === 'text' || this.activeMapTool === 'path' || this.activeMapTool === 'fog' || this.activeMapTool === 'vision');
        if (panel) panel.style.display = showPanel ? 'block' : 'none';

        if (drawSection) drawSection.style.display = this.activeMapTool === 'draw' ? 'flex' : 'none';
        if (textSection) textSection.style.display = this.activeMapTool === 'text' ? 'flex' : 'none';
        if (pathSection) pathSection.style.display = this.activeMapTool === 'path' ? 'flex' : 'none';
        if (fogSection) fogSection.style.display = this.activeMapTool === 'fog' ? 'flex' : 'none';
        if (visionSection) visionSection.style.display = this.activeMapTool === 'vision' ? 'flex' : 'none';

        if (title) {
            const map = {
                pointer: 'Ponteiro',
                hand: 'Mover mapa',
                draw: 'Desenhar',
                text: 'Texto',
                path: 'Caminho',
                fog: 'Neblina',
                vision: 'Visão',
                floor: 'Piso'
            };
            title.textContent = map[this.activeMapTool] || 'Ferramentas do Mapa';
        }

        if (mapContainer) {
            mapContainer.classList.toggle('floor-tool-active', this.isMaster && this.activeMapTool === 'floor' && !this.deleteMode);
            mapContainer.classList.toggle('delete-mode-active', this.isMaster && !!this.deleteMode);
            mapContainer.classList.toggle('hand-tool-active', this.isMaster && this.activeMapTool === 'hand' && !this.deleteMode);
        }
        if (floorTilesLayer) floorTilesLayer.style.zIndex = (this.isMaster && this.activeMapTool === 'floor' && !this.deleteMode) ? '30' : '';

        if (this.drawCanvas) this.drawCanvas.style.pointerEvents = (this.isMaster && (this.activeMapTool === 'draw' || this.activeMapTool === 'text' || this.activeMapTool === 'path')) ? 'auto' : 'none';
        if (this.fogCanvas) this.fogCanvas.style.pointerEvents = (this.isMaster && this.activeMapTool === 'fog') ? 'auto' : 'none';





        if (area) {
            if (this.isMaster && this.activeMapTool === 'hand') area.style.cursor = 'grab';
            else if (this.isMaster && this.activeMapTool === 'pointer') area.style.cursor = 'default';
            else if (this.isMaster && (this.activeMapTool === 'draw' || this.activeMapTool === 'fog' || this.activeMapTool === 'path' || this.activeMapTool === 'text' || this.activeMapTool === 'floor')) area.style.cursor = 'crosshair';
            
            else area.style.cursor = 'grab';
        }

        document.querySelectorAll('.gm-tool-btn.gm-map-tool').forEach(b => {
            b.classList.toggle('active', b.dataset.tool === this.activeMapTool);
        });

        const btnDeleteMode = document.querySelector('.gm-tool-btn[data-tool="delete-mode"]');
        if (btnDeleteMode) btnDeleteMode.classList.toggle('active', !!this.deleteMode);
    }

    syncMapOverlaysFromSession() {
        const ops = Array.isArray(this.sessionData?.map_draw_ops) ? this.sessionData.map_draw_ops : [];
        this.drawOps = ops;

        const fog = this.sessionData?.map_fog || {};
        this.fogState = {
            covered: !!fog.covered,
            reveals: Array.isArray(fog.reveals) ? fog.reveals : []
        };

        const path = this.sessionData?.map_path || {};
        this.pathState = {
            a: path.a || null,
            b: path.b || null,
            points: Array.isArray(path.points) ? path.points : [],
            color: String(path.color || '#00ff88'),
            mode: null
        };

        const editor = this.sessionData?.map_editor || {};
        const vision = editor.vision || {};
        this.visionState = {
            enabled: !!vision.enabled,
            radius: Number.isFinite(vision.radius) ? vision.radius : 220
        };

        const visionEnabled = document.getElementById('vision-enabled');
        const visionRadius = document.getElementById('vision-radius');
        if (visionEnabled) visionEnabled.checked = this.visionState.enabled;
        if (visionRadius) visionRadius.value = String(this.visionState.radius);

        this.renderDrawLayer();
        this.renderFogLayer();
    }

    normalizeSearchText(s) {
        return String(s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    getRulesManualData() {
        return [
            {
                id: 'intro',
                title: '1. Fundamentos',
                sections: [
                    {
                        id: 'what',
                        title: 'O que é este manual',
                        blocks: [
                            { type: 'p', text: 'Este é um manual original e livre para você conduzir uma mesa de RPG online no ELARA. Ele funciona como um sistema completo e simples, com foco em fluidez e cooperação.' },
                            { type: 'p', text: 'Se a sua campanha usa outro sistema, este manual também serve como base, referência rápida e conjunto de boas práticas.' }
                        ]
                    },
                    {
                        id: 'core-loop',
                        title: 'O ciclo do jogo',
                        blocks: [
                            { type: 'ul', items: [
                                'Jogadores descrevem intenções: o que querem fazer e como.',
                                'Mestre decide se existe risco/incerteza e escolhe um teste.',
                                'Rola-se o dado, aplica-se modificadores e compara-se com a dificuldade.',
                                'O mundo reage; a história avança; novas escolhas aparecem.'
                            ] }
                        ]
                    },
                    {
                        id: 'dice',
                        title: 'Dados e dificuldades',
                        blocks: [
                            { type: 'p', text: 'O dado principal é o D20. Um teste é: D20 + Modificador contra uma Dificuldade (CD).' },
                            { type: 'ul', items: [
                                'CD 8: fácil; CD 12: comum; CD 15: desafiador; CD 18: difícil; CD 22+: épico.',
                                '20 natural: sucesso espetacular; 1 natural: falha dramática (a mesa decide o impacto).'
                            ] }
                        ]
                    }
                ]
            },
            {
                id: 'characters',
                title: '2. Personagens',
                sections: [
                    {
                        id: 'attributes',
                        title: 'Atributos',
                        blocks: [
                            { type: 'p', text: 'Use seis atributos: Força, Destreza, Constituição, Inteligência, Sabedoria e Carisma.' },
                            { type: 'p', text: 'Modificador: (Atributo - 10) / 2 arredondado para baixo. Ex.: 14 → +2, 9 → -1.' }
                        ]
                    },
                    {
                        id: 'hp-ac',
                        title: 'Vida e defesa',
                        blocks: [
                            { type: 'ul', items: [
                                'Vida (HP): quanto você aguenta antes de cair.',
                                'Defesa (DEF): o quão difícil é te acertar ou afetar diretamente.'
                            ] }
                        ]
                    },
                    {
                        id: 'skills',
                        title: 'Perícias (opcional)',
                        blocks: [
                            { type: 'p', text: 'Se quiser mais detalhe, defina perícias como: Atletismo, Furtividade, Percepção, Persuasão, Sobrevivência, Arcanismo, Medicina e Investigação.' },
                            { type: 'p', text: 'Uma perícia treinada recebe +2. No nível alto, pode virar +3/+4 conforme a progressão da campanha.' }
                        ]
                    }
                ]
            },
            {
                id: 'actions',
                title: '3. Ações e Exploração',
                sections: [
                    {
                        id: 'movement',
                        title: 'Movimento e distância',
                        blocks: [
                            { type: 'p', text: 'O mapa do ELARA usa grade de 50px. Você pode tratar cada quadrado como 1,5m/5ft (ou o que sua mesa preferir).' },
                            { type: 'ul', items: [
                                'Movimento padrão: 6 quadrados por turno (ajuste por personagem).',
                                'Terreno difícil: custa o dobro.',
                                'Visibilidade: o Mestre pode usar neblina e visão por token.'
                            ] }
                        ]
                    },
                    {
                        id: 'checks',
                        title: 'Testes comuns',
                        blocks: [
                            { type: 'ul', items: [
                                'Força: arrombar, empurrar, agarrar.',
                                'Destreza: esquivar, equilibrar, atirar, furtividade.',
                                'Constituição: resistir veneno, aguentar frio/fadiga.',
                                'Inteligência: lembrar fatos, investigar, decifrar.',
                                'Sabedoria: perceber, rastrear, intuição.',
                                'Carisma: enganar, inspirar, negociar.'
                            ] }
                        ]
                    }
                ]
            },
            {
                id: 'combat',
                title: '4. Combate',
                sections: [
                    {
                        id: 'initiative',
                        title: 'Iniciativa',
                        blocks: [
                            { type: 'p', text: 'No início do combate, cada participante rola D20 + DES. O turno segue do maior para o menor.' },
                            { type: 'p', text: 'O Mestre pode rolar iniciativas em grupo para inimigos para simplificar.' }
                        ]
                    },
                    {
                        id: 'turn',
                        title: 'O que você faz no seu turno',
                        blocks: [
                            { type: 'ul', items: [
                                'Movimento: deslocar até seu limite.',
                                'Ação: atacar, lançar magia, usar item, ajudar, preparar.',
                                'Reação (opcional): um disparo rápido fora do turno se uma condição ocorrer.'
                            ] }
                        ]
                    },
                    {
                        id: 'attack',
                        title: 'Ataques e dano',
                        blocks: [
                            { type: 'p', text: 'Ataque: D20 + ATK contra DEF do alvo. Se acertar, causa dano.' },
                            { type: 'p', text: 'Dano sugerido: 1d6 por arma simples; 1d8 por arma marcial; magia varia conforme efeito.' }
                        ]
                    }
                ]
            },
            {
                id: 'conditions',
                title: '5. Condições',
                sections: [
                    {
                        id: 'list',
                        title: 'Condições rápidas',
                        blocks: [
                            { type: 'ul', items: [
                                'Cego: testes de percepção visual falham; atacar pode ter desvantagem.',
                                'Assustado: difícil se aproximar da origem do medo.',
                                'Impedido: movimento reduzido; pode exigir teste para sair.',
                                'Paralisado: não se move; ataques contra você podem ter vantagem.',
                                'Inconsciente: não age; acorda com ajuda ou após descanso.'
                            ] }
                        ]
                    }
                ]
            },
            {
                id: 'magic',
                title: '6. Magia (genérica)',
                sections: [
                    {
                        id: 'casting',
                        title: 'Conjurar',
                        blocks: [
                            { type: 'p', text: 'Magias podem ser ofensivas, defensivas ou utilitárias. O Mestre define se é teste de ataque, teste de resistência do alvo ou efeito automático com custo/limitação.' },
                            { type: 'ul', items: [
                                'Ataque mágico: D20 + INT/SAB/CAR (do conjurador) contra DEF.',
                                'Resistência: alvo rola D20 + atributo contra CD do conjurador (CD = 8 + atributo + treino).'
                            ] }
                        ]
                    }
                ]
            },
            {
                id: 'gm',
                title: '7. Mestre e Mesa Online',
                sections: [
                    {
                        id: 'pace',
                        title: 'Ritmo e decisões',
                        blocks: [
                            { type: 'ul', items: [
                                'Decida rápido; ajuste depois se precisar.',
                                'Prefira consequências interessantes em vez de travar a história.',
                                'Use o chat para registrar decisões importantes.'
                            ] }
                        ]
                    },
                    {
                        id: 'tools',
                        title: 'Ferramentas do ELARA',
                        blocks: [
                            { type: 'ul', items: [
                                'Mão: arrasta o mapa; Ponteiro: interação normal.',
                                'Neblina: oculta e revela áreas; Visão: cria spots por token.',
                                'Alfinetes e Caminho: organize objetivos e rotas.',
                                'Régua e Ping: comunicação rápida durante combate e exploração.'
                            ] }
                        ]
                    }
                ]
            }
        ];
    }

    initRulesManual() {
        if (this.rulesManualInitialized) return;
        const toc = document.getElementById('rules-toc');
        const content = document.getElementById('rules-content');
        if (!toc || !content) return;

        this.rulesManualInitialized = true;
        this.rulesManual = this.getRulesManualData();
        this.rulesFlatIndex = [];

        toc.innerHTML = '';
        content.innerHTML = '';

        this.rulesManual.forEach((ch) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.chapter = ch.id;
            btn.textContent = ch.title;
            btn.onclick = () => this.setRulesChapter(ch.id);
            toc.appendChild(btn);

            const chWrap = document.createElement('div');
            chWrap.dataset.chapter = ch.id;

            const h3 = document.createElement('h3');
            h3.id = `rules-chapter-${ch.id}`;
            h3.textContent = ch.title;
            chWrap.appendChild(h3);

            (ch.sections || []).forEach((sec) => {
                const secId = `rules-${ch.id}-${sec.id}`;
                const h4 = document.createElement('h4');
                h4.id = secId;
                h4.textContent = sec.title;
                chWrap.appendChild(h4);

                const blocks = Array.isArray(sec.blocks) ? sec.blocks : [];
                blocks.forEach((b) => {
                    if (b.type === 'p') {
                        const p = document.createElement('p');
                        p.textContent = String(b.text || '');
                        chWrap.appendChild(p);
                    } else if (b.type === 'ul') {
                        const ul = document.createElement('ul');
                        (b.items || []).forEach((it) => {
                            const li = document.createElement('li');
                            li.textContent = String(it || '');
                            ul.appendChild(li);
                        });
                        chWrap.appendChild(ul);
                    }
                });

                const textBlob = blocks.map((b) => {
                    if (b.type === 'p') return String(b.text || '');
                    if (b.type === 'ul') return (b.items || []).map(x => String(x || '')).join(' ');
                    return '';
                }).join(' ');

                this.rulesFlatIndex.push({
                    chapterId: ch.id,
                    chapterTitle: ch.title,
                    sectionId: sec.id,
                    sectionTitle: sec.title,
                    anchorId: secId,
                    text: textBlob
                });
            });

            content.appendChild(chWrap);
        });

        this.setRulesChapter(this.rulesManual[0]?.id || 'intro');
    }

    setRulesChapter(chapterId) {
        const toc = document.getElementById('rules-toc');
        const results = document.getElementById('rules-results');
        if (results) results.style.display = 'none';

        if (toc) {
            toc.querySelectorAll('button').forEach((b) => {
                b.classList.toggle('active', b.dataset.chapter === chapterId);
            });
        }

        const el = document.getElementById(`rules-chapter-${chapterId}`);
        if (el) el.scrollIntoView({ block: 'start' });
    }

    searchRules(query) {
        const q = this.normalizeSearchText(query);
        const results = document.getElementById('rules-results');
        const content = document.getElementById('rules-content');
        if (!results || !content) return;

        if (!q) {
            results.style.display = 'none';
            return;
        }

        const hits = [];
        for (const row of (this.rulesFlatIndex || [])) {
            const hay = this.normalizeSearchText(`${row.chapterTitle} ${row.sectionTitle} ${row.text}`);
            const idx = hay.indexOf(q);
            if (idx === -1) continue;
            hits.push(row);
            if (hits.length >= 20) break;
        }

        results.innerHTML = '';
        results.style.display = 'grid';

        if (!hits.length) {
            const empty = document.createElement('div');
            empty.className = 'rules-result-snippet';
            empty.textContent = 'Nenhum resultado encontrado.';
            results.appendChild(empty);
            return;
        }

        hits.forEach((row) => {
            const card = document.createElement('div');
            card.className = 'rules-result';
            card.onclick = () => {
                results.style.display = 'none';
                const toc = document.getElementById('rules-toc');
                if (toc) {
                    toc.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.chapter === row.chapterId));
                }
                const el = document.getElementById(row.anchorId);
                if (el) el.scrollIntoView({ block: 'start' });
            };

            const title = document.createElement('div');
            title.className = 'rules-result-title';
            title.textContent = `${row.chapterTitle} — ${row.sectionTitle}`;

            const snippet = document.createElement('div');
            snippet.className = 'rules-result-snippet';
            const t = String(row.text || '');
            const n = this.normalizeSearchText(t);
            const start = Math.max(0, n.indexOf(q) - 60);
            const end = Math.min(t.length, start + 160);
            snippet.textContent = t.slice(start, end) + (end < t.length ? '…' : '');

            card.appendChild(title);
            card.appendChild(snippet);
            results.appendChild(card);
        });
    }

    getMapPointFromClient(clientX, clientY) {
        const mapContainer = document.getElementById('map-container');
        if (!mapContainer) return null;
        const rect = mapContainer.getBoundingClientRect();
        return {
            x: (clientX - rect.left) / this.scale,
            y: (clientY - rect.top) / this.scale
        };
    }

    hexToRgba(hex, alpha) {
        const raw = String(hex || '#000000').replace('#', '').trim();
        const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw.padEnd(6, '0').slice(0, 6);
        const r = parseInt(full.slice(0, 2), 16) || 0;
        const g = parseInt(full.slice(2, 4), 16) || 0;
        const b = parseInt(full.slice(4, 6), 16) || 0;
        const a = Math.max(0, Math.min(1, Number(alpha) || 0));
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    renderDrawLayer(preview = null) {
        if (!this.drawCtx || !this.drawCanvas) return;
        const ctx = this.drawCtx;
        ctx.clearRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);

        const drawSmoothStroke = (pts) => {
            if (!pts || pts.length === 0) return;
            if (pts.length === 1) {
                ctx.lineTo(pts[0].x, pts[0].y);
                return;
            }
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length - 1; i++) {
                const midX = (pts[i].x + pts[i + 1].x) / 2;
                const midY = (pts[i].y + pts[i + 1].y) / 2;
                ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
            }
            const last = pts[pts.length - 1];
            ctx.lineTo(last.x, last.y);
        };

        const drawPin = (p, color, label) => {
            if (!p) return;
            const x = p.x;
            const y = p.y;
            const s = 26;
            const r = 10;
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.65)';
            ctx.shadowBlur = 14;
            ctx.shadowOffsetY = 6;
            ctx.fillStyle = this.hexToRgba(color, 0.98);
            ctx.strokeStyle = this.hexToRgba('#ffffff', 0.85);
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(x - s * 0.55, y - s * 0.45, x - s * 0.55, y - s * 1.15, x, y - s * 1.25);
            ctx.bezierCurveTo(x + s * 0.55, y - s * 1.15, x + s * 0.55, y - s * 0.45, x, y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.shadowBlur = 0;
            ctx.fillStyle = this.hexToRgba('#0a0a0e', 0.65);
            ctx.beginPath();
            ctx.arc(x, y - s * 0.85, r, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = this.hexToRgba('#ffffff', 0.92);
            ctx.font = `900 14px Cinzel, serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(label || ''), x, y - s * 0.85);
            ctx.restore();
        };

        const drawCurvedGuide = (a, b) => {
            if (!a || !b) return;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
            const nx = -dy / dist;
            const ny = dx / dist;
            const lift = Math.min(220, Math.max(70, dist * 0.18));
            const c1 = { x: a.x + dx * 0.33 + nx * lift, y: a.y + dy * 0.33 + ny * lift };
            const c2 = { x: a.x + dx * 0.66 + nx * lift, y: a.y + dy * 0.66 + ny * lift };
            ctx.save();
            ctx.setLineDash([10, 10]);
            ctx.strokeStyle = this.hexToRgba('#ffffff', 0.32);
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
            ctx.stroke();
            ctx.restore();
        };

        const renderOp = (op) => {
            if (!op) return;

            if (op.type === 'text') {
                const size = Number(op.size) || 22;
                const font = `900 ${size}px Cinzel, serif`;
                ctx.font = font;
                ctx.textBaseline = 'top';
                const text = String(op.text || '');
                const pad = 8;
                const metrics = ctx.measureText(text);
                const w = metrics.width + pad * 2;
                const h = size + pad * 2;
                ctx.fillStyle = this.hexToRgba(op.bg || '#000000', 0.65);
                ctx.fillRect(op.x - w / 2, op.y - h / 2, w, h);
                ctx.fillStyle = this.hexToRgba(op.color || '#ffffff', 1);
                ctx.fillText(text, op.x - metrics.width / 2, op.y - size / 2);
                if (this.deleteMode && this.deleteSelection?.texts?.has?.(String(op.id || `idx_${this.drawOps.indexOf(op)}`))) {
                    ctx.save();
                    ctx.strokeStyle = this.hexToRgba('#ff3b30', 0.85);
                    ctx.lineWidth = 3;
                    ctx.strokeRect(op.x - w / 2, op.y - h / 2, w, h);
                    ctx.restore();
                }
                return;
            }

            if (op.type === 'path') {
                ctx.save();
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.strokeStyle = this.hexToRgba(op.color || '#00ff88', 0.95);
                ctx.lineWidth = Number(op.size) || 10;
                const pts = Array.isArray(op.points) ? op.points : [];
                if (pts.length) {
                    ctx.beginPath();
                    drawSmoothStroke(pts);
                    ctx.stroke();
                }
                ctx.restore();
                return;
            }

            if (op.type === 'stroke') {
                const pts = Array.isArray(op.points) ? op.points : [];
                if (!pts.length) return;
                ctx.save();
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.strokeStyle = this.hexToRgba(op.color || '#ffd700', op.opacity ?? 0.8);
                ctx.lineWidth = Number(op.size) || 8;
                ctx.beginPath();
                drawSmoothStroke(pts);
                ctx.stroke();
                ctx.restore();
                return;
            }

            if (op.type === 'shape') {
                const start = op.start;
                const end = op.end;
                if (!start || !end) return;
                ctx.save();
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.strokeStyle = this.hexToRgba(op.color || '#ffd700', op.opacity ?? 0.8);
                ctx.lineWidth = Number(op.size) || 8;
                if (op.shape === 'line') {
                    ctx.beginPath();
                    ctx.moveTo(start.x, start.y);
                    ctx.lineTo(end.x, end.y);
                    ctx.stroke();
                } else if (op.shape === 'rect') {
                    const x = Math.min(start.x, end.x);
                    const y = Math.min(start.y, end.y);
                    const w = Math.abs(end.x - start.x);
                    const h = Math.abs(end.y - start.y);
                    ctx.strokeRect(x, y, w, h);
                } else if (op.shape === 'circle') {
                    const dx = end.x - start.x;
                    const dy = end.y - start.y;
                    const r = Math.sqrt(dx * dx + dy * dy);
                    ctx.beginPath();
                    ctx.arc(start.x, start.y, r, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.restore();
                return;
            }
        };

        this.drawOps.forEach(renderOp);

        const a = this.pathState?.a;
        const b = this.pathState?.b;
        if (a) drawPin(a, '#ff4757', 'A');
        if (b) drawPin(b, '#1e90ff', 'B');
        if (a && b && !(this.pathState?.points?.length)) drawCurvedGuide(a, b);
        if (this.pathState?.points?.length) {
            renderOp({ type: 'path', points: this.pathState.points, color: this.pathState.color, size: 10 });
        }

        if (preview) renderOp(preview);
    }

    renderFogLayer() {
        if (!this.fogCtx || !this.fogCanvas || !this.fogStoreCtx) return;
        const store = this.fogStoreCtx;
        store.clearRect(0, 0, this.fogStore.width, this.fogStore.height);

        const covered = !!this.fogState.covered || !this.isMaster;
        if (covered) {
            store.globalCompositeOperation = 'source-over';
            store.fillStyle = 'rgba(0,0,0,0.99)';
            store.fillRect(0, 0, this.fogStore.width, this.fogStore.height);

            store.globalCompositeOperation = 'destination-out';
            const reveals = Array.isArray(this.fogState.reveals) ? this.fogState.reveals : [];
            reveals.forEach((r) => this.applyFogStroke(store, r));

            // Visão agora é map-object player 
            const editor = this.sessionData?.map_editor || {};
            const vision = editor.vision || {};
            const enabled = !!vision.enabled;
            const radius = Number.isFinite(vision.radius) ? vision.radius : 220;
            if (enabled) {
                const targets = this.tokens.filter(t => t && t.type === 'player' && !t.isDead && t.isRevealed !== false);
                targets.forEach(t => {
                    const ang = Number.isFinite(t.vision_angle) ? t.vision_angle : (-Math.PI / 2);
                    this.applyFogCone(store, t.x, t.y, radius, ang, 1, 0.8);
                });
                
            }
        } 

        const ctx = this.fogCtx;
        ctx.clearRect(0, 0, this.fogCanvas.width, this.fogCanvas.height);
        ctx.drawImage(this.fogStore, 0, 0);
    }

    applyFogSpot(ctx, x, y, radius, opacity, soft) {
        const r = Math.max(10, Number(radius) || 90);
        const o = Math.max(0, Math.min(1, Number(opacity) || 0.8));
        const s = Math.max(0, Math.min(1, Number(soft) || 0.7));
        const inner = r * (1 - s * 0.85);
        const g = ctx.createRadialGradient(x, y, Math.max(0, inner), x, y, r);
        g.addColorStop(0, `rgba(0,0,0,${o})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    applyFogCone(ctx, x, y, radius, angle, opacity, soft) {
        const r = Math.max(20, Number(radius) || 220);
        const o = Math.max(0, Math.min(1, Number(opacity) || 0.9));
        const s = Math.max(0, Math.min(1, Number(soft) || 0.8));
        const spread = (Math.PI / 2.2);
        const a = Number.isFinite(angle) ? angle : (-Math.PI / 2);
        const inner = r * (1 - s * 0.85);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, -spread / 2, spread / 2, false);
        ctx.closePath();
        ctx.clip();

        const g = ctx.createRadialGradient(0, 0, Math.max(0, inner), 0, 0, r);
        g.addColorStop(0, `rgba(0,0,0,${o})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.restore();
    }

    applyFogStroke(ctx, stroke) {
        if (!stroke) return;
        const pts = Array.isArray(stroke.points) ? stroke.points : [];
        if (!pts.length) return;
        const size = Number(stroke.size) || 90;
        const opacity = Number(stroke.opacity) || 0.85;
        const soft = Number.isFinite(stroke.soft) ? stroke.soft : 0.7;
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            this.applyFogSpot(ctx, p.x, p.y, size, opacity, soft);
        }
    }

    startOverlayDraw(e) {
        if (!this.isMaster || !this.drawCtx) return;
        const p = this.getMapPointFromClient(e.clientX, e.clientY);
        if (!p) return;
        e.preventDefault();
        e.stopPropagation();

        const mode = String(document.getElementById('draw-mode')?.value || 'free');
        const color = String(document.getElementById('draw-color')?.value || '#ffd700');
        const size = parseFloat(document.getElementById('draw-size')?.value || '8') || 8;
        const opacity = parseFloat(document.getElementById('draw-opacity')?.value || '0.8') || 0.8;

        if (mode === 'free' || mode === 'pen') {
            this.overlayPreview = { type: 'stroke', points: [p], color, size, opacity };
        } else {
            this.overlayStart = p;
            this.overlayPreview = { type: 'shape', shape: mode, start: p, end: p, color, size, opacity };
        }
        this.isOverlayDrawing = true;
        this.overlayLastPointAt = Date.now();
        this.renderDrawLayer(this.overlayPreview);
    }

    startOverlayFog(e) {
        if (!this.isMaster || !this.fogCtx) return;
        const p = this.getMapPointFromClient(e.clientX, e.clientY);
        if (!p) return;
        e.preventDefault();
        e.stopPropagation();

        if (!this.fogState.covered) this.fogState.covered = true;
        const size = parseFloat(document.getElementById('fog-size')?.value || '90') || 90;
        const opacity = parseFloat(document.getElementById('fog-opacity')?.value || '0.85') || 0.85;
        const soft = parseFloat(document.getElementById('fog-soft')?.value || '0.7') || 0.7;
        this.overlayPreview = { type: 'fog', points: [p], size, opacity, soft };
        this.isOverlayDrawing = true;
        this.overlayLastPointAt = Date.now();
        this.renderFogLayerWithPreview(this.overlayPreview);
    }

    startOverlayPath(e) {
        if (!this.isMaster || !this.drawCtx) return;
        const p = this.getMapPointFromClient(e.clientX, e.clientY);
        if (!p) return;
        e.preventDefault();
        e.stopPropagation();

        const color = String(document.getElementById('path-color')?.value || this.pathState.color || '#00ff88');
        this.pathState.color = color;
        this.overlayPreview = { type: 'path', points: [p], color, size: 10 };
        this.isOverlayDrawing = true;
        this.overlayLastPointAt = Date.now();
        this.renderDrawLayer(this.overlayPreview);
    }

    updateOverlayDraw(e) {
        if (!this.isOverlayDrawing || !this.overlayPreview) return;
        const p = this.getMapPointFromClient(e.clientX, e.clientY);
        if (!p) return;

        const now = Date.now();
        if (this.overlayPreview.type === 'stroke') {
            if (now - this.overlayLastPointAt >= 14) {
                this.overlayPreview.points.push(p);
                this.overlayLastPointAt = now;
                this.renderDrawLayer(this.overlayPreview);
            }
            return;
        }

        if (this.overlayPreview.type === 'shape') {
            this.overlayPreview.end = p;
            this.renderDrawLayer(this.overlayPreview);
            return;
        }

        if (this.overlayPreview.type === 'fog') {
            if (now - this.overlayLastPointAt >= 16) {
                this.overlayPreview.points.push(p);
                this.overlayLastPointAt = now;
                this.renderFogLayerWithPreview(this.overlayPreview);
            }
            return;
        }

        if (this.overlayPreview.type === 'path') {
            if (now - this.overlayLastPointAt >= 14) {
                this.overlayPreview.points.push(p);
                this.overlayLastPointAt = now;
                this.renderDrawLayer(this.overlayPreview);
            }
        }
    }

    async finishOverlayDraw() {
        const preview = this.overlayPreview;
        this.isOverlayDrawing = false;
        this.overlayPreview = null;
        this.overlayStart = null;
        this.overlayLastPointAt = 0;

        if (!preview) {
            this.renderDrawLayer();
            this.renderFogLayer();
            return;
        }

        if (preview.type === 'stroke') {
            this.drawOps = [...this.drawOps, preview].slice(-80);
            await this.persistDrawOps();
            this.renderDrawLayer();
            return;
        }

        if (preview.type === 'shape') {
            this.drawOps = [...this.drawOps, preview].slice(-80);
            await this.persistDrawOps();
            this.renderDrawLayer();
            return;
        }

        if (preview.type === 'fog') {
            const reveals = Array.isArray(this.fogState.reveals) ? this.fogState.reveals : [];
            this.fogState.reveals = [...reveals, { points: preview.points, size: preview.size, opacity: preview.opacity, soft: preview.soft }].slice(-220);
            await this.persistFogState();
            this.renderFogLayer();
            return;
        }

        if (preview.type === 'path') {
            const pts = Array.isArray(this.pathState.points) ? this.pathState.points : [];
            this.pathState.points = [...pts, ...preview.points].slice(-800);
            await this.persistPathState();
            this.renderDrawLayer();
        }
    }

    renderFogLayerWithPreview(preview) {
        const base = { covered: this.fogState.covered, reveals: this.fogState.reveals };
        const next = {
            covered: base.covered,
            reveals: [...(Array.isArray(base.reveals) ? base.reveals : []), { points: preview.points, size: preview.size, opacity: preview.opacity, soft: preview.soft }]
        };
        const prev = this.fogState;
        this.fogState = next;
        this.renderFogLayer();
        this.fogState = prev;
    }

    addTextOp(text, x, y) {
        if (!this.isMaster) return;
        const size = parseFloat(document.getElementById('text-size')?.value || '22') || 22;
        const color = String(document.getElementById('text-color')?.value || '#ffffff');
        const bg = String(document.getElementById('text-bg')?.value || '#000000');
        const id = `text_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`;
        this.drawOps = [...this.drawOps, { id, type: 'text', text, x, y, size, color, bg }].slice(-80);
        this.persistDrawOps().then(() => this.renderDrawLayer());
    }

    async persistDrawOps() {
        if (!this.isMaster) return;
        try {
            const sessionRef = doc(db, "sessions", this.sessionId);
            await updateDoc(sessionRef, { map_draw_ops: this.drawOps });
        } catch (e) {
            console.error(e);
        }
    }

    async persistFogState() {
        if (!this.isMaster) return;
        try {
            const sessionRef = doc(db, "sessions", this.sessionId);
            await updateDoc(sessionRef, { map_fog: this.fogState });
        } catch (e) {
            console.error(e);
        }
    }

    async persistPathState() {
        if (!this.isMaster) return;
        try {
            const sessionRef = doc(db, "sessions", this.sessionId);
            await updateDoc(sessionRef, { map_path: { a: this.pathState.a, b: this.pathState.b, points: this.pathState.points, color: this.pathState.color } });
        } catch (e) {
            console.error(e);
        }
    }

    applyPermissions() {
        if (this.isMaster) {
            // Atualiza os checkboxes do mestre com base nos dados do Firestore
            const permissions = this.sessionData.permissions || {
                allow_sheets: true,
                allow_dice: true,
                allow_tokens: true,
                allow_abilities: true,
                allow_chat: true
            };

            const toggles = {
                'toggle-allow-sheets': permissions.allow_sheets,
                'toggle-allow-dice': permissions.allow_dice,
                'toggle-allow-tokens': permissions.allow_tokens,
                'toggle-allow-abilities': permissions.allow_abilities,
                'toggle-allow-chat': permissions.allow_chat
            };

            for (const [id, value] of Object.entries(toggles)) {
                const el = document.getElementById(id);
                if (el) el.checked = value;
            }
            return;
        }

        // Se for jogador, aplica as restrições
        const p = this.sessionData.permissions || {};
        
        // Fichas (Bloqueia o botão de abrir ficha completa)
        const btnOpenSheet = document.getElementById('btn-open-full-sheet');
        if (p.allow_sheets === false) {
            btnOpenSheet?.classList.add('action-blocked');
        } else {
            btnOpenSheet?.classList.remove('action-blocked');
        }

        // Dados (Bloqueia a grade de dados)
        const diceGrid = document.querySelector('.dice-grid');
        if (p.allow_dice === false) {
            diceGrid?.classList.add('action-blocked');
        } else {
            diceGrid?.classList.remove('action-blocked');
        }

        // Tokens/Invocação (Bloqueia a lista de cards de jogadores para não arrastar)
        const sidebarPlayerCards = document.getElementById('sidebar-player-cards');
        if (p.allow_tokens === false) {
            sidebarPlayerCards?.classList.add('action-blocked');
        } else {
            sidebarPlayerCards?.classList.remove('action-blocked');
        }

        // Se dados e tokens estiverem bloqueados, o jogador não tem motivo para abrir a sidebar esquerda (DADOS)
        const btnBestiary = document.getElementById('toggle-bestiary');
        if (p.allow_dice === false && p.allow_tokens === false) {
            btnBestiary?.classList.add('action-blocked');
            const sidebarLeft = document.getElementById('sidebar-left');
            sidebarLeft?.classList.add('collapsed');
        } else {
            btnBestiary?.classList.remove('action-blocked');
        }

        // Habilidades (Bloqueia a lista de habilidades)
        const abilitiesList = document.getElementById('player-abilities-list');
        if (p.allow_abilities === false) {
            abilitiesList?.classList.add('action-blocked');
        } else {
            abilitiesList?.classList.remove('action-blocked');
        }

        // Chat (Bloqueia o campo de entrada do chat)
        const chatInputWrappers = document.querySelectorAll('.chat-input-wrapper');
        const chatInputs = document.querySelectorAll('#chat-input, #large-chat-input');
        const chatButtons = document.querySelectorAll('#btn-send-chat, #btn-send-large-chat');
        const btnOpenLargeChat = document.getElementById('btn-open-large-chat');

        if (p.allow_chat === false) {
            chatInputWrappers.forEach(w => w.classList.add('action-blocked'));
            chatInputs.forEach(i => {
                i.disabled = true;
                i.placeholder = "Chat desativado pelo Mestre";
            });
            chatButtons.forEach(b => b.disabled = true);
            // Bloqueia também a abertura do chat grande se quiser ser rigoroso
            btnOpenLargeChat?.classList.add('action-blocked');
            // Também esconde o chat privado se o chat geral estiver off (opcional, mas coerente)
            document.getElementById('player-private-chat')?.classList.add('action-blocked');
        } else {
            chatInputWrappers.forEach(w => w.classList.remove('action-blocked'));
            chatInputs.forEach(i => {
                i.disabled = false;
                i.placeholder = "Digite sua mensagem...";
            });
            chatButtons.forEach(b => b.disabled = false);
            btnOpenLargeChat?.classList.remove('action-blocked');
            document.getElementById('player-private-chat')?.classList.remove('action-blocked');
        }

        // Bloqueio extra para os botões de dados individualmente
        document.querySelectorAll('.btn-roll-dice').forEach(btn => {
            if (p.allow_dice === false) btn.classList.add('action-blocked');
            else btn.classList.remove('action-blocked');
        });

        // Se TUDO estiver bloqueado na sidebar inferior, podemos bloquear a sidebar inteira
        const sidebarBottom = document.getElementById('sidebar-bottom');
        if (p.allow_sheets === false && p.allow_abilities === false) {
            // Se o mestre bloqueou ficha E habilidades, desativa a abertura da barra inferior
            const toggleAbilities = document.getElementById('toggle-abilities');
            toggleAbilities?.classList.add('action-blocked');
            // Fecha a barra se estiver aberta
            sidebarBottom?.classList.add('collapsed');
        } else {
            const toggleAbilities = document.getElementById('toggle-abilities');
            toggleAbilities?.classList.remove('action-blocked');
        }
    }

    async togglePermission(permissionKey, value) {
        if (!this.isMaster) return;
        try {
            const sessionRef = doc(db, "sessions", this.sessionId);
            await updateDoc(sessionRef, {
                [`permissions.${permissionKey}`]: value
            });
        } catch (error) {
            console.error("Erro ao atualizar permissão:", error);
        }
    }
    // handlegmToolbar pode ser usado pelos players apenas algumas funções

    handleGmToolbar(tool) {
        // if (!this.isMaster) return;
        if(!this.isMaster) {
            tool === 'pointer' || tool === 'hand' || tool === 'mobile-touch' || tool === 'draw' || tool === 'text' || tool === 'path' || tool === 'fog' || tool === 'vision' && (this.activeMapTool = tool);
        }
        if (tool === 'delete-mode') {
            this.toggleDeleteMode();
            return;
        }

        if (tool === 'measure' || tool === 'ping') {
            const next = this.activeGmTool === tool ? null : tool;
            this.activeGmTool = next;
            if (next === 'ping') {
                this._blockedFloor = true;
                const btnBlockedFloor = document.getElementById('btn-blocked-floor');
                btnBlockedFloor.classList.toggle('active', !!this._blockedFloor);
                const measureLayer = document.querySelector('.measure-layer');
                measureLayer.style.pointerEvents = 'auto';
            } else {
                this._blockedFloor = false;
                const btnBlockedFloor = document.getElementById('btn-blocked-floor');
                btnBlockedFloor.classList.toggle('active', !!this._blockedFloor);
                const measureLayer = document.querySelector('.measure-layer');
                measureLayer.style.pointerEvents = 'none';
            }
                document.querySelectorAll('.gm-tool-btn[data-tool="measure"], .gm-tool-btn[data-tool="ping"]').forEach(b => {
                    b.classList.toggle('active', b.dataset.tool === next);
                    // btnBlockedFloor.onclick();
                });
                return;
            }
               
                 
                 
                
                 
            

        if (tool === 'floor') {
            if (this.activeMapTool === 'floor') {
                this.closeFloorPickerModal?.();
                this.hideFloorToolMenu();
                this.hideFloorTilePopover();
                this.activeMapTool = 'pointer';
                this.updateMapToolUI();
                document.querySelectorAll('.gm-tool-btn.gm-map-tool').forEach(b => {
                    b.classList.toggle('active', b.dataset.tool === this.activeMapTool);
                });
                this.renderFloorTiles();
                return;
            }
            this.deleteMode = false;
            this.activeMapTool = 'floor';
            this.updateMapToolUI();
            document.querySelectorAll('.gm-tool-btn.gm-map-tool').forEach(b => {
                b.classList.toggle('active', b.dataset.tool === this.activeMapTool);
            });
            this.hideMapContextMenu();
            this.hideFloorTilePopover();
            this.openFloorPickerModal();
            this.renderFloorTiles();
            return;
        }
        // Map Tools & mobile touch
        if (tool === 'pointer' || tool === 'hand' || tool === 'mobile-touch' || tool === 'draw' || tool === 'text' || tool === 'path' || tool === 'fog' || tool === 'vision') {
            this.deleteMode = false;
            const next = this.activeMapTool === tool ? 'pointer' : tool;
            this.activeMapTool = next;
            this.updateMapToolUI();
            document.querySelectorAll('.gm-tool-btn.gm-map-tool').forEach(b => {
                b.classList.toggle('active', b.dataset.tool === this.activeMapTool);
            });
            this.renderFloorTiles();
            return;
        }

        const sidebarRight = document.getElementById('sidebar-right');

        if (tool === 'bestiary') {
            this.toggleGmModal('enemies');
            return;
        }

        if (tool === 'enemy-create') {
            document.getElementById('enemy-create-modal').style.display = 'flex';
            return;
        }

        if (tool === 'players') {
            this.toggleGmModal('players');
            return;
        }

        if (tool === 'sheets') {
            this.toggleGmModal('sheets');
            return;
        }

        if (tool === 'kit') {
            if (sidebarRight?.classList.contains('collapsed')) sidebarRight.classList.remove('collapsed');
            else sidebarRight?.classList.add('collapsed');
            return;
        }

        if (tool === 'editor') {
            if (!sidebarRight) return;
            const panel = document.getElementById('kit-map');
            const isOpen = !sidebarRight.classList.contains('collapsed');
            const isActive = !!panel?.classList.contains('active');
            if (isOpen && isActive) {
                sidebarRight.classList.add('collapsed');
                return;
            }
            sidebarRight.classList.remove('collapsed');
            document.querySelectorAll('.kit-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.kit-tab-panel').forEach(p => p.classList.remove('active'));
            const tab = document.querySelector('.kit-tab[data-tab="map"]');
            if (tab) tab.classList.add('active');
            if (panel) panel.classList.add('active');
            return;
        }
    }

    toggleGmModal(kind) {
        if (!this.isMaster) return;

        const map = {
            players: 'gm-players-modal',
            enemies: 'gm-enemies-modal',
            sheets: 'gm-sheets-modal'
        };
        const modalId = map[kind];
        if (!modalId) return;

        if (this.gmOpenModal === kind) {
            const current = document.getElementById(modalId);
            if (current) current.style.display = 'none';
            this.gmOpenModal = null;
            return;
        }

        Object.values(map).forEach(id => {
            const m = document.getElementById(id);
            if (m) m.style.display = 'none';
        });

        this.gmOpenModal = kind;
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.style.display = 'flex';
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
                if (this.gmOpenModal === kind) this.gmOpenModal = null;
            }
        };

        if (kind === 'players') {
            this.renderGmPlayersList();
            return;
        }

        if (kind === 'enemies') {
            const list = document.getElementById('gm-bestiary-list');
            const search = document.getElementById('gm-enemy-search');
            const btnSpawn = document.getElementById('gm-btn-spawn-enemy');
            this.gmSelectedEnemyId = null;
            this.gmSelectedEnemy = null;
            if (btnSpawn) {
                btnSpawn.disabled = true;
                btnSpawn.textContent = 'SELECIONE UM INIMIGO';
            }
            this.loadBestiary(search?.value || '', list);
            if (search && !search.dataset.bound) {
                search.dataset.bound = '1';
                search.addEventListener('input', (e) => this.loadBestiary(e.target.value, list));
            }
            if (btnSpawn && !btnSpawn.dataset.bound) {
                btnSpawn.dataset.bound = '1';
                btnSpawn.onclick = () => this.beginPlacingSelectedEnemy();
            }
            return;
        }

        if (kind === 'sheets') {
            this.renderGmSheetsList();
        }
    }

    beginPlacingSelectedEnemy() {
        if (!this.isMaster) return;
        if (!this.gmSelectedEnemy) return;

        const enemy = this.gmSelectedEnemy;
        this.isPlacingToken = true;
        this.pendingTokenPlacement = {
            type: 'enemy',
            data: {
                name: enemy.name,
                image_url: enemy.image_url || 'assets/inimigos/Aranha.png',
                hp: enemy.hp || 10,
                hpMax: enemy.hp || 10,
                atk: enemy.atk || 0,
                def: enemy.def || 0,
                level: enemy.level || 1
            }
        };

        const enemiesModal = document.getElementById('gm-enemies-modal');
        if (enemiesModal) enemiesModal.style.display = 'none';
        if (this.gmOpenModal === 'enemies') this.gmOpenModal = null;

        this.activeGmTool = null;
        document.querySelectorAll('.gm-tool-btn').forEach(b => b.classList.remove('active'));

        document.getElementById('targeting-overlay').style.display = 'flex';
        document.getElementById('targeting-text').textContent = `Posicionar ${enemy.name}: clique no mapa para colocar...`;
        document.getElementById('btn-confirm-attack').style.display = 'none';
    }

    openGmSheetsModal() {
        if (!this.isMaster) return;
        const modal = document.getElementById('gm-sheets-modal');
        if (!modal) return;
        modal.style.display = 'flex';
        this.renderGmSheetsList();
        modal.onclick = (e) => {
            if (e.target === modal) modal.style.display = 'none';
        };
    }

    renderGmSheetsList() {
        const list = document.getElementById('gm-sheets-list');
        if (!list) return;
        list.innerHTML = '';

        const allSheets = [];
        if (this.playerSheet) allSheets.push({ id: this.playerSheetId, ...this.playerSheet });
        if (this.otherPlayerSheets) allSheets.push(...this.otherPlayerSheets);

        allSheets.forEach(sheet => {
            const d = sheet.data || {};
            const currentStars = Math.max(0, Math.min(5, parseInt(sheet.rating_stars ?? 0)));
            let starsHtml = '';
            for (let i = 1; i <= 5; i++) {
                const on = i <= currentStars;
                starsHtml += `<button class="gm-rate-star ${on ? 'active' : ''}" type="button" data-star="${i}" aria-label="${i} estrelas"><i class="${on ? 'fas' : 'far'} fa-star"></i></button>`;
             // salva as estrelas e renderiza
             if (sheet.rating_stars !== currentStars) {
                sheet.rating_stars = currentStars;
             }

            }
            const item = document.createElement('div');
            item.className = 'gm-sheet-item';
            item.innerHTML = `
                <div class="gm-sheet-left">
                    <div class="gm-sheet-avatar" style="background-image: url('${d.image || 'assets/default-avatar.png'}')"></div>
                    <div class="gm-sheet-name">${sheet.name || 'Aventureiro'}</div>
                </div>
                <div class="gm-sheet-right">
                    <div class="gm-sheet-rating" data-sheet-id="${sheet.id}">${starsHtml}</div>
                    <button class="btn-confirm-small gm-sheet-open" type="button" style="display: none;">ABRIR</button>
                </div>
            `;
            const btn = item.querySelector('.gm-sheet-open');
            btn.onclick = () => {
                const sheetModal = document.getElementById('sheet-modal');
                const iframe = document.getElementById('sheet-iframe');
                if (sheetModal && iframe) {
                    iframe.src = `ficha-dnd.html?id=${sheet.id}&view=iframe`;
                    sheetModal.style.display = 'flex';
                }
            };

            item.querySelectorAll('.gm-rate-star').forEach((b) => {
                b.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const v = parseInt(b.dataset.star || 0);
                    if (!Number.isFinite(v) || v < 1 || v > 5) return;
                    try {
                        await updateDoc(doc(db, 'sheets', sheet.id), {
                            rating_stars: v,
                            rating_by: this.user.uid,
                            rating_session_id: this.sessionId,
                            rating_updated_at: serverTimestamp()
                        });
                        sheet.rating_stars = v;
                        item.querySelectorAll('.gm-rate-star').forEach((x) => {
                            const n = parseInt(x.dataset.star || 0);
                            const on = n <= v;
                            x.classList.toggle('active', on);
                            const icon = x.querySelector('i');
                            if (icon) icon.className = `${on ? 'fas' : 'far'} fa-star`;
                        });
                    } catch {}
                });
            });
            list.appendChild(item);
        });
    }

    renderGmPlayersList() {
        const list = document.getElementById('gm-players-list');
        if (!list) return;
        list.innerHTML = '';

        const allSheets = [];
        if (this.playerSheet) allSheets.push({ id: this.playerSheetId, ...this.playerSheet });
        if (this.otherPlayerSheets) allSheets.push(...this.otherPlayerSheets);

        allSheets.forEach(sheet => {
            const d = sheet.data || {};
            const hpCurrent = parseInt(d.hpCurrent) || 0;
            const hpMax = parseInt(d.hpMax) || 10;
            const item = document.createElement('div');
            item.className = 'gm-sheet-item';
            item.draggable = true;
            item.innerHTML = `
                <div class="gm-sheet-left">
                    <div class="gm-sheet-avatar" style="background-image: url('${d.image || 'assets/default-avatar.png'}')"></div>
                    <div class="gm-sheet-name">${sheet.name || 'Aventureiro'} <span style="font-size: 0.75rem; color: #aaa; font-weight: 700;">(${hpCurrent}/${hpMax} HP)</span></div>
                </div>
                <button class="btn-confirm-small">ABRIR</button>
            `;

            item.addEventListener('dragstart', (e) => {
                const payload = JSON.stringify({
                    type: 'player',
                    data: {
                        id: sheet.id,
                        name: sheet.name,
                        image_url: d.image || 'assets/default-avatar.png',
                        hp: hpCurrent,
                        hpMax: hpMax,
                        atk: d.attributes?.str || 10,
                        def: d.ac || 10,
                        level: d.classLevel ? parseInt((d.classLevel.match(/\d+/) || [1])[0]) || 1 : 1
                    }
                });
                e.dataTransfer.setData('application/json', payload);
                e.dataTransfer.setData('text/plain', payload);
                e.dataTransfer.effectAllowed = 'move';
            });

            const btn = item.querySelector('button');
            btn.onclick = () => {
                const sheetModal = document.getElementById('sheet-modal');
                const iframe = document.getElementById('sheet-iframe');
                if (sheetModal && iframe) {
                    iframe.src = `ficha-dnd.html?id=${sheet.id}&view=iframe`;
                    sheetModal.style.display = 'flex';
                }
            };
            list.appendChild(item);
        });
    }

    spawnPing(x, y) {
        
        if (!this.isMaster) return;
        const sessionRef = doc(db, "sessions", this.sessionId);
        updateDoc(sessionRef, {
            last_ping: {
                x,
                y,
                timestamp: Date.now()
            }
        }).catch((e) => console.error("Erro ao enviar ping:", e));
    }

    spawnPingLocal(x, y) {
        const layer = document.getElementById('measure-layer') || document.getElementById('map-container'); 
        if (!layer) return;
       
        const el = document.createElement('div');
        el.className = 'ping-marker';
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        layer.appendChild(el);
        setTimeout(() => el.remove(), 5200);
    }

    async loadSession() {
        const sessionRef = doc(db, "sessions", this.sessionId);
        this.unsubscribeSession = onSnapshot(sessionRef, async (snapshot) => {
            if (!snapshot.exists()) {
                window.location.href = 'index.html';
                return;
            }
            const oldRoll = this.sessionData?.last_roll;
            this.sessionData = snapshot.data();
            if (this.sessionData.status === 'ended') {
                window.location.href = 'index.html';
                return;
            }
            this.isMaster = this.sessionData.master_id === this.user.uid;
            this.updateExitButton();
        
        // Aplica Permissões de Jogador
        this.applyPermissions();
            
            // Tenta pegar o ID da ficha da sessão primeiro (selecionada no lobby)
            const sessionSheetId = this.sessionData.players?.[this.user.uid]?.sheet_id;

            // Se ainda não carregou a ficha ou se a ficha da sessão mudou
            if (!this.playerSheet || (sessionSheetId && this.playerSheetId !== sessionSheetId)) {
                await this.loadPlayerSheet(sessionSheetId);
            }

            // Combina inimigos
            this.allEnemies = [...DEFAULT_ENEMIES, ...(this.sessionData.enemies || [])];
            
            // Atualiza tokens vindos do campo map_tokens
            this.tokens = this.sessionData.map_tokens || [];

            this.syncFloorFromSession();
            this.syncMapObjectsFromSession();

            this.applyMapEditorState();
            this.syncMapOverlaysFromSession();
            this.renderFloorTiles();
            this.renderMapObjects();
            this.renderMapAssets();
            
            // Sincroniza Combate
            this.combatActive = this.sessionData.combat_active || false;
            this.turnOrder = this.sessionData.turn_order || [];
            this.currentTurnIndex = this.sessionData.current_turn_index || 0;
            
            // Verifica se o usuário já rolou iniciativa nesta rodada
            if (this.user && this.sessionData.initiatives?.[this.user.uid]) {
                this.hasRolledInitiative = true;
            } else {
                this.hasRolledInitiative = false;
            }

            // Carrega fichas de outros jogadores se necessário
            await this.syncPlayerSheets();

            this.updateUI();
            this.renderTokens();
            this.renderFootprints();
            this.renderTurnTracker();
            this.renderPlayerAbilities();
            this.renderFloorLibrary();
            this.renderFloorTileInspector();
            this.renderObjectBook();
            this.handleDiceSync(oldRoll);
            this.handleSFXSync(this.sessionData.last_sfx);
            this.handlePingSync(this.sessionData.last_ping);
        });
    }

    syncFloorFromSession() {
        const rawTextures = Array.isArray(this.sessionData?.map_floor_textures) ? this.sessionData.map_floor_textures : [];
        const rawTiles = Array.isArray(this.sessionData?.map_floor_tiles) ? this.sessionData.map_floor_tiles : [];

        let texturesChanged = false;
        let tilesChanged = false;

        this.floorTextures = rawTextures.map((t) => {
            const nextUrl = normalizeFloorUrl(t?.url);
            if (t?.url !== nextUrl) texturesChanged = true;
            return { ...(t || {}), url: nextUrl };
        });

        this.floorTiles = rawTiles.map((t) => {
            const nextUrl = normalizeFloorUrl(t?.url);
            if (t?.url !== nextUrl) tilesChanged = true;
            return { ...(t || {}), url: nextUrl };
        });

        if (this.isMaster) {
            if (texturesChanged) this.schedulePersistFloorTextures();
            if (tilesChanged) this.schedulePersistFloorTiles();
        }
    }

    syncMapObjectsFromSession() {
        this.mapObjects = Array.isArray(this.sessionData?.map_objects) ? this.sessionData.map_objects : [];
    }

    schedulePersistMapObjects() {
        if (!this.isMaster) return;
        clearTimeout(this._mapObjectsSaveTimer);
        this._mapObjectsSaveTimer = setTimeout(async () => {
            try {
                const sessionRef = doc(db, 'sessions', this.sessionId);
                await updateDoc(sessionRef, { map_objects: this.mapObjects });
            } catch (e) {
                console.error(e);
            }
        }, 220);
    }

    getSelectedMapObject() {
        return (Array.isArray(this.mapObjects) ? this.mapObjects : []).find(o => o && o.id === this.selectedMapObjectId) || null;
    }

    patchMapObject(objectId, patch) {
        if (!this.isMaster) return;
        const list = Array.isArray(this.mapObjects) ? [...this.mapObjects] : [];
        const idx = list.findIndex(o => o && o.id === objectId);
        if (idx === -1) return;
        list[idx] = { ...list[idx], ...patch };
        this.mapObjects = list;
        this.renderMapObjects();
        this.schedulePersistMapObjects();
    }

    removeMapObject(objectId) {
        if (!this.isMaster) return;
        this.mapObjects = (Array.isArray(this.mapObjects) ? this.mapObjects : []).filter(o => o && o.id !== objectId);
        if (this.selectedMapObjectId === objectId) this.selectedMapObjectId = null;
        this.renderMapObjects();
        this.hideObjectPopover();
        this.schedulePersistMapObjects();
    }

    duplicateMapObject(objectId) {
        if (!this.isMaster) return;
        const list = Array.isArray(this.mapObjects) ? [...this.mapObjects] : [];
        const o = list.find(x => x && x.id === objectId);
        if (!o) return;
        const copy = {
            ...o,
            id: `obj_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
            x: (Number(o.x) || 0) + 50,
            y: (Number(o.y) || 0) + 50
        };
        list.push(copy);
        this.mapObjects = list;
        this.renderMapObjects();
        this.schedulePersistMapObjects();
    }

    renderMapObjects() {
        const layer = document.getElementById('map-objects-layer');
        if (!layer) return;
        layer.innerHTML = '';
        const list = Array.isArray(this.mapObjects) ? this.mapObjects : [];

        list.forEach((o) => {
            if (!o || !o.id || !o.image_url) return;
            const el = document.createElement('div');
            const locked = !!o.locked;
            const deleteSelected = this.deleteMode && this.deleteSelection?.objects?.has(o.id);
            el.className = `map-object${this.selectedMapObjectId === o.id ? ' selected' : ''}${locked ? ' locked' : ''}${this.deleteMode ? ' delete-armed' : ''}${deleteSelected ? ' delete-selected' : ''}`;
            el.dataset.id = o.id;
            el.style.left = `${Number(o.x) || 0}px`;
            el.style.top = `${Number(o.y) || 0}px`;
            el.style.width = `${Math.max(20, Number(o.w) || 120)}px`;
            el.style.height = `${Math.max(20, Number(o.h) || 120)}px`;
            el.style.opacity = String(Math.max(0.05, Math.min(1, Number(o.opacity ?? 1))));
            el.style.backgroundImage = `url('${o.image_url}')`;
            const rot = Math.round(Number(o.rot) || 0) % 360;
            const scale = Math.max(0.2, Math.min(5, Number(o.scale ?? 1)));
            el.style.transform = `rotate(${rot}deg) scale(${scale})`;
            if (o.borderColor) el.style.setProperty('--map-item-border-color', String(o.borderColor));

            const dist = document.createElement('div');
            dist.className = 'map-object-distance';
            dist.textContent = '';
            el.appendChild(dist);

            const lockBtn = document.createElement('button');
            lockBtn.type = 'button';
            lockBtn.className = 'map-object-lock';
            lockBtn.title = locked ? 'Desbloquear' : 'Bloquear';
            lockBtn.innerHTML = locked ? '<i class="fas fa-lock"></i>' : '<i class="fas fa-lock-open"></i>';
            lockBtn.onclick = (e) => {
                e.stopPropagation();
                this.patchMapObject(o.id, { locked: !locked });
            };
            el.appendChild(lockBtn);

            el.onclick = (e) => {
                e.stopPropagation();
                if (this.isMaster && this.deleteMode) {
                    this.toggleDeleteSelection('object', o.id);
                    return;
                }
                if (this.isMaster && this.activeMapTool  !== 'pointer') return;
                this.selectedMapObjectId = o.id;
                this.renderMapObjects();
                if (this.isMaster && this.activeMapTool === 'pointer') {
                    this.openObjectPopover(o.id, e.clientX, e.clientY);
                }
            };

            el.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.deleteMode) return;
                if (this.isMaster && this.activeMapTool !== 'pointer') return;
                this.selectedMapObjectId = o.id;
                this.renderMapObjects();
                this.openMapContextMenu({
                    kind: 'object',
                    id: o.id,
                    canMove: !!this.isMaster && !locked,
                    canDuplicate: !!this.isMaster,
                    canDelete: !!this.isMaster,
                    canBorderColor: !!this.isMaster
                }, e.clientX, e.clientY);
            };

            if (this.isMaster && this.activeMapTool === 'pointer' && !locked && !this.deleteMode) {
                this.makeMapObjectDraggable(el, o);
            }

            layer.appendChild(el);
        });
    }

    hideObjectPopover() {
        const pop = document.getElementById('object-popover');
        if (!pop) return;
        pop.classList.remove('active');
        pop.style.left = '';
        pop.style.top = '';
        pop.style.visibility = '';
    }

    openObjectPopover(objectId, clientX, clientY) {
        if (!this.isMaster) return;
        const pop = document.getElementById('object-popover');
        if (!pop) return;
        const o = (Array.isArray(this.mapObjects) ? this.mapObjects : []).find(x => x && x.id === objectId);
        if (!o) return;

        const rot = Math.round(Number(o.rot) || 0) % 360;
        const opacity = Math.max(0.05, Math.min(1, Number(o.opacity ?? 1)));
        const scale = Math.max(0.2, Math.min(5, Number(o.scale ?? 1)));

        pop.innerHTML = `
            <div style="font-weight: 900;">Objeto</div>
            <div class="row">
                <label>Ângulo</label>
                <div style="display:flex; gap: 10px; align-items:center;">
                    <input id="obj-rot" type="range" min="0" max="360" step="1" value="${rot}" style="flex:1;">
                    <div id="obj-rot-val" style="min-width:52px; text-align:right; font-weight:900; opacity:0.9;">${rot}°</div>
                </div>
            </div>
            <div class="row">
                <label>Escala</label>
                <input id="obj-scale" type="range" min="0.2" max="5" step="0.05" value="${scale}">
            </div>
            <div class="row">
                <label>Opacidade</label>
                <input id="obj-opacity" type="range" min="0.05" max="1" step="0.05" value="${opacity}">
            </div>
            <div class="actions">
                <button id="obj-dup" class="btn-secondary" type="button">Duplicar</button>
                <button id="obj-del" class="btn-danger-small" type="button">Remover</button>
            </div>
        `;

        const rotRange = pop.querySelector('#obj-rot');
        const rotVal = pop.querySelector('#obj-rot-val');
        const scaleRange = pop.querySelector('#obj-scale');
        const opRange = pop.querySelector('#obj-opacity');
        const btnDup = pop.querySelector('#obj-dup');
        const btnDel = pop.querySelector('#obj-del');

        const normalizeDeg = (d) => {
            const n = Math.round(Number(d) || 0) % 360;
            return n < 0 ? n + 360 : n;
        };

        if (rotRange) rotRange.oninput = () => {
            const next = normalizeDeg(rotRange.value);
            if (rotVal) rotVal.textContent = `${next}°`;
            this.patchMapObject(objectId, { rot: next });
        };
        if (scaleRange) scaleRange.oninput = () => {
            const next = Math.max(0.2, Math.min(5, Number(scaleRange.value) || 1));
            this.patchMapObject(objectId, { scale: next });
        };
        if (opRange) opRange.oninput = () => {
            const next = Math.max(0.05, Math.min(1, Number(opRange.value) || 1));
            this.patchMapObject(objectId, { opacity: next });
        };
        if (btnDup) btnDup.onclick = () => this.duplicateMapObject(objectId);
        if (btnDel) btnDel.onclick = () => this.removeMapObject(objectId);

        pop.classList.add('active');
        pop.style.visibility = 'hidden';
        pop.style.left = '0px';
        pop.style.top = '0px';
        const rectP = pop.getBoundingClientRect();
        const maxLeft = Math.max(8, window.innerWidth - rectP.width - 8);
        const maxTop = Math.max(70, window.innerHeight - rectP.height - 8);
        const left = Math.min(Math.max(8, clientX), maxLeft);
        const top = Math.min(Math.max(70, clientY), maxTop);
        pop.style.left = `${left}px`;
        pop.style.top = `${top}px`;
        pop.style.visibility = '';
    }

    makeMapObjectDraggable(el, obj) {
        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;
        let startX = 0;
        let startY = 0;

        const label = el.querySelector('.map-object-distance');

        const onMouseDown = (e) => {
            if (!this.isMaster || this.activeMapTool !== 'pointer') return;
            if (e.button !== 0) return;
            if (obj.locked) return;
            if (e.target.closest('.map-object-lock')) return;
            e.stopPropagation();
            this.selectedMapObjectId = obj.id;
            this.renderMapObjects();
            this.hideObjectPopover();

            const p = this.getMapPointFromClient(e.clientX, e.clientY);
            if (!p) return;
            startX = Number(obj.x) || 0;
            startY = Number(obj.y) || 0;
            offsetX = p.x - startX;
            offsetY = p.y - startY;

            isDragging = true;
            el.classList.add('dragging');

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            const p = this.getMapPointFromClient(e.clientX, e.clientY);
            if (!p) return;
            const newX = p.x - offsetX;
            const newY = p.y - offsetY;
            el.style.left = `${newX}px`;
            el.style.top = `${newY}px`;

            const dx = newX - startX;
            const dy = newY - startY;
            const distPx = Math.sqrt(dx * dx + dy * dy);
            const distFt = Math.round((distPx / 50) * 5);
            if (label) label.textContent = `${distFt} ft`;
        };

        const onMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;
            el.classList.remove('dragging');

            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

            const rawX = parseFloat(el.style.left || '0') || 0;
            const rawY = parseFloat(el.style.top || '0') || 0;
            const gridX = Math.round(rawX / 50) * 50;
            const gridY = Math.round(rawY / 50) * 50;
            this.patchMapObject(obj.id, { x: gridX, y: gridY });
        };

        el.addEventListener('mousedown', onMouseDown);
    }
    
    startMovingMapObject(objectId, e) {
        if (!this.isMaster || this.activeMapTool !== 'pointer') return;
        const o = (Array.isArray(this.mapObjects) ? this.mapObjects : []).find(x => x && x.id === objectId);
        if (!o || o.locked) return;

        this.isMovingMapObject = true;
        this.movingMapObjectId = objectId;
        this.isMovingToken = false;
        this.tokenToMove = null;
        this.isMovingFloorTile = true;
        this.movingFloorTileId = null;
        this.isPlacingToken = false;
        this.pendingTokenPlacement = null;
        this.isPlacingAsset = false;
        this.pendingAssetPlacement = null;
        document.getElementById('targeting-overlay').style.display = 'flex';
        document.getElementById('targeting-text').textContent = 'Movendo objeto. Clique no destino...';
        document.getElementById('btn-confirm-attack').style.display = 'none';
    }

    async moveMapObjectTo(x, y) {
        if (!this.isMaster || !this.movingMapObjectId || this.activeMapTool !== 'pointer') return;
        this.patchMapObject(this.movingMapObjectId, { x, y });
        this.isMovingMapObject = false;
        this.movingMapObjectId = null;
        document.getElementById('targeting-overlay').style.display = 'none';
    }

    getFloorTextureById(id) {
        const list = Array.isArray(this.floorTextures) ? this.floorTextures : [];
        return list.find(t => t && t.id === id) || null;
    }

    getSelectedFloorTile() {

            return (Array.isArray(this.floorTiles) ? this.floorTiles : []).find(t => t && t.id === this.selectedFloorTileId) || null;
  
    }

    getFloorTileRect(t) {
        const x = Number(t?.x) || 0;
        const y = Number(t?.y) || 0;
        const w = Math.max(10, Number(t?.w) || 50);
        const h = Math.max(10, Number(t?.h) || 50);
        return { x, y, w, h };
    }

    rectsOverlap(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    findFreeFloorPosition(layer, x, y, w, h, excludeId = null) {
        const tiles = Array.isArray(this.floorTiles) ? this.floorTiles : [];
        const step = 50;
        const base = { x, y, w, h };

        const isFree = (rx, ry) => {
            const r = { x: rx, y: ry, w, h };
            return !tiles.some(t => {
                if (!t || (excludeId && t.id === excludeId)) return false;
                if ((t.layer ?? 0) !== layer) return false;
                return this.rectsOverlap(r, this.getFloorTileRect(t));
            });
        };

        if (isFree(base.x, base.y)) return { x: base.x, y: base.y };

        for (let r = 1; r <= 14; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const nx = base.x + dx * step;
                    const ny = base.y + dy * step;
                    if (nx < 0 || ny < 0 || nx > 3000 - w || ny > 3000 - h) continue;
                    if (isFree(nx, ny)) return { x: nx, y: ny };
                }
            }
        }

        return { x: base.x, y: base.y };
    }

    renderFloorTiles() {
        const layer = document.getElementById('floor-tiles-layer');
        if (!layer) return;
        layer.innerHTML = '';
        const tiles = Array.isArray(this.floorTiles) ? this.floorTiles : [];

        const deleteArmed = this.isMaster && (this.deleteMode || (this.activeMapTool === 'floor' && this.floorRemoveMode));

        tiles.forEach((t) => {
            if (!t || !t.id || !t.url) return;
            const el = document.createElement('div');
            const deleteSelected = this.deleteMode && this.deleteSelection?.floors?.has(t.id);
            el.className = `floor-tile${this.selectedFloorTileId === t.id ? ' selected' : ''}${deleteArmed ? ' delete-armed' : ''}${deleteSelected ? ' delete-selected' : ''}`;
            el.dataset.id = t.id;
            el.style.left = `${t.x || 0}px`;
            el.style.top = `${t.y || 0}px`;
            el.style.width = `${t.w || 50}px`;
            el.style.height = `${t.h || 50}px`;
            el.style.opacity = String(Math.max(0.05, Math.min(1, t.opacity ?? 1)));
            el.style.backgroundImage = `url('${t.url}')`;
            el.style.transform = `rotate(${Number(t.rot || 0)}deg)`;
            el.style.zIndex = String(2 + Math.max(0, Math.min(4, Number(t.layer) || 0)));
            if (t.borderColor) el.style.setProperty('--floor-border-color', String(t.borderColor));

            el.onclick = (e) => {
                e.stopPropagation();
                if (this.isMaster && this.deleteMode) {
                    this.toggleDeleteSelection('floor', t.id);
                    return;
                }
                if (this.isMaster && this.activeMapTool === 'floor' && this.floorRemoveMode) {
                    this.removeFloorTileNoConfirm(t.id);
                    return;
                }
                if (this.isMaster && this._blockedFloor === true) return;
                this.selectedFloorTileId = t.id;
                this.renderFloorTiles();
                this.renderFloorTileInspector();
                if (this.isMaster && this.activeMapTool === 'floor' && this.floorSubMode === 'edit') {
                    this.openFloorTilePopover(t.id, e.clientX, e.clientY);
                }
            };

            el.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.deleteMode) return;
                if (this.isMaster && this._blockedFloor === true) return;
                this.selectedFloorTileId = t.id;
                this.renderFloorTiles();
                this.renderFloorTileInspector();
                if (this.isMaster) this.openMasterKitTab('map');
                this.openMapContextMenu({
                    kind: 'floor',
                    id: t.id,
                    canMove: !!this.isMaster,
                    canDuplicate: !!this.isMaster,
                    canDelete: !!this.isMaster,
                    canBorderColor: !!this.isMaster
                }, e.clientX, e.clientY);
            };

            if (this.isMaster && this._blockedFloor !== true) {
                this.makeFloorTileDraggable(el, t);
            }

            layer.appendChild(el);
        });
    }

    async removeFloorTileNoConfirm(tileId) {
        if (!this.isMaster) return;
        this.floorTiles = (Array.isArray(this.floorTiles) ? this.floorTiles : []).filter(t => t && t.id !== tileId);
        this.renderFloorTiles();
        this.renderFloorTileInspector();
        this.hideFloorTilePopover();
        this.schedulePersistFloorTiles();
    }

    makeFloorTileDraggable(el, tile) {
        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;

        const onMouseDown = (e) => {
            if (!this.isMaster) return;
            if (this._blockedFloor === true) return;  
            e.stopPropagation();


            
            this.selectedFloorTileId = tile.id;
            this.hideFloorTilePopover();
           
            this.renderFloorTiles();

            const p = this.getMapPointFromClient(e.clientX, e.clientY);
            if (!p) return;
            offsetX = p.x - (tile.x || 0);
            offsetY = p.y - (tile.y || 0);
            isDragging = true;
            el.style.zIndex = '1200';


            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        };
        //faz mover ao arrastar o token 

        const onMouseMove = (e) => {
            if (!isDragging ) return;
            const p = this.getMapPointFromClient(e.clientX, e.clientY);
            // if (!p) return;
            const newX = p.x - offsetX;
            const newY = p.y - offsetY;
            el.style.left = `${newX}px`;
            el.style.top = `${newY}px`;
        };

        const onMouseUp = async () => {
            if (!isDragging) return;
            isDragging = false;
            el.style.zIndex = '';

            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

            const rawX = parseFloat(el.style.left || '0') || 0;
            const rawY = parseFloat(el.style.top || '0') || 0;
            const gridX = Math.round(rawX / 50) * 50;
            const gridY = Math.round(rawY / 50) * 50;
            await this.patchFloorTile(tile.id, { x: gridX, y: gridY }, true);
        };

        el.addEventListener('mousedown', onMouseDown);
    }

    async patchFloorTile(tileId, patch, resolveCollision = false) {
        if (!this.isMaster) return;
        if (this._blockedFloor) return;
        const tiles = Array.isArray(this.floorTiles) ? [...this.floorTiles] : [];
        const idx = tiles.findIndex(t => t && t.id === tileId);
        if (idx === -1) return;
        const next = { ...tiles[idx], ...patch };

        if (resolveCollision) {
            const rect = this.getFloorTileRect(next);
            const layer = Math.max(0, Math.min(4, Number(next.layer) || 0));
            const pos = this.findFreeFloorPosition(layer, rect.x, rect.y, rect.w, rect.h, tileId);
            next.x = pos.x;
            next.y = pos.y;
        }

        tiles[idx] = next;
        this.floorTiles = tiles;
        this.renderFloorTiles();
        this.schedulePersistFloorTiles();
    }

    async removeFloorTile(tileId) {
        if (!this.isMaster) return;
        if (this._blockedFloor) return;
        const ok = confirm('Deletar este piso?');
        if (!ok) return;
        this.floorTiles = (Array.isArray(this.floorTiles) ? this.floorTiles : []).filter(t => t && t.id !== tileId);
        if (this.selectedFloorTileId === tileId) this.selectedFloorTileId = null;
        this.renderFloorTiles();
        this.hideFloorTilePopover();
        this.schedulePersistFloorTiles();
    }

    async duplicateFloorTile(tileId) {
        if (!this.isMaster) return;
        if (this._blockedFloor) return;
        const tiles = Array.isArray(this.floorTiles) ? [...this.floorTiles] : [];
        const t = tiles.find(x => x && x.id === tileId);
        if (!t) return;
        const copy = { ...t, id: `floor_${Date.now()}`, x: (t.x || 0) + 50, y: (t.y || 0) + 50 };
        const rect = this.getFloorTileRect(copy);
        const layer = Math.max(0, Math.min(4, Number(copy.layer) || 0));
        const pos = this.findFreeFloorPosition(layer, rect.x, rect.y, rect.w, rect.h, null);
        copy.x = pos.x;
        copy.y = pos.y;
        tiles.push(copy);
        this.floorTiles = tiles;
        this.renderFloorTiles();
        this.schedulePersistFloorTiles();
    }

    startMovingFloorTile(tileId) {
        if (!this.isMaster) return;
        if (this._blockedFloor) return;
        const t = (Array.isArray(this.floorTiles) ? this.floorTiles : []).find(x => x && x.id === tileId);
        if (!t) return;
        this.isMovingFloorTile = true;
        this.movingFloorTileId = tileId;
        this.isMovingToken = false;
        this.tokenToMove = null;
        this.isPlacingToken = false;
        this.pendingTokenPlacement = null;
        this.isPlacingAsset = false;
        this.pendingAssetPlacement = null;
        this.selectedAssetId = null;
        document.getElementById('targeting-overlay').style.display = 'flex';
        document.getElementById('targeting-text').textContent = 'Movendo piso. Clique no destino...';
        document.getElementById('btn-confirm-attack').style.display = 'none';
    }

    async moveFloorTileTo(x, y) {
        if (!this.isMaster || !this.movingFloorTileId) return;
        if (this._blockedFloor) return;
        await this.patchFloorTile(this.movingFloorTileId, { x, y }, true);
        this.isMovingFloorTile = false;
        this.movingFloorTileId = null;
        document.getElementById('targeting-overlay').style.display = 'none';
    }

    schedulePersistFloorTiles() {
        if (!this.isMaster) return;
        clearTimeout(this._floorTilesSaveTimer);
        this._floorTilesSaveTimer = setTimeout(async () => {
            try {
                const sessionRef = doc(db, 'sessions', this.sessionId);
                await updateDoc(sessionRef, { map_floor_tiles: this.floorTiles });
            } catch (e) {
                console.error(e);
            }
        }, 250);
    }

    schedulePersistFloorTextures() {
        if (!this.isMaster) return;
        clearTimeout(this._floorTexSaveTimer);
        this._floorTexSaveTimer = setTimeout(async () => {
            try {
                const sessionRef = doc(db, 'sessions', this.sessionId);
                await updateDoc(sessionRef, { map_floor_textures: this.floorTextures });
            } catch (e) {
                console.error(e);
            }
        }, 350);
    }

    async addFloorTexturesFromFiles(files) {
        if (!this.isMaster) return;
        const list = Array.from(files || []).filter(Boolean);
        if (!list.length) return;

        const next = Array.isArray(this.floorTextures) ? [...this.floorTextures] : [];

        for (const f of list) {
            if (!f) continue;
            if (f.size > 260000) {
                alert('Arquivo muito grande. Use imagens menores.');
                continue;
            }
            const dataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => resolve('');
                reader.readAsDataURL(f);
            });
            if (!dataUrl) continue;
            next.push({
                id: `tex_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
                name: String(f.name || 'Piso'),
                url: String(dataUrl)
            });
        }

        this.floorTextures = next.slice(-80);
        this.renderFloorLibrary();
        this.schedulePersistFloorTextures();
    }

    renderFloorLibrary() {
        const grid = document.getElementById('floor-texture-grid');
        if (!grid) return;
        if (!this.isMaster) {
            grid.innerHTML = '';
            return;
        }

        const list = Array.isArray(this.floorTextures) ? this.floorTextures : [];
        if (!list.length) {
            grid.innerHTML = '<div style="opacity:0.7; font-size:0.85rem;">Nenhum piso adicionado ainda.</div>';
            return;
        }

        grid.innerHTML = list.map(t => {
            const safeName = String(t.name || 'Piso').replace(/"/g, '&quot;');
            const selected = this.selectedFloorTextureId === t.id;
            return `
                <div class="floor-texture-card${selected ? ' selected' : ''}" draggable="true" data-tex-id="${t.id}">
                    <div class="floor-texture-thumb" style="background-image: url('${t.url}')"></div>
                    <div class="floor-texture-meta">
                        <div class="floor-texture-name">${safeName}</div>
                        <div class="floor-texture-hint">Clique para equipar • Arraste p/ 1 piso</div>
                    </div>
                </div>
            `;
        }).join('');

        grid.querySelectorAll('.floor-texture-card').forEach((card) => {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.isMaster) return;
                const id = card.dataset.texId;
                this.selectedFloorTextureId = id;
                this.activeMapTool = 'floor';
                this.updateMapToolUI();
                this.renderFloorLibrary();
            });

            card.addEventListener('dragstart', (e) => {
                const id = card.dataset.texId;
                const payload = JSON.stringify({ type: 'floor', data: { textureId: id, layer: this.floorActiveLayer } });
                e.dataTransfer.setData('application/json', payload);
                e.dataTransfer.setData('text/plain', payload);
                e.dataTransfer.effectAllowed = 'copy';
            });
        });
    }

    renderObjectBook(searchText = '') {
        const root = document.getElementById('objects-book');
        if (!root) return;
        if (!this.isMaster) {
            root.innerHTML = '';
            return;
        }

        const q = String(searchText || '').trim().toLowerCase();
        const categories = getObjectBookCategories();

        const html = categories.map((cat, i) => {
            const filtered = q ? cat.items.filter(it => it.name.toLowerCase().includes(q)) : cat.items;
            const count = filtered.length;
            const open = q ? true : i === 0;
            const body = count
                ? filtered.map(it => {
                    const safeName = it.name.replace(/</g, '&lt;');
                    const url = String(it.image_url || '');
                    const safeUrlAttr = url.replace(/"/g, '&quot;');
                    return `
                        <div class="objects-item" draggable="true" data-obj-id="${it.id}" data-obj-name="${safeName}" data-obj-url="${safeUrlAttr}">
                            <div class="objects-item-name">${safeName}</div>
                        </div>
                    `;
                }).join('')
                : `<div style="padding: 10px; opacity: 0.75; font-size: 0.85rem;">Sem itens</div>`;

            return `
                <div class="objects-category ${open ? 'open' : ''}" data-category="${cat.category}">
                    <div class="objects-category-header">
                        <span>${cat.category}</span>
                        <small>${count}</small>
                    </div>
                    <div class="objects-category-body">${body}</div>
                </div>
            `;
        }).join('');

        root.innerHTML = html;

        root.querySelectorAll('.objects-category-header').forEach((hdr) => {
            hdr.addEventListener('click', (e) => {
                e.stopPropagation();
                const box = hdr.closest('.objects-category');
                if (!box) return;
                box.classList.toggle('open');
            });
        });

        root.querySelectorAll('.objects-item').forEach((item) => {
            item.addEventListener('mouseenter', () => {
                const name = String(item.dataset.objName || '').trim();
                const imageUrl = String(item.dataset.objUrl || '').trim();
                if (!imageUrl) return;
                const rect = item.getBoundingClientRect();
                this.showObjectsHoverPreview(imageUrl, name, rect.top + rect.height / 2);
            });
            item.addEventListener('mouseleave', () => {
                this.hideObjectsHoverPreview();
            });
            item.addEventListener('dragstart', (e) => {
                const name = String(item.dataset.objName || '').trim();
                const imageUrl = String(item.dataset.objUrl || '').trim();
                if (!name || !imageUrl) {
                    e.preventDefault();
                    alert('Este item ainda não tem imagem. Preencha a URL/arquivo no código.');
                    return;
                }
                const payload = JSON.stringify({ type: 'object', data: { name, image_url: imageUrl } });
                e.dataTransfer.setData('application/json', payload);
                e.dataTransfer.setData('text/plain', payload);
                e.dataTransfer.effectAllowed = 'copy';
            });

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.isMaster) return;
                const name = String(item.dataset.objName || '').trim();
                const imageUrl = String(item.dataset.objUrl || '').trim();
                if (!name || !imageUrl) {
                    alert('Este item ainda não tem imagem. Preencha a URL/arquivo no código.');
                    return;
                }

                this.isPlacingMapObject = true;
                this.pendingMapObjectPlacement = { name, image_url: imageUrl };
                const overlay = document.getElementById('targeting-overlay');
                if (overlay) overlay.style.display = 'flex';
                const txt = document.getElementById('targeting-text');
                if (txt) txt.textContent = `Posicionar ${name}: clique no mapa para colocar...`;
                const btn = document.getElementById('btn-confirm-attack');
                if (btn) btn.style.display = 'none';
            });
        });
    }

    renderFloorTileInspector() {
        const root = document.getElementById('floor-tile-inspector');
        if (!root) return;
        if (!this.isMaster) {
            root.innerHTML = '';
            return;
        }
        const t = this.getSelectedFloorTile();
        if (!t) {
            root.innerHTML = '<div style="opacity:0.75; font-size:0.85rem;">Selecione um piso no mapa para editar.</div>';
            return;
        }

        const rot = Number(t.rot || 0) % 360;
        const opacity = Math.max(0.05, Math.min(1, Number(t.opacity ?? 1)));
        const sizeSquares = Math.max(1, Math.min(400, Math.round((Number(t.w || 50) || 50) / 50)));
        const layer = Math.max(0, Math.min(4, Number(t.layer) || 0));
        const name = (Array.isArray(this.floorTextures) ? this.floorTextures : []).find(x => x && x.url === t.url)?.name || 'Piso';

        const area = document.querySelector('.map-area');
        const areaRect = area ? area.getBoundingClientRect() : null;
        const visibleW = areaRect ? (areaRect.width / (this.newScale || 1)) : 800;
        const visibleH = areaRect ? (areaRect.height / (this.newScale || 1)) : 600;
        const visibleSquares = Math.max(1, Math.min(400, Math.ceil(Math.max(visibleW, visibleH) / 50)));
        const maxSquares = Math.max(6, visibleSquares);
        const defaultSquares = Math.max(1, Math.min(40, Math.round((Number(this.floorDefaultSizePx || 150) || 150) / 50)));

        root.innerHTML = `
            <div style="font-weight: 900;">Piso Selecionado</div>
            <div style="opacity: 0.8; font-size: 0.8rem; margin-top: 4px;">${String(name).replace(/</g, '&lt;')}</div>

            <div class="floor-inspector-row">
                <label>Camada</label>
                <select id="floor-edit-layer" class="sidebar-search" style="height: 34px; padding: 0 10px;">
                    <option value="0" ${layer === 0 ? 'selected' : ''}>1</option>
                    <option value="1" ${layer === 1 ? 'selected' : ''}>2</option>
                    <option value="2" ${layer === 2 ? 'selected' : ''}>3</option>
                    <option value="3" ${layer === 3 ? 'selected' : ''}>4</option>
                    <option value="4" ${layer === 4 ? 'selected' : ''}>5</option>
                </select>
            </div>

            <div class="floor-inspector-row">
                <label>Rotação</label>
                <div style="display:flex; gap: 8px;">
                    <button id="floor-rot-left" class="btn-secondary" type="button" style="padding: 10px;"><i class="fas fa-undo"></i></button>
                    <button id="floor-rot-right" class="btn-secondary" type="button" style="padding: 10px;"><i class="fas fa-redo"></i></button>
                </div>
            </div>

            <div class="floor-inspector-row">
                <label>Tamanho</label>
                <div style="display:grid; grid-template-columns: 1fr 50px; gap: 10px; align-items:center;">
                    <input id="floor-edit-size" type="range" min="1" max="${maxSquares}" step="1" value="${sizeSquares}" style="max-width: 78px;">
                    <input id="floor-edit-size-input" type="number" min="1" max="${maxSquares}" step="1" value="${sizeSquares}" class="sidebar-search" style="height: 34px; padding: 0 5px;">
                </div>
                <div style="display: flex;flex-direction: column;width: 224px;text-align: center;font-size: 0.78rem;opacity: 0.75;margin-top: 6px;">
                    Padrão para próximos pisos: <b>${defaultSquares}x</b> (ajuste aqui e o próximo piso já vem nesse tamanho)
                    <button id="floor-size-fit" type="button" class="btn-secondary" style="padding: 6px 10px; margin-left: 8px; margin-top: 30px;">Tela</button>
                </div>
            </div>

            <div class="floor-inspector-row">
                <label>Opacidade</label>
                <input id="floor-edit-opacity" type="range" min="0.05" max="1" step="0.05" value="${opacity}">
            </div>

            <div class="floor-inspector-actions">
                <button id="floor-delete" class="btn-danger-small" type="button" style="padding: 10px; flex:1;">Deletar</button>
            </div>
        `;

        const btnL = root.querySelector('#floor-rot-left');
        const btnR = root.querySelector('#floor-rot-right');
        const rangeS = root.querySelector('#floor-edit-size');
        const inputS = root.querySelector('#floor-edit-size-input');
        const btnFit = root.querySelector('#floor-size-fit');
        const rangeO = root.querySelector('#floor-edit-opacity');
        const selLayer = root.querySelector('#floor-edit-layer');
        const btnDel = root.querySelector('#floor-delete');

        if (btnL) btnL.onclick = () => this.patchFloorTile(t.id, { rot: (rot - 90 + 360) % 360 });
        if (btnR) btnR.onclick = () => this.patchFloorTile(t.id, { rot: (rot + 90) % 360 });
        const setDefaultFloorSizeSquares = (sq) => {

            const v = Math.max(1, Math.min(400, Math.round(Number(sq) || 1)));
            console.log('max40  1')
            this.floorDefaultSizePx = v * 50;
            try { localStorage.setItem('floor_default_size_px', String(this.floorDefaultSizePx)); } catch {}
        };
        const applySizeSquares = (sq) => {
            const v = Math.max(1, Math.min(400, Math.round(Number(sq) || 1)));
            console.log('max400  2');
            if (rangeS) rangeS.value = String(v);
            if (inputS) inputS.value = String(v);
            setDefaultFloorSizeSquares(v);
            this.patchFloorTile(t.id, { w: v * 50, h: v * 50 }, true);
        };
        if (rangeS) rangeS.oninput = () => applySizeSquares(rangeS.value);
        if (inputS) inputS.onchange = () => applySizeSquares(inputS.value);
        if (btnFit) btnFit.onclick = () => applySizeSquares(visibleSquares);
        if (rangeO) rangeO.oninput = () => {
            const o = Math.max(0.05, Math.min(1, Number(rangeO.value) || 1));
            this.patchFloorTile(t.id, { opacity: o });
        };
        if (selLayer) selLayer.onchange = () => {
            const l = Math.max(0, Math.min(4, Number(selLayer.value) || 0));
            this.patchFloorTile(t.id, { layer: l }, true);
        };
        if (btnDel) btnDel.onclick = () => this.removeFloorTile(t.id);
    }

    startFloorPaint(e) {
        if (!this.isMaster) return;
        if (this.activeMapTool !== 'floor') return;
        if (this.floorRemoveMode) return;
        if (this.floorSubMode !== 'paint') return;
        if (this._blockedFloor) return;
        if (!this.selectedFloorTextureId) {
            alert('Selecione um piso primeiro.');
            return;
        }
        const tex = this.getFloorTextureById(this.selectedFloorTextureId);
        if (!tex) return;
        e.preventDefault();
        e.stopPropagation();
        this.isFloorPainting = true;
        this.lastFloorPaintCellKey = null;
        this.paintFloorAtClient(e.clientX, e.clientY, tex);
    }

    updateFloorPaint(e) {
        if (!this.isFloorPainting) return;
        if (this._blockedFloor) return;
        const tex = this.getFloorTextureById(this.selectedFloorTextureId);
        if (!tex) return;
        this.paintFloorAtClient(e.clientX, e.clientY, tex);
    }

    async finishFloorPaint() {
        this.isFloorPainting = false;
        this.lastFloorPaintCellKey = null;
        this.schedulePersistFloorTiles();
    }

    paintFloorAtClient(clientX, clientY, tex) {
        if (this._blockedFloor) return;
        const p = this.getMapPointFromClient(clientX, clientY);
        if (!p) return;
        const gridX = Math.floor(p.x / 50) * 50;
        const gridY = Math.floor(p.y / 50) * 50;
        const layer = Math.max(0, Math.min(4, Number(this.floorActiveLayer) || 0));
        const key = `${layer}:${gridX}:${gridY}`;
        if (this.lastFloorPaintCellKey === key) return;
        this.lastFloorPaintCellKey = key;

        const tiles = this.floorTiles || [];
        const occupied = tiles.some(t => t && (t.layer ?? 0) === layer && Number(t.x || 0) === gridX && Number(t.y || 0) === gridY);
        if (occupied) return;

        const size = Math.max(50, Math.min(3000, Math.round((Number(this.floorDefaultSizePx || 150) || 150) / 50) * 50));
        const tile = {
            id: `floor_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 5)}`,
            layer,
            url: tex.url,
            x: gridX,
            y: gridY,
            w: size,
            h: size,
            rot: 0,
            opacity: 1
        };

        const pos = this.findFreeFloorPosition(layer, tile.x, tile.y, tile.w, tile.h, null);
        tile.x = pos.x;
        tile.y = pos.y;
        tiles.push(tile);
        this.floorTiles = tiles;
        this.renderFloorTiles();
    }

    applyMapEditorState() {
        const editor = this.sessionData?.map_editor || {};
        const floor = editor.floor || {};
        const floorLayer = document.getElementById('floor-layer');
        const floorTilesLayer = document.getElementById('floor-tiles-layer');
        const mapImg = document.getElementById('session-map');
        const assetsLayer = document.getElementById('assets-layer');
        const objectsLayer = document.getElementById('map-objects-layer');
        const grid = document.getElementById('map-grid');

        const floorPreset = String(floor.preset || this.sessionData?.free_category || 'classic_hatching');
        const floorVisible = floor.visible !== false;
        const floorOpacity = Number.isFinite(floor.opacity) ? floor.opacity : 1;
        const assetsVisible = editor.assets_visible !== false;
        const brightness = Number.isFinite(editor.brightness) ? editor.brightness : 1;
        const mapOpacity = Number.isFinite(editor.map_opacity) ? editor.map_opacity : (this.sessionData?.type === 'free' ? 0 : 1);

        if (floorLayer) {
            floorLayer.className = `floor-layer preset-${floorPreset}`;
            floorLayer.style.display = floorVisible ? 'block' : 'none';
            floorLayer.style.opacity = String(Math.max(0, Math.min(1, floorOpacity)));
            floorLayer.style.filter = `brightness(${Math.max(0.4, Math.min(1.6, brightness))})`;
        }

        if (floorTilesLayer) {
            floorTilesLayer.style.display = floorVisible ? 'block' : 'none';
            floorTilesLayer.style.opacity = String(Math.max(0, Math.min(1, floorOpacity)));
            floorTilesLayer.style.filter = `brightness(${Math.max(0.4, Math.min(1.6, brightness))})`;
        }

        if (mapImg) {
            mapImg.style.opacity = String(Math.max(0.3, Math.min(1, mapOpacity)));
            mapImg.style.filter = `brightness(${Math.max(0.4, Math.min(1.6, brightness))})`;
        }

        if (assetsLayer) {
            assetsLayer.style.display = assetsVisible ? 'block' : 'none';
            assetsLayer.style.filter = `brightness(${Math.max(0.4, Math.min(1.6, brightness))})`;
        }

        if (objectsLayer) {
            objectsLayer.style.display = assetsVisible ? 'block' : 'none';
            objectsLayer.style.filter = `brightness(${Math.max(0.4, Math.min(1.6, brightness))})`;
        }

        if (grid) {
            const variant = String(editor.grid_variant || 'square');
            if (variant === 'dots') {
                grid.style.backgroundImage = `radial-gradient(rgba(255,255,255,0.22) 1px, transparent 1px)`;
                grid.style.backgroundSize = `50px 50px`;
            } else {
                grid.style.backgroundImage = `linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)`;
                grid.style.backgroundSize = `50px 50px`;
            }
        }

        if (this.isMaster) {
            const elFloor = document.getElementById('toggle-floor-visible');
            const elAssets = document.getElementById('toggle-assets-visible');
            const elBright = document.getElementById('range-map-brightness');
            const elFloorOp = document.getElementById('range-floor-opacity');
            const elPreset = document.getElementById('select-floor-preset');
            if (elFloor) elFloor.checked = floorVisible;
            if (elAssets) elAssets.checked = assetsVisible;
            if (elBright) elBright.value = String(brightness);
            if (elFloorOp) elFloorOp.value = String(floorOpacity);
            if (elPreset) elPreset.value = floorPreset;
        }
    }

    async updateMapEditorConfig(patch) {
        if (!this.isMaster) return;
        try {
            const current = this.sessionData?.map_editor || {};
            const next = {
                ...current,
                ...patch,
                floor: {
                    ...(current.floor || {}),
                    ...((patch && patch.floor) ? patch.floor : {})
                }
            };
            const sessionRef = doc(db, "sessions", this.sessionId);
            await updateDoc(sessionRef, { map_editor: next });
        } catch (e) {
            console.error(e);
        }
    }

    renderMapAssets() {
        const layer = document.getElementById('assets-layer');
        if (!layer) return;
        layer.innerHTML = '';
        const assets = Array.isArray(this.sessionData?.map_assets) ? this.sessionData.map_assets : [];

        assets.forEach((a) => {
            if (!a || !a.id || !a.url) return;
            const el = document.createElement('div');
            const deleteSelected = this.deleteMode && this.deleteSelection?.assets?.has(a.id);
            el.className = `map-asset${this.selectedAssetId === a.id ? ' selected' : ''}${this.deleteMode ? ' delete-armed' : ''}${deleteSelected ? ' delete-selected' : ''}`;
            el.style.left = `${a.x || 0}px`;
            el.style.top = `${a.y || 0}px`;
            el.style.width = `${a.w || 2}px`;
            el.style.height = `${a.h || 2}px`;
            el.style.opacity = String(Math.max(0, Math.min(1, a.opacity ?? 1)));
            el.style.backgroundImage = `url('${a.url}')`;
            el.dataset.id = a.id;
            if (a.borderColor) el.style.setProperty('--map-item-border-color', String(a.borderColor));

            el.onclick = (e) => {
                e.stopPropagation();
                if (this.isMaster && this.deleteMode) {
                    this.toggleDeleteSelection('asset', a.id);
                    return;
                }
                if (this.isMaster && this.activeMapTool !== 'pointer') return;
                this.selectedAssetId = a.id;
                this.renderMapAssets();
            };

            el.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.deleteMode) return;
                if (this.isMaster && this.activeMapTool !== 'pointer') return;
                if (e.target.closest('button' ) ) return;
                this.selectedAssetId = a.id;
                this.renderMapAssets();
                this.openMapContextMenu({
                    kind: 'asset',
                    id: a.id,
                    canMove: !!this.isMaster || a.type === 'player',
                    canDuplicate: !!this.isMaster,
                    canDelete: !!this.isMaster,
                    canBorderColor: !!this.isMaster
                }, e.clientX, e.clientY);
            };

            if (this.isMaster) {
                const controls = document.createElement('div');
                controls.className = 'map-asset-controls';
                controls.innerHTML = `
                    <button type="button" data-action="move" title="Mover"><i class="fas fa-arrows-alt"></i></button>
                    <button type="button" data-action="delete" title="Remover"><i class="fas fa-trash"></i></button>
                `;
                controls.onclick = (e) => {
                    e.stopPropagation();
                    const btn = e.target.closest('button');
                    if (!btn) return;
                    const act = btn.dataset.action;
                    if (act === 'delete') this.removeMapAsset(a.id);
                    if (act === 'move') this.startMovingAsset(a.id);
                };
                el.appendChild(controls);
            }

            if (this.isMaster && this.activeMapTool === 'pointer' && !this.deleteMode) {
                this.makeMapAssetDraggable(el, a);
            }

            layer.appendChild(el);
        });
    }

    async patchMapAsset(assetId, patch) {
        if (!this.isMaster) return;
        try {
            const sessionRef = doc(db, "sessions", this.sessionId);
            const assets = Array.isArray(this.sessionData?.map_assets) ? [...this.sessionData.map_assets] : [];
            const idx = assets.findIndex(a => a && a.id === assetId);
            if (idx === -1) return;
            assets[idx] = { ...assets[idx], ...patch };
            await updateDoc(sessionRef, { map_assets: assets });
        } catch {}
    }

    async duplicateMapAsset(assetId) {
        if (!this.isMaster) return;
        try {
            const assets = Array.isArray(this.sessionData?.map_assets) ? [...this.sessionData.map_assets] : [];
            const a = assets.find(x => x && x.id === assetId);
            if (!a) return;
            const copy = {
                ...a,
                id: `asset_${Date.now()}`,
                x: (a.x || 0) + 50,
                y: (a.y || 0) + 50
            };
            assets.push(copy);
            const sessionRef = doc(db, "sessions", this.sessionId);
            await updateDoc(sessionRef, { map_assets: assets });
        } catch {}
    }

    startPlacingAsset(url) {
        if (!this.isMaster) return;
        const clean = String(url || '').trim();
        if (!clean) return;
        this.isPlacingAsset = true;
        this.pendingAssetPlacement = { url: clean };
        document.getElementById('targeting-overlay').style.display = 'flex';
        document.getElementById('targeting-text').textContent = `Clique no mapa para posicionar o asset...`;
        document.getElementById('btn-confirm-attack').style.display = 'none';
    }

    startMovingAsset(assetId) {
        if (!this.isMaster) return;
        const assets = Array.isArray(this.sessionData?.map_assets) ? this.sessionData.map_assets : [];
        const a = assets.find(x => x && x.id === assetId);
        if (!a) return;
        this.isMovingToken = false;
        this.tokenToMove = null;
        this.isPlacingToken = false;
        this.pendingTokenPlacement = null;
        this.isPlacingAsset = false;
        this.pendingAssetPlacement = null;
        this.selectedAssetId = assetId;
        this.activeGmTool = null;
        document.querySelectorAll('.gm-tool-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('targeting-overlay').style.display = 'flex';
        document.getElementById('targeting-text').textContent = `Movendo asset. Clique no destino...`;
        document.getElementById('btn-confirm-attack').style.display = 'none';
    }

    async moveAssetTo(x, y) {
        if (!this.isMaster || !this.selectedAssetId) return;
        try {
            const sessionRef = doc(db, "sessions", this.sessionId);
            const assets = Array.isArray(this.sessionData?.map_assets) ? [...this.sessionData.map_assets] : [];
            const idx = assets.findIndex(a => a && a.id === this.selectedAssetId);
            if (idx === -1) return;
            assets[idx] = { ...assets[idx], x, y };
            await updateDoc(sessionRef, { map_assets: assets });
        } catch {}
    }

    async addAssetToMap(url, x, y) {
        if (!this.isMaster) return;
        const sessionRef = doc(db, "sessions", this.sessionId);
        const asset = {
            id: `asset_${Date.now()}`,
            url,
            x,
            y,
            w: 220,
            h: 220,
            opacity: 1
        };
        const assets = Array.isArray(this.sessionData?.map_assets) ? [...this.sessionData.map_assets] : [];
        assets.push(asset);
        try {
            await updateDoc(sessionRef, { map_assets: assets });
        } catch (e) {
            console.error(e);
        }
    }

    async removeMapAsset(assetId) {
        if (!this.isMaster) return;
        try {
            const sessionRef = doc(db, "sessions", this.sessionId);
            const assets = Array.isArray(this.sessionData?.map_assets) ? this.sessionData.map_assets : [];
            const filtered = assets.filter(a => a && a.id !== assetId);
            await updateDoc(sessionRef, { map_assets: filtered });
            if (this.selectedAssetId === assetId) this.selectedAssetId = null;
        } catch {}
    }

    updateExitButton() {
        const btnExit = document.getElementById('btn-exit-session');
        if (!btnExit) return;
        btnExit.innerHTML = `<i class="fas fa-sign-out-alt"></i> ${this.isMaster ? '' : 'Sair'}`;
    }

    async leaveOrEndSession() {
        const sessionRef = doc(db, "sessions", this.sessionId);
        if (this.isMaster) {
            if (!confirm("Deseja encerrar a sessão? Todos serão removidos e voltarão para a tela inicial.")) return;
            try {
                await updateDoc(sessionRef, {
                    status: 'ended',
                    ended_at: serverTimestamp(),
                    ended_by: this.user.uid,
                    players: {},
                    initiatives: {},
                    turn_order: [],
                    combat_active: false,
                    current_turn_index: 0,
                    map_tokens: []
                });
            } catch (err) {
                console.error("Erro ao encerrar sessão:", err);
            }
            window.location.href = 'index.html';
            return;
        }

        if (!confirm("Deseja sair da sessão?")) return;
        try {
            const snap = await getDoc(sessionRef);
            const updates = {
                [`players.${this.user.uid}`]: deleteField(),
                [`initiatives.${this.user.uid}`]: deleteField()
            };

            if (snap.exists()) {
                const data = snap.data();
                const tokens = Array.isArray(data.map_tokens) ? data.map_tokens : [];
                const filteredTokens = tokens.filter(t => t && t.owner_uid !== this.user.uid);
                if (filteredTokens.length !== tokens.length) updates.map_tokens = filteredTokens;
            }

            await updateDoc(sessionRef, updates);
        } catch (err) {
            console.error("Erro ao sair da sessão:", err);
        }
        window.location.href = 'index.html';
    }

    renderFootprints() {
        const grid = document.getElementById('map-grid');
        if (!grid) return;

        // Remove rastros antigos
        const oldFootprints = grid.querySelectorAll('.footprint');
        oldFootprints.forEach(f => f.remove());

        const footprints = this.sessionData.footprints || [];
        footprints.forEach(fp => {
            const el = document.createElement('div');
            el.className = 'footprint';
            el.style.position = 'absolute';
            el.style.left = `${fp.x + 15}px`; // Centraliza um pouco na grid
            el.style.top = `${fp.y + 15}px`;
            el.style.width = '20px';
            el.style.height = '20px';
            el.style.borderRadius = '50%';
            el.style.backgroundColor = fp.color || '#ffd700';
            el.style.boxShadow = `0 0 10px ${fp.color || '#ffd700'}`;
            el.style.opacity = '0.6';
            el.style.pointerEvents = 'none';
            el.style.zIndex = '999999999999';
            grid.appendChild(el);
        });
    }

    handleSFXSync(lastSfx) {
        if (!lastSfx || lastSfx.timestamp < this.sessionStartTime) return;
        if (this.lastProcessedSfx === lastSfx.timestamp) return;
        
        this.lastProcessedSfx = lastSfx.timestamp;
        this.playSfx(lastSfx.type);
    }

    handlePingSync(lastPing) {
        if (!lastPing || !lastPing.timestamp) return;
        if (lastPing.timestamp < this.sessionStartTime) return;
        if (this.lastProcessedPing === lastPing.timestamp) return;

        this.lastProcessedPing = lastPing.timestamp;
        this.spawnPingLocal(lastPing.x, lastPing.y);
    }

    playSfx(type) {
        // Tenta tocar o arquivo local primeiro
        const localPath = `assets/sfx/${type}.mp3`;
        const audio = new Audio(localPath);
        audio.volume = this.localVolume;
        
        audio.play().catch(err => {
            console.warn(`SFX Local não encontrado para ${type}, tentando fallback...`);
            // Se falhar (ex: arquivo não existe), tenta o fallback da biblioteca
            const fallbackUrl = this.sfxLibrary[type];
            if (fallbackUrl) {
                const fallbackAudio = new Audio(fallbackUrl);
                fallbackAudio.volume = this.localVolume;
                fallbackAudio.play().catch(e => console.error("Erro ao tocar SFX Fallback:", e));
            }
        });
    }

    async triggerSFX(type) {
        if (!this.isMaster) return;
        try {
            await updateDoc(doc(db, "sessions", this.sessionId), {
                last_sfx: {
                    type: type,
                    timestamp: Date.now()
                }
            });
        } catch (error) {
            console.error("Erro ao disparar SFX:", error);
        }
    }

    handleDiceSync(oldRoll) {
        const newRoll = this.sessionData.last_roll;
        // Se não tem roll, ou se o roll é o mesmo de antes, ou se o roll foi feito ANTES da página carregar (F5), ignora
        if (!newRoll || (oldRoll && newRoll.timestamp === oldRoll.timestamp) || newRoll.timestamp < this.sessionStartTime) return;

        const overlay = document.getElementById('dice-roll-overlay');
        const nameEl = document.getElementById('dice-roller-name');
        const resultEl = document.getElementById('dice-result-large');
        const typeEl = document.getElementById('dice-type-label');
        const iconEl = document.getElementById('dice-icon-large');
        const visualEl = document.querySelector('.dice-roll-visual');

        if (!overlay || !nameEl || !resultEl || !typeEl || !iconEl || !visualEl) return;

        // Prepara dados
        nameEl.textContent = newRoll.user_name || "Alguém";
        resultEl.textContent = newRoll.result;
        resultEl.classList.remove('revealed'); // Esconde o resultado
        typeEl.textContent = `Rolou um D${newRoll.sides}`;
        
        // Ícone e Cor
        iconEl.className = `fas dice-icon-large ${newRoll.sides === 20 ? 'fa-dice-d20' : 'fa-dice-d6'}`;
        const colors = { 4: '#ff4444', 6: '#44ff44', 8: '#4444ff', 10: '#ff44ff', 12: '#ffff44', 20: '#ffd700' };
        iconEl.style.color = colors[newRoll.sides] || '#fff';

        // Mostra overlay e inicia animação
        overlay.style.display = 'flex';
        visualEl.classList.add('rolling');
        this.playSfx('dice');

        // Revela resultado após 800ms
        setTimeout(() => {
            resultEl.classList.add('revealed');
            // Mantém um pequeno brilho ou efeito ao revelar se quiser
        }, 800);
        
        // Esconder tudo após 4 segundos
        setTimeout(() => {
            overlay.style.display = 'none';
            visualEl.classList.remove('rolling');
        }, 4000);
    }

    async loadPlayerSheet(preferredId = null) {
        try {
            const sheetsRef = collection(db, "sheets");
            let sheetDoc = null;

            // 1. Tenta carregar pelo ID preferido (vido da sessão/lobby)
            if (preferredId) {
                console.log("Tentando carregar ficha específica da sessão:", preferredId);
                const docRef = doc(db, "sheets", preferredId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    sheetDoc = docSnap;
                }
            }

            // 2. Se não conseguiu ou não tinha preferido, busca a primeira ficha do usuário
            if (!sheetDoc) {
                console.log("Buscando qualquer ficha para o usuário:", this.user.uid);
                // IMPORTANTE: O campo correto é 'user_id' e não 'owner_id'
                const q = query(sheetsRef, where("user_id", "==", this.user.uid), limit(1));
                const querySnapshot = await getDocs(q);
                
                if (!querySnapshot.empty) {
                    sheetDoc = querySnapshot.docs[0];
                }
            }

            if (sheetDoc) {
                this.playerSheet = sheetDoc.data();
                this.playerSheetId = sheetDoc.id;
                console.log("Ficha do jogador vinculada:", this.playerSheet.name, "ID:", this.playerSheetId);
                
                // Preenche o painel de status rápido
                this.fillQuickStats(this.playerSheet);

                // Força a renderização inicial das habilidades
                this.renderPlayerAbilities();
            } else {
                console.warn("Nenhuma ficha encontrada para este usuário no Firestore.");
            }
        } catch (error) {
            console.error("Erro ao carregar ficha do jogador:", error);
        }
    }

    fillQuickStats(sheet) {
        const d = sheet.data || {};
        const hpCurrent = document.getElementById('quick-hp-current');
        const hpMax = document.getElementById('quick-hp-max');
        const ac = document.getElementById('quick-ac');
        const attrStr = document.getElementById('quick-str');
        const attrDex = document.getElementById('quick-dex');
        const attrCon = document.getElementById('quick-con');
        const attrInt = document.getElementById('quick-int');
        const attrWis = document.getElementById('quick-wis');
        const attrCha = document.getElementById('quick-cha');

        if (hpCurrent) hpCurrent.value = d.hpCurrent || 0;
        if (hpMax) hpMax.value = d.hpMax || 0;
        if (ac) ac.value = d.ac || 10;
        
        if (d.trailColor) {
            const trailInput = document.getElementById('quick-trail-color');
            if (trailInput) trailInput.value = d.trailColor;
            this.playerTrailColor = d.trailColor;
        }
        
        const attrs = d.attributes || {};
        if (attrStr) attrStr.value = attrs.str || 10;
        if (attrDex) attrDex.value = attrs.dex || 10;
        if (attrCon) attrCon.value = attrs.con || 10;
        if (attrInt) attrInt.value = attrs.int || 10;
        if (attrWis) attrWis.value = attrs.wis || 10;
        if (attrCha) attrCha.value = attrs.cha || 10;
    }

    async saveQuickStats() {
        if (!this.playerSheetId) return;
        
        const trailColor = document.getElementById('quick-trail-color').value;
        this.playerTrailColor = trailColor;

        const data = {
            'data.hpCurrent': parseInt(document.getElementById('quick-hp-current').value),
            'data.hpMax': parseInt(document.getElementById('quick-hp-max').value),
            'data.ac': parseInt(document.getElementById('quick-ac').value),
            'data.attributes.str': parseInt(document.getElementById('quick-str').value),
            'data.attributes.dex': parseInt(document.getElementById('quick-dex').value),
            'data.attributes.con': parseInt(document.getElementById('quick-con').value),
            'data.attributes.int': parseInt(document.getElementById('quick-int').value),
            'data.attributes.wis': parseInt(document.getElementById('quick-wis').value),
            'data.attributes.cha': parseInt(document.getElementById('quick-cha').value),
            'data.trailColor': trailColor,
            updated_at: serverTimestamp()
        };

        try {
            await updateDoc(doc(db, "sheets", this.playerSheetId), data);
            alert("Status rápido atualizado!");
        } catch (error) {
            console.error("Erro ao salvar status rápido:", error);
        }
    }

    renderPlayerAbilities() {
        const container = document.getElementById('player-abilities-list');
        if (!container || !this.playerSheet?.data?.abilities) return;

        container.innerHTML = '';
        this.playerSheet.data.abilities.forEach((ability, index) => {
            const card = document.createElement('div');
            card.className = `ability-card ${ability.color} ${this.selectedAbility?.index === index ? 'selected' : ''}`;
            card.innerHTML = `
                <div class="ability-card-img" style="background-image: url('${ability.image || 'assets/default-ability.png'}')"></div>
                <div class="ability-card-info">
                    <div class="ability-card-title">${ability.title}</div>
                    <div class="ability-card-desc">${ability.desc}</div>
                </div>
            `;
            card.onclick = () => this.selectAbility(ability, index);
            container.appendChild(card);
        });
    }

    async syncPlayerSheets() {
        if (!this.sessionData.players) return;
        
        const sheetIds = Object.values(this.sessionData.players)
            .map(p => p.sheet_id)
            .filter(id => id && id !== this.playerSheetId); // Pega IDs de outros jogadores
            
        if (sheetIds.length === 0) {
            this.otherPlayerSheets = [];
            return;
        }

        try {
            const sheetsRef = collection(db, "sheets");
            // Divide em lotes de 10 se necessário (aqui é max 4 então ok)
            const q = query(sheetsRef, where("__name__", "in", sheetIds));
            const snapshot = await getDocs(q);
            
            this.otherPlayerSheets = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error("Erro ao sincronizar fichas de outros jogadores:", error);
        }
    }

    renderPlayerCards() {
        const container = document.getElementById('player-cards-list');
        if (!container) return;

        container.innerHTML = '';
        
        // Combina minha ficha com as outras
        const allSheets = [];
        if (this.playerSheet) allSheets.push({ id: this.playerSheetId, ...this.playerSheet });
        if (this.otherPlayerSheets) allSheets.push(...this.otherPlayerSheets);

        allSheets.forEach(sheet => {
            const d = sheet.data || {};
            const hpCurrent = parseInt(d.hpCurrent) || 0;
            const hpMax = parseInt(d.hpMax) || 10;
            const hpPercent = Math.max(0, Math.min(100, (hpCurrent / hpMax) * 100));
            
            // Cor da barra: Verde (>50), Amarelo (>20), Vermelho (<=20)
            let healthColor = '#2ecc71';
            if (hpPercent <= 20) healthColor = '#e74c3c';
            else if (hpPercent <= 50) healthColor = '#f1c40f';

            const isDead = hpCurrent <= 0;

            const card = document.createElement('div');
            card.className = `player-card-sidebar ${isDead ? 'dead' : ''}`;
            card.dataset.sheetId = sheet.id;
            card.draggable = true;

            card.innerHTML = `
                <div class="player-card-header">
                    <div class="player-card-avatar" style="background-image: url('${d.image || 'assets/default-avatar.png'}')"></div>
                    <div class="player-card-name">${sheet.name || 'Herói'}</div>
                </div>
                <div class="health-bar-container">
                    <div class="health-bar-fill" style="width: ${hpPercent}%; background: ${healthColor};"></div>
                </div>
                <div style="font-size: 0.7rem; text-align: right; color: #aaa;">${hpCurrent} / ${hpMax} HP</div>
            `;

            // Drag event para colocar no mapa
            card.addEventListener('dragstart', (e) => {
                const payload = JSON.stringify({
                    type: 'player',
                    data: {
                        id: sheet.id,
                        name: sheet.name,
                        image_url: d.image || 'assets/default-avatar.png',
                        hp: hpCurrent,
                        hpMax: hpMax,
                        atk: d.attributes?.str || 10,
                        def: d.ac || 10,
                        level: d.classLevel ? parseInt(d.classLevel.match(/\d+/)) || 1 : 1
                    }
                });
                e.dataTransfer.setData('application/json', payload);
                e.dataTransfer.setData('text/plain', payload);
            });

            container.appendChild(card);
        });
    }

    selectAbility(ability, index) {
        if (!this.isMaster && this.sessionData.permissions?.allow_abilities === false) {
            console.warn("Uso de habilidades bloqueado pelo Mestre.");
            return;
        }

        if (this.selectedAbility?.index === index) {
            this.cancelTargeting();
        } else {
            // Selecionar
            this.selectedAbility = { ...ability, index };
            this.isTargeting = true;
            this.currentTarget = null;
            
            // UI Update
            document.getElementById('targeting-overlay').style.display = 'flex';
            document.getElementById('targeting-text').textContent = `Usando ${ability.title}. Selecione um alvo...`;
            document.getElementById('btn-confirm-attack').style.display = 'none';
            
            // Recolhe sidebar inferior para liberar o mapa
            const sidebarBottom = document.getElementById('sidebar-bottom');
            if (sidebarBottom && !sidebarBottom.classList.contains('collapsed')) {
                sidebarBottom.classList.add('collapsed');
                const icon = document.querySelector('#toggle-abilities .fa-chevron-up, #toggle-abilities .fa-chevron-down');
                if (icon) {
                    icon.classList.remove('fa-chevron-up');
                    icon.classList.add('fa-chevron-down');
                }
            }
        }
        this.renderPlayerAbilities();
    }

    cancelTargeting() {
        this.selectedAbility = null;
        this.currentTarget = null;
        this.isTargeting = false;
        this.isMovingToken = false;
        this.tokenToMove = null;
        this.isPlacingToken = false;
        this.pendingTokenPlacement = null;
        this.isPlacingAsset = false;
        this.pendingAssetPlacement = null;
        this.isPlacingMapObject = false;
        this.pendingMapObjectPlacement = null;
        this.isMovingMapObject = false;
        this.movingMapObjectId = null;
        document.getElementById('targeting-overlay').style.display = 'none';
        this.renderPlayerAbilities();
        this.renderTokens(); // Limpa borders de target e moving
    }

 async handleTokenClick(token) {
    if (this.selectedTokenId === token.id) {
        this.selectedTokenId = null;
    } else {
        this.selectedTokenId = token.id;
    }

    this.renderTokens();
    this.renderGmTokenPanel();

    if (!this.isMaster) {
        this.openTokenDetails(token);
    }
}
    

    startMovingToken(tokenId) {
        if (!this.isMaster && this.sessionData.permissions?.allow_tokens === false) {
            console.warn("Movimento de tokens bloqueado pelo Mestre.");
            return;
        }

        const token = this.tokens.find(t => t.id === tokenId);
        if (!token) return;

        const isOwner = token.type === 'player' && token.sheet_id === this.playerSheetId;
        if (!this.isMaster && !isOwner) {
            console.warn("Você não pode mover este token.");
            return;
        }
        if (!this.isMaster && token.type !== 'player') {
            console.warn("Você não pode mover este token.");
            return;
        }

        this.isMovingToken = true;
        this.tokenToMove = token;
        
        document.getElementById('targeting-overlay').style.display = 'flex';
        document.getElementById('targeting-text').textContent = `Movendo ${token.name}. Clique no destino vazio ou em um aliado/inimigo...`;
        document.getElementById('btn-confirm-attack').style.display = 'none';
        
        // Adiciona classe visual ao token sendo movido
        this.renderTokens();
    }

    async moveTokenTo(x, y) {
        if (!this.tokenToMove) return;
        if (!this.isMaster && this.sessionData.permissions?.allow_tokens === false) return;

        const tokens = [...this.tokens];
        const index = tokens.findIndex(t => t.id === this.tokenToMove.id);
        if (index === -1) return;
        const token = tokens[index];

        const isOwner = token.type === 'player' && token.sheet_id === this.playerSheetId;
        if (!this.isMaster && !isOwner) return;
        if (!this.isMaster && token.type !== 'player') return;

        const oldX = tokens[index].x;
        const oldY = tokens[index].y;
        
        // Se a posição for a mesma, apenas cancela
        if (oldX === x && oldY === y) {
            this.isMovingToken = false;
            this.tokenToMove = null;
            document.getElementById('targeting-overlay').style.display = 'none';
            this.renderTokens();
            return;
        }

        // Atualiza posição
        const dx = x - oldX;
        const dy = y - oldY;
        tokens[index].x = x;
        tokens[index].y = y;
        if (token.type === 'player' && (dx !== 0 || dy !== 0)) {
            tokens[index].vision_angle = Math.atan2(dy, dx);
        }

        // Sistema de Rastro que faz linha entre os pontos (Footprints)
        const footprint = {
            x: oldX,
            y: oldY,
            color: this.playerTrailColor,
            timestamp: Date.now()
        };
        
        try {
            const sessionRef = doc(db, "sessions", this.sessionId);
            await updateDoc(sessionRef, {
                footprints: arrayUnion(footprint),
                map_tokens: tokens
            });
            console.log("Movimento e rastro registrados!");
        } catch (error) {
            console.error("Erro ao salvar movimento:", error);
        }

        this.isMovingToken = false;
        this.tokenToMove = null;
        document.getElementById('targeting-overlay').style.display = 'none';
        this.renderTokens();
    }

    selectTarget(token) {
        this.currentTarget = token;
        
        // UI Update
        document.getElementById('targeting-text').textContent = `Alvo: ${token.name}`;
        document.getElementById('btn-confirm-attack').style.display = 'inline-block';
        
        // Re-render tokens para mostrar o border no alvo
        this.renderTokens();
    }

    executeAttack(targetToken) {
        const ability = this.selectedAbility;
        const msg = `Atacou **${targetToken.name}** com **${ability.title}**!`;
        this.sendChatMessage(msg, 'public');

        // Dispara animação de impacto localmente e sincroniza se possível
        this.playHitAnimation(targetToken.id, ability.color);

        this.cancelTargeting();
    }

    playHitAnimation(tokenId, colorType) {
        const el = document.querySelector(`.token[data-id="${tokenId}"]`);
        if (!el) return;

        // Mapeia cor da habilidade para cor hexadecimal
        const colors = {
            'spell': '#3498db',
            'skill': '#2ecc71',
            'trap': '#e74c3c',
            'default': '#ffd700'
        };
        const hitColor = colors[colorType] || colors.default;

        el.style.setProperty('--hit-color', hitColor);
        el.classList.add('hit-animation');

        setTimeout(() => {
            el.classList.remove('hit-animation');
        }, 5000);
    }

    openTokenDetails(token) {
        // const modal = document.getElementById('token-details-modal');
        const title = document.getElementById('token-modal-title');
        const img = document.getElementById('token-modal-img');
        const hpCurrent = document.getElementById('token-hp-current');
        const hpMax = document.getElementById('token-hp-max');
        const ac = document.getElementById('token-ac');
        const atk = document.getElementById('token-atk');
        const def = document.getElementById('token-def');
        const saveBtn = document.getElementById('btn-save-token-stats');

        title.textContent = `Ficha de ${token.name}`;
        img.src = token.image_url || 'assets/inimigos/Aranha.png';
        hpCurrent.value = token.hp || 0;
        hpMax.value = token.hpMax || 0;
        ac.value = token.def || 10; // Usando def como AC para simplificar se necessário
        
        if (this.isMaster) {
            atk.value = token.atk || 0;
            def.value = token.def || 0;
            hpCurrent.disabled = false;
            hpMax.disabled = false;
            ac.disabled = false;
            atk.disabled = false;
            def.disabled = false;
            saveBtn.style.display = 'block';
            saveBtn.onclick = () => this.saveTokenStats(token.id);
        } else {
            hpCurrent.disabled = true;
            hpMax.disabled = true;
            ac.disabled = true;
            atk.disabled = true;
            def.disabled = true;
            saveBtn.style.display = 'none';
            moveBtn.style.display = 'none';
            moveBtn.disabled = true;
        }

        modal.style.display = 'flex';
    }

    async saveTokenStats(tokenId) {
        const hpCurrent = parseInt(document.getElementById('token-hp-current').value);
        const hpMax = parseInt(document.getElementById('token-hp-max').value);
        const ac = parseInt(document.getElementById('token-ac').value);
        const atk = parseInt(document.getElementById('token-atk').value);
        const def = parseInt(document.getElementById('token-def').value);

        const tokens = [...this.tokens];
        const index = tokens.findIndex(t => t.id === tokenId);
        if (index === -1) return;

        const oldHp = tokens[index].hp;
        tokens[index].hp = hpCurrent;
        tokens[index].hpMax = hpMax;
        tokens[index].def = ac; // No modal ac é def
        tokens[index].atk = atk;
        tokens[index].isDead = hpCurrent <= 0;

        try {
            const sessionRef = doc(db, "sessions", this.sessionId);
            await updateDoc(sessionRef, { map_tokens: tokens });
            document.getElementById('token-details-modal').style.display = 'none';
            
            // Se o HP diminuiu, dispara animação de tremor
            if (hpCurrent < oldHp) {
                this.playHitAnimation(tokenId, 'trap'); // Vermelho para dano
            }

            console.log("Token atualizado!");
        } catch (error) {
            console.error("Erro ao salvar token:", error);
        }
    }

    // Método loadTokens removido pois agora usamos map_tokens no documento principal

    updateUI() {
        // Remove referências antigas a display-session-name
        
        // Adiciona classe de role ao body para controle de CSS
        if (this.isMaster) {
            document.body.classList.add('is-master');
            document.body.classList.remove('is-player');
        } else {
            document.body.classList.add('is-player');
            document.body.classList.remove('is-master');
        }

        // Atualiza Botões de Combate
        const btnStart = document.getElementById('btn-start-combat');
        const btnNext = document.getElementById('btn-next-turn');
        const btnEnd = document.getElementById('btn-end-combat');
        const btnInitiative = document.getElementById('btn-roll-initiative');
        const btnRollEnemies = document.getElementById('btn-roll-enemies');

        if (this.combatActive) {
            if (btnStart) btnStart.style.display = 'none';
            if (btnNext) btnNext.style.display = 'inline-flex';
            if (btnEnd) btnEnd.style.display = 'inline-flex';
            if (btnInitiative) btnInitiative.style.display = this.hasRolledInitiative ? 'none' : 'inline-flex';
            
            // Botão de inimigos só para o mestre e se ele ainda não rolou
            if (this.isMaster && btnRollEnemies) {
                const hasEnemiesInInitiative = Object.values(this.sessionData.initiatives || {}).some(init => init.type === 'enemy');
                btnRollEnemies.style.display = hasEnemiesInInitiative ? 'none' : 'inline-flex';
            }
            
            if (this.isMaster && this.turnOrder.length === 0) {
                if (btnNext) {
                    btnNext.innerHTML = '<i class="fas fa-sort-amount-down"></i> DEFINIR ORDEM';
                    btnNext.onclick = () => this.organizeTurnOrder();
                }
            } else if (this.isMaster) {
                if (btnNext) {
                    btnNext.innerHTML = '<i class="fas fa-step-forward"></i> PRÓXIMO TURNO';
                    btnNext.onclick = () => this.nextTurn();
                }
            }
        } else {
            if (btnStart) btnStart.style.display = 'inline-flex';
            if (btnNext) btnNext.style.display = 'none';
            if (btnEnd) btnEnd.style.display = 'none';
            if (btnInitiative) btnInitiative.style.display = 'none';
        }

        // Atualiza Contador de Abates
        const killCounter = document.getElementById('kill-count-value');
        if (killCounter) {
            killCounter.textContent = this.sessionData.kill_count || 0;
        }

        const mapImg = document.getElementById('session-map');
        if (this.sessionData.map_url) {
            mapImg.src = this.sessionData.map_url;
        }

        // Sidebars: jogador usa esquerda/direita; mestre usa apenas a direita (toolbar/modais)
        const sidebarLeft = document.getElementById('sidebar-left');
        const sidebarRight = document.getElementById('sidebar-right');
        
        if (this.isMaster) {
            if (sidebarLeft) sidebarLeft.style.display = 'none';
            if (sidebarRight) sidebarRight.style.display = 'flex';
        } else {
            if (sidebarLeft) sidebarLeft.style.display = 'flex';
            if (sidebarRight) sidebarRight.style.display = 'flex';
            sidebarLeft?.classList.remove('collapsed');
        }
        
        this.renderPlayersHud();

        if (this.isMaster) {
            console.log("Usuário é Mestre, carregando ferramentas...");
            // this.loadBestiary();
            this.loadMasterKit();
            this.renderNpcList();
        } else {
            console.log("Usuário é Jogador, carregando dados...");
        }

        // Renderiza cards dos aventureiros
        this.renderPlayerCards();

        // Esconde overlay de carregamento
        document.getElementById('session-loading-overlay').style.display = 'none';
    }

    renderPlayersHud() {
        const hudContainer = document.getElementById('players-hud');
        if (!hudContainer) return;

        const players = Object.values(this.sessionData.players || {});
        if (players.length === 0) {
            hudContainer.innerHTML = '<span style="color: #888; font-size: 0.8rem;">Nenhum jogador</span>';
            return;
        }

        // Combina minha ficha com as outras
        const allSheets = [];
        if (this.playerSheet) allSheets.push({ id: this.playerSheetId, ...this.playerSheet });
        if (this.otherPlayerSheets) allSheets.push(...this.otherPlayerSheets);

        hudContainer.innerHTML = players.map(p => {
            let hp = 10;
            let hpMax = 10;
            
            // Tenta achar a ficha nos sheets carregados
            const sheet = allSheets.find(s => s.id === p.sheet_id);
            if (sheet && sheet.data) {
                hp = parseInt(sheet.data.hpCurrent) || 0;
                hpMax = parseInt(sheet.data.hpMax) || 10;
            }

            // Se o token estiver no mapa, a vida do token sobrescreve
            const token = (this.sessionData.map_tokens || []).find(t => t.type === 'player' && t.owner_uid === p.uid);
            if (token && typeof token.hp !== 'undefined') {
                hp = token.hp;
                hpMax = token.hpMax || hpMax;
            }

            const hpPercent = Math.max(0, Math.min(100, (hp / hpMax) * 100));
            
            // Cor da barra baseada na porcentagem
            let barColor = '#2ecc71'; // Verde
            if (hpPercent <= 20) barColor = '#e74c3c'; // Vermelho
            else if (hpPercent <= 50) barColor = '#f1c40f'; // Amarelo

            return `
                <div class="hud-player-card">
                    <img src="${p.photo || 'assets/default-avatar.png'}" class="hud-avatar" onerror="this.src='assets/default-avatar.png'">
                    <div class="hud-info">
                        <span class="hud-name" title="${p.name}">${p.name} <span style="font-size: 0.7rem; color: #aaa;">(${hp}/${hpMax})</span></span>
                        <div class="hud-hp-bar-bg">
                            <div class="hud-hp-bar-fill" style="width: ${hpPercent}%; background: ${barColor};"></div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    loadBestiary(filterTerm = '', listOverride = null) {
        const list = listOverride || document.getElementById('bestiary-list');
        if (!list) return;

        const term = filterTerm.toLowerCase();
        const filtered = this.allEnemies.filter(e => 
            e.name.toLowerCase().includes(term) || (e.type && e.type.toLowerCase().includes(term))
        );
        
        list.innerHTML = filtered.map(enemy => `
            <div class="enemy-drag-card" draggable="true" data-enemy-id="${enemy.id}">
                <img src="${enemy.image_url || 'assets/inimigos/Aranha.png'}" onerror="this.onerror=null; this.src='assets/inimigos/Aranha.png'">
                <div class="enemy-info">
                    <strong>${enemy.name}</strong>
                    <span>Nível ${enemy.level || 1}</span>
                </div>
            </div>
        `).join('');

        // Drag events - Usando event listener padrão para garantir funcionamento
        list.querySelectorAll('.enemy-drag-card').forEach(card => {
            card.addEventListener('dragstart', (e) => {
                const enemyId = card.dataset.enemyId;
                const enemy = this.allEnemies.find(en => en.id === enemyId);
                console.log("Iniciando drag de:", enemy.name);
                const payload = JSON.stringify({
                    type: 'enemy',
                    data: enemy
                });
                e.dataTransfer.setData('application/json', payload);
                e.dataTransfer.setData('text/plain', payload);
                e.dataTransfer.effectAllowed = 'move';
            });
        });

        if (this.isMaster && list.id === 'gm-bestiary-list') {
            const btnSpawn = document.getElementById('gm-btn-spawn-enemy');
            list.querySelectorAll('.enemy-drag-card').forEach(card => {
                const enemyId = card.dataset.enemyId;
                card.addEventListener('click', () => {
                    if (this.gmSelectedEnemyId === enemyId) {
                        this.gmSelectedEnemyId = null;
                        this.gmSelectedEnemy = null;
                        list.querySelectorAll('.enemy-drag-card').forEach(c => c.classList.remove('selected'));
                        if (btnSpawn) {
                            btnSpawn.disabled = true;
                            btnSpawn.textContent = 'SELECIONE UM INIMIGO';
                        }
                        return;
                    }

                    const enemy = this.allEnemies.find(en => en.id === enemyId);
                    this.gmSelectedEnemyId = enemyId;
                    this.gmSelectedEnemy = enemy || null;
                    list.querySelectorAll('.enemy-drag-card').forEach(c => c.classList.toggle('selected', c.dataset.enemyId === enemyId));
                    if (btnSpawn) {
                        btnSpawn.disabled = !this.gmSelectedEnemy;
                        btnSpawn.textContent = this.gmSelectedEnemy ? `COLOCAR ${this.gmSelectedEnemy.name.toUpperCase()} EM CAMPO` : 'SELECIONE UM INIMIGO';
                    }
                });
            });
        }
    }

    loadMasterKit() {
        const musicList = document.getElementById('music-list');
        if (musicList) musicList.innerHTML = '';

        // Controle de Volume Local
        let volumeControl = document.getElementById('local-volume-control');
        if (!volumeControl) {
            const soundsPanel = document.getElementById('kit-sounds');
            const volumeDiv = document.createElement('div');
            volumeDiv.className = 'volume-control-wrapper';
            volumeDiv.innerHTML = `
                <label><i class="fas fa-volume-down"></i> Volume Local</label>
                <input type="range" id="local-volume-control" min="0" max="1" step="0.05" value="${this.localVolume}">
            `;
            soundsPanel.appendChild(volumeDiv);
            
            volumeControl = volumeDiv.querySelector('input');
            volumeControl.oninput = (e) => {
                this.localVolume = parseFloat(e.target.value);
            };
        }

        const characterSearch = document.getElementById('kit-character-search');
        if (characterSearch) {
            characterSearch.oninput = (e) => this.renderCharacterAssets(e.target.value);
        }

        const gridCharacters = document.getElementById('kit-characters-grid');
        const sizeRange = document.getElementById('kit-character-size');
        const sizeValue = document.getElementById('kit-character-size-value');
        const applySize = (raw) => {
            const v = Math.max(160, Math.min(320, Number(raw) || 220));
            const thumb = Math.max(34, Math.min(78, Math.round(v * 0.22)));
            if (gridCharacters) {
                gridCharacters.style.setProperty('--kit-char-card-min', `${v}px`);
                gridCharacters.style.setProperty('--kit-char-thumb', `${thumb}px`);
            }
            if (sizeValue) sizeValue.textContent = String(v);
            if (sizeRange) sizeRange.value = String(v);
            try { localStorage.setItem('kit_character_card_min', String(v)); } catch {}
        };

        let saved = null;
        try { saved = localStorage.getItem('kit_character_card_min'); } catch {}
        applySize(saved || sizeRange?.value || 220);

        if (sizeRange) {
            sizeRange.oninput = (e) => applySize(e.target.value);
        }
        this.renderCharacterAssets(String(characterSearch?.value || ''));
        this.renderGmTokenPanel();
    }

    setupEventListeners() {
        if (this._listenersBound?.eventListeners) return;
        this._listenersBound.eventListeners = true;
        initClickSound();

        // Botões de Combate
        const btnStart = document.getElementById('btn-start-combat');
        const btnEnd = document.getElementById('btn-end-combat');
        const btnInitiative = document.getElementById('btn-roll-initiative');
        const btnRollEnemies = document.getElementById('btn-roll-enemies');

        if (btnStart) btnStart.onclick = () => this.startCombat();
        if (btnEnd) btnEnd.onclick = () => this.endCombat();
        if (btnInitiative) btnInitiative.onclick = () => this.rollInitiative();
        if (btnRollEnemies) btnRollEnemies.onclick = () => this.rollEnemiesInitiative();

        // Voltar play.html
        const btnReturnLobby = document.getElementById('btn-return-lobby');
        if (btnReturnLobby) {
            btnReturnLobby.onclick = () => {
                // const type = this.sessionData?.type || 'guild';
                window.location.href = 'play.html'
            };
        }

        const btnOpenRules = document.getElementById('btn-open-rules');
        const rulesModal = document.getElementById('rules-modal');
        const btnCloseRules = document.getElementById('btn-close-rules');
        if (btnOpenRules && rulesModal) {
            btnOpenRules.onclick = (e) => {
                e.stopPropagation();
                rulesModal.style.display = 'flex';
                this.initRulesManual();
                const input = document.getElementById('rules-search');
                if (input) input.focus();
            };
            rulesModal.onclick = (e) => {
                if (e.target === rulesModal) rulesModal.style.display = 'none';
            };
        }
        if (btnCloseRules && rulesModal) {
            btnCloseRules.onclick = (e) => {
                e.stopPropagation();
                rulesModal.style.display = 'none';
            };
        }
        const rulesSearch = document.getElementById('rules-search');
        if (rulesSearch) {
            rulesSearch.oninput = (e) => {
                this.initRulesManual();
                this.searchRules(String(e.target.value || ''));
            };
        }
        const rulesClear = document.getElementById('rules-clear-search');
        if (rulesClear) {
            rulesClear.onclick = () => {
                if (rulesSearch) rulesSearch.value = '';
                this.initRulesManual();
                this.searchRules('');
            };
        }

        // Header Toggle
        const header = document.getElementById('main-header');
        const arrow = document.querySelector('.header-toggle-arrow');
        if (arrow && header) {
            arrow.onclick = () => {
                header.classList.toggle('collapsed');
                const icon = arrow.querySelector('i');
                if (icon) {
                    icon.classList.toggle('fa-chevron-up');
                    icon.classList.toggle('fa-chevron-down');
                }
            };

            // Recolher automaticamente após 2 segundos da carga inicial
            setTimeout(() => {
                if (!header.classList.contains('collapsed')) {
                    header.classList.add('collapsed');
                    const icon = arrow.querySelector('i');
                    if (icon) {
                        icon.classList.remove('fa-chevron-up');
                        icon.classList.add('fa-chevron-down');
                    }
                }
            }, 2000);
        }

        // Toggle Sidebars
        const btnBestiary = document.getElementById('toggle-bestiary');
        const btnMasterKit = document.getElementById('toggle-master-kit');
        const sidebarLeft = document.getElementById('sidebar-left');
        const sidebarRight = document.getElementById('sidebar-right');

        if (btnBestiary && sidebarLeft) {
            btnBestiary.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                sidebarLeft.classList.toggle('collapsed');
            });
        }

        if (btnMasterKit && sidebarRight) {
            btnMasterKit.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                sidebarRight.classList.toggle('collapsed');
                this.updateRightOverlayWidth();
            });
        }

        if (sidebarRight) {
            sidebarRight.addEventListener('transitionend', () => this.updateRightOverlayWidth());
        }

        this.updateRightOverlayWidth();
        this.setupMapContextMenu();
        this.setupFloorToolUi();

        const objectsSearch = document.getElementById('objects-search');
        if (objectsSearch) {
            objectsSearch.oninput = (e) => {
                this.renderObjectBook(String(e.target.value || ''));
            };
        }

        // Toggle Sidebar Inferior (Habilidades)
        const btnAbilities = document.getElementById('toggle-abilities');
        const sidebarBottom = document.getElementById('sidebar-bottom');
        if (btnAbilities && sidebarBottom) {
            btnAbilities.onclick = (e) => {
                // Se clicar no botão de abrir ficha, não colapsa a sidebar
                if (e.target.closest('#btn-open-full-sheet')) return;
                
                sidebarBottom.classList.toggle('collapsed');
                const icon = btnAbilities.querySelector('.fa-chevron-up, .fa-chevron-down');
                if (icon) {
                    icon.classList.toggle('fa-chevron-up');
                    icon.classList.toggle('fa-chevron-down');
                }
            };
        }

        // Abrir Ficha Completa
        const btnOpenSheet = document.getElementById('btn-open-full-sheet');
        const sheetModal = document.getElementById('sheet-modal');
        if (btnOpenSheet && sheetModal) {
            btnOpenSheet.onclick = () => {
                if (!this.isMaster && this.sessionData.permissions?.allow_sheets === false) {
                    console.warn("Acesso à ficha bloqueado pelo Mestre.");
                    return;
                }
                
                if (this.playerSheetId) {
                    const iframe = document.getElementById('sheet-iframe');
                    // Passa o parâmetro view=iframe para a ficha saber que está em um modal
                    iframe.src = `ficha-dnd.html?id=${this.playerSheetId}&view=iframe`;
                    sheetModal.style.display = 'flex';
                } else {
                    alert("Sua ficha ainda não foi carregada ou não existe.");
                }
            };

            // Fechar modal ao clicar fora do conteúdo
            sheetModal.onclick = (e) => {
                if (e.target === sheetModal) {
                    sheetModal.style.display = 'none';
                    const iframe = document.getElementById('sheet-iframe');
                    if (iframe) iframe.src = ''; // Limpa para economizar recursos
                }
            };
        }

        // Dados
        document.querySelectorAll('.btn-roll-dice').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const box = btn.closest('.dice-box');
                const sides = parseInt(box.dataset.dice);
                
                // Adiciona animação
                box.classList.add('rolling');
                
                // Simula tempo de rolagem antes de enviar
                setTimeout(() => {
                    box.classList.remove('rolling');
                    this.rollDice(sides);
                }, 600);
            };
        });

        // Salvar Status Rápido
        const btnSaveQuick = document.getElementById('btn-save-quick-stats');
        if (btnSaveQuick) {
            btnSaveQuick.onclick = () => this.saveQuickStats();
        }

        // Cancelar Targeting
        const btnCancelTarget = document.getElementById('btn-cancel-targeting');
        if (btnCancelTarget) {
            btnCancelTarget.onclick = () => this.cancelTargeting();
        }

        // Confirmar Ataque
        const btnConfirmAttack = document.getElementById('btn-confirm-attack');
        if (btnConfirmAttack) {
            btnConfirmAttack.onclick = () => {
                if (this.selectedAbility && this.currentTarget) {
                    this.executeAttack(this.currentTarget);
                }
            };
        }

        // Abrir Chat Grande
        const btnOpenLargeChat = document.getElementById('btn-open-large-chat');
        const largeChatModal = document.getElementById('large-chat-modal');
        if (btnOpenLargeChat && largeChatModal) {
            btnOpenLargeChat.onclick = () => {
                largeChatModal.style.display = 'flex';
                // Garante scroll no fim ao abrir
                setTimeout(() => {
                    const publicList = document.getElementById('large-chat-messages');
                    const privateList = document.getElementById('large-private-messages');
                    if (publicList) publicList.scrollTop = publicList.scrollHeight;
                    if (privateList) privateList.scrollTop = privateList.scrollHeight;
                }, 100);
            };

            // Fechar ao clicar fora
            largeChatModal.onclick = (e) => {
                if (e.target === largeChatModal) {
                    largeChatModal.style.display = 'none';
                }
            };
        }

        // Enviar no Chat Grande
        const btnSendLarge = document.getElementById('btn-send-large-chat');
        if (btnSendLarge) {
            btnSendLarge.onclick = () => {
                const input = document.getElementById('large-chat-input');
                const msg = input.value.trim();
                const target = document.querySelector('input[name="chat-target-large"]:checked')?.value || 'public';
                if (msg) {
                    this.sendChatMessage(msg, target);
                    input.value = '';
                }
            };
        }

        const largeChatInput = document.getElementById('large-chat-input');
        if (largeChatInput) {
            largeChatInput.onkeypress = (e) => {
                if (e.key === 'Enter') {
                    const msg = largeChatInput.value.trim();
                    const target = document.querySelector('input[name="chat-target-large"]:checked')?.value || 'public';
                    if (msg) {
                        this.sendChatMessage(msg, target);
                        largeChatInput.value = '';
                    }
                }
            };
        }

        // Prevenir fechamento ao clicar dentro da sidebar
        sidebarLeft?.addEventListener('mousedown', (e) => e.stopPropagation());
        sidebarRight?.addEventListener('mousedown', (e) => e.stopPropagation());

        // Fullscreen Toggle
        const btnFullscreen = document.getElementById('btn-toggle-fullscreen');
        if (btnFullscreen) {
            btnFullscreen.onclick = () => {
                const icon = btnFullscreen.querySelector('i');
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen()
                        .then(() => {
                            if (icon) icon.className = 'fas fa-compress';
                        })
                        .catch(err => {
                            console.error(`Erro ao tentar entrar em modo tela cheia: ${err.message}`);
                        });
                } else {
                    if (document.exitFullscreen) {
                        document.exitFullscreen().finally(() => {
                            if (icon) icon.className = 'fas fa-expand';
                        });
                    }
                }
            };
        }

        // Grid Toggle
        const btnGrid = document.getElementById('btn-toggle-grid');
        const grid = document.getElementById('map-grid');
        if (btnGrid && grid) {
            btnGrid.addEventListener('click', () => {
                grid.classList.toggle('active');
                btnGrid.classList.toggle('active');
                console.log("Grid Toggled:", grid.classList.contains('active'));
            });
        }

        // Exit Session
        const btnExit = document.getElementById('btn-exit-session');
        if (btnExit) {
            btnExit.addEventListener('click', () => this.leaveOrEndSession());
        }

        // Efeitos Sonoros do Mestre
        document.querySelectorAll('.sfx-btn').forEach(btn => {
            btn.onclick = () => {
                if (this.isMaster) {
                    this.triggerSFX(btn.dataset.sfx);
                } else {
                    // Jogador toca localmente
                    this.playSfx(btn.dataset.sfx);
                }
            };
        });

        // Tabs no Kit Mestre
        document.querySelectorAll('.kit-tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.kit-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.kit-tab-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`kit-${tab.dataset.tab}`).classList.add('active');
            };
        });

        const toggleFloor = document.getElementById('toggle-floor-visible');
        if (toggleFloor) toggleFloor.onchange = (e) => this.updateMapEditorConfig({ floor: { visible: !!e.target.checked } });
        const toggleAssets = document.getElementById('toggle-assets-visible');
        if (toggleAssets) toggleAssets.onchange = (e) => this.updateMapEditorConfig({ assets_visible: !!e.target.checked });
        const rangeBright = document.getElementById('range-map-brightness');
        if (rangeBright) rangeBright.oninput = (e) => this.updateMapEditorConfig({ brightness: parseFloat(e.target.value || '1') });
        const rangeFloorOp = document.getElementById('range-floor-opacity');
        if (rangeFloorOp) rangeFloorOp.oninput = (e) => this.updateMapEditorConfig({ floor: { opacity: parseFloat(e.target.value || '1') } });
        const selPreset = document.getElementById('select-floor-preset');
        if (selPreset) selPreset.onchange = (e) => this.updateMapEditorConfig({ floor: { preset: String(e.target.value || 'classic_hatching') }, map_opacity: 0 });
        const btnCenter = document.getElementById('btn-map-center');
        if (btnCenter) btnCenter.onclick = () => this.centerMap();
        const btnReset = document.getElementById('btn-map-reset');
        if (btnReset) btnReset.onclick = () => this.centerMap();

        

        const btnPlaceUrl = document.getElementById('btn-place-asset-url');
        if (btnPlaceUrl) btnPlaceUrl.onclick = () => {
            const url = document.getElementById('input-asset-url')?.value || '';
            this.startPlacingAsset(url);
        };

        const btnPlaceFile = document.getElementById('btn-place-asset-file');
        if (btnPlaceFile) btnPlaceFile.onclick = async () => {
            const input = document.getElementById('input-asset-file');
            const f = input?.files?.[0];
            if (!f) return;
            if (f.size > 260000) {
                alert('Arquivo muito grande. Use um link ou uma imagem menor.');
                return;
            }
            const dataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => resolve('');
                reader.readAsDataURL(f);
            });
            if (!dataUrl) return;
            this.startPlacingAsset(dataUrl);
            try { input.value = ''; } catch {}
        };

        // Busca de Inimigos
        const enemySearch = document.getElementById('enemy-search');
        if (enemySearch) {
            enemySearch.addEventListener('input', (e) => this.loadBestiary(e.target.value));
        }

        // Criar NPC
        const btnCreateNpc = document.getElementById('btn-create-npc');
        if (btnCreateNpc) {
            btnCreateNpc.addEventListener('click', () => {
                document.getElementById('npc-create-modal').style.display = 'flex';
            });
        }

        const btnConfirmNpc = document.getElementById('btn-confirm-npc-create');
        if (btnConfirmNpc) {
            btnConfirmNpc.addEventListener('click', () => this.createQuickNpc());
        }

        // Criar Inimigo Customizado
        const btnAddCustomEnemy = document.getElementById('btn-add-custom-enemy');
        if (btnAddCustomEnemy) {
            btnAddCustomEnemy.addEventListener('click', () => {
                document.getElementById('enemy-create-modal').style.display = 'flex';
            });
        }

        const btnConfirmEnemyCreate = document.getElementById('btn-confirm-enemy-create');
        if (btnConfirmEnemyCreate) {
            btnConfirmEnemyCreate.addEventListener('click', () => this.createCustomEnemy(false));
        }
        const btnConfirmEnemyCreatePlace = document.getElementById('btn-confirm-enemy-create-place');
        if (btnConfirmEnemyCreatePlace) {
            btnConfirmEnemyCreatePlace.addEventListener('click', () => this.createCustomEnemy(true));
        }

        // Toolbar do Mestre
        document.querySelectorAll('.gm-tool-btn').forEach(btn => {
            btn.addEventListener('click', () => this.handleGmToolbar(btn.dataset.tool));
        });

        // Expansão de Jogadores na Sidebar Esquerda
        const btnExpandPlayers = document.getElementById('btn-expand-players');
        const sidebarPlayerCards = document.getElementById('sidebar-player-cards');
        if (btnExpandPlayers && sidebarPlayerCards) {
            btnExpandPlayers.onclick = () => {
                const isMinimized = sidebarPlayerCards.classList.toggle('minimized');
                btnExpandPlayers.innerHTML = isMinimized ? '+' : '-';
                btnExpandPlayers.title = isMinimized ? 'Ver Jogadores' : 'Recolher Jogadores';
            };
        }

        // Toggles de Permissão (Mestre)
        const permissionToggles = {
            'toggle-allow-sheets': 'allow_sheets',
            'toggle-allow-dice': 'allow_dice',
            'toggle-allow-tokens': 'allow_tokens',
            'toggle-allow-abilities': 'allow_abilities',
            'toggle-allow-chat': 'allow_chat'
        };

        for (const [id, key] of Object.entries(permissionToggles)) {
            const el = document.getElementById(id);
            if (el) {
                el.onchange = (e) => this.togglePermission(key, e.target.checked);
            }
        }

        // Chat Send
        const btnSend = document.getElementById('btn-send-chat');
        if (btnSend) {
            btnSend.addEventListener('click', () => {
                const input = document.getElementById('chat-input');
                if (!input) return;
                const msg = input.value.trim();
                const target = document.querySelector('input[name="chat-target"]:checked')?.value || 'public';
                
                if (msg) {
                    this.sendChatMessage(msg, target);
                    input.value = '';
                }
            });
        }

        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const msg = chatInput.value.trim();
                    const target = document.querySelector('input[name="chat-target"]:checked')?.value || 'public';
                    if (msg) {
                        this.sendChatMessage(msg, target);
                        chatInput.value = '';
                    }
                }
            });
        }
    }

    setupDragAndDrop() {
        const mapArea = document.querySelector('.map-area');
        const mapContainer = document.getElementById('map-container');
        if (!mapArea || !mapContainer) return;

        // Limpa ouvintes anteriores para evitar duplicatas
        mapArea.removeEventListener('dragover', this._onDragOver);
        mapArea.removeEventListener('drop', this._onDrop);

        this._onDragOver = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };

        this._onDrop = async (e) => {
            e.preventDefault();

            try {
                const rect = mapContainer.getBoundingClientRect();
                
                // Cálculo de coordenadas relativas ao mapa 5000x5000
                const x = (e.clientX - rect.left) / this.scale;
                const y = (e.clientY - rect.top) / this.scale;

                // Snap na grid de 50px
                const gridX = Math.floor(x / 50) * 50;
                const gridY = Math.floor(y / 50) * 50;

                const rawData = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
                const text = String(rawData || '').trim();
                if (!text) {
                    // Se não tem dados de drag e não está movendo, pode ser apenas um clique no mapa
                    if (this.isTargeting || this.isMovingToken ) return;
                    return;
                }

                let droppedData;
                try {
                    droppedData = JSON.parse(text);
                } catch {
                    return;
                }
                if (!droppedData || !droppedData.type) return;
                console.log(`Drop detectado: ${droppedData.type} em ${gridX}, ${gridY}`);

                if (droppedData.type === 'floor') {
                    if (!this.isMaster) {
                        alert('Apenas o Mestre pode construir pisos.');
                        return;
                    }
                    const texId = droppedData?.data?.textureId;
                    const layer = Number.isFinite(droppedData?.data?.layer) ? droppedData.data.layer : this.floorActiveLayer;
                    const tex = this.getFloorTextureById(texId) || this.getFloorTextureById(this.selectedFloorTextureId);
                    if (!tex) {
                        alert('Selecione um piso válido.');
                        return;
                    }
                    const size = Math.max(50, Math.min(3000, Math.round((Number(this.floorDefaultSizePx || 150) || 150) / 50) * 50));
                    const tile = {
                        id: `floor_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 5)}`,
                        layer: Math.max(0, Math.min(4, Number(layer) || 0)),
                        url: tex.url,
                        x: gridX,
                        y: gridY,
                        w: size,
                        h: size,
                        rot: 0,
                        opacity: 1
                    };
                    const pos = this.findFreeFloorPosition(tile.layer, tile.x, tile.y, tile.w, tile.h, null);
                    tile.x = pos.x;
                    tile.y = pos.y;
                    this.floorTiles = [...(Array.isArray(this.floorTiles) ? this.floorTiles : []), tile];
                    this.renderFloorTiles();
                    this.schedulePersistFloorTiles();
                    return;
                }

                if (droppedData.type === 'object') {
                    if (!this.isMaster) {
                        alert('Apenas o Mestre pode colocar objetos.');
                        return;
                    }
                    const name = String(droppedData?.data?.name || '').trim();
                    const imageUrl = String(droppedData?.data?.image_url || '').trim();
                    if (!name || !imageUrl) return;

                    const obj = {
                        id: `obj_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`,
                        name,
                        image_url: imageUrl,
                        x: gridX,
                        y: gridY,
                        w: 120,
                        h: 120,
                        rot: 0,
                        scale: 1,
                        opacity: 1
                    };
                    this.mapObjects = [...(Array.isArray(this.mapObjects) ? this.mapObjects : []), obj];
                    this.selectedMapObjectId = obj.id;
                    this.renderMapObjects();
                    this.schedulePersistMapObjects();
                    return;
                }

                // Se for inimigo, só o mestre pode colocar
                if (droppedData.type === 'enemy') {
                    if (!this.isMaster) {
                        alert("Apenas o Mestre pode invocar inimigos!");
                        return;
                    }
                    await this.addTokenToMap(droppedData.data, gridX, gridY, 'enemy');
                } 
                // Se for NPC, só o mestre pode colocar
                else if (droppedData.type === 'npc') {
                    if (!this.isMaster) {
                        alert("Apenas o Mestre pode invocar NPCs!");
                        return;
                    }
                    await this.addTokenToMap(droppedData.data, gridX, gridY, 'npc');
                }
                // Se for jogador, o mestre pode colocar qualquer um, e o jogador pode colocar o seu
                else if (droppedData.type === 'player') {
                    await this.addTokenToMap(droppedData.data, gridX, gridY, 'player');
                    this.renderTokens();
                    this.schedulePersistTokens();
                }
            } catch (error) {
                console.error("Erro no processamento do drop:", error);
            }
        };

        mapArea.addEventListener('dragover', this._onDragOver);
        mapArea.addEventListener('drop', this._onDrop);
    }

    async addTokenToMap(data, x, y, type = 'enemy') {
        if (!this.isMaster && this.sessionData.permissions?.allow_tokens === false) {
            console.warn("Invocação de tokens bloqueada pelo Mestre.");
            return;
        }

        try {
            if (type === 'player') {
                const sheetId = data?.id || data?.sheet_id || null;
                if (sheetId) {
                    const currentTokens = Array.isArray(this.tokens) ? this.tokens : (this.sessionData?.map_tokens || []);
                    const alreadyOnMap = currentTokens.some(t => t?.type === 'player' && t?.sheet_id === sheetId);
                    if (alreadyOnMap) {
                        alert("Este aventureiro já está em campo. Remova ele do mapa antes de colocar novamente.");
                        return;
                    }
                }
            }

            console.log(`Tentando adicionar token ${type}...`, { sessionId: this.sessionId, userId: this.user?.uid });
            const sessionRef = doc(db, "sessions", this.sessionId);
            
            // Se for jogador colocando sua própria ficha, ou mestre colocando qualquer uma
            // Se for inimigo, já validamos no _onDrop que só mestre chega aqui
            
            const newToken = {
                id: Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
                name: data.name,
                job: data.job || null,
                image_url: data.image_url,
                type: type,
                level: data.level || 1,
                hp: data.hp || 10,
                hpMax: data.hpMax || data.hp || 10,
                atk: data.atk || 5,
                def: data.def || 5,
                x: x,
                y: y,
                scale: clampNumber(data.scale ?? 1, 0.6, 2),
                isRevealed: type === 'player', // Jogadores sempre começam revelados
                isDead: data.hp <= 0,
                owner_uid: this.user.uid,
                sheet_id: data.id || null, // Se for player, guarda o ID da ficha
                vision_angle: type === 'player' ? (-Math.PI / 2) : undefined,
                created_at: new Date().toISOString()
            };

            await setDoc(sessionRef, {
                map_tokens: arrayUnion(newToken)
            }, { merge: true });
            
            console.log("Token adicionado com sucesso!");
        } catch (error) {
            console.error("Erro ao adicionar token:", error);
            alert(`Erro ao adicionar no mapa. Verifique sua conexão ou permissões.`);
        }
    }

    async createCustomEnemy(placeOverride = null) {
        if (!this.isMaster) return;

        const name = document.getElementById('enemy-new-name').value.trim();
        const imageUrl = document.getElementById('enemy-new-image').value.trim();
        const hp = parseInt(document.getElementById('enemy-new-hp').value) || 20;
        const level = parseInt(document.getElementById('enemy-new-level').value) || 1;
        const atk = parseInt(document.getElementById('enemy-new-atk').value) || 5;
        const def = parseInt(document.getElementById('enemy-new-def').value) || 5;
        const spawnCheckbox = document.getElementById('enemy-new-spawn-now');
        const shouldPlace = placeOverride === null ? !!spawnCheckbox?.checked : !!placeOverride;

        if (!name) {
            alert("Por favor, digite um nome para o inimigo.");
            return;
        }

        const newEnemy = {
            id: 'custom_' + Date.now().toString(36),
            name: name,
            image_url: imageUrl || 'assets/inimigos/Aranha.png',
            hp: hp,
            level: level,
            atk: atk,
            def: def,
            type: 'Customizado',
            created_at: new Date().toISOString()
        };

        try {
            const sessionRef = doc(db, "sessions", this.sessionId);
            await updateDoc(sessionRef, {
                enemies: arrayUnion(newEnemy)
            });
            
            document.getElementById('enemy-create-modal').style.display = 'none';
            document.getElementById('enemy-new-name').value = '';
            document.getElementById('enemy-new-image').value = '';
            console.log("Inimigo customizado criado!");

            if (shouldPlace) {
                this.isPlacingToken = true;
                this.pendingTokenPlacement = {
                    type: 'enemy',
                    data: {
                        name: newEnemy.name,
                        image_url: newEnemy.image_url,
                        hp: newEnemy.hp,
                        hpMax: newEnemy.hp,
                        atk: newEnemy.atk,
                        def: newEnemy.def,
                        level: newEnemy.level
                    }
                };
                document.getElementById('targeting-overlay').style.display = 'flex';
                document.getElementById('targeting-text').textContent = `Posicionar ${newEnemy.name}: clique no mapa para colocar...`;
                document.getElementById('btn-confirm-attack').style.display = 'none';
            }
        } catch (error) {
            console.error("Erro ao criar inimigo:", error);
            alert("Erro ao salvar inimigo.");
        }
    }

    renderNpcList() {
        const container = document.getElementById('npcs-list');
        if (!container) return;

        const npcs = this.sessionData.quick_npcs || [];
        container.innerHTML = npcs.length ? '' : '<p style="font-size: 0.8rem; color: #666; text-align: center; padding: 10px;">Nenhum NPC criado.</p>';

        npcs.forEach(npc => {
            const el = document.createElement('div');
            el.className = 'enemy-drag-card';
            el.draggable = true;
            el.innerHTML = `
                <img src="${npc.image_url || 'assets/default-avatar.png'}" alt="${npc.name}">
                <div class="enemy-info">
                    <strong>${npc.name}</strong>
                    <span>${npc.job} (HP: ${npc.hp})</span>
                </div>
            `;

            el.addEventListener('dragstart', (e) => {
                const payload = JSON.stringify({
                    type: 'npc',
                    data: {
                        name: npc.name,
                        job: npc.job,
                        image_url: npc.image_url,
                        hp: npc.hp,
                        hpMax: npc.hp,
                        atk: 0,
                        def: 2,
                        level: 1
                    }
                });
                e.dataTransfer.setData('application/json', payload);
                e.dataTransfer.setData('text/plain', payload);
            });

            container.appendChild(el);
        });
    }

    async createQuickNpc() {
        if (!this.isMaster) return;

        const imageUrl = document.getElementById('npc-new-image').value.trim();
        const hp = parseInt(document.getElementById('npc-new-hp').value) || 10;

        const firstNames = ["Alaric", "Bartholomew", "Cedric", "Dante", "Edmund", "Fabian", "Geoffrey", "Hilda", "Isolde", "Joan", "Lambert", "Maude", "Osric", "Piers", "Rowena", "Sigismund", "Theobald", "Ursula", "Wymond", "Yolande"];
        const lastNames = ["Miller", "Smith", "Cooper", "Fletcher", "Baker", "Thatcher", "Webb", "Carter", "Mason", "Cook", "Ward", "Fisher", "Hunter", "Taylor", "Clark", "Wright", "Turner", "Walker", "Wood", "Knight"];
        const jobs = ["Ferreiro", "Estalajadeiro", "Mercador", "Camponês", "Coveiro", "Alquimista", "Guarda", "Boticário", "Tecelão", "Alfaiate", "Taverneiro", "Moleiro", "Sapateiro", "Pescador", "Lenhador", "Sacerdote", "Arauto", "Menestrel", "Bibliotecário", "Escrivão"];

        const randomName = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
        const randomJob = jobs[Math.floor(Math.random() * jobs.length)];

        const newNpc = {
            id: Date.now().toString(36),
            name: randomName,
            job: randomJob,
            image_url: imageUrl || 'assets/default-avatar.png',
            hp: hp,
            created_at: new Date().toISOString()
        };

        try {
            const sessionRef = doc(db, "sessions", this.sessionId);
            await updateDoc(sessionRef, {
                quick_npcs: arrayUnion(newNpc)
            });
            
            document.getElementById('npc-create-modal').style.display = 'none';
            document.getElementById('npc-new-image').value = '';
            console.log("NPC criado com sucesso!");
        } catch (error) {
            console.error("Erro ao criar NPC:", error);
            alert("Erro ao salvar NPC no banco de dados.");
        }
    }

    // --- Sistema de Combate ---
    async startCombat() {
        if (!this.isMaster) return;
        
        try {
            const sessionRef = doc(db, "sessions", this.sessionId);
            await updateDoc(sessionRef, {
                combat_active: true,
                turn_order: [],
                current_turn_index: 0,
                initiatives: {} // Limpa rolagens anteriores
            });
            console.log("Combate iniciado!");
        } catch (error) {
            console.error("Erro ao iniciar combate:", error);
        }
    }

    async rollInitiative() {
        if (this.hasRolledInitiative) return;
        if (!this.user || !this.sessionId) {
            console.error("User ou SessionID não definidos");
            return;
        }
        
        console.log("Rolando iniciativa...");
        const roll = Math.floor(Math.random() * 20) + 1;
        const playerName = this.playerSheet?.name || this.user.displayName || "Aventureiro";
        const avatar = this.playerSheet?.data?.image || "assets/default-avatar.png";

        try {
            // Busca o frame do perfil do usuário na coleção 'profiles' (não 'users')
            let frame = 'wood';
            try {
                const profileRef = doc(db, "profiles", this.user.uid);
                const profileSnap = await getDoc(profileRef);
                if (profileSnap.exists()) {
                    const profileData = profileSnap.data();
                    frame = profileData.current_frame || 'wood';
                    if (profileData.is_admin || this.user.email === 'hayagames@outlook.com') {
                        frame = 'adm';
                    }
                }
            } catch (pError) {
                console.warn("Não foi possível carregar o frame do perfil:", pError);
                // Continua com frame padrão se falhar
            }

            const sessionRef = doc(db, "sessions", this.sessionId);
            const initiativeData = {
                uid: this.user.uid,
                name: playerName,
                avatar: avatar,
                frame: frame,
                roll: roll,
                timestamp: Date.now()
            };

            // Atualiza iniciativa individual e também o last_roll para disparar animação
            await updateDoc(sessionRef, {
                [`initiatives.${this.user.uid}`]: initiativeData,
                last_roll: {
                    user_name: playerName,
                    result: roll,
                    sides: 20,
                    timestamp: Date.now()
                }
            });

            this.hasRolledInitiative = true;
            this.sendChatMessage(`Rolou Iniciativa: **${roll}**`, 'public');
            console.log("Iniciativa enviada com frame:", frame, "resultado:", roll);
        } catch (error) {
            console.error("Erro ao rolar iniciativa:", error);
            alert("Erro ao enviar iniciativa. Tente novamente.");
        }
    }

    async rollEnemiesInitiative() {
        if (!this.isMaster || !this.combatActive) return;

        const enemiesOnMap = this.tokens.filter(t => t.type === 'enemy' && !t.isDead);
        if (enemiesOnMap.length === 0) {
            alert("Não há inimigos vivos no mapa para rolar iniciativa.");
            return;
        }

        // Agrupa por nome para não poluir o tracker se houver muitos iguais
        const uniqueEnemies = [...new Set(enemiesOnMap.map(e => e.name))];
        const sessionRef = doc(db, "sessions", this.sessionId);
        const updates = {};

        for (const name of uniqueEnemies) {
            const enemy = enemiesOnMap.find(e => e.name === name);
            const roll = Math.floor(Math.random() * 20) + 1;
            const safeId = String(enemy?.id || name).replace(/[^a-zA-Z0-9_-]/g, '_');
            
            updates[`initiatives.enemy_${safeId}`] = {
                uid: `enemy_${safeId}`,
                name: name,
                avatar: enemy.image_url || 'assets/inimigos/Aranha.png',
                frame: 'iron',
                roll: roll,
                type: 'enemy',
                timestamp: Date.now()
            };

            // Dispara animação para o último inimigo rolado (para não sobrecarregar)
            updates.last_roll = {
                user_name: `Inimigo: ${name}`,
                result: roll,
                sides: 20,
                timestamp: Date.now()
            };
        }

        try {
            await updateDoc(sessionRef, updates);
            this.sendChatMessage(`Mestre rolou iniciativa para os inimigos!`, 'public');
        } catch (error) {
            console.error("Erro ao rolar iniciativa dos inimigos:", error);
        }
    }

    async organizeTurnOrder() {
        if (!this.isMaster) return;
        
        const initiatives = this.sessionData.initiatives || {};
        const entries = Object.values(initiatives);
        
        if (entries.length === 0) return;

        // Ordena do maior para o menor
        const sorted = entries.sort((a, b) => b.roll - a.roll);
        
        try {
            const sessionRef = doc(db, "sessions", this.sessionId);
            await updateDoc(sessionRef, {
                turn_order: sorted,
                current_turn_index: 0
            });
        } catch (error) {
            console.error("Erro ao organizar turnos:", error);
        }
    }

    async nextTurn() {
        if (!this.isMaster || !this.combatActive) return;
        
        let nextIndex = this.currentTurnIndex + 1;
        if (nextIndex >= this.turnOrder.length) {
            nextIndex = 0; // Reinicia ciclo
        }

        try {
            const sessionRef = doc(db, "sessions", this.sessionId);
            await updateDoc(sessionRef, {
                current_turn_index: nextIndex
            });
        } catch (error) {
            console.error("Erro ao avançar turno:", error);
        }
    }

    async endCombat() {
        if (!this.isMaster) return;

        const ok = confirm("Encerrar combate? Isso limpa iniciativas e ordem de turno.");
        if (!ok) return;
        
        try {
            const sessionRef = doc(db, "sessions", this.sessionId);
            await updateDoc(sessionRef, {
                combat_active: false,
                turn_order: [],
                current_turn_index: 0,
                initiatives: {}
            });
            this.hasRolledInitiative = false;
            this.sendChatMessage("Mestre encerrou o combate.", "public");
            const tracker = document.getElementById('turn-tracker');
            if (tracker) tracker.style.display = 'none';
        } catch (error) {
            console.error("Erro ao encerrar combate:", error);
            alert("Erro ao encerrar combate. Verifique sua conexão/permissões.");
        }
    }

    renderTurnTracker() {
        const tracker = document.getElementById('turn-tracker');
        const list = document.getElementById('turn-list');
        if (!tracker || !list) return;

        if (!this.combatActive || this.turnOrder.length === 0) {
            tracker.style.display = 'none';
            return;
        }

        tracker.style.display = 'flex';
        list.innerHTML = '';

        this.turnOrder.forEach((player, index) => {
            const isActive = index === this.currentTurnIndex;
            const item = document.createElement('div');
            item.className = `turn-item ${isActive ? 'active' : ''}`;
            
            // Frame classes
            const frameClass = player.frame  ? `frame-${player.frame.toLowerCase()}` : '';
            const glowClass = player.frame  ? `glow-${player.frame.toLowerCase()}` : '';

            item.innerHTML = `
                <div class="turn-avatar-container">
                    <div class="frame-glow ${glowClass}"></div>
                    <div class="frame-border ${frameClass} ${player.isMaster ? 'frame-ADM' : ''}"></div>
                    <div class="turn-avatar" style="background-image: url('${player.avatar}')"></div>
                </div>
                <div class="turn-name">${player.name}</div>
            `;
            
            list.appendChild(item);
        });
    }

    renderTokens() {
        const layer = document.getElementById('tokens-layer');
        if (!layer) return;
        layer.innerHTML = '';

        this.tokens.forEach(token => {
            if (!token.isRevealed && !this.isMaster) return;

            const isTargeted = this.currentTarget && this.currentTarget.id === token.id;
            const isBoss = token.level === 5 && token.type === 'enemy';

            const el = document.createElement('div');
            const deleteSelected = this.deleteMode && this.deleteSelection?.tokens?.has(token.id);
            el.className = `token ${token.type || 'enemy'} ${isBoss ? 'boss' : ''} ${!token.isRevealed ? 'hidden' : ''} ${token.isDead ? 'dead' : ''} ${isTargeted ? 'targeted' : ''} ${this.isMovingToken && this.tokenToMove?.id === token.id ? 'moving' : ''} ${this.selectedTokenId === token.id ? 'selected' : ''} ${this.deleteMode ? 'delete-armed' : ''} ${deleteSelected ? 'delete-selected' : ''}`;
            el.dataset.id = token.id; // Importante para animações
            el.style.left = `${token.x}px`;
            el.style.top = `${token.y}px`;

            const tokenScale = clampNumber(token.scale ?? 1, 0.6, 2);
            el.style.setProperty('--token-scale', String(tokenScale));
            if (token.borderColor) el.style.setProperty('--token-custom-border-color', String(token.borderColor));
            
            // Determina se o usuário pode mover este token (mestre ou dono de folha)
            const isMaster = this.isMaster;
            const isSheetOwner = token.type === 'player' && token.sheet_id === this.playerSheetId;
            const canMove = isMaster || isSheetOwner;
            el.dataset.canMove = canMove;
            el.dataset.sheetOwner = isSheetOwner;
            el.dataset.isMaster = isMaster;
            el.dataset.canMove = canMove;

            // Gerar Estrelas de nível
            let stars = '';
            const level = token.level || 1;
            for(let i=0; i < level; i++) {
                stars += '<i class="fas fa-star"></i>';
            }

            // Cálculo HP
            const hpCurrent = token.hp || 0;
            const hpMax = token.hpMax || hpCurrent || 10;
            const hpPercent = Math.max(0, Math.min(100, (hpCurrent / hpMax) * 100));
            let hpColor = '#2ecc71';
            if (hpPercent <= 20) hpColor = '#e74c3c';
            else if (hpPercent <= 50) hpColor = '#f1c40f';

            el.innerHTML = `
                <div class="token-card-inner">
                    <div class="token-stars">${stars}</div>
                    <div class="token-image-area" style="background-image: url('${token.image_url || 'assets/inimigos/Aranha.png'}')"></div>
                    <div class="token-info-area">
                        <div class="token-name" style="font-size: 1.1rem; color: #000000ff; font-weight: bold; text-align: center;">${token.name}</div>

                    </div>
                    <div class="token-dead-overlay">
                        <span class="dead-text">${token.type === 'player' ? 'CAÍDO' : 'ELIMINADO'}</span>
                    </div>
                </div>
                ${canMove && !token.isDead && token.type === 'player' ? `
                    <div class="token-controls">
                        ${this.isMaster ?  `
                            <button class="control-btn btn-reveal" onclick="window.gameSession.toggleReveal('${token.id}', ${token.isRevealed})" title="${token.isRevealed ? 'Esconder' : 'Revelar'}">
                                <i class="fas ${token.isRevealed ? 'fa-eye-slash' : 'fa-eye'}"></i>
                            </button>
                        ` : ''}
                        <button class="control-btn btn-move" onclick="window.gameSession.startMovingToken('${token.id}')" title="Mover">
                            <i class="fas fa-arrows-alt"></i>
                        </button>
                        <button class="control-btn btn-kill" onclick="window.gameSession.killEnemy('${token.id}')" title="Matar Inimigo">
                            <i class="fas fa-skull"></i>
                        </button>
                        <button class="control-btn" onclick="window.gameSession.removeToken('${token.id}')" title="Remover">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                ` : ''}
            `;

           // Evento de Clique no Token
            el.onclick = (e) => {
                e.stopPropagation();
                // Se estiver clicando nos controles, ignora para não abrir modal
                if (e.target.closest('.control-btn')) return;
                if (this.isMaster && this.deleteMode) {
                    this.toggleDeleteSelection('token', token.id);
                    return;
                }
                if (this.isMaster && this.activeMapTool !== 'pointer') return;
                this.handleTokenClick(token);
            };

            el.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.deleteMode) return;
                if (this.isMaster && this.activeMapTool !== 'pointer') return;
                if (e.target.closest('.control-btn')) return;
                this.selectedTokenId = token.id;
                this.renderTokens();
                this.renderGmTokenPanel();

                const isSheetOwner = token.type === 'player' && token.sheet_id === this.playerSheetId;
                const canMove = !token.isDead && (this.isMaster || isSheetOwner);
                const canDelete = this.isMaster || isSheetOwner;
                const canDuplicate = this.isMaster;
                const canBorderColor = this.isMaster;

                this.openMapContextMenu({
                    kind: 'token',
                    id: token.id,
                    canMove,
                    canDuplicate,
                    canDelete,
                    canBorderColor
                }, e.clientX, e.clientY);
            };

            const canDrag = !this.deleteMode && !token.isDead && canMove && (!this.isMaster || this.activeMapTool === 'pointer');
            if (canDrag) {
                this.makeTokenDraggable(el, token);
            }

            layer.appendChild(el);
        });
    }

    async duplicateToken(tokenId) {
        if (!this.isMaster) return;
        try {
            const tokens = Array.isArray(this.tokens) ? [...this.tokens] : [];
            const t = tokens.find(x => x && x.id === tokenId);
            if (!t) return;
            const copy = {
                ...t,
                id: `token_${Date.now()}`,
                x: (t.x || 0) + 50,
                y: (t.y || 0) + 50,
                isDead: false
            };
            tokens.push(copy);
            const sessionRef = doc(db, "sessions", this.sessionId);
            await setDoc(sessionRef, { map_tokens: tokens }, { merge: true });
        } catch (e) {
            console.error(e);
        }
    }

    async clearFootprints() {
        if (!this.isMaster) return;
        if (confirm("Deseja limpar todos os rastros do mapa?")) {
            try {
                const sessionRef = doc(db, "sessions", this.sessionId);
                await updateDoc(sessionRef, {
                    footprints: []
                });
            } catch (error) {
                console.error("Erro ao limpar rastros:", error);
            }
        }
    }

    async killEnemy(tokenId) {
        try {
            const tokens = [...this.tokens];
            const index = tokens.findIndex(t => t.id === tokenId);
            if (index === -1 || tokens[index].isDead) return;

            // Se for player, o dono da ficha ou mestre pode matar (cair)
            const isSheetOwner = tokens[index].type === 'player' && tokens[index].sheet_id === this.playerSheetId;
            if (!this.isMaster && !isSheetOwner) {
                alert("Você não tem permissão para abater este token.");
                return;
            }

            tokens[index].isDead = true;
            tokens[index].hp = 0; // Zera o HP ao matar/cair

            const sessionRef = doc(db, "sessions", this.sessionId);
            const updates = { 
                map_tokens: tokens
            };
            
            // Só conta como abate do grupo se for um inimigo
            if (tokens[index].type === 'enemy') {
                updates.kill_count = (this.sessionData.kill_count || 0) + 1;
            }

            await setDoc(sessionRef, updates, { merge: true });
            
            console.log("Token abatido!");
        } catch (error) {
            console.error("Erro ao abater token:", error);
        }
    }

    makeTokenDraggable(el, token) {
        let isDragging = false;
        
        const onMouseDown = (e) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    const isSelected = this.selectedTokenId === token.id;

    if (isSelected) {
        // 🔥 DESSELECIONAR
        
        this.selectedTokenId = null;
    } else {
        // 🔥 SELECIONAR
        this.selectedTokenId = token.id;
    }


    // 🔥 ESSENCIAL
    this.renderTokens();
    this.renderGmTokenPanel();
    e.preventDefault();
    };


        const onMouseMove = (e) => {
            if (!isDragging) return;
            const container = document.getElementById('map-container');
            const rect = container.getBoundingClientRect();
            
            // O ponto (x,y) agora é a BASE central do card (devido ao translate -50% -100% no CSS)
            let newX = (e.clientX - rect.left) / this.scale;
            let newY = (e.clientY - rect.top) / this.scale;

            el.style.left = `${newX}px`;
            el.style.top = `${newY}px`;
        };

        const onMouseUp = async (e) => {
            if (!isDragging) return;
            isDragging = false;
            el.style.zIndex = 20;

            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

            const gridX = Math.round(parseInt(el.style.left) / 50) * 50;
            const gridY = Math.round(parseInt(el.style.top) / 50) * 50;

            el.style.left = `${gridX}px`;
            el.style.top = `${gridY}px`;

            // Atualiza no array map_tokens
            const tokens = [...this.tokens];
            const index = tokens.findIndex(t => t.id === token.id);
            if (index !== -1) {
                tokens[index].x = gridX;
                tokens[index].y = gridY;
                const sessionRef = doc(db, "sessions", this.sessionId);
                await setDoc(sessionRef, { map_tokens: tokens }, { merge: true });
            }
        };

        el.addEventListener('mousedown', onMouseDown);
    }

    makeMapAssetDraggable(el, asset) {
        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;

        const onMouseDown = (e) => {
            if (!this.isMaster || this.activeMapTool !== 'pointer') return;
            if (e.button !== 0) return;
            if (e.target.closest('button')) return;
            e.stopPropagation();

            this.selectedAssetId = asset.id;
            this.renderMapAssets();

            const p = this.getMapPointFromClient(e.clientX, e.clientY);
            if (!p) return;
            offsetX = p.x - (asset.x || 0);
            offsetY = p.y - (asset.y || 0);
            isDragging = true;
            el.style.zIndex = 1000;

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            const p = this.getMapPointFromClient(e.clientX, e.clientY);
            if (!p) return;
            const newX = p.x - offsetX;
            const newY = p.y - offsetY;
            el.style.left = `${newX}px`;
            el.style.top = `${newY}px`;
        };

        const onMouseUp = async () => {
            if (!isDragging) return;
            isDragging = false;
            el.style.zIndex = '';

            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

            const rawX = parseFloat(el.style.left || '0') || 0;
            const rawY = parseFloat(el.style.top || '0') || 0;
            const gridX = Math.round(rawX / 50) * 50;
            const gridY = Math.round(rawY / 50) * 50;
            el.style.left = `${gridX}px`;
            el.style.top = `${gridY}px`;

            await this.patchMapAsset(asset.id, { x: gridX, y: gridY });
        };

        el.addEventListener('mousedown', onMouseDown);
    }

    previewTokenScale(tokenId, scale) {
        const el = document.querySelector(`.token[data-id="${tokenId}"]`);
        if (!el) return;
        el.style.setProperty('--token-scale', String(clampNumber(scale, 0.6, 2)));
    }

    async patchToken(tokenId, patch) {
        try {
            const tokens = Array.isArray(this.tokens) ? [...this.tokens] : [];
            const idx = tokens.findIndex(t => t && t.id === tokenId);
            if (idx === -1) return;
            tokens[idx] = { ...tokens[idx], ...patch };
            const sessionRef = doc(db, "sessions", this.sessionId);
            await setDoc(sessionRef, { map_tokens: tokens }, { merge: true });
        } catch (e) {
            console.error(e);
        }
    }

    renderGmTokenPanel() {
        const root = document.getElementById('gm-token-panel');
        if (!root) return;
        if (!this.isMaster) {
            root.innerHTML = '';
            return;
        }

        const token = this.tokens.find(t => t && t.id === this.selectedTokenId);
        if (!token) {
            root.innerHTML = `<div class="gm-token-empty">Selecione um token no mapa para editar.<br>Você pode arrastar para mover (ferramenta Ponteiro).</div>`;
            return;
        }

        const scale = clampNumber(token.scale ?? 1, 0.6, 2);
        const typeLabel = token.type === 'player' ? 'Jogador' : (token.type === 'npc' ? 'NPC' : 'Inimigo');

        root.innerHTML = `
            <div class="gm-token-header">
                <div class="gm-token-preview" style="background-image: url('${token.image_url || 'assets/inimigos/Aranha.png'}')"></div>
                <div class="gm-token-title">
                    <strong>${token.name || 'Token'}</strong>
                    <span>${typeLabel} • X:${token.x ?? 0} Y:${token.y ?? 0}</span>
                </div>
            </div>
            <div class="gm-token-form">
                <div class="gm-token-row">
                    <label>Nome</label>
                    <input id="gm-token-name" type="text" class="sidebar-search" value="${String(token.name || '').replace(/"/g, '&quot;')}">
                </div>
                <div class="gm-token-row">
                    <label>Tamanho <span id="gm-token-scale-value" style="opacity: 0.7; font-weight: 700;">${Math.round(scale * 100)}%</span></label>
                    <input id="gm-token-scale" type="range" min="0.6" max="2" step="0.05" value="${scale}">
                </div>
                <div class="gm-token-actions">
                    <button id="gm-token-open-details" class="btn-secondary" type="button">Detalhes</button>
                    <button id="gm-token-remove" class="btn-danger-small" type="button">Remover</button>
                </div>
            </div>
        `;

        const nameInput = root.querySelector('#gm-token-name');
        const scaleInput = root.querySelector('#gm-token-scale');
        const scaleLabel = root.querySelector('#gm-token-scale-value');
        const btnDetails = root.querySelector('#gm-token-open-details');
        const btnRemove = root.querySelector('#gm-token-remove');

        if (nameInput) {
            nameInput.onchange = async () => {
                const next = String(nameInput.value || '').trim();
                if (!next || next === token.name) return;
                await this.patchToken(token.id, { name: next });
            };
        }

        if (scaleInput && scaleLabel) {
            scaleInput.oninput = () => {
                const v = clampNumber(scaleInput.value, 0.6, 2);
                scaleLabel.textContent = `${Math.round(v * 100)}%`;
                this.previewTokenScale(token.id, v);
            };
            scaleInput.onchange = async () => {
                const v = clampNumber(scaleInput.value, 0.6, 2);
                await this.patchToken(token.id, { scale: v });
            };
        }

        if (btnDetails) {
            btnDetails.onclick = () => this.openTokenDetails(token);
        }
        if (btnRemove) {
            btnRemove.onclick = () => this.removeToken(token.id);
        }
    }

    renderCharacterAssets(filterTerm = '') {
        const grid = document.getElementById('kit-characters-grid');
        if (!grid) return;

        const term = String(filterTerm || '').trim().toLowerCase();
        const all = getBuiltinCharacterAssets();
        const list = term ? all.filter(c => c.name.toLowerCase().includes(term)) : all;

        grid.innerHTML = list.map((c) => {
            const safeName = String(c.name || '').replace(/"/g, '&quot;');
            return `
                <div class="kit-character-card" draggable="true" data-character-id="${c.id}">
                    <div class="kit-character-thumb" style="background-image: url('${c.image_url}')"></div>
                    <div class="kit-character-meta">
                        <div class="kit-character-name">${safeName}</div>
                        <div class="kit-character-hint">Arraste para colocar no mapa</div>
                    </div>
                </div>
            `;
        }).join('');

        grid.querySelectorAll('.kit-character-card').forEach((card) => {
            card.addEventListener('dragstart', (e) => {
                const id = card.dataset.characterId;
                const c = list.find(x => x.id === id);
                if (!c) return;
                const payload = JSON.stringify({
                    type: 'npc',
                    data: {
                        name: c.name,
                        image_url: c.image_url,
                        hp: 10,
                        hpMax: 10,
                        level: 1,
                        atk: 0,
                        def: 0,
                        scale: 1
                    }
                });
                e.dataTransfer.setData('application/json', payload);
                e.dataTransfer.setData('text/plain', payload);
                e.dataTransfer.effectAllowed = 'move';
            });

            card.addEventListener('click', (e) => {
                if (!this.isMaster) return;
                if (e.target.closest('input, button, a')) return;
                const id = card.dataset.characterId;
                const c = list.find(x => x.id === id);
                if (!c) return;

                this.isPlacingToken = true;
                this.pendingTokenPlacement = {
                    type: 'npc',
                    data: {
                        name: c.name,
                        image_url: c.image_url,
                        hp: 10,
                        hpMax: 10,
                        level: 1,
                        atk: 0,
                        def: 0,
                        scale: 1
                    }
                };
                const overlay = document.getElementById('targeting-overlay');
                if (overlay) overlay.style.display = 'flex';
                const txt = document.getElementById('targeting-text');
                if (txt) txt.textContent = `Posicionar ${c.name}: clique no mapa para colocar...`;
                const btn = document.getElementById('btn-confirm-attack');
                if (btn) btn.style.display = 'none';
            });
            card.addEventListener('touchstart', (e) => {
                if (!this.isMaster) return;
             if (e.target.closest('input, button, a')) return;
                const id = card.dataset.characterId;
                const c = list.find(x => x.id === id);
                if (!c) return;

                this.isPlacingToken = true;
                this.pendingTokenPlacement = {
                    type: 'npc',
                    data: {
                        name: c.name,
                        image_url: c.image_url,
                        hp: 10,
                        hpMax: 10,
                        level: 1,
                        atk: 0,
                        def: 0,
                        scale: 1
                    }
                };
                const overlay = document.getElementById('targeting-overlay');
                if (overlay) overlay.style.display = 'flex';
                const txt = document.getElementById('targeting-text');
                if (txt) txt.textContent = `Posicionar ${c.name}: clique no mapa para colocar...`;
                const btn = document.getElementById('btn-confirm-attack');
                if (btn) btn.style.display = 'none';
            });
        });
    }

    async toggleReveal(tokenId, currentState) {
        if (!this.isMaster) return;
        try {
            const tokens = [...this.tokens];
            const index = tokens.findIndex(t => t.id === tokenId);
            if (index !== -1) {
                tokens[index].isRevealed = !currentState;
                const sessionRef = doc(db, "sessions", this.sessionId);
                await setDoc(sessionRef, { map_tokens: tokens }, { merge: true });
            }
        } catch (error) {
            console.error("Erro ao revelar token:", error);
        }
    }

    async removeToken(tokenId) {
        if (!confirm("Remover este token do mapa?")) return;
        
        try {
            const target = this.tokens.find(t => t.id === tokenId);
            if (!target) return;

            const isOwner = target.type === 'player' && target.sheet_id === this.playerSheetId;
            if (!this.isMaster && this.sessionData.permissions?.allow_tokens === false) return;
            if (!this.isMaster && !isOwner) return;
            if (!this.isMaster && target.type !== 'player') return;

            const tokens = this.tokens.filter(t => t.id !== tokenId);
            const sessionRef = doc(db, "sessions", this.sessionId);
            await setDoc(sessionRef, { map_tokens: tokens }, { merge: true });
            if (this.selectedTokenId === tokenId) {
                this.selectedTokenId = null;
                this.renderGmTokenPanel();
            }
        } catch (error) {
            console.error("Erro ao remover token:", error);
        }
    }

    async removeTokenNoConfirm(tokenId) {
        if (!this.isMaster) return;
        try {
            const target = this.tokens.find(t => t.id === tokenId);
            if (!target) return;
            const tokens = this.tokens.filter(t => t.id !== tokenId);
            const sessionRef = doc(db, "sessions", this.sessionId);
            await setDoc(sessionRef, { map_tokens: tokens }, { merge: true });
            if (this.selectedTokenId === tokenId) {
                this.selectedTokenId = null;
                this.renderGmTokenPanel();
            }
        } catch (error) {
            console.error("Erro ao remover token:", error);
        }
    }

    async rollDice(sides) {
        if (!this.isMaster && this.sessionData.permissions?.allow_dice === false) {
            console.warn("Rolagem de dados bloqueada pelo Mestre.");
            return;
        }

        const result = Math.floor(Math.random() * sides) + 1;
        
        try {
            const sessionRef = doc(db, "sessions", this.sessionId);
            
            // Grava a rolagem na sessão para sincronizar o overlay
            await setDoc(sessionRef, {
                last_roll: {
                    user_name: this.playerSheet?.name || this.user.displayName || "Jogador",
                    result: result,
                    sides: sides,
                    timestamp: Date.now()
                }
            }, { merge: true });

            // Envia para o chat também
            this.sendChatMessage(`Rolou D${sides}: **${result}**`, 'public');
        } catch (error) {
            console.error("Erro ao sincronizar rolagem:", error);
        }
    }

    listenToChat() {
        const messagesRef = collection(db, `sessions/${this.sessionId}/messages`);
        const q = query(messagesRef, orderBy('timestamp', 'asc'), limit(120));
        
        onSnapshot(q, (snapshot) => {
            const publicList = document.getElementById('chat-messages');
            const privateList = document.getElementById('private-messages');
            const largePublicList = document.getElementById('large-chat-messages');
            const largePrivateList = document.getElementById('large-private-messages');

            if (!publicList) return;

            // Salva se estava no final para decidir se rola automaticamente
            const scrollStates = [publicList, privateList, largePublicList, largePrivateList].map(list => {
                if (!list) return false;
                // Se a altura for 0 (vazio), considera que está no final para rolar as primeiras mensagens
                if (list.scrollHeight <= list.clientHeight) return true;
                return (list.scrollHeight - list.scrollTop) <= (list.clientHeight + 100);
            });

            // Limpa listas
            publicList.innerHTML = '';
            if (privateList) privateList.innerHTML = '';
            if (largePublicList) largePublicList.innerHTML = '';
            if (largePrivateList) largePrivateList.innerHTML = '';

            snapshot.forEach(doc => {
                const msg = doc.data();
                
                if (msg.target === 'private') {
                    if (this.isMaster) return;
                    this.renderMessage(msg, privateList);
                    this.renderMessage(msg, largePrivateList);
                } else {
                    this.renderMessage(msg, publicList);
                    this.renderMessage(msg, largePublicList);
                }
            });
            
            // Scroll para o fim apenas se o usuário já estava lá (ou se for a primeira carga)
            [publicList, privateList, largePublicList, largePrivateList].forEach((list, i) => {
                if (list && scrollStates[i]) {
                    list.scrollTop = list.scrollHeight;
                }
            });
        });
    }

    renderMessage(msg, container) {
        if (!container) return;
        const root = document.createElement('div');
        root.className = `chat-msg ${msg.this.user.displayName === this.user.uid ? 'own' : ''}`;

        const header = document.createElement('div');
        header.className = 'msg-header';

        const strong = document.createElement('strong');
        strong.textContent = String(msg.sender || 'Jogador');

        const small = document.createElement('small');
        const time = msg.timestamp ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        small.textContent = time;

        header.appendChild(strong);
        header.appendChild(small);

        const text = document.createElement('div');
        text.className = 'msg-text';
        text.textContent = String(msg.text || '');

        root.appendChild(header);
        root.appendChild(text);
        container.appendChild(root);
    }

    async sendChatMessage(text, target = 'public') {
        if (!this.isMaster && this.sessionData.permissions?.allow_chat === false) {
            console.warn("Envio de chat bloqueado pelo Mestre.");
            return;
        }
        if (!text) return;

        try {
            const messagesRef = collection(db, `sessions/${this.sessionId}/messages`);
            
            // Mestre só pode mandar mensagem pública
            const finalTarget = this.isMaster ? 'public' : target;

            await addDoc(messagesRef, {
                uid: this.user.uid,
                sender: this.playerSheet?.name || this.user.displayName || (this.isMaster ? "Mestre" : "Jogador"),
                text: text,
                target: finalTarget,
                timestamp: serverTimestamp()
            });

            const input = document.getElementById('chat-input');
            if (input) input.value = '';
        } catch (error) {
            console.error("Erro ao enviar mensagem:", error);
        }
    }
}
const btnMenu = document.getElementById('btn-menu');
const hamburgerMenu = document.querySelector('.hamburger-menu');
const controls = document.querySelector('.combat-controls');

btnMenu.addEventListener('click', () => {
    console.log('click');
    hamburgerMenu.classList.toggle('active');
    controls.classList.toggle('active');   
});
btnMenu.addEventListener('touchstart', () => {
    console.log('touchstart');
    hamburgerMenu.classList.toggle('active');
    controls.classList.toggle('active');   
});

window.onload = () => {
    window.gameSession = new GameSession();
};
