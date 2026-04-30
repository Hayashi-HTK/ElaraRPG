import { 
    auth, db, doc, setDoc, getDoc, updateDoc, onSnapshot, collection, addDoc, query, orderBy, serverTimestamp, arrayUnion, arrayRemove, deleteDoc, where, getDocs, deleteField, limit, onAuthStateChanged
} from "./firebase.js";

const DEFAULT_ENEMIES = [
    { id: 'def_1', name: 'Goblin', type: 'Humanoide Pequeno', level: 1, image_url: 'https://i.postimg.cc/J7c05S4m/Goblins.png' },
    { id: 'def_2', name: 'Esqueleto', type: 'Morto-Vivo Médio', level: 1, image_url: 'https://i.postimg.cc/59qySDNJ/esqueleto.png' },
    { id: 'def_3', name: 'Lobo Atroz', type: 'Besta Média', level: 2, image_url: 'https://wiki.runarcana.org/images/d/dc/Lobo_Atroz.png' },
    { id: 'def_4', name: 'Zumbi de Elite', type: 'Morto-Vivo Médio', level: 2, image_url: 'https://i.postimg.cc/qRPdh6jk/Zumbi.png' },
    { id: 'def_5', name: 'Gárgula', type: 'Elemental Médio', level: 3, image_url: 'https://i.postimg.cc/7YgqzXvY/Gargula.png' },
    { id: 'def_6', name: 'Aranha Gigante', type: 'Besta Grande', level: 3, image_url: 'https://i.postimg.cc/hvmcp1fp/Aranha.png' },
    { id: 'def_7', name: 'Golem de Ferro', type: 'Construto Grande', level: 4, image_url: 'https://i.postimg.cc/nLwxxPmj/Golem.png' },
    { id: 'def_8', name: 'Quimera', type: 'Monstruosidade Grande', level: 4, image_url: 'https://i.postimg.cc/MKwhCS4p/Quimera.jpg' },
    { id: 'def_9', name: 'Observador', type: 'Aberração Grande', level: 5, image_url: 'https://i.postimg.cc/13YfN6RG/Observador.png' },
    { id: 'def_10', name: 'Dragão Vermelho', type: 'Dragão Enorme', level: 5, image_url: 'https://img.pikbest.com/origin/09/30/95/865pIkbEsTAcw.png!sw800' },
    { id: 'def_boss_1', name: 'THE FIRST', type: 'Deus Primordial', level: 5, image_url: 'assets/inimigos/The first.png' }
];

class MultiplayerLobby {
    constructor() {
        this.currentSessionId = null;
        this.isMaster = false;
        this.user = null;
        this.sessionData = null;
        this.unsubscribeSession = null;
        this.unsubscribeChat = null;
        this.allEnemies = []; // Cache para todos os inimigos
        this.selectedEnemies = [];

        // UI Elements - Entry
        this.entryOverlay = document.getElementById('entry-overlay');
        this.btnCreate = document.getElementById('btn-create-session');
        this.btnContinue = document.getElementById('btn-continue-session');
        this.btnJoin = document.getElementById('btn-join-session');
        this.joinCodeInput = document.getElementById('join-code-input');
        this.joinPasswordInput = document.getElementById('join-password-input');

        // UI Elements - Lobby
        this.lobbyMain = document.getElementById('lobby-main');
        this.displaySessionName = document.getElementById('display-session-name');
        this.displaySessionId = document.getElementById('display-session-id');
        this.btnCopyId = document.getElementById('btn-copy-id');
        this.btnSave = document.getElementById('btn-save-session');
        this.btnExit = document.getElementById('btn-exit-lobby');
        this.chatMessages = document.getElementById('chat-messages');
        this.chatInput = document.getElementById('chat-input');
        this.btnSendChat = document.getElementById('btn-send-chat');

        // Master Controls
        this.masterControls = document.getElementById('master-controls');
        this.btnStartGame = document.getElementById('btn-start-game');
        this.btnSettings = document.getElementById('btn-settings');
        this.masterSettingsModal = document.getElementById('master-settings-modal');
        this.freeCategoryModal = document.getElementById('free-category-modal');
        this.freeCategoryGrid = document.getElementById('free-category-grid');
        this.freeCategoryClose = document.getElementById('free-category-close');
        this.freeCategorySkip = document.getElementById('free-category-skip');
        this.freeCategoryConfirm = document.getElementById('free-category-confirm');
        this.freeCategoryPrompted = false;
        this.selectedFreeCategory = null;

        this.masterProfileCache = {};

        // Seats
        this.seats = document.querySelectorAll('.seat');

        this.init();
    }

    getSessionHistoryKey() {
        return this.user?.uid ? `session_history_${this.user.uid}` : 'session_history';
    }

