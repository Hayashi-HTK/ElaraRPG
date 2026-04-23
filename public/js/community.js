import { 
    auth, db, collection, doc, getDoc, getDocs, query, where, 
    orderBy, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp, 
    onAuthStateChanged, waitForAuth, arrayUnion, onSnapshot, limit 
} from './firebase.js';

document.addEventListener('DOMContentLoaded', async () => {
    const user = await waitForAuth();
    if (!user) {
        window.location.replace('login.html');
        return;
    }

    // Elementos da UI
    const communityContainer = document.querySelector('.community-container');
    const communitySidebar = document.getElementById('community-sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const mobileNav = document.getElementById('mobile-nav');
    const mobileNavOverlay = document.getElementById('mobile-nav-overlay');
    const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');

    const friendsOnlineList = document.getElementById('friends-online-list');
    const friendsOfflineList = document.getElementById('friends-offline-list');
    const friendsOnlineCount = document.getElementById('friends-online-count');
    const onlineTotal = document.getElementById('online-total');
    const offlineTotal = document.getElementById('offline-total');
    const friendRequestsList = document.getElementById('friend-requests-list');
    const requestsBadge = document.getElementById('requests-badge');
    const mobileRequestsBadge = document.getElementById('mobile-requests-badge');
    const noFriendsMsg = document.getElementById('no-friends-msg');
    
    const messageRequestsList = document.getElementById('message-requests-list');
    const msgRequestsBadge = document.getElementById('msg-requests-badge');
    const messageRequestActions = document.getElementById('message-request-actions');
    const acceptMsgBtn = document.getElementById('accept-msg-btn');
    const blockMsgBtn = document.getElementById('block-msg-btn');

    const chatContainer = document.getElementById('chat-container');
    const noChatPlaceholder = document.getElementById('no-chat-selected');
    const activeChatWrapper = document.getElementById('active-chat');
    const chatHeaderName = document.getElementById('chat-header-name');
    const chatHeaderStatus = document.getElementById('chat-header-status');
    const chatHeaderAvatar = document.getElementById('chat-header-avatar');
    const chatMessages = document.getElementById('chat-messages');
    const chatInputForm = document.getElementById('chat-input-form');
    const chatInput = document.getElementById('chat-input');
    
    const sidebarTabs = document.querySelectorAll('.sidebar-tab');
    const tabSections = document.querySelectorAll('.tab-section');
    
    const friendContextMenu = document.getElementById('friend-context-menu');
    
    // Elementos de Pesquisa
    const searchContainer = document.getElementById('community-search-container');
    const playerSearchInput = document.getElementById('player-search-input');
    const searchResults = document.getElementById('search-results');
    const mobileSearchToggle = document.getElementById('mobile-search-toggle');

    // Modal de Perfil (Shared Popup)
    const profileModalContainer = document.getElementById('profile-modal-container');

    // Elementos Modais
    const modalCreateGroup = document.getElementById('modal-create-group');
    const createGroupBtn = document.getElementById('create-group-btn');
    const createGroupForm = document.getElementById('create-group-form');
    
    const modalChatSettings = document.getElementById('modal-chat-settings');
    const chatSettingsBtn = document.getElementById('chat-settings-btn');
    const saveChatBg = document.getElementById('save-chat-bg');
    const chatBgUrl = document.getElementById('chat-bg-url');
    const chatBgOpacity = document.getElementById('chat-bg-opacity');
    
    const adminTabBtn = document.getElementById('admin-tab-btn');
    const settingsTabs = document.querySelectorAll('.settings-tab-btn');
    const settingsSections = document.querySelectorAll('.settings-section');
    
    const editGroupNameInput = document.getElementById('edit-group-name');
    const saveGroupNameBtn = document.getElementById('save-group-name');
    const promoteAdminSelect = document.getElementById('promote-admin-select');
    const confirmPromoteAdminBtn = document.getElementById('confirm-promote-admin');
    const deleteGroupBtn = document.getElementById('delete-group-btn');

    // Novos Elementos: Gerenciar Membros
    const chatMembersBtn = document.getElementById('chat-members-btn');
    const modalManageMembers = document.getElementById('modal-manage-members');
    const availableFriendsList = document.getElementById('available-friends-to-add');
    const currentGroupMembersList = document.getElementById('current-group-members');

    let currentChatId = null;
    let currentChatType = null;
    let unsubscribeMessages = null;
    let unsubscribeChatDoc = null;

    async function upsertNotification(targetUid, notifId, data) {
        if (!targetUid || !notifId) return;
        try {
            await setDoc(doc(db, 'profiles', targetUid, 'notifications', notifId), data, { merge: true });
        } catch (err) {
            console.error('Erro ao criar notificação:', err);
        }
    }

    const getBlockedKey = () => `community_blocked_${user.uid}`;
    const loadBlocked = () => {
        try {
            const raw = localStorage.getItem(getBlockedKey());
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    };
    const saveBlocked = (list) => {
        try { localStorage.setItem(getBlockedKey(), JSON.stringify(list)); } catch {}
    };
    const isBlocked = (uid) => loadBlocked().includes(uid);
    const blockUser = (uid) => {
        const list = loadBlocked().filter(Boolean);
        if (!list.includes(uid)) {
            list.unshift(uid);
            saveBlocked(list.slice(0, 200));
        }
    };

    async function sendFriendRequest(targetUid) {
        if (!targetUid) return null;
        
        try {
            const friendshipId = [user.uid, targetUid].sort().join('_');
            const friendshipRef = doc(db, 'friendships', friendshipId);
            const friendshipDoc = await getDoc(friendshipRef);
            
            if (friendshipDoc.exists()) return friendshipDoc.data().status;
            
            // Usamos um objeto Date simples como fallback se o serverTimestamp falhar
            // Às vezes regras de segurança barram serverTimestamp() dependendo de como estão configuradas
            await setDoc(friendshipRef, {
                participants: [user.uid, targetUid],
                sender_id: user.uid,
                receiver_id: targetUid,
                status: 'pending',
                created_at: new Date()
            });

            await upsertNotification(targetUid, `friend_request_${friendshipId}`, {
                type: 'friend_request',
                title: 'Solicitação de amizade',
                body: 'Você recebeu uma solicitação de amizade.',
                payload: { sender_id: user.uid, friendship_id: friendshipId },
                read: false,
                created_at: new Date()
            });
            
            return 'pending';
        } catch (err) {
            console.error("Erro detalhado no setDoc do friendship:", err);
            throw err;
        }
    }

    async function openMiniProfile(uid, preloaded = null) {
        if (!uid) return;
        if (uid === user.uid) {
            window.location.href = `profile.html?uid=${uid}`;
            return;
        }
        if (isBlocked(uid)) {
            alert("Você bloqueou este usuário.");
            return;
        }

        let displayName = preloaded?.full_name || preloaded?.nickname || 'Aventureiro';
        let nickname = preloaded?.nickname ? `@${preloaded.nickname}` : '';
        let avatarUrl = preloaded?.avatar_url || 'assets/default-avatar.png';
        let currentFrame = (preloaded?.current_frame || 'wood').toLowerCase();
        let level = preloaded?.level || 1;
        let xp = preloaded?.xp || 0;
        let friendsCount = preloaded?.friends_count || 0;
        let towerRecord = preloaded?.tower_record || 0;
        let bannerUrl = preloaded?.banner_url || 'assets/bg/lobby-classic.jpeg';

        try {
            const profileDoc = await getDoc(doc(db, 'profiles', uid));
            if (profileDoc.exists()) {
                const data = profileDoc.data();
                displayName = data.full_name || data.nickname || displayName;
                nickname = data.nickname ? `@${data.nickname}` : nickname;
                avatarUrl = data.avatar_url || avatarUrl;
                currentFrame = (data.current_frame || currentFrame || 'wood').toLowerCase();
                level = data.level || level;
                xp = data.xp || xp;
                friendsCount = data.friends_count || friendsCount;
                towerRecord = data.tower_record || towerRecord;
                bannerUrl = data.banner_url || bannerUrl;
            }
        } catch {}

        const friendshipId = [user.uid, uid].sort().join('_');
        let friendshipStatus = null;
        try {
            const friendshipDoc = await getDoc(doc(db, 'friendships', friendshipId));
            friendshipStatus = friendshipDoc.exists() ? friendshipDoc.data().status : null;
        } catch {}

        profileModalContainer.innerHTML = `
            <div class="modal-overlay visible" id="mini-profile-overlay">
                <div class="modal-content mini-profile-modal-content">
                    <button class="modal-close-btn" id="mini-profile-close">&times;</button>
                    <div class="modal-header">
                        <h2 class="title-cinzel">Perfil</h2>
                    </div>
                    <div class="modal-body">
                        <div class="mini-profile-banner" style="background-image: url('${bannerUrl}')"></div>
                        <div class="mini-profile-top">
                            <div class="mini-profile-avatar" style="background-image: url('${avatarUrl}')">
                                <div class="frame-glow glow-${currentFrame}" style="display:none;"></div>
                                <div class="frame-border frame-${currentFrame}"></div>
                            </div>
                            <div class="mini-profile-text">
                                <div class="mini-profile-name-wrap"><div class="mini-profile-name">${displayName}</div></div>
                                <div class="mini-profile-nick">${nickname}</div>
                            </div>
                        </div>
                        <div class="mini-profile-subline" id="mini-profile-subline">Nível ${level} • XP ${xp}</div>
                        <div class="mini-profile-stats">
                            <div class="mini-stat">
                                <div class="mini-stat-label">Fichas</div>
                                <div class="mini-stat-value" id="mini-profile-sheets">...</div>
                            </div>
                            <div class="mini-stat">
                                <div class="mini-stat-label">Torre</div>
                                <div class="mini-stat-value" id="mini-profile-tower">${towerRecord}</div>
                            </div>
                            <div class="mini-stat">
                                <div class="mini-stat-label">Amigos</div>
                                <div class="mini-stat-value" id="mini-profile-friends">${friendsCount}</div>
                            </div>
                            <div class="mini-stat">
                                <div class="mini-stat-label">Fichas Torre</div>
                                <div class="mini-stat-value" id="mini-profile-tower-sheets">...</div>
                            </div>
                        </div>
                        <div class="mini-profile-actions">
                            <button class="btn-primary" id="mini-profile-add" ${friendshipStatus ? 'disabled' : ''}>
                                ${friendshipStatus === 'accepted' ? 'Amigos' : (friendshipStatus === 'pending' ? 'Pendente' : 'Adicionar')}
                            </button>
                            <button class="btn-secondary" id="mini-profile-msg">Mandar Mensagem</button>
                            <button class="btn-secondary" id="mini-profile-block">Bloquear</button>
                            <button class="btn-secondary" id="mini-profile-close2">Ver Perfil</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        (async () => {
            const sheetsEl = document.getElementById('mini-profile-sheets');
            if (!sheetsEl) return;

            try {
                const sheetsSnap = await getDocs(query(collection(db, 'sheets'), where('user_id', '==', uid)));
                sheetsEl.textContent = `${sheetsSnap.size}`;
            } catch (err) {
                console.error("Erro ao contar fichas no mini profile:", err);
                sheetsEl.textContent = '-';
            }
        })();

        (async () => {
            const towerSheetsEl = document.getElementById('mini-profile-tower-sheets');
            if (!towerSheetsEl) return;

            try {
                const towerSnap = await getDocs(query(collection(db, 'tower_sheets'), where('user_id', '==', uid)));
                towerSheetsEl.textContent = `${towerSnap.size}`;
            } catch (err) {
                console.error("Erro ao contar fichas da torre no mini profile:", err);
                towerSheetsEl.textContent = '-';
            }
        })();

        const close = () => {
            const modalOverlay = document.getElementById('mini-profile-overlay');
            if (modalOverlay) {
                modalOverlay.classList.remove('visible');
                setTimeout(() => { profileModalContainer.innerHTML = ''; }, 200);
            } else {
                profileModalContainer.innerHTML = '';
            }
        };

        document.getElementById('mini-profile-close')?.addEventListener('click', close);
        document.getElementById('mini-profile-close2')?.addEventListener('click', () => {
            window.location.href = `profile.html?uid=${encodeURIComponent(uid)}`
        }
        );
        document.getElementById('mini-profile-overlay')?.addEventListener('click', (e) => {
            if (e.target?.id === 'mini-profile-overlay') close();
        });

        document.getElementById('mini-profile-add')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = 'Enviando...';
            try {
                const status = await sendFriendRequest(uid);
                btn.textContent = status === 'accepted' ? 'Amigos' : 'Pendente';
            } catch (err) {
                console.error("Erro no mini profile (Add Friend):", err);
                btn.disabled = false;
                btn.textContent = 'Adicionar';
                alert("Erro ao enviar solicitação. Verifique o console.");
            }
        });

        document.getElementById('mini-profile-msg')?.addEventListener('click', () => {
            profileModalContainer.innerHTML = '';
            startPrivateChat({ id: uid, nickname: (nickname || displayName).replace('@', ''), avatar_url: avatarUrl, current_frame: currentFrame });
        });

        document.getElementById('mini-profile-block')?.addEventListener('click', () => {
            if (confirm("Deseja bloquear este usuário?")) {
                blockUser(uid);
                close();
            }
        });
    }

    // --- Lógica de Pesquisa de Players ---
    function getSearchHistory() {
        try { return JSON.parse(localStorage.getItem(`community_search_history_${user.uid}`)) || []; } catch { return []; }
    }
    function saveSearchHistory(history) {
        localStorage.setItem(`community_search_history_${user.uid}`, JSON.stringify(history));
    }
    function addToSearchHistory(profile) {
        let history = getSearchHistory();
        history = history.filter(h => h.id !== profile.id);
        history.unshift(profile);
        if (history.length > 5) history.pop();
        saveSearchHistory(history);
    }
    function removeFromSearchHistory(id) {
        let history = getSearchHistory();
        history = history.filter(h => h.id !== id);
        saveSearchHistory(history);
        renderSearchHistory();
    }
    function renderSearchHistory() {
        const history = getSearchHistory();
        searchResults.innerHTML = '';
        if (history.length === 0) {
            searchResults.classList.remove('visible');
            return;
        }
        
        const header = document.createElement('div');
        header.style.padding = '10px 15px';
        header.style.fontSize = '0.8rem';
        header.style.color = '#888';
        header.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        header.textContent = 'Buscas Recentes';
        searchResults.appendChild(header);

        history.forEach(p => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <div class="search-result-avatar" style="background-image: url('${p.avatar_url || 'https://via.placeholder.com/150?text=Avatar'}')">
                    <div class="frame-glow glow-${(p.current_frame || 'wood').toLowerCase()}" style="top: -5%;left: -2%;right: -2%;bottom: -5%;"></div>
                    <div class="frame-border frame-${(p.current_frame || 'wood').toLowerCase()}" style="top: -32%;left: -32%;right: -32%;bottom: -32%;"></div>
                </div>
                <div class="search-result-info">
                    <span class="search-result-name">${p.full_name || 'Aventureiro'}</span>
                    <span class="search-result-nickname">@${p.nickname}</span>
                </div>
                <button class="remove-history-btn" style="background:none; border:none; color:#888; cursor:pointer; padding:5px; margin-left:auto; z-index:10;"><i class="fas fa-times"></i></button>
            `;
            item.addEventListener('click', (e) => {
                if (e.target.closest('.remove-history-btn')) {
                    e.stopPropagation();
                    removeFromSearchHistory(p.id);
                    return;
                }
                searchResults.classList.remove('visible');
                playerSearchInput.value = '';
                openProfilePopup(p.id); // Ajuste: chama openProfilePopup que é o wrapper seguro
            });
            item.addEventListener('contextmenu', (ev) => {
                ev.preventDefault();
                showUserContextMenu(ev, p, 'search');
            });
            searchResults.appendChild(item);
        });
        searchResults.classList.add('visible');
    }

    async function openProfilePopup(uid) {
        if (!uid) return;
        await openMiniProfile(uid);
    }
    window.openProfilePopup = openProfilePopup; // Exportando para acessos inline

    playerSearchInput.addEventListener('focus', () => {
        if (playerSearchInput.value.trim().length < 2) {
            renderSearchHistory();
        }
    });

    playerSearchInput.addEventListener('click', () => {
        if (playerSearchInput.value.trim().length < 2) {
            renderSearchHistory();
        }
    });

    mobileSearchToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        searchContainer.classList.toggle('active');
        if (searchContainer.classList.contains('active')) {
            playerSearchInput.focus();
        }
    });

    playerSearchInput.addEventListener('input', async (e) => {
        const queryText = e.target.value.trim().toLowerCase();
        if (queryText.length < 2) {
            renderSearchHistory();
            return;
        }

        try {
            const q = query(collection(db, 'profiles'), where('nickname', '>=', queryText), where('nickname', '<=', queryText + '\uf8ff'));
            const snapshot = await getDocs(q);
            
            searchResults.innerHTML = '';
            let count = 0;

            snapshot.forEach(d => {
                if (d.id === user.uid) return;
                const p = d.data();
                
                if (p.nickname && p.nickname.toUpperCase() === 'THE FIRST') return;
                if (p.full_name && p.full_name.toUpperCase() === 'THE FIRST') return;
                if (isBlocked(d.id)) return;

                const item = document.createElement('div');
                item.className = 'search-result-item';
                item.innerHTML = `
                <div class="search-result-avatar" style="background-image: url('${p.avatar_url || 'https://via.placeholder.com/150?text=Avatar'}')">
                    <div class="frame-glow glow-${(p.current_frame || 'wood').toLowerCase()}"></div>
                    <div class="frame-border frame-${(p.current_frame || 'wood').toLowerCase()}"></div>
                </div>
                <div class="search-result-info">
                        <span class="search-result-name">${p.full_name || 'Aventureiro'}</span>
                        <span class="search-result-nickname">@${p.nickname}</span>
                    </div>
                `;
                item.addEventListener('click', () => {
                    addToSearchHistory({ id: d.id, ...p });
                    searchResults.classList.remove('visible');
                    playerSearchInput.value = '';
                    openProfilePopup(d.id); // Ajuste
                });
                item.addEventListener('contextmenu', (ev) => {
                    ev.preventDefault();
                    showUserContextMenu(ev, { id: d.id, ...p }, 'search');
                });
                searchResults.appendChild(item);
                count++;
            });

            if (count > 0) searchResults.classList.add('visible');
            else searchResults.classList.remove('visible');

        } catch (err) { console.error("Erro na pesquisa:", err); }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-bar-container')) {
            searchResults.classList.remove('visible');
            searchContainer.classList.remove('active');
        }
    });

    // --- Lógica de Sidebar Expansível ---
    sidebarToggle.addEventListener('click', () => {
        const isCollapsed = communitySidebar.classList.toggle('collapsed');
        if (communityContainer) communityContainer.classList.toggle('sidebar-collapsed', isCollapsed);
        const icon = sidebarToggle.querySelector('.toggle-icon');
        icon.textContent = isCollapsed ? '❯' : '❮';
        
        localStorage.setItem('sidebarCollapsed', isCollapsed);
    });

    // --- Lógica de Alternância de Abas (Centralizada) ---
    function switchTab(tabName) {
        console.log("Alternando para aba:", tabName);
        
        // Atualizar abas da sidebar
        sidebarTabs.forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tabName);
        });

        // Atualizar seções de conteúdo
        tabSections.forEach(s => s.classList.remove('active'));
        const targetMap = { 
            'friends': 'friends-list-section', 
            'groups': 'groups-list-section', 
            'requests': 'requests-list-section',
            'message-requests': 'message-requests-list-section'
        };
        
        const targetId = targetMap[tabName];
        if (targetId) {
            const targetSection = document.getElementById(targetId);
            if (targetSection) targetSection.classList.add('active');
        }

        // Atualizar botões mobile
        const mobileTabName = tabName === 'message-requests' ? 'chat-list' : tabName;
        mobileNavBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === mobileTabName);
        });
    }

    sidebarTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.dataset.tab);
        });
    });

    if (localStorage.getItem('sidebarCollapsed') === 'true') {
        communitySidebar.classList.add('collapsed');
        if (communityContainer) communityContainer.classList.add('sidebar-collapsed');
        const icon = sidebarToggle.querySelector('.toggle-icon');
        const textSidebar = document.getElementById('groups-list');
        textSidebar.style.display = 'none';
        const pendent = document.getElementById('friend-requests-list');
        pendent.style.display = 'none';
        const messagePendent = document.getElementById('message-requests-list');
        messagePendent.style.display = 'none';
        if (icon) icon.textContent = '❯';
    }

    if (window.innerWidth <= 1100 && window.innerWidth > 768) {
        communitySidebar.classList.add('collapsed');
        if (communityContainer) communityContainer.classList.add('sidebar-collapsed');
        const textSidebar = document.getElementById('groups-list');
        textSidebar.style.display = 'none';
        const pendent = document.getElementById('friend-requests-list');
        pendent.style.display = 'none';
        const messagePendent = document.getElementById('message-requests-list');
        messagePendent.style.display = 'none';
        const icon = sidebarToggle.querySelector('.toggle-icon');
        if (icon) icon.textContent = '❯';
    }

    // --- Lógica de Mobile Nav (Menu Inferior) ---
    function setupMobileNav() {
        const closeMobileNav = () => {
            communitySidebar.classList.remove('mobile-open');
            mobileNavOverlay.classList.remove('visible');
            
            // Se o chat estiver visível (mesmo que seja o placeholder), ativa o botão de chat
            mobileNavBtns.forEach(b => b.classList.remove('active'));
            const chatBtn = Array.from(mobileNavBtns).find(b => b.dataset.tab === 'chat-list');
            if (chatBtn) chatBtn.classList.add('active');
        };

        const openMobileNav = (tabName) => {
            if (tabName === 'chat-list') {
                closeMobileNav();
                return;
            }

            communitySidebar.classList.add('mobile-open');
            mobileNavOverlay.classList.add('visible');
            
            // Usar switchTab diretamente em vez de simular click
            switchTab(tabName);
        };

        mobileNavOverlay.addEventListener('click', closeMobileNav);

        mobileNavBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const tabName = btn.dataset.tab;
                
                if (tabName === 'chat-list') {
                    closeMobileNav();
                    return;
                }

                // Para outras abas, o openMobileNav cuida de tudo
                openMobileNav(tabName);
            });
        });
    }

    function closeSidebarOnMobile() {
        if (window.innerWidth <= 768) {
            communitySidebar.classList.remove('mobile-open');
            mobileNavOverlay.classList.remove('visible');
            
            mobileNavBtns.forEach(b => b.classList.remove('active'));
            const chatBtn = Array.from(mobileNavBtns).find(b => b.dataset.tab === 'chat-list');
            if (chatBtn) chatBtn.classList.add('active');
        }
    }

    setupMobileNav();

    // --- Lógica de Modais ---
    function openModal(modal) { 
        console.log("Abrindo modal:", modal?.id);
        if (modal) {
            modal.classList.add('visible');
            modal.style.display = 'flex'; // Forçar display flex
        }
    }
    
    function closeModal(modal) { 
        console.log("Fechando modal:", modal?.id);
        if (modal) {
            modal.classList.remove('visible');
            modal.style.display = 'none'; // Forçar display none
        }
    }

    // Inicializar modais como ocultos
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');

    // Gerenciamento de Tabs nos Modais
    document.querySelectorAll('.settings-tabs').forEach(tabContainer => {
        const tabs = tabContainer.querySelectorAll('.settings-tab-btn');
        const modal = tabContainer.closest('.modal-overlay');
        
        tabs.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.target;
                console.log("Alternando para aba:", targetId);
                
                tabs.forEach(t => t.classList.remove('active'));
                modal.querySelectorAll('.settings-section').forEach(s => {
                    s.classList.remove('visible');
                    s.style.display = 'none';
                });
                
                btn.classList.add('active');
                const target = document.getElementById(targetId);
                if (target) {
                    target.classList.add('visible');
                    target.style.display = 'block';
                }
            });
        });
    });

    document.querySelectorAll('.modal-close-btn, .modal-cancel').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal(btn.closest('.modal-overlay'));
        });
    });

    const confirmCreateGroup = document.getElementById('confirm-create-group');
    const groupNameInput = document.getElementById('group-name-input');

    if (createGroupBtn) {
        createGroupBtn.addEventListener('click', () => openModal(modalCreateGroup));
    }

    if (confirmCreateGroup && groupNameInput) {
        confirmCreateGroup.addEventListener('click', async () => {
            const groupName = groupNameInput.value.trim();
            if (!groupName) {
                alert("Dê um nome ao seu grupo!");
                return;
            }

            confirmCreateGroup.disabled = true;
            confirmCreateGroup.textContent = "Criando...";

            try {
                const chatData = {
                    name: groupName,
                    type: 'group',
                    admin_id: user.uid,
                    creator_nickname: user.displayName || 'Mestre',
                    members: [user.uid],
                    image: 'assets/icons/group.png',
                    created_at: serverTimestamp(),
                    updated_at: serverTimestamp()
                };

                const docRef = await addDoc(collection(db, 'groups'), chatData);
                console.log("Grupo criado com ID:", docRef.id);
                
                closeModal(modalCreateGroup);
                groupNameInput.value = '';
                alert(`Grupo "${groupName}" criado com sucesso!`);
                
            } catch (err) {
                console.error("Erro ao criar grupo:", err);
                alert("Erro ao criar grupo. Verifique sua conexão.");
            } finally {
                confirmCreateGroup.disabled = false;
                confirmCreateGroup.textContent = "Criar Grupo";
            }
        });
    }
    
    if (chatSettingsBtn) {
        chatSettingsBtn.onclick = async (e) => {
            console.log("Botão de configuração clicado!");
            e.preventDefault();
            e.stopPropagation();
            
            if (!currentChatId) {
                alert("Selecione uma conversa primeiro!");
                return;
            }
            
            // Abrir modal imediatamente
            openModal(modalChatSettings);
            
            // Reset tabs para o modal de configurações
            const tabs = modalChatSettings.querySelectorAll('.settings-tab-btn');
            const sections = modalChatSettings.querySelectorAll('.settings-section');
            tabs.forEach(t => t.classList.remove('active'));
            sections.forEach(s => {
                s.classList.remove('visible');
                s.style.display = 'none';
            });
            
            if (tabs.length > 0) {
                tabs[0].classList.add('active');
                const defaultTarget = document.getElementById(tabs[0].dataset.target);
                if (defaultTarget) {
                    defaultTarget.classList.add('visible');
                    defaultTarget.style.display = 'block';
                }
            }
            
            try {
                const collectionName = currentChatType === 'group' ? 'groups' : 'chats';
                const chatDoc = await getDoc(doc(db, collectionName, currentChatId));
                
                if (chatDoc.exists()) {
                    const data = chatDoc.data();
                    if (chatBgUrl) chatBgUrl.value = data.background_url || '';
                    if (chatBgOpacity) chatBgOpacity.value = data.background_opacity || 0.5;
                    
                    if (currentChatType === 'group') {
                        const isAdmin = data.admin_id === user.uid;
                        // Mostrar aba de administração APENAS para o ADM do grupo
                        if (adminTabBtn) adminTabBtn.style.display = isAdmin ? 'block' : 'none';
                        if (editGroupNameInput) editGroupNameInput.value = data.name || '';
                        
                        if (promoteAdminSelect) {
                            promoteAdminSelect.innerHTML = '<option value="">Selecione um membro...</option>';
                            for (const memberId of data.members || []) {
                                if (memberId === user.uid) continue;
                                const pDoc = await getDoc(doc(db, 'profiles', memberId));
                                if (pDoc.exists()) {
                                    const p = pDoc.data();
                                    promoteAdminSelect.innerHTML += `<option value="${memberId}">${p.nickname || p.full_name}</option>`;
                                }
                            }
                        }
                    } else {
                        // Se for chat privado, esconder aba de administração
                        if (adminTabBtn) adminTabBtn.style.display = 'none';
                    }
                }
            } catch (err) {
                console.error("Erro ao carregar configurações:", err);
            }
        };
    }

    // --- Lógica de Gerenciar Membros (👤+) ---
    if (chatMembersBtn) {
        chatMembersBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (currentChatType !== 'group' || !currentChatId) return;
            
            openModal(modalManageMembers);
            
            // Carregar listas de membros e amigos
            await loadManageMembersData();
        };
    }

    async function loadManageMembersData() {
        try {
            const groupRef = doc(db, 'groups', currentChatId);
            const groupSnap = await getDoc(groupRef);
            if (!groupSnap.exists()) return;
            
            const groupData = groupSnap.data();
            const members = groupData.members || [];
            const isAdmin = groupData.admin_id === user.uid;
            
            // 1. Carregar Membros Atuais para Remover
            currentGroupMembersList.innerHTML = '';
            for (const memberId of members) {
                if (memberId === user.uid) continue; // Não remover a si mesmo aqui
                
                const pDoc = await getDoc(doc(db, 'profiles', memberId));
                if (pDoc.exists()) {
                    const p = pDoc.data();
                    const item = document.createElement('div');
                    item.className = 'friend-item';
                    item.innerHTML = `
                        <div class="item-avatar" style="background-image: url('${p.avatar_url || 'https://via.placeholder.com/150?text=Avatar'}')"></div>
                        <div class="item-info">
                            <span class="item-name">${p.nickname || p.full_name}</span>
                        </div>
                        ${isAdmin ? `<button class="request-btn decline remove-member-btn" data-id="${memberId}">Remover</button>` : ''}
                    `;
                    if (isAdmin) {
                        item.querySelector('.remove-member-btn').onclick = () => removeMember(memberId, p.nickname || p.full_name);
                    }
                    currentGroupMembersList.appendChild(item);
                }
            }

            // 2. Carregar Amigos para Adicionar
            availableFriendsList.innerHTML = '';
            const qFriends = query(collection(db, 'friendships'), where('participants', 'array-contains', user.uid), where('status', '==', 'accepted'));
            const friendsSnap = await getDocs(qFriends);
            
            for (const fDoc of friendsSnap.docs) {
                const fData = fDoc.data();
                const friendId = fData.participants.find(id => id !== user.uid);
                
                // Se o amigo já está no grupo, ignora
                if (members.includes(friendId)) continue;
                
                const pDoc = await getDoc(doc(db, 'profiles', friendId));
                if (pDoc.exists()) {
                    const p = pDoc.data();
                    const item = document.createElement('div');
                    item.className = 'friend-item';
                    item.innerHTML = `
                        <div class="item-avatar" style="background-image: url('${p.avatar_url || 'https://via.placeholder.com/150?text=Avatar'}')"></div>
                        <div class="item-info">
                            <span class="item-name">${p.nickname || p.full_name}</span>
                        </div>
                        <button class="request-btn accept add-member-btn" data-id="${friendId}">Adicionar</button>
                    `;
                    item.querySelector('.add-member-btn').onclick = () => addMember(friendId, p.nickname || p.full_name);
                    availableFriendsList.appendChild(item);
                }
            }
            
            if (availableFriendsList.innerHTML === '') {
                availableFriendsList.innerHTML = '<p style="padding: 1rem; text-align: center; color: var(--dashboard-text-muted);">Todos os seus amigos já estão no grupo ou você não tem amigos.</p>';
            }

        } catch (err) { console.error("Erro ao carregar membros:", err); }
    }

    async function addMember(memberId, name) {
        try {
            await updateDoc(doc(db, 'groups', currentChatId), {
                members: arrayUnion(memberId)
            });
            alert(`${name} adicionado ao grupo!`);
            await loadManageMembersData();
        } catch (err) { console.error(err); }
    }

    async function removeMember(memberId, name) {
        if (!confirm(`Deseja remover ${name} do grupo?`)) return;
        try {
            const groupRef = doc(db, 'groups', currentChatId);
            const groupSnap = await getDoc(groupRef);
            const members = groupSnap.data().members || [];
            const newMembers = members.filter(id => id !== memberId);
            
            await updateDoc(groupRef, { members: newMembers });
            alert(`${name} removido.`);
            await loadManageMembersData();
        } catch (err) { console.error(err); }
    }

    saveGroupNameBtn.addEventListener('click', async () => {
        const newName = editGroupNameInput.value.trim();
        if (!newName || currentChatType !== 'group') return;
        try {
            await updateDoc(doc(db, 'groups', currentChatId), { name: newName });
            chatHeaderName.textContent = newName;
            alert("Grupo renomeado!");
        } catch (err) { console.error(err); }
    });

    confirmPromoteAdminBtn.addEventListener('click', async () => {
        const newAdminId = promoteAdminSelect.value;
        if (!newAdminId || !confirm("Tem certeza que deseja tornar esta pessoa o Administrador? Você perderá seus privilégios.")) return;
        try {
            await updateDoc(doc(db, 'groups', currentChatId), { admin_id: newAdminId });
            alert("Administrador alterado com sucesso!");
            closeModal(modalChatSettings);
        } catch (err) { console.error(err); }
    });

    deleteGroupBtn.addEventListener('click', async () => {
        if (!confirm("TEM CERTEZA? Isso excluirá o grupo e todas as mensagens permanentemente.")) return;
        try {
            await deleteDoc(doc(db, 'groups', currentChatId));
            alert("Grupo excluído.");
            window.location.reload();
        } catch (err) { console.error(err); }
    });

    saveChatBg.addEventListener('click', async () => {
        const url = chatBgUrl.value.trim();
        const opacity = parseFloat(chatBgOpacity.value) || 0.5;
        if (!currentChatId) return;
        
        try {
            const collectionName = currentChatType === 'group' ? 'groups' : 'chats';
            const chatRef = doc(db, collectionName, currentChatId);
            
            if (currentChatType === 'group') {
                const groupDoc = await getDoc(chatRef);
                if (groupDoc.exists() && groupDoc.data().admin_id !== user.uid) {
                    alert("Apenas o Mestre (ADM) do grupo pode alterar o fundo!");
                    return;
                }
            }
            
            const updateData = { 
                background_url: url,
                background_opacity: opacity
            };

            if (currentChatType === 'private') {
                updateData.participants = currentChatId.split('_');
                updateData.type = 'private';
            }

            await setDoc(chatRef, updateData, { merge: true });

            updateChatBackground(url, opacity);
            closeModal(modalChatSettings);
            
            const originalText = saveChatBg.textContent;
            saveChatBg.textContent = "Aplicado! ✨";
            saveChatBg.style.background = "#43b581";
            setTimeout(() => {
                saveChatBg.textContent = originalText;
                saveChatBg.style.background = "";
            }, 2000);

        } catch (err) { 
            console.error("Erro ao salvar fundo:", err);
            alert("Erro ao salvar visual do chat. Verifique sua conexão.");
        }
    });

    function updateChatBackground(url, opacity) {
        if (url) {
            activeChatWrapper.style.backgroundImage = `linear-gradient(rgba(0,0,0,${opacity}), rgba(0,0,0,${opacity})), url('${url}')`;
        } else {
            activeChatWrapper.style.backgroundImage = 'none';
        }
    }

    async function updatePresence(status) {
        const userRef = doc(db, 'profiles', user.uid);
        await updateDoc(userRef, { status: status, last_seen: serverTimestamp() });
    }
    updatePresence('online');
    window.addEventListener('beforeunload', () => updatePresence('offline'));

    function listenToFriendships() {
        const qAccepted = query(collection(db, 'friendships'), where('participants', 'array-contains', user.uid), where('status', '==', 'accepted'));
        onSnapshot(qAccepted, async (snapshot) => {
            const friendIds = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const friendId = data.participants.find(id => id !== user.uid);
                if (friendId) friendIds.push(friendId);
            });
            if (friendIds.length === 0) { renderFriends([]); noFriendsMsg.style.display = 'block'; return; }
            noFriendsMsg.style.display = 'none';
            const friendsData = [];
            for (const id of friendIds) {
                const pDoc = await getDoc(doc(db, 'profiles', id));
                if (pDoc.exists()) friendsData.push({ id: pDoc.id, ...pDoc.data() });
            }
            renderFriends(friendsData);
        }, (error) => {
            console.error("Erro no onSnapshot qAccepted (friendships):", error);
        });

        const qPending = query(collection(db, 'friendships'), where('receiver_id', '==', user.uid), where('status', '==', 'pending'));
        onSnapshot(qPending, async (snapshot) => {
            const requests = [];
            for (const d of snapshot.docs) {
                const data = d.data();
                const senderDoc = await getDoc(doc(db, 'profiles', data.sender_id));
                if (senderDoc.exists()) requests.push({ request_id: d.id, ...data, sender_data: senderDoc.data() });
            }
            renderRequests(requests);
        }, (error) => {
            console.error("Erro no onSnapshot qPending (friendships):", error);
        });

        const profileCache = new Map();
        const getProfile = async (uid) => {
            if (!uid) return null;
            if (profileCache.has(uid)) return profileCache.get(uid);
            const p = await getDoc(doc(db, 'profiles', uid));
            const data = p.exists() ? { id: p.id, ...p.data() } : null;
            profileCache.set(uid, data);
            return data;
        };

        const qMsgRequests = query(
            collection(db, 'chats'),
            where('participants', 'array-contains', user.uid),
            where('type', '==', 'private'),
            limit(50)
        );

        onSnapshot(qMsgRequests, async (snapshot) => {
            const items = [];
            let pendingCount = 0;

            const docs = snapshot.docs || [];
            const otherIds = [];
            for (const d of docs) {
                const data = d.data() || {};
                const participants = Array.isArray(data.participants) ? data.participants : [];
                const otherId = participants.find((id) => id !== user.uid);
                if (otherId) otherIds.push(otherId);
            }

            const uniqueOtherIds = [...new Set(otherIds)];
            await Promise.all(uniqueOtherIds.map((id) => getProfile(id)));

            for (const d of docs) {
                const data = d.data() || {};
                const participants = Array.isArray(data.participants) ? data.participants : [];
                const otherId = participants.find((id) => id !== user.uid);
                if (!otherId) continue;

                const otherProfile = await getProfile(otherId);
                if (!otherProfile) continue;

                const acceptedBy = Array.isArray(data.accepted_by) ? data.accepted_by : [];
                const acceptedByMe = acceptedBy.includes(user.uid);

                let isFriendAccepted = false;
                if (!acceptedByMe) {
                    const friendshipId = [user.uid, otherId].sort().join('_');
                    const friendDoc = await getDoc(doc(db, 'friendships', friendshipId));
                    isFriendAccepted = friendDoc.exists() && friendDoc.data()?.status === 'accepted';
                }

                const isPendingRequest = !acceptedByMe && !isFriendAccepted;
                if (isPendingRequest) pendingCount += 1;

                const lastTs =
                    (data.last_timestamp && typeof data.last_timestamp.toMillis === 'function')
                        ? data.last_timestamp.toMillis()
                        : (data.created_at && typeof data.created_at.toMillis === 'function')
                            ? data.created_at.toMillis()
                            : 0;

                items.push({
                    id: d.id,
                    ...data,
                    other_id: otherId,
                    other_data: otherProfile,
                    is_pending_request: isPendingRequest,
                    _sortTs: lastTs
                });
            }

            items.sort((a, b) => (b._sortTs || 0) - (a._sortTs || 0));
            renderMessageRequests(items, pendingCount);
        }, (error) => {
            console.error("Erro no onSnapshot qMsgRequests (chats):", error);
            renderMessageRequests([], 0);
        });

        const qSent = query(collection(db, 'friendships'), where('sender_id', '==', user.uid), where('status', '==', 'pending'));
        onSnapshot(qSent, async (snapshot) => {
            const sentRequests = [];
            for (const d of snapshot.docs) {
                const data = d.data();
                const receiverDoc = await getDoc(doc(db, 'profiles', data.receiver_id));
                if (receiverDoc.exists()) sentRequests.push({ request_id: d.id, ...data, receiver_data: { id: receiverDoc.id, ...receiverDoc.data() } });
            }
            renderSentRequests(sentRequests);
        }, (error) => {
            console.error("Erro no onSnapshot qSent (friendships):", error);
        });
    }

    function renderSentRequests(requests) {
        const sentList = document.getElementById('sent-requests-list');
        if (!sentList) return;
        sentList.innerHTML = '';
        if (requests.length === 0) {
            sentList.innerHTML = '<p style="padding: 1.5rem; text-align: center; font-size: 0.85rem; color: var(--dashboard-text-muted);">Nenhuma solicitação enviada.</p>';
            return;
        }
        requests.forEach(req => {
            const item = document.createElement('div');
            item.className = 'friend-item';
            item.innerHTML = `
                <div class="item-avatar" style="background-image: url('${req.receiver_data.avatar_url || 'https://via.placeholder.com/150?text=Avatar'}'); cursor: pointer;" onclick="window.lobby?.openProfilePopup?.('${req.receiver_data.id}') || window.openProfilePopup?.('${req.receiver_data.id}')">
                    <div class="frame-border frame-${req.receiver_data.current_frame || 'wood'}" style="border-width: 2px;"></div>
                </div>
                <div class="item-info">
                    <span class="item-name" style="cursor: pointer;" onclick="window.lobby?.openProfilePopup?.('${req.receiver_data.id}') || window.openProfilePopup?.('${req.receiver_data.id}')">${req.receiver_data.nickname || req.receiver_data.full_name}</span>
                    <div class="request-actions">
                        <button class="request-btn btn-primary decline cancel-request" data-id="${req.request_id}">Cancelar</button>
                    </div>
                </div>
            `;
            item.querySelector('.cancel-request').onclick = () => cancelRequest(req.request_id);
            sentList.appendChild(item);
        });
    }

    async function cancelRequest(requestId) {
        if (!confirm("Deseja cancelar esta solicitação de amizade?")) return;
        try {
            await deleteDoc(doc(db, 'friendships', requestId));
            alert("Solicitação cancelada.");
        } catch (err) { console.error(err); }
    }

    function renderFriends(friends) {
        friendsOnlineList.innerHTML = '';
        friendsOfflineList.innerHTML = '';
        let onlineCount = 0; let offlineCount = 0;
        friends.forEach(friend => {
            const isOnline = friend.status === 'online';
            const item = document.createElement('div');
            item.className = 'friend-item';
            item.innerHTML = `
                <div class="item-avatar" style="background-image: url('${friend.avatar_url || 'https://via.placeholder.com/150?text=Avatar'}'); cursor: pointer;" onclick="event.stopPropagation(); window.openProfilePopup?.('${friend.id}')">
                    <div class="frame-glow glow-${(friend.current_frame || 'wood').toLowerCase()}" style="display:none;"></div>
                    <div class="frame-border frame-${(friend.current_frame || 'wood').toLowerCase()}" style="display:none;"></div>
                    <span class="item-status ${isOnline ? 'online' : ''}"></span>
                </div>
                <div class="item-info">
                    <span class="item-name" style="cursor: pointer;" onclick="event.stopPropagation(); window.openProfilePopup?.('${friend.id}')">${friend.nickname || friend.full_name || 'Aventureiro'}</span>
                    <span class="item-sub ${isOnline ? 'online' : 'offline'}">${isOnline ? 'Online' : 'Offline'}</span>
                </div>
                <button class="remove-friend-btn" title="Remover Amizade">Remover</button>
            `;
            item.addEventListener('click', () => startPrivateChat(friend));
            item.addEventListener('contextmenu', (e) => showContextMenu(e, friend));
            
            // Lógica do botão remover amizade
            const removeBtn = item.querySelector('.remove-friend-btn');
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Não abrir o chat ao clicar no botão
                unfriend(friend.id);
            });

            if (isOnline) { friendsOnlineList.appendChild(item); onlineCount++; }
            else { friendsOfflineList.appendChild(item); offlineCount++; }
        });
        friendsOnlineCount.textContent = onlineCount;
        onlineTotal.textContent = onlineCount;
        offlineTotal.textContent = offlineCount;
    }

    function renderRequests(requests) {
        friendRequestsList.innerHTML = '';
        const count = requests.length;
        requestsBadge.textContent = count;
        requestsBadge.style.display = count > 0 ? 'inline-block' : 'none';
        if (mobileRequestsBadge) {
            mobileRequestsBadge.textContent = count;
            mobileRequestsBadge.style.display = count > 0 ? 'inline-block' : 'none';
        }
        if (count === 0) {
            friendRequestsList.innerHTML = '<p style="padding: 1.5rem; text-align: center; font-size: 0.85rem; color: var(--dashboard-text-muted);">Nenhuma solicitação pendente.</p>';
            return;
        }
        requests.forEach(req => {
            const item = document.createElement('div');
            item.className = 'friend-item';
            item.dataset.sender = req.sender_id;
            item.innerHTML = `
                <div class="item-avatar" style="background-image: url('${req.sender_data.avatar_url || 'https://via.placeholder.com/150?text=Avatar'}'); cursor: pointer;" onclick="window.openProfilePopup?.('${req.sender_id}')">
                    <div class="frame-glow glow-${(req.sender_data.current_frame || 'wood').toLowerCase()}"></div>
                    <div class="frame-border frame-${(req.sender_data.current_frame || 'wood').toLowerCase()}" style="border-width: 2px;"></div>
                </div>
                <div class="item-info">
                    <span class="item-name" style="cursor: pointer;" onclick="window.openProfilePopup?.('${req.sender_id}')">${req.sender_data.nickname || req.sender_data.full_name}</span>
                    <div class="request-actions">
                        <button class="request-btn accept" data-id="${req.request_id}">Aceitar</button>
                        <button class="request-btn decline" data-id="${req.request_id}">Recusar</button>
                    </div>
                </div>
            `;
            item.querySelector('.accept').onclick = () => acceptRequest(req.request_id, req.sender_id);
            item.querySelector('.decline').onclick = () => declineRequest(req.request_id);
            friendRequestsList.appendChild(item);
        });
    }

    async function acceptRequest(requestId, senderId) {
        try {
            await updateDoc(doc(db, 'friendships', requestId), { status: 'accepted', accepted_at: serverTimestamp() });
            const updateCount = async (uid) => {
                const ref = doc(db, 'profiles', uid);
                const d = await getDoc(ref);
                const current = d.data().friends_count || 0;
                await updateDoc(ref, { friends_count: current + 1 });
            };
            await updateCount(user.uid);
            await updateCount(senderId);
            alert("Solicitação aceita!");
        } catch (err) { console.error(err); }
    }

    async function declineRequest(requestId) {
        if (!confirm("Deseja recusar esta solicitação?")) return;
        try { await deleteDoc(doc(db, 'friendships', requestId)); } catch (err) { console.error(err); }
    }

    async function unfriend(friendId) {
        if (!confirm("Tem certeza que deseja desfazer a amizade?")) return;
        try {
            const q = query(collection(db, 'friendships'), where('participants', 'array-contains', user.uid), where('status', '==', 'accepted'));
            const snapshot = await getDocs(q);
            let docId = null;
            snapshot.forEach(d => { if (d.data().participants.includes(friendId)) docId = d.id; });
            if (docId) {
                await deleteDoc(doc(db, 'friendships', docId));
                const updateCount = async (uid) => {
                    const ref = doc(db, 'profiles', uid);
                    const d = await getDoc(ref);
                    const current = d.data().friends_count || 0;
                    await updateDoc(ref, { friends_count: Math.max(0, current - 1) });
                };
                await updateCount(user.uid);
                await updateCount(friendId);
                alert("Amizade desfeita.");
                if (currentChatId && currentChatId.includes(friendId)) {
                    activeChatWrapper.style.display = 'none';
                    noChatPlaceholder.style.display = 'flex';
                }
            }
        } catch (err) { console.error(err); }
    }

    function renderMessageRequests(requests, pendingCountOverride) {
        if (!messageRequestsList) return;
        messageRequestsList.innerHTML = '';

        const list = Array.isArray(requests) ? requests : [];
        const pendingCount = Number.isFinite(Number(pendingCountOverride)) ? Number(pendingCountOverride) : 0;
        msgRequestsBadge.textContent = pendingCount;
        msgRequestsBadge.style.display = pendingCount > 0 ? 'inline-block' : 'none';

        if (list.length === 0) {
            messageRequestsList.innerHTML = '<p class="message-requests-list-empty">Nenhuma conversa recente.</p>';
            return;
        }

        list.forEach((req) => {
            const other = req.other_data || {};
            const avatarUrl = other.avatar_url || 'https://via.placeholder.com/150?text=Avatar';
            const name = other.nickname || other.full_name || 'Aventureiro';
            const frame = (other.current_frame || 'wood').toLowerCase();

            const item = document.createElement('div');
            item.className = 'friend-item';
            item.innerHTML = `
                <div class="item-avatar" style="background-image: url('${avatarUrl}'); cursor: pointer;">
                    ${req.is_pending_request ? '<span class="chat-pending-dot" title="Conversa pendente"></span>' : ''}
                    <div class="frame-glow glow-${frame}"></div>
                    <div class="frame-border frame-${frame}"></div>
                </div>
                <div class="item-info">
                    <span class="item-name">${name}</span>
                    <span class="item-last-msg" style="font-size: 0.7rem; color: var(--dashboard-text-muted); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${req.last_message || '—'}</span>
                </div>
            `;

            item.onclick = () => startPrivateChat({ id: req.other_id, ...other });
            messageRequestsList.appendChild(item);
        });
    }

    async function startPrivateChat(friend) {
        const friendUid = friend?.id || friend?.uid || friend?.other_id;
        if (!friendUid) return;

        const chatId = [user.uid, friendUid].sort().join('_');
        currentChatId = chatId;
        currentChatType = 'private';
        noChatPlaceholder.style.display = 'none';
        activeChatWrapper.style.display = 'flex';
        chatHeaderName.textContent = friend.nickname || friend.full_name;
        chatHeaderStatus.textContent = friend.status === 'online' ? 'Online' : 'Offline';
        chatHeaderAvatar.style.backgroundImage = `url('${friend.avatar_url || 'https://via.placeholder.com/150?text=Avatar'}')`;
        
        chatHeaderName.onclick = (e) => {
            e.preventDefault();
            window.location.href = `profile.html?uid=${encodeURIComponent(friendUid)}`;
        };
        // Esconder botão de gerenciar membros (👤+) em chats privados
        if (chatMembersBtn) chatMembersBtn.style.display = 'none';

        closeSidebarOnMobile();
        if (unsubscribeChatDoc) unsubscribeChatDoc();
        unsubscribeChatDoc = onSnapshot(doc(db, 'chats', chatId), async (docSnap) => {
            if (docSnap.exists()) {
                const chatData = docSnap.data();
                const acceptedBy = chatData.accepted_by || [];
                if (!acceptedBy.includes(user.uid)) {
                    const friendDoc = await getDoc(doc(db, 'friendships', [user.uid, friendUid].sort().join('_')));
                    if (friendDoc.exists() && friendDoc.data().status === 'accepted') {
                        await updateDoc(doc(db, 'chats', chatId), { accepted_by: arrayUnion(user.uid) });
                        messageRequestActions.style.display = 'none';
                        chatInputForm.classList.remove('blocked');
                    } else {
                        messageRequestActions.style.display = 'block';
                        chatInputForm.classList.add('blocked');
                        acceptMsgBtn.onclick = async () => {
                            await updateDoc(doc(db, 'chats', chatId), { accepted_by: arrayUnion(user.uid) });
                            messageRequestActions.style.display = 'none';
                            chatInputForm.classList.remove('blocked');
                        };
                        blockMsgBtn.onclick = async () => {
                            if (confirm("Deseja recusar esta conversa? As mensagens serão apagadas.")) {
                                await deleteDoc(doc(db, 'chats', chatId));
                                activeChatWrapper.style.display = 'none';
                                noChatPlaceholder.style.display = 'flex';
                            }
                        };
                    }
                } else {
                    messageRequestActions.style.display = 'none';
                    chatInputForm.classList.remove('blocked');
                }
                updateChatBackground(chatData.background_url, chatData.background_opacity || 0.5);
            } else {
                await setDoc(doc(db, 'chats', chatId), {
                    participants: [user.uid, friendUid],
                    type: 'private',
                    accepted_by: [user.uid],
                    created_at: serverTimestamp()
                }, { merge: true });
                messageRequestActions.style.display = 'none';
                chatInputForm.classList.remove('blocked');
                updateChatBackground(null, 0.5);
            }
        });
        loadMessages(chatId);
    }

    function loadMessages(chatId) {
        if (unsubscribeMessages) unsubscribeMessages();
        const q = query(collection(db, `chats/${chatId}/messages`), orderBy('timestamp', 'asc'));
        unsubscribeMessages = onSnapshot(q, (snapshot) => {
            chatMessages.innerHTML = '';
            snapshot.forEach(docSnap => {
                const msg = docSnap.data();
                const isSent = msg.sender_id === user.uid;
                const msgEl = document.createElement('div');
                msgEl.className = `message ${isSent ? 'sent' : 'received'}`;
                msgEl.innerHTML = `<div class="message-bubble">${msg.text}</div><div class="message-info">${formatTime(msg.timestamp?.toDate())}</div>`;
                chatMessages.appendChild(msgEl);
            });
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            // Marca a notificação como lida se o usuário está ativamente com o chat aberto
            if (currentChatType === 'private') {
                try {
                    const qNotifs = query(
                        collection(db, 'profiles', user.uid, 'notifications'),
                        where('type', '==', 'offline_message'),
                        where('payload.chat_id', '==', chatId),
                        where('read', '==', false)
                    );
                    getDocs(qNotifs).then((snap) => {
                        const ps = [];
                        snap.forEach((d) => ps.push(updateDoc(doc(db, 'profiles', user.uid, 'notifications', d.id), { read: true })));
                        return Promise.all(ps);
                    }).catch(() => {});
                } catch(e) {}
            }
        });
    }

    chatInputForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text || !currentChatId) return;
        chatInput.value = '';
        try {
            await addDoc(collection(db, `chats/${currentChatId}/messages`), { text: text, sender_id: user.uid, timestamp: serverTimestamp() });
            await setDoc(doc(db, 'chats', currentChatId), { last_message: text, last_timestamp: serverTimestamp(), type: currentChatType, participants: currentChatId.split('_') }, { merge: true });

            if (currentChatType === 'private') {
                const otherId = currentChatId.split('_').find(id => id !== user.uid);
                if (otherId) {
                    const senderLabel = String(user.displayName || '').trim() || 'Aventureiro';
                    const notifId = `offline_message_${currentChatId}_${Date.now()}`;
                    await upsertNotification(otherId, notifId, {
                        type: 'offline_message',
                        title: `Nova mensagem de ${senderLabel}`,
                        body: `Mensagem: ${text.length > 50 ? text.slice(0, 50) + '...' : text}`,
                        payload: { sender_id: user.uid, sender_name: senderLabel, chat_id: currentChatId, preview: text.slice(0, 140) },
                        read: false,
                        created_at: serverTimestamp()
                    });
                }
            }
        } catch (err) { console.error(err); }
    });

    function positionContextMenu(e) {
        const menu = friendContextMenu;
        const pad = 8;
        menu.style.display = 'block';
        menu.style.left = '0px';
        menu.style.top = '0px';
        const rect = menu.getBoundingClientRect();
        const x = Math.min(window.innerWidth - rect.width - pad, Math.max(pad, e.clientX));
        const y = Math.min(window.innerHeight - rect.height - pad, Math.max(pad, e.clientY));
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
    }

    function showUserContextMenu(e, target, mode) {
        if (!friendContextMenu) return;
        e.preventDefault();

        const ctxView = document.getElementById('ctx-view-profile');
        const ctxAdd = document.getElementById('ctx-add-friend');
        const ctxMsg = document.getElementById('ctx-send-message');
        const ctxBlock = document.getElementById('ctx-block-user');
        const ctxUnfriend = document.getElementById('ctx-unfriend');

        if (ctxView) ctxView.style.display = 'block';
        if (ctxAdd) ctxAdd.style.display = mode === 'search' ? 'block' : 'none';
        if (ctxBlock) ctxBlock.style.display = mode === 'search' ? 'block' : 'none';
        if (ctxUnfriend) ctxUnfriend.style.display = mode === 'friend' ? 'block' : 'none';

        positionContextMenu(e);

        if (ctxView) ctxView.onclick = () => {
            friendContextMenu.style.display = 'none';
            openMiniProfile(target.id, target);
        };

        if (ctxAdd) ctxAdd.onclick = async () => {
            friendContextMenu.style.display = 'none';
            try {
                const status = await sendFriendRequest(target.id);
                if (status === 'accepted') alert("Vocês já são amigos!");
                else alert("Solicitação enviada!");
            } catch (err) {
                console.error("Erro no context menu (Add Friend):", err);
                alert("Erro ao enviar solicitação. Verifique o console.");
            }
        };

        if (ctxMsg) ctxMsg.onclick = () => {
            friendContextMenu.style.display = 'none';
            if (isBlocked(target.id)) {
                alert("Você bloqueou este usuário.");
                return;
            }
            startPrivateChat(target);
        };

        if (ctxBlock) ctxBlock.onclick = () => {
            friendContextMenu.style.display = 'none';
            if (confirm("Deseja bloquear este usuário?")) {
                blockUser(target.id);
                searchResults.classList.remove('visible');
            }
        };

        if (ctxUnfriend) ctxUnfriend.onclick = () => unfriend(target.id);

        positionContextMenu(e);
    }

    function showContextMenu(e, friend) {
        showUserContextMenu(e, friend, 'friend');
    }

    document.addEventListener('click', () => { if (friendContextMenu) friendContextMenu.style.display = 'none'; });

    function formatTime(date) { return date ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''; }

    function listenToGroups() {
        const q = query(collection(db, 'groups'), where('members', 'array-contains', user.uid));
        const groupsList = document.getElementById('groups-list');
        onSnapshot(q, (snapshot) => {
            groupsList.innerHTML = '';
            snapshot.forEach(doc => {
                const group = { id: doc.id, ...doc.data() };
                const item = document.createElement('div');
                item.className = 'group-item';
                item.innerHTML = `<div class="item-avatar" style="background-image: url('${group.image || 'https://via.placeholder.com/150?text=Grupo'}')"></div><div class="item-info"><span class="item-name">${group.name}</span><span class="item-sub">${group.members.length} membros</span></div>`;
                item.addEventListener('click', () => startGroupChat(group));
                groupsList.appendChild(item);
            });
        }, (error) => {
            console.error("Erro no onSnapshot groups:", error);
            if (groupsList) {
                groupsList.innerHTML = '<p style="padding: 1.5rem; text-align: center; font-size: 0.85rem; color: var(--dashboard-text-muted);">Sem permissão para listar grupos.</p>';
            }
        });
    }

    async function startGroupChat(group) {
        console.log("Iniciando chat de grupo:", group.name);
        currentChatId = group.id;
        currentChatType = 'group';
        noChatPlaceholder.style.display = 'none';
        activeChatWrapper.style.display = 'flex';
        chatHeaderName.textContent = group.name;
        chatHeaderStatus.textContent = `${group.members.length} membros`;
        chatHeaderAvatar.style.backgroundImage = `url('${group.image || 'https://via.placeholder.com/150?text=Grupo'}')`;
        
        // Mostrar botão de gerenciar membros (👤+) apenas em grupos
        if (chatMembersBtn) {
            console.log("Mostrando botão de membros");
            chatMembersBtn.style.display = 'flex';
        } else {
            console.warn("Elemento chatMembersBtn não encontrado!");
        }

        closeSidebarOnMobile();
        if (unsubscribeChatDoc) unsubscribeChatDoc();
        unsubscribeChatDoc = onSnapshot(doc(db, 'groups', group.id), (docSnap) => {
            if (docSnap.exists()) {
                const groupData = docSnap.data();
                updateChatBackground(groupData.background_url, groupData.background_opacity || 0.5);
                chatHeaderName.textContent = groupData.name;
            }
        });
        loadMessages(group.id);
    }

    async function applyDeepLink() {
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab');
        if (tab) switchTab(tab);

        const chat = params.get('chat');
        if (chat === 'private') {
            const uid = params.get('uid');
            if (!uid) return;
            try {
                const pDoc = await getDoc(doc(db, 'profiles', uid));
                if (!pDoc.exists()) return;
                await startPrivateChat({ id: uid, ...pDoc.data() });
            } catch {}
        }
    }

    listenToFriendships();
    listenToGroups();
    await applyDeepLink();
});