    loadSessionHistory() {
        try {
            const raw = localStorage.getItem(this.getSessionHistoryKey());
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    }

    saveSessionHistory(list) {
        try {
            localStorage.setItem(this.getSessionHistoryKey(), JSON.stringify(list));
        } catch {}
    }

    recordSessionHistory() {
        if (!this.user?.uid) return;
        if (!this.currentSessionId || !this.sessionData) return;

        const entry = {
            id: this.currentSessionId,
            name: this.sessionData.name || `Sessão ${this.currentSessionId}`,
            type: this.sessionData.type || (window.location.pathname.includes('guild') ? 'guild' : 'free'),
            status: this.sessionData.status || 'lobby',
            last_seen_at: Date.now()
        };

        const history = this.loadSessionHistory()
            .filter(e => e && e.id && e.id !== this.currentSessionId);

        history.unshift(entry);
        this.saveSessionHistory(history.slice(0, 15));
    }

    async openMiniProfile(uid) {
        if (!uid || !this.user?.uid) return;
        if (uid === this.user.uid) {
            window.location.href = `profile.html?uid=${uid}`;
            return;
        }

        try {
            let displayName = 'Aventureiro';
            let nickname = '';
            let avatarUrl = 'assets/default-avatar.png';

            try {
                const profileDoc = await getDoc(doc(db, 'profiles', uid));
                if (profileDoc.exists()) {
                    const data = profileDoc.data();
                    displayName = data.full_name || data.nickname || displayName;
                    nickname = data.nickname ? `@${data.nickname}` : nickname;
                    avatarUrl = data.avatar_url || avatarUrl;
                } else {
                    const playerData = Object.values(this.sessionData?.players || {}).find(p => p.uid === uid);
                    if (playerData) {
                        displayName = playerData.name || displayName;
                        avatarUrl = playerData.photo || avatarUrl;
                    } else if (this.sessionData?.master_id === uid) {
                        displayName = 'Mestre';
                    }
                }
            } catch (err) {
                const playerData = Object.values(this.sessionData?.players || {}).find(p => p.uid === uid);
                if (playerData) {
                    displayName = playerData.name || displayName;
                    avatarUrl = playerData.photo || avatarUrl;
                } else if (this.sessionData?.master_id === uid) {
                    displayName = 'Mestre';
                }
            }

            const friendshipId = [this.user.uid, uid].sort().join('_');
            let friendshipStatus = null;
            try {
                const friendshipDoc = await getDoc(doc(db, 'friendships', friendshipId));
                friendshipStatus = friendshipDoc.exists() ? friendshipDoc.data().status : null;
            } catch {}

            let modal = document.getElementById('mini-profile-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'mini-profile-modal';
                modal.className = 'modal-overlay';
                modal.innerHTML = `
                    <div class="modal-content mini-profile-content">
                        <button class="modal-x" style="top: 10px; right: 20px;">&times;</button>
                        <div class="modal-header">
                            <h2 class="title-cinzel">Perfil</h2>
                        </div>
                        <div class="modal-body">
                            <div class="mini-profile-top">
                                <div class="mini-profile-avatar" id="mini-profile-avatar"></div>
                                <div class="mini-profile-text">
                                    <div class="mini-profile-name" id="mini-profile-name"></div>
                                    <div class="mini-profile-nick" id="mini-profile-nick"></div>
                                </div>
                            </div>
                            <div class="mini-profile-actions">
                                <button class="btn-primary" id="mini-profile-add-friend">Adicionar Amigo</button>
                                <button class="btn-secondary" id="mini-profile-msg">Mandar Mensagem</button>
                                <button class="btn-secondary" id="mini-profile-view">Ver Perfil</button>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
            }

            const avatarEl = document.getElementById('mini-profile-avatar');
            const nameEl = document.getElementById('mini-profile-name');
            const nickEl = document.getElementById('mini-profile-nick');
            if (avatarEl) avatarEl.style.backgroundImage = `url('${avatarUrl}')`;
            if (nameEl) nameEl.textContent = displayName;
            if (nickEl) nickEl.textContent = nickname || '';

            const closeBtn = modal.querySelector('.modal-x');
            if (closeBtn) closeBtn.onclick = () => this.closeAllModals();
            modal.onclick = (e) => {
                if (e.target === modal) this.closeAllModals();
            };

            const btnAdd = document.getElementById('mini-profile-add-friend');
            const btnMsg = document.getElementById('mini-profile-msg');
            const btnView = document.getElementById('mini-profile-view');

            if (btnAdd) {
                btnAdd.disabled = !!friendshipStatus;
                btnAdd.textContent = friendshipStatus === 'accepted' ? 'Amigos' : (friendshipStatus === 'pending' ? 'Pendente' : 'Adicionar Amigo');
                btnAdd.onclick = async () => {
                    if (btnAdd.disabled) return;
                    btnAdd.disabled = true;
                    btnAdd.textContent = 'Enviando...';
                    try {
                        const again = await getDoc(doc(db, 'friendships', friendshipId));
                        if (again.exists()) {
                            btnAdd.textContent = again.data().status === 'accepted' ? 'Amigos' : 'Pendente';
                            return;
                        }
                        await setDoc(doc(db, 'friendships', friendshipId), {
                            participants: [this.user.uid, uid],
                            sender_id: this.user.uid,
                            receiver_id: uid,
                            status: 'pending',
                            created_at: serverTimestamp()
                        });
                        btnAdd.textContent = 'Pendente';
                    } catch (err) {
                        console.error(err);
                        btnAdd.disabled = false;
                        btnAdd.textContent = 'Adicionar Amigo';
                    }
                };
            }

            if (btnMsg) {
                btnMsg.onclick = () => {
                    window.location.href = `community.html?chat=${uid}`;
                };
            }

            if (btnView) {
                btnView.onclick = () => {
                    window.location.href = `profile.html?uid=${uid}`;
                };
            }

            this.openModal('mini-profile-modal');
        } catch (err) {
            console.error(err);
            alert("Erro ao abrir o perfil.");
        }
    }

    async init() {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                this.user = user;
                window.lobby = this; // Global reference for onclick handlers
                
                // Verificar se há um ID de join na URL
                const urlParams = new URLSearchParams(window.location.search);
                const joinId = urlParams.get('join') || urlParams.get('id');
                if (joinId) {
                    let autofillPassword = '';
                    let shouldAutoJoin = true;
                    try {
                        const raw = sessionStorage.getItem('lobby_autofill_v1');
                        if (raw) {
                            const data = JSON.parse(raw);
                            if (data && data.code && String(data.code).toUpperCase() === String(joinId).toUpperCase()) {
                                autofillPassword = data.password || '';
                                shouldAutoJoin = data.autoJoin !== false;
                                if (this.joinCodeInput) this.joinCodeInput.value = data.code;
                                if (this.joinPasswordInput) this.joinPasswordInput.value = data.password || '';
                                sessionStorage.removeItem('lobby_autofill_v1');
                            }
                        }
                    } catch {}

                    if (shouldAutoJoin) this.joinSession(joinId, autofillPassword);
                } else {
                    this.checkActiveSession();
                }
                
                this.setupEventListeners();
            } else {
                window.location.href = 'index.html';
            }
        });
    }

    setupEventListeners() {
        this.btnCreate.onclick = () => this.createSession();
        this.btnContinue.onclick = () => this.continueSession();
        this.btnJoin.onclick = () => this.joinSession(this.joinCodeInput.value, this.joinPasswordInput.value);
        
        this.btnCopyId.onclick = () => {
            navigator.clipboard.writeText(this.currentSessionId);
            alert('ID da sessão copiado!');
        };

        if (this.btnSave) {
            this.btnSave.onclick = () => this.saveSession();
        }

        this.btnExit.onclick = () => this.leaveSession();

        const btnReturnSession = document.getElementById('btn-return-session');
        if (btnReturnSession) {
            btnReturnSession.onclick = () => {
                if (this.currentSessionId) {
                    window.location.href = `session.html?id=${this.currentSessionId}`;
                }
            };
        }

        this.btnSendChat.onclick = () => this.sendChatMessage();
        this.chatInput.onkeypress = (e) => { if (e.key === 'Enter') this.sendChatMessage(); };

        // Fechar overlay clicando fora (Saguão de Entrada) e voltar pro Menu
        const entryOverlay = document.getElementById('entry-overlay');
        if (entryOverlay) {
            entryOverlay.addEventListener('click', (e) => {
                if (e.target === entryOverlay) {
                    window.location.href = 'dashboard.html';
                }
            });
        }

        // Seat Clicks
        this.seats.forEach(seat => {
            seat.onclick = () => this.handleSeatClick(seat);
        });

        // Master Settings
        if (this.btnSettings) {
            this.btnSettings.onclick = () => {
                console.log("Configurações clicado");
                if (!this.sessionData || this.sessionData.status === 'saved') return;
                document.getElementById('select-bg-type').value = this.sessionData.background_type || 'classic';
                document.getElementById('select-privacy').value = this.sessionData.is_private ? 'private' : 'public';
                document.getElementById('input-room-password').value = this.sessionData.password || '';
                this.openModal('master-settings-modal');
            };
        }

        const btnSaveSettings = document.getElementById('btn-save-settings');
        if (btnSaveSettings) {
            btnSaveSettings.onclick = () => this.saveMasterSettings();
        }

        // Map Selection
        const btnChooseMap = document.getElementById('btn-choose-map');
        if (btnChooseMap) {
            btnChooseMap.onclick = () => {
                console.log("Escolher Mapa clicado");
                if (!this.sessionData || this.sessionData.status === 'saved') return;
                this.openMapSelection();
            };
        }

        // Start Game / Resume
        if (this.btnStartGame) {
            this.btnStartGame.onclick = async () => {
                console.log("Jogar/Retomar clicado");
                if (!this.sessionData) return;

                if (this.sessionData.status === 'saved') {
                    // Lógica de Retomar para o Lobby antes de jogar
                    await updateDoc(doc(db, "sessions", this.currentSessionId), { status: 'lobby' });
                    return;
                }

                // Lógica de Jogar
                if (confirm("Deseja iniciar a partida?")) {
                    await updateDoc(doc(db, "sessions", this.currentSessionId), {
                        status: 'playing'
                    });
                    
                    await addDoc(collection(db, "sessions", this.currentSessionId, "messages"), {
                        uid: "system",
                        name: "SISTEMA",
                        text: "⚔️ O Mestre iniciou a sessão! Preparem-se.",
                        timestamp: serverTimestamp()
                    });

                    // O redirecionamento acontece no listener quando o status muda para 'playing'
                }
            };
        }

        // Master specific: Add Enemy
        const btnAddEnemy = document.getElementById('btn-add-enemy');
        if (btnAddEnemy) {
            btnAddEnemy.onclick = () => {
                console.log("Adicionar Inimigo clicado");
                if (!this.sessionData || this.sessionData.status === 'saved') return;
                this.openEnemySelection();
            };
        }

        const btnConfirmEnemies = document.getElementById('btn-confirm-enemies');
        if (btnConfirmEnemies) {
            btnConfirmEnemies.onclick = () => this.confirmEnemies();
        }

        // Map Selection Tabs
        document.querySelectorAll('.map-tab-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.map-tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.map-tab-content').forEach(c => c.style.display = 'none');
                btn.classList.add('active');
                const target = document.getElementById(`map-${btn.dataset.tab}-content`);
                if (target) target.style.display = 'block';
                
                if (btn.dataset.tab === 'community') this.loadCommunityMaps();
            };
        });

        // Enemy Search
        const enemySearch = document.getElementById('enemy-search');
        if (enemySearch) {
            enemySearch.oninput = (e) => this.filterEnemies(e.target.value);
        }

        const btnApplyMapLink = document.getElementById('btn-apply-map-link');
        if (btnApplyMapLink || btnChooseMap) {
            btnApplyMapLink.onclick = () => {
                const url = document.getElementById('input-map-url').value;
                if (url) this.selectMap(url);
            };
            btnChooseMap.onclick = () => {
                const url = document.getElementById('input-map-url').value;
                if (url) this.selectMap(url);
            };
        }

        // Close Modals
        document.querySelectorAll('.modal-close, .modal-x').forEach(btn => {
            btn.onclick = () => this.closeAllModals();
        });

        // Click outside modal to close
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.onclick = (e) => {
                if (e.target === overlay) this.closeAllModals();
            };
        });

        this.bindFreeCategoryModal();

        // Responsividade em tempo real para o background
        window.addEventListener('resize', () => {
            if (this.sessionData) this.updateLobbyUI();
        });

        // Escuta mensagens do iframe da ficha (autosave)
        window.addEventListener('message', (event) => {
            if (event.data?.type === 'sheet-changed' && this.editingSheetId) {
                this.saveEditingSheet(event.data.data);
            }
        });
    }

    async openCharacterSheet(sheetId, ownerId) {
        const modal = document.getElementById('character-sheet-modal');
        const iframe = document.getElementById('sheet-iframe');
        const title = document.getElementById('sheet-modal-title');
        
        if (!modal || !iframe) return;

        this.editingSheetId = sheetId;
        this.editingSheetOwnerId = ownerId;
        this.openModal('character-sheet-modal');

        try {
            const sheetRef = doc(db, 'sheets', sheetId);
            const sheetDoc = await getDoc(sheetRef);

            if (!sheetDoc.exists()) {
                alert('Ficha não encontrada.');
                this.closeAllModals();
                return;
            }

            const sheet = sheetDoc.data();
            const template = sheet.template || 'free';
            title.textContent = `Ficha: ${sheet.name || 'Personagem'}`;

            const isDnd = template === 'dnd' || !!sheet.data?.nomePersonagem;
            const isReadonly = ownerId !== this.user.uid;
            if (isDnd) {
                iframe.src = `ficha-dnd.html?id=${sheetId}&view=iframe${isReadonly ? '&readonly=1' : ''}`;
                return;
            }

            window.open(`${isReadonly ? 'sheet-editor.html' : 'sheet-editor.html'}?id=${sheetId}`, '_blank');
            this.closeAllModals();
        } catch (error) {
            console.error("Erro ao abrir ficha:", error);
            alert("Erro ao carregar os dados da ficha.");
        }
    }

    isFreeCategorySelectionRequired() {
        return this.sessionData?.type === 'free' && this.isMaster && !this.sessionData?.free_category && this.sessionData?.status !== 'saved';
    }

    forceFreeCategorySelection() {
        if (!this.freeCategoryGrid) return;
        const cards = Array.from(this.freeCategoryGrid.querySelectorAll('.free-category-card'));
        if (!cards.length) return;

        const fallbackValue = String(cards[0].dataset.value || '').trim();
        const value = String(this.selectedFreeCategory || fallbackValue || '').trim();
        if (!value) return;

        this.selectedFreeCategory = value;
        cards.forEach(c => {
            c.classList.toggle('selected', String(c.dataset.value || '').trim() === value);
        });

        if (this.freeCategoryConfirm) this.freeCategoryConfirm.disabled = false;

        const required = this.isFreeCategorySelectionRequired();
        if (this.freeCategoryClose) {
            this.freeCategoryClose.disabled = required;
            this.freeCategoryClose.style.visibility = required ? 'hidden' : '';
        }
        if (this.freeCategorySkip) {
            this.freeCategorySkip.disabled = required;
            this.freeCategorySkip.style.display = required ? 'none' : '';
        }
    }

    bindFreeCategoryModal() {
        if (this.freeCategoryGrid) {
            this.freeCategoryGrid.onclick = (e) => {
                const btn = e.target.closest('.free-category-card');
                if (!btn) return;

                const value = String(btn.dataset.value || '').trim();
                if (!value) return;

                e.stopPropagation();

                this.freeCategoryGrid.querySelectorAll('.free-category-card').forEach(c => c.classList.remove('selected'));
                btn.classList.add('selected');
                this.selectedFreeCategory = value;
                if (this.freeCategoryConfirm) this.freeCategoryConfirm.disabled = false;
            };
        }

        if (this.freeCategoryConfirm) {
            this.freeCategoryConfirm.onclick = async (e) => {
                e.stopPropagation();

                if (!this.currentSessionId || !this.isMaster) return;
                const value = String(this.selectedFreeCategory || '').trim();
                if (!value) return;

                try {
                    const currentEditor = this.sessionData?.map_editor || {};
                    const nextEditor = {
                        ...currentEditor,
                        brightness: Number.isFinite(currentEditor.brightness) ? currentEditor.brightness : 1,
                        assets_visible: currentEditor.assets_visible !== false,
                        map_opacity: Number.isFinite(currentEditor.map_opacity) ? currentEditor.map_opacity : 0,
                        floor: {
                            ...(currentEditor.floor || {}),
                            preset: value,
                            visible: true,
                            opacity: 1
                        }
                    };

                    await updateDoc(doc(db, "sessions", this.currentSessionId), {
                        free_category: value,
                        map_editor: nextEditor
                    });

                    this.freeCategoryPrompted = true;
                    this.closeAllModals();
                } catch (err) {
                    console.error(err);
                }
            };
        }

        if (this.freeCategoryClose) {
            this.freeCategoryClose.onclick = (e) => {
                e.stopPropagation();
                if (this.isFreeCategorySelectionRequired()) return;
                this.freeCategoryPrompted = true;
                this.closeAllModals();
            };
        }

        if (this.freeCategorySkip) {
            this.freeCategorySkip.onclick = (e) => {
                e.stopPropagation();
                if (this.isFreeCategorySelectionRequired()) return;
                this.freeCategoryPrompted = true;
                this.closeAllModals();
            };
        }

        if (this.freeCategoryModal) {
            this.freeCategoryModal.onclick = (e) => {
                if (e.target !== this.freeCategoryModal) return;
                if (this.isFreeCategorySelectionRequired()) return;
                this.freeCategoryPrompted = true;
                this.closeAllModals();
            };
        }
    }

    async saveEditingSheet(data) {
        // Apenas o dono da ficha pode salvar alterações
        if (this.user.uid !== this.editingSheetOwnerId) return;

        const statusEl = document.getElementById('sheet-save-status');
        if (statusEl) statusEl.textContent = 'Salvando...';

        try {
            const sheetRef = doc(db, 'sheets', this.editingSheetId);
            await updateDoc(sheetRef, {
                data: data,
                updated_at: serverTimestamp()
            });
            if (statusEl) statusEl.textContent = 'Salvo';
        } catch (error) {
            console.error("Erro ao salvar ficha:", error);
            if (statusEl) statusEl.textContent = 'Erro ao salvar';
        }
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = '';
            modal.classList.add('active');
            document.body.style.overflow = 'hidden'; // Previne scroll no fundo
        }
    }

    closeAllModals() {
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.classList.remove('active');
            modal.style.display = '';
        });
        document.body.style.overflow = '';
    }

    async saveMasterSettings() {
        const bgType = document.getElementById('select-bg-type').value;
        const privacy = document.getElementById('select-privacy').value;
        const password = document.getElementById('input-room-password').value;

        await updateDoc(doc(db, "sessions", this.currentSessionId), {
            background_type: bgType,
            is_private: privacy === 'private',
            password: password
        });

        this.closeAllModals();
        alert('Configurações salvas!');
    }

    async openMapSelection() {
        const modal = document.getElementById('map-selection-modal');
        const siteGrid = document.getElementById('site-maps-grid');
        const communityGrid = document.getElementById('community-maps-grid');
        
        if (!modal) {
            console.error("Modal de seleção de mapa não encontrado!");
            return;
        }

        this.openModal('map-selection-modal');

        // Reset dos conteúdos se as grids existirem
        if (siteGrid) siteGrid.innerHTML = '<div class="session-loading"><i class="fas fa-spinner fa-spin"></i></div>';
        if (communityGrid) communityGrid.innerHTML = '<div class="session-loading"><i class="fas fa-spinner fa-spin"></i></div>';

        // 1. Mapas Oficiais (Site) sem restrições
        const siteMaps = [
            { name: 'Caverna Obscura', description: 'Um local úmido e perigoso nas profundezas.', url: 'https://i.postimg.cc/SRbSV4LR/Escudo-Elara.png' },
            { name: 'Vulcão Ativo', description: 'O calor é insuportável perto da lava.', url: 'https://i.postimg.cc/BZpYz0V9/Escudo3.png' },
            { name: 'Estrela Azul', description: 'Um local úmido e perigoso nas profundezas.', url: 'https://i.postimg.cc/h4syYB3p/Escudo2.png' },
        ];

        if (siteGrid) {
            siteGrid.innerHTML = `
                <div class="map-card add-map-card" onclick="window.lobby.openAddMapLink()">
                    <div class="add-icon"><i class="fas fa-plus"></i></div>
                    <div class="map-info">
                        <strong>Adicionar Imagem +</strong>
                        <p>Use um link externo</p>
                    </div>
                </div>
            ` + siteMaps.map(map => `
                <div class="map-card" onclick="window.lobby.selectMap('${map.url}')">
                    <img src="${map.url}" onerror="this.onerror=null; this.src='assets/maps/florest.png'">
                    <div class="map-info">
                        <strong>${map.name}</strong>
                        <p>${map.description}</p>
                    </div>
                </div>
            `).join('');
        }

        // 2. Mapas da Comunidade
        this.loadCommunityMaps();
    }

    openAddMapLink() {
        // Ativa a tab de link e foca no input
        const linkTabBtn = document.querySelector('.map-tab-btn[data-tab="link"]');
        if (linkTabBtn) linkTabBtn.click();
        const input = document.getElementById('input-map-url');
        if (input) input.focus();
    }

    async selectMap(url) {
        if (this.sessionData.status === 'saved') return;
        try {
            await updateDoc(doc(db, "sessions", this.currentSessionId), {
                map_url: url,
                map_img: url
            });
            this.closeAllModals();
            console.log("Mapa atualizado para:", url);
        } catch (error) {
            console.error("Erro ao atualizar mapa:", error);
            alert("Erro ao selecionar mapa.");
        }
    }

    async loadCommunityMaps() {
        const grid = document.getElementById('community-maps-grid');
        if (!grid) return;
        grid.innerHTML = '<p>Buscando mapas da comunidade...</p>';

        try {
            const q = query(collection(db, "community_maps"), orderBy("created_at", "desc"), limit(12));
            const snapshot = await getDocs(q);
            
            grid.innerHTML = '';
            if (snapshot.empty) {
                grid.innerHTML = '<p>Nenhum mapa compartilhado pela comunidade ainda.</p>';
                return;
            }

            snapshot.forEach(doc => {
                const map = doc.data();
                const card = document.createElement('div');
                card.className = 'map-card';
                card.innerHTML = `
                    <img src="${map.url}" onerror="this.onerror=null; this.src='assets/Jogar/História/Fundos/S3.png'">
                    <div class="map-info">
                        <strong>${map.name || 'Mapa da Comunidade'}</strong>
                        <p>${map.description || 'Compartilhado por um aventureiro.'}</p>
                    </div>
                `;
                card.onclick = () => this.selectMap(map.url);
                grid.appendChild(card);
            });
        } catch (error) {
            console.error("Erro ao carregar mapas da comunidade:", error);
            grid.innerHTML = '<p>Erro ao carregar mapas.</p>';
        }
    }

    // --- Enemy Selection ---
    async openEnemySelection() {
        if (this.sessionData.status === 'saved') return; // Bloqueia se pausado
        const modal = document.getElementById('enemy-selection-modal');
        this.openModal('enemy-selection-modal');
        
        // Carrega inimigos selecionados da sessão
        this.selectedEnemies = this.sessionData.enemies || [];
        
        // Carrega todos os inimigos se ainda não estiverem em cache
        if (this.allEnemies.length === 0) {
            try {
                const q = query(collection(db, "enemies"), orderBy("name"));
                const snapshot = await getDocs(q);
                const communityEnemies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // Combina padrões com comunidade
                this.allEnemies = [...DEFAULT_ENEMIES, ...communityEnemies];
            } catch (error) {
                console.error("Erro ao buscar inimigos do banco:", error);
                this.allEnemies = [...DEFAULT_ENEMIES]; // Usa pelo menos os padrões
            }
        }

        this.renderEnemiesGrid();
        this.updateSelectedEnemiesUI();
    }

    renderEnemiesGrid(filterTerm = '') {
        const grid = document.getElementById('enemies-selection-grid');
        if (!grid) return;

        grid.innerHTML = '';
        const term = filterTerm.toLowerCase();

        this.allEnemies.forEach(enemy => {
            if (term && !enemy.name.toLowerCase().includes(term)) return;

            const isSelected = this.selectedEnemies.some(e => e.id === enemy.id);
            const card = document.createElement('div');
            card.className = `enemy-select-card ${isSelected ? 'selected' : ''}`;
            card.innerHTML = `
                <img src="${enemy.image_url || 'assets/default-enemy.png'}" onerror="this.onerror=null; this.src='assets/default-enemy.png'">
                <div class="enemy-info">
                    <h4>${enemy.name}</h4>
                    <span>Nível ${enemy.level || 1} | ${enemy.type || 'Monstro'}</span>
                </div>
            `;
            card.onclick = () => this.toggleEnemySelection(enemy.id, enemy);
            grid.appendChild(card);
        });
    }

    toggleEnemySelection(id, data) {
        const index = this.selectedEnemies.findIndex(e => e.id === id);
        if (index > -1) {
            this.selectedEnemies.splice(index, 1);
        } else {
            this.selectedEnemies.push({ id, ...data });
        }
        
        this.updateSelectedEnemiesUI();
        this.renderEnemiesGrid(document.getElementById('enemy-search')?.value || '');
    }

    updateSelectedEnemiesUI() {
        const list = document.getElementById('selected-enemies-list');
        const count = document.getElementById('selected-enemies-count');
        if (!list || !count) return;
        
        count.textContent = this.selectedEnemies.length;
        list.innerHTML = this.selectedEnemies.map(e => `
            <div class="selected-enemy-tag">
                ${e.name} <i class="fas fa-times" onclick="window.lobby.toggleEnemySelection('${e.id}')"></i>
            </div>
        `).join('');
    }

    async filterEnemies(term) {
        this.renderEnemiesGrid(term);
    }

    async confirmEnemies() {
        await updateDoc(doc(db, "sessions", this.currentSessionId), {
            enemies: this.selectedEnemies
        });
        this.closeAllModals();
        alert('Inimigos confirmados para a sessão!');
    }

    async checkActiveSession() {
        const lastSessionId = localStorage.getItem('last_active_session');
        if (lastSessionId) {
            const sessionDoc = await getDoc(doc(db, "sessions", lastSessionId));
            if (sessionDoc.exists()) {
                this.btnContinue.style.display = 'block';
                this.btnContinue.dataset.sessionId = lastSessionId;
            } else {
                localStorage.removeItem('last_active_session');
            }
        }
    }

    async saveSession() {
        if (!this.isMaster) return;

        const originalText = this.btnSave.innerHTML;
        this.btnSave.disabled = true;
        this.btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        try {
            const saveRef = doc(db, "sessions", this.currentSessionId);
            
            // Coletamos o estado atual
            const currentPlayers = this.sessionData.players || {};
            
            await updateDoc(saveRef, {
                last_saved: serverTimestamp(),
                players: currentPlayers,
                enemies: this.sessionData.enemies || [],
                map_url: this.sessionData.map_url || '',
                background_type: this.sessionData.background_type || 'classic',
                enemy_scores: this.sessionData.enemy_scores || {},
                status: 'saved' // Novo status para indicar que está pausado
            });

            // Notifica no chat que a sessão foi salva
            await addDoc(collection(db, "sessions", this.currentSessionId, "messages"), {
                uid: "system",
                name: "SISTEMA",
                text: "💾 O Mestre salvou o progresso. A sessão está pausada.",
                timestamp: serverTimestamp()
            });

        } catch (error) {
            console.error("Erro ao salvar sessão:", error);
            alert("Erro ao salvar o progresso.");
        } finally {
            this.btnSave.disabled = false;
            this.btnSave.innerHTML = originalText;
        }
    }

    async createSession() {
        const sessionId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const sessionType = window.location.pathname.includes('guild') ? 'guild' : 'free';
        
        const newSession = {
            id: sessionId,
            name: `Sessão de ${this.user.displayName || 'Aventureiro'}`,
            type: sessionType,
            master_id: this.user.uid,
            status: 'lobby',
            created_at: serverTimestamp(),
            players: {},
            is_private: false,
            password: '',
            background_type: 'classic',
            free_category: '',
            map_editor: { brightness: 1, assets_visible: true, map_opacity: 0, floor: { preset: 'classic_hatching', visible: true, opacity: 1 } },
            map_assets: [],
            enemy_scores: {}, // Pontuação e HP atual dos inimigos
            last_saved: serverTimestamp()
        };

        try {
            await setDoc(doc(db, "sessions", sessionId), newSession);
            this.enterLobby(sessionId);
        } catch (error) {
            console.error("Erro detalhado ao criar sessão:", error);
            if (error.code === 'permission-denied') {
                alert("Erro: Permissão negada no banco de dados. Verifique as regras do Firestore.");
            } else {
                alert(`Erro ao criar sessão: ${error.message}`);
            }
        }
    }

    async continueSession() {
        const sessionId = this.btnContinue.dataset.sessionId;
        // Sempre entra no saguão (lobby) ao invés de ir direto para a session.html
        this.enterLobby(sessionId);
    }

    async joinSession(code, password = '') {
        if (!code) return alert("Insira o código da sala.");
        
        const sessionDoc = await getDoc(doc(db, "sessions", code.toUpperCase()));
        if (!sessionDoc.exists()) {
            return alert("Sessão não encontrada.");
        }

        const data = sessionDoc.data();
        if (data.password && data.password !== password) {
            return alert("Senha incorreta.");
        }

        this.enterLobby(code.toUpperCase());
    }

    enterLobby(sessionId) {
        this.currentSessionId = sessionId;
        localStorage.setItem('last_active_session', sessionId);
        
        // Atualiza a URL sem recarregar para manter o ID em caso de refresh
        const newUrl = `${window.location.origin}${window.location.pathname}?join=${sessionId}`;
        window.history.replaceState({ path: newUrl }, '', newUrl);
        
        this.entryOverlay.style.display = 'none';
        this.lobbyMain.style.display = 'flex';
        this.setupChatToggle();
        
        this.listenToSession();
        this.listenToChat();
    }

    setupChatToggle() {
        const chatSidebar = document.querySelector('.chat-sidebar');
        if (!chatSidebar) return;

        const chatHeader = chatSidebar.querySelector('.chat-header');
        const btnToggle = document.getElementById('btn-toggle-chat') || chatSidebar.querySelector('.chat-toggle-btn');
        if (!btnToggle) return;

        const key = this.currentSessionId ? `lobby_chat_state_${this.currentSessionId}` : 'lobby_chat_state';

        const isMobile = () => window.innerWidth <= 768;

        const applyState = (state) => {
            chatSidebar.classList.remove('is-collapsed', 'is-expanded');
            if (isMobile()) {
                chatSidebar.classList.add(state === 'expanded' ? 'is-expanded' : 'is-collapsed');
            } else {
                if (state === 'collapsed') chatSidebar.classList.add('is-collapsed');
            }
        };

        const getState = () => {
            const raw = localStorage.getItem(key);
            if (raw === 'collapsed' || raw === 'expanded') return raw;
            return isMobile() ? 'collapsed' : 'expanded';
        };

        const setState = (state) => {
            localStorage.setItem(key, state);
            applyState(state);
        };

        const toggle = () => {
            const state = getState();
            if (isMobile()) {
                setState(state === 'expanded' ? 'collapsed' : 'expanded');
            } else {
                setState(state === 'collapsed' ? 'expanded' : 'collapsed');
            }
        };

        applyState(getState());

        btnToggle.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle();
        };

        if (chatHeader) {
            chatHeader.onclick = (e) => {
                if (e.target.closest('button')) return;
                if (!isMobile()) return;
                toggle();
            };
        }

        window.addEventListener('resize', () => applyState(getState()));
    }

    listenToSession() {
        if (this.unsubscribeSession) this.unsubscribeSession();
        
        this.unsubscribeSession = onSnapshot(doc(db, "sessions", this.currentSessionId), (docSnap) => {
            if (!docSnap.exists()) {
                window.location.href = 'index.html';
                return;
            }

            this.sessionData = docSnap.data();
            if (this.sessionData.status === 'ended') {
                window.location.href = 'index.html';
                return;
            }
            this.isMaster = this.sessionData.master_id === this.user.uid;
            this.selectedEnemies = this.sessionData.enemies || [];
            this.enemyScores = this.sessionData.enemy_scores || {}; // Sincroniza scores
            this.updateLobbyUI();
            this.recordSessionHistory();

            // Controla botão de voltar para sessão
            const btnReturnSession = document.getElementById('btn-return-session');
            if (btnReturnSession) {
                // Se a sessão já foi "startada" (tem mapa etc), permite voltar
                if (this.sessionData.status === 'active' || this.sessionData.map_url) {
                    btnReturnSession.style.display = 'inline-flex';
                } else {
                    btnReturnSession.style.display = 'none';
                }
            }
        });
    }

    updateLobbyUI() {
        if (!this.sessionData) return;
        
        this.displaySessionName.textContent = this.sessionData.name;
        this.displaySessionId.textContent = `ID: ${this.currentSessionId}`;
        if (this.btnExit) {
            this.btnExit.innerHTML = `<i class="fas fa-sign-out-alt"></i> ${this.isMaster ? 'Encerrar Sessão' : 'Sair'}`;
        }
        
        // Verifica se a sessão está pausada (salva)
        if (this.sessionData.status === 'saved') {
            this.lobbyMain.classList.add('session-paused');
            if (this.btnStartGame) this.btnStartGame.disabled = true;
        } else {
            this.lobbyMain.classList.remove('session-paused');
        }

        // Update Background
        const isMobile = window.innerWidth <= 768;
        const bgMap = {
            classic: {
                desktop: 'assets/bg/lobby-classic.png',
                mobile: 'assets/bg/lobby-classic-mobile.jpg'
            },
            dark: {
                desktop: 'assets/bg/lobby-dark.png',
                mobile: 'assets/bg/lobby-dark-mobile.jpg'
            },
            cyber: {
                desktop: 'assets/bg/lobby-cyber.png',
                mobile: 'assets/bg/lobby-cyber-mobile.jpg'
            },
            tavern: {
                desktop: 'assets/bg/lobby-tavern.jpeg',
                mobile: 'assets/bg/lobby-tavern-mobile.jpg'
            }
        };

        const currentBg = bgMap[this.sessionData.background_type] || bgMap.classic;
        let bgUrl = isMobile ? currentBg.mobile : currentBg.desktop;
        const theme = this.sessionData.background_type || 'classic';
        if (this.lobbyMain) this.lobbyMain.dataset.theme = theme;
        
        // Aplicar o fundo
        this.lobbyMain.style.backgroundImage = `url(${bgUrl})`;
        this.lobbyMain.style.backgroundColor = 'var(--lobby-bg)';

        // Tentar carregar a imagem mobile, se falhar ou não existir, usa a desktop
        if (isMobile) {
            const img = new Image();
            img.src = bgUrl;
            img.onerror = () => {
                this.lobbyMain.style.backgroundImage = `url(${currentBg.desktop})`;
            };
        }

        const img = new Image();
        img.src = bgUrl;
        img.onerror = () => {
            this.lobbyMain.style.backgroundImage = 'none';
        };

        // Update Map Display
        const mapPlaceholder = document.querySelector('.map-placeholder');
        const mapImg = document.getElementById('current-map-img');
        const btnChooseMap = document.getElementById('btn-choose-map');

        if (this.sessionData.map_url) {
            console.log("Forçando exibição do mapa:", this.sessionData.map_url);
            if (mapImg) {
                mapImg.src = this.sessionData.map_url;
                mapImg.onerror = () => {
                    mapImg.onerror = null;
                    mapImg.src = '';
                };
                mapImg.style.display = 'flex'; 
                mapImg.classList.add('active');
            }
            if (mapPlaceholder) mapPlaceholder.style.display = 'none';
        } else {
            if (mapImg) {
                mapImg.style.display = 'none';
                mapImg.classList.remove('active');
            }
            if (mapPlaceholder) mapPlaceholder.style.display = 'flex';
        }

        // Visibilidade do botão de mapa (Mestre e não pausado)
        if (btnChooseMap) {
            if (this.isMaster && this.sessionData.status !== 'saved') {
                btnChooseMap.style.display = 'flex';
                btnChooseMap.style.cursor = 'pointer';
                // Garante que o clique funcione
                btnChooseMap.onclick = (e) => {
                    e.stopPropagation();
                    this.openMapSelection();
                };
            } else {
                btnChooseMap.style.display = 'none';
            }
        }

        // Update Master Controls
        if (this.masterControls) {
            this.masterControls.style.display = this.isMaster ? 'flex' : 'none';
        }
        
        if (this.btnSave) {
            this.btnSave.style.display = (this.isMaster && this.sessionData.status !== 'saved') ? 'block' : 'none';
        }

        // Botão de "Retomar" para o Mestre se estiver pausado
        if (this.btnStartGame) {
            if (this.isMaster && this.sessionData.status === 'saved') {
                this.btnStartGame.disabled = false;
                this.btnStartGame.textContent = "RETOMAR";
            } else {
                this.btnStartGame.textContent = "JOGAR";
            }
        }

        // Update Seats
        this.updateSeats();

        // Check if everyone is ready
        if (this.sessionData.status !== 'saved') {
            this.checkReadyStatus();
        }
        
        // Se a sessão já começou (playing), inicia animação e redireciona
        if (this.sessionData.status === 'playing') {
            const pokerTable = document.querySelector('.poker-table');
            if (pokerTable) {
                pokerTable.classList.add('game-active');
                // Pequeno atraso para a animação ser vista antes do redirecionamento
                setTimeout(() => this.redirectToGame(), 1500);
            } else {
                this.redirectToGame();
            }
        }

        if (this.isFreeCategorySelectionRequired() && !this.freeCategoryPrompted) {
            this.openModal('free-category-modal');
            this.forceFreeCategorySelection();
        }
    }

    redirectToGame() {
        // Evita múltiplos redirecionamentos
        if (this.isRedirecting) return;
        
        if (!this.currentSessionId) {
            console.error("Erro: Tentativa de redirecionamento sem Session ID.");
            return;
        }

        this.isRedirecting = true;
        
        // Redireciona para a página de jogo real (session.html)
        window.location.href = `session.html?id=${this.currentSessionId}`;
    }

    updateSeats() {
        // Master Seat
        const masterSeat = document.getElementById('seat-master');
        
        const applyMasterPhoto = async (uid, isCurrentUser) => {
            const avatarEl = masterSeat.querySelector('.seat-avatar');
            if (this.masterProfileCache[uid]) {
                avatarEl.style.backgroundImage = `url(${this.masterProfileCache[uid]})`;
            } else if (isCurrentUser && this.user.photoURL) {
                avatarEl.style.backgroundImage = `url(${this.user.photoURL})`;
            } else {
                avatarEl.style.backgroundImage = 'none';
                try {
                    const docSnap = await getDoc(doc(db, 'profiles', uid));
                    if (docSnap.exists() && docSnap.data().avatar_url) {
                        this.masterProfileCache[uid] = docSnap.data().avatar_url;
                        avatarEl.style.backgroundImage = `url(${this.masterProfileCache[uid]})`;
                    } else {
                        this.masterProfileCache[uid] = 'assets/default-avatar.png';
                        avatarEl.style.backgroundImage = `url(${this.masterProfileCache[uid]})`;
                    }
                } catch (e) {
                    console.error("Erro ao carregar foto do mestre:", e);
                    avatarEl.style.backgroundImage = `url(assets/default-avatar.png)`;
                }
            }
        };

        if (this.sessionData.master_id === this.user.uid) {
            masterSeat.querySelector('.seat-name').textContent = "Você (Mestre)";
            applyMasterPhoto(this.user.uid, true);
            masterSeat.classList.add('occupied');
            this.applyProfileBorder(masterSeat.querySelector('.seat-avatar'), this.user.uid);
            const masterAvatar = masterSeat.querySelector('.seat-avatar');
            if (masterAvatar) {
                masterAvatar.onclick = (e) => {
                    e.stopPropagation();
                    this.openMiniProfile(this.user.uid);
                };
            }
        } else if (this.sessionData.master_id) {
            masterSeat.querySelector('.seat-name').textContent = "Mestre";
            applyMasterPhoto(this.sessionData.master_id, false);
            masterSeat.classList.add('occupied');
            this.applyProfileBorder(masterSeat.querySelector('.seat-avatar'), this.sessionData.master_id);
            const masterAvatar = masterSeat.querySelector('.seat-avatar');
            if (masterAvatar) {
                masterAvatar.onclick = (e) => {
                    e.stopPropagation();
                    this.openMiniProfile(this.sessionData.master_id);
                };
            }
        } else {
            masterSeat.querySelector('.seat-name').textContent = "Aguardando Mestre";
            masterSeat.classList.remove('occupied');
            masterSeat.querySelector('.seat-avatar').style.backgroundImage = 'none';
            masterSeat.querySelector('.seat-avatar').style.border = '';
            const masterAvatar = masterSeat.querySelector('.seat-avatar');
            if (masterAvatar) masterAvatar.onclick = null;
        }

        // Player Seats
        for (let i = 0; i < 4; i++) {
            const seatEl = document.getElementById(`seat-${i}`);
            if (!seatEl) continue;

            const playerData = Object.values(this.sessionData.players || {}).find(p => p.seat === i);

            if (playerData) {
                seatEl.classList.add('occupied');
                seatEl.querySelector('.seat-name').textContent = playerData.name;
                const avatar = seatEl.querySelector('.seat-avatar');
                avatar.style.backgroundImage = `url(${playerData.photo || 'assets/default-avatar.png'})`;
                avatar.innerHTML = ''; // Limpa o ícone de plus
                seatEl.classList.toggle('ready', playerData.is_ready);
                
                this.applyProfileBorder(avatar, playerData.uid);

                avatar.onclick = (e) => {
                    e.stopPropagation();
                    this.openMiniProfile(playerData.uid);
                };
                
                // Botão de Olho para ver ficha (Mestre ou Próprio Jogador)
                const canSeeSheet = this.isMaster || playerData.uid === this.user.uid;
                if (canSeeSheet && playerData.sheet_id) {
                    let eyeBtn = seatEl.querySelector('.view-sheet-btn');
                    if (!eyeBtn) {
                        eyeBtn = document.createElement('div');
                        eyeBtn.className = 'view-sheet-btn';
                        eyeBtn.innerHTML = '<i class="fas fa-eye"></i>';
                        seatEl.appendChild(eyeBtn);
                    }
                    eyeBtn.onclick = (e) => {
                        e.stopPropagation();
                        this.openCharacterSheet(playerData.sheet_id, playerData.uid);
                    };
                } else {
                    seatEl.querySelector('.view-sheet-btn')?.remove();
                }
            } else {
                seatEl.classList.remove('occupied', 'ready');
                seatEl.querySelector('.seat-name').textContent = "Vazio";
                const avatar = seatEl.querySelector('.seat-avatar');
                avatar.style.backgroundImage = 'none';
                avatar.style.border = '';
                avatar.innerHTML = '<i class="fas fa-plus"></i>';
                avatar.onclick = null;
                const eyeBtn = seatEl.querySelector('.view-sheet-btn');
                if (eyeBtn) eyeBtn.remove();
            }
        }
    }

    async applyProfileBorder(element, uid) {
        if (!uid) return;
        try {
            const profileDoc = await getDoc(doc(db, 'profiles', uid));
            if (profileDoc.exists()) {
                const data = profileDoc.data();
                if (data.active_border) {
                    element.style.border = `4px solid ${data.active_border}`;
                    element.style.boxShadow = `0 0 15px ${data.active_border}`;
                }
            }
        } catch (e) {
            console.error("Erro ao carregar borda:", e);
        }
    }

    async handleSeatClick(seat) {
        if (this.sessionData.status === 'saved') return;

        // Se for o lugar do mestre
        if (seat.id === 'seat-master') {
            if (this.isMaster) return; // Já é o mestre
            
            if (confirm("Deseja assumir o papel de Mestre?")) {
                // Remove-se da lista de jogadores se estiver em uma cadeira
                const updates = {
                    master_id: this.user.uid,
                    [`players.${this.user.uid}`]: deleteField()
                };
                await updateDoc(doc(db, "sessions", this.currentSessionId), updates);
            }
            return;
        }

        const seatIndex = parseInt(seat.dataset.index);
        const players = this.sessionData.players || {};
        const currentOccupant = Object.values(players).find(p => p.seat === seatIndex);

        if (currentOccupant && currentOccupant.uid !== this.user.uid) {
            return; // Lugar ocupado por outro
        }

        // Se o usuário já está em um lugar, move para o novo
        const existingPlayerData = players[this.user.uid];
        if (existingPlayerData) {
            if (existingPlayerData.seat !== seatIndex) {
                const playerUpdate = {
                    [`players.${this.user.uid}.seat`]: seatIndex
                };
                await updateDoc(doc(db, "sessions", this.currentSessionId), playerUpdate);
            } else {
                // Se clicou no mesmo lugar, abre seleção de ficha para trocar
                this.openSheetSelection(seatIndex);
            }
            return;
        }

        // Se o usuário era o mestre e quer virar jogador
        if (this.isMaster) {
            if (confirm("Você deixará de ser Mestre para se sentar nesta cadeira. Continuar?")) {
                this.openSheetSelection(seatIndex, true);
            }
            return;
        }
        
        this.openSheetSelection(seatIndex);
    }

    async openSheetSelection(seatIndex, wasMaster = false) {
        const modal = document.getElementById('sheet-selection-modal');
        const grid = document.getElementById('sheets-grid');
        grid.innerHTML = '<div class="session-loading"><i class="fas fa-spinner fa-spin"></i><p>Buscando suas fichas...</p></div>';
        this.openModal('sheet-selection-modal');

        try {
            // Buscar fichas do usuário na coleção correta 'sheets'
            const q = query(collection(db, "sheets"), where("user_id", "==", this.user.uid));
            const querySnapshot = await getDocs(q);
            
            grid.innerHTML = '';
            if (querySnapshot.empty) {
                grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Você ainda não tem fichas D&D criadas.</p>';
                return;
            }

            querySnapshot.forEach((doc) => {
                const sheet = doc.data();
                const sheetData = sheet.data || {};
                const card = document.createElement('div');
                card.className = 'sheet-mini-card';
                card.innerHTML = `
                    <img src="${sheetData.image || 'assets/default-avatar.png'}" onerror="this.onerror=null; this.src='assets/default-avatar.png'">
                    <div class="sheet-info">
                        <strong>${sheet.name || 'Sem Nome'}</strong>
                        <span>${sheetData.classLevel || 'Sem classe'}</span>
                    </div>
                `;
                card.onclick = () => this.selectSheetForSeat(seatIndex, doc.id, sheet, wasMaster);
                grid.appendChild(card);
            });
        } catch (error) {
            console.error("Erro ao buscar fichas:", error);
            grid.innerHTML = '<p>Erro ao carregar fichas.</p>';
        }
    }





    async selectSheetForSeat(seatIndex, sheetId, sheet, wasMaster = false) {
        const sheetData = sheet.data || {};
        const playerUpdate = {
            [`players.${this.user.uid}`]: {
                uid: this.user.uid,
                name: this.user.displayName || 'Jogador',
                photo: sheetData.image || this.user.photoURL || 'assets/default-avatar.png',
                seat: seatIndex,
                sheet_id: sheetId,
                is_ready: true
            }
        };

        if (wasMaster) {
            playerUpdate.master_id = ""; // Remove o mestre atual
        }

        try {
            const sessionRef = doc(db, "sessions", this.currentSessionId);
            await updateDoc(sessionRef, playerUpdate);
            
            // Força o fechamento do modal e feedback
            this.closeAllModals();
            console.log(`Jogador ${this.user.uid} moveu para assento ${seatIndex}`);
        } catch (error) {
            console.error("Erro ao ocupar lugar:", error);
            alert("Erro ao selecionar ficha.");
        }
    }

    checkReadyStatus() {
        const players = Object.values(this.sessionData.players || {});
        const allReady = players.length > 0 && players.every(p => p.is_ready);
        
        if (this.isMaster) {
            this.btnStartGame.disabled = !allReady;
        }
    }

    viewPlayerSheet(sheetId) {
        window.open(`ficha-dnd.html?id=${sheetId}&view=true`, '_blank');
    }

    async leaveSession() {
        const sessionRef = doc(db, "sessions", this.currentSessionId);

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
                console.error("Erro ao encerrar sessão (lobby):", err);
            }
            localStorage.removeItem('last_active_session');
            window.location.href = 'index.html';
            return;
        }

        if (!confirm("Deseja sair da sessão?")) return;
        try {
            const playerPath = `players.${this.user.uid}`;
            await updateDoc(sessionRef, {
                [playerPath]: deleteField()
            });
        } catch (err) {
            console.error("Erro ao sair da sessão (lobby):", err);
        }

        localStorage.removeItem('last_active_session');
        window.location.href = 'index.html';
    }

    // --- Chat Logic ---
    listenToChat() {
        const chatRef = collection(db, "sessions", this.currentSessionId, "messages");
        const q = query(chatRef, orderBy("timestamp", "asc"));

        this.unsubscribeChat = onSnapshot(q, (snapshot) => {
            this.chatMessages.innerHTML = '';
            snapshot.forEach(doc => {
                const msg = doc.data();
                const msgEl = document.createElement('div');
                let className = 'chat-msg';
                if (msg.uid === this.user.uid) className += ' own';
                if (msg.uid === 'system') className += ' system';
                
                msgEl.className = className;
                msgEl.innerHTML = `
                    <span class="chat-author">${msg.name}</span>
                    <p class="chat-text">${msg.text}</p>
                `;
                this.chatMessages.appendChild(msgEl);
            });
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        });
    }

    async sendChatMessage() {
        const text = this.chatInput.value.trim();
        if (!text) return;

        await addDoc(collection(db, "sessions", this.currentSessionId, "messages"), {
            uid: this.user.uid,
            name: this.user.displayName || 'Jogador',
            text: text,
            timestamp: serverTimestamp()
        });

        this.chatInput.value = '';
    }
}

new MultiplayerLobby();
