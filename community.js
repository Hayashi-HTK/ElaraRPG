import { 
    auth, db, collection, doc, getDoc, getDocs, query, where, 
    orderBy, addDoc, updateDoc, deleteDoc, setDoc, serverTimestamp, 
    onAuthStateChanged, waitForAuth, arrayUnion, onSnapshot 
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
    const mobileNavContent = document.getElementById('mobile-nav-content');
    const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
    const sidebarContent = document.querySelector('.sidebar-content');

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

    let currentChatId = null;
    let currentChatType = null;
    let unsubscribeMessages = null;
    let unsubscribeChatDoc = null;

    // --- Lógica de Pesquisa de Players ---
    async function openProfilePopup(uid) {
        if (!uid) return;

        try {
            const profileRef = doc(db, 'profiles', uid);
            const profileDoc = await getDoc(profileRef);
            
            if (!profileDoc.exists()) {
                alert("Perfil não encontrado.");
                return;
            }

            const data = profileDoc.data();
            const avatarUrl = data.avatar_url || 'https://via.placeholder.com/150?text=Avatar';
            const bannerUrl = data.banner_url || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1000&auto=format&fit=crop';
            const displayName = data.full_name || "Aventureiro Desconhecido";
            const nickname = data.nickname || "viajante";
            const level = data.level || 1;
            const xp = data.xp || 0;
            const playStyle = data.play_style || "Explorador";
            const bio = data.bio || `Um aventureiro ${playStyle.toLowerCase()} que percorre as terras de ELARA em busca de desafios e glória.`;
            const isUserAdmin = data.is_admin || (data.email === 'hayagames@outlook.com');
            const planKey = String(data.plan || '').trim().toLowerCase();
            const isPremium = isUserAdmin || data.is_premium || planKey === 'basic' || planKey === 'premium';
            const title = isUserAdmin ? 'ADM' : (data.title || 'Jogador');
            const currentFrame = isUserAdmin ? 'adm' : (data.current_frame || 'wood');
            const friendsCount = data.friends_count || 0;

            const isOwnProfile = uid === user.uid;

            // Verifica o status de amizade atual
            let friendshipStatus = null;
            if (!isOwnProfile) {
                const friendshipId = [user.uid, uid].sort().join('_');
                const friendshipDoc = await getDoc(doc(db, 'friendships', friendshipId));
                if (friendshipDoc.exists()) {
                    friendshipStatus = friendshipDoc.data().status;
                }
            }

            profileModalContainer.innerHTML = `
                <div class="modal-overlay visible">
                    <div class="modal-content profile-modal-content">
                        <button class="modal-close-btn">&times;</button>
                        
                        <div class="profile-popup-banner" style="background-image: url('${bannerUrl}')">
                            ${isPremium ? '<span class="badge-premium">PREMIUM</span>' : ''}
                        </div>
                        
                        <div class="profile-popup-info">
                            <div class="profile-popup-avatar" style="background-image: url('${avatarUrl}')">
                                <div class="frame-glow glow-${currentFrame.toLowerCase()}"></div>
                                <div class="frame-border frame-${currentFrame.toLowerCase()}"></div>
                            </div>
                            <h2 class="profile-popup-name">${displayName}</h2>
                            <div class="profile-popup-subtitle">
                                <span class="profile-popup-nickname">@${nickname}</span>
                                <span class="profile-popup-title">${title}</span>
                            </div>
                            
                            <div class="profile-popup-stats">
                                <div class="profile-popup-stat">
                                    <span class="popup-stat-label">Nível</span>
                                    <span class="popup-stat-value">${level}</span>
                                </div>
                                <div class="profile-popup-stat">
                                    <span class="popup-stat-label">XP</span>
                                    <span class="popup-stat-value">${xp}</span>
                                </div>
                                <div class="profile-popup-stat">
                                    <span class="popup-stat-label">Amigos</span>
                                    <span class="popup-stat-value">${friendsCount}</span>
                                </div>
                            </div>
                            
                            <p class="profile-popup-bio">${bio}</p>
                            
                            <div class="profile-popup-actions">
                                ${!isOwnProfile ? `
                                    <button class="btn-primary" id="add-friend-btn" ${friendshipStatus ? 'disabled' : ''}>
                                        ${friendshipStatus === 'accepted' ? 'Amigos' : (friendshipStatus === 'pending' ? 'Pendente' : 'Adicionar Amigo')}
                                    </button>
                                    <button class="btn-secondary" id="msg-popup-btn">Mandar Mensagem</button>
                                ` : ''}
                                <button class="btn-secondary" id="view-full-profile" style="${isOwnProfile ? 'flex: 1' : ''}">
                                    ${isOwnProfile ? 'Meu Perfil Completo' : 'Ver Perfil Completo'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const closeProfilePopup = () => {
                const modalOverlay = profileModalContainer.querySelector('.modal-overlay');
                if (modalOverlay) {
                    modalOverlay.classList.remove('visible');
                    setTimeout(() => { profileModalContainer.innerHTML = ''; }, 300);
                }
            };

            profileModalContainer.querySelector('.modal-close-btn').onclick = closeProfilePopup;
            profileModalContainer.querySelector('.modal-overlay').onclick = (e) => {
                if (e.target.classList.contains('modal-overlay')) closeProfilePopup();
            };
            
            if (!isOwnProfile) {
                document.getElementById('add-friend-btn').addEventListener('click', async () => {
                    const addBtn = document.getElementById('add-friend-btn');
                    addBtn.disabled = true;
                    addBtn.textContent = "Enviando...";

                    try {
                        const friendshipId = [user.uid, uid].sort().join('_');
                        const friendshipRef = doc(db, 'friendships', friendshipId);
                        const friendshipDoc = await getDoc(friendshipRef);

                        if (friendshipDoc.exists()) {
                            const status = friendshipDoc.data().status;
                            if (status === 'accepted') alert("Vocês já são amigos!");
                            else if (status === 'pending') alert("Já existe uma solicitação pendente.");
                            addBtn.textContent = "Pendente";
                            return;
                        }

                        await setDoc(friendshipRef, {
                            participants: [user.uid, uid],
                            sender_id: user.uid,
                            receiver_id: uid,
                            status: 'pending',
                            created_at: serverTimestamp()
                        });

                        alert(`Pedido de amizade enviado para ${displayName}!`);
                        addBtn.textContent = "Pendente";
                        
                        // Opcional: Notificar o usuário via outro canal se necessário
                    } catch (err) {
                        console.error("Erro ao enviar solicitação:", err);
                        alert("Erro ao enviar pedido de amizade: " + err.message);
                        addBtn.disabled = false;
                        addBtn.textContent = "Adicionar Amigo";
                    }
                });

                document.getElementById('msg-popup-btn').addEventListener('click', () => {
                    profileModalContainer.innerHTML = '';
                    startPrivateChat({ id: uid, nickname, avatar_url: avatarUrl });
                });
            }

            document.getElementById('view-full-profile').addEventListener('click', () => {
                window.location.href = `profile.html?uid=${uid}`;
            });

        } catch (err) { console.error("Erro ao carregar perfil:", err); }
    }

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
            searchResults.classList.remove('visible');
            return;
        }

        try {
            // Busca simplificada ('search_nickname')
            const q = query(collection(db, 'profiles'), where('nickname', '>=', queryText), where('nickname', '<=', queryText + '\uf8ff'));
            const snapshot = await getDocs(q);
            
            searchResults.innerHTML = '';
            let count = 0;

            snapshot.forEach(d => {
                if (d.id === user.uid) return;
                const p = d.data();
                
                // Ocultar o Boss Final da pesquisa da comunidade
                if (p.nickname && p.nickname.toUpperCase() === 'THE FIRST') return;
                if (p.full_name && p.full_name.toUpperCase() === 'THE FIRST') return;

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
                    searchResults.classList.remove('visible');
                    playerSearchInput.value = '';
                    openProfilePopup(d.id);
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
        
        // Salvar preferência no localStorage
        localStorage.setItem('sidebarCollapsed', isCollapsed);
    });

    // Restaurar estado da sidebar
    if (localStorage.getItem('sidebarCollapsed') === 'true') {
        communitySidebar.classList.add('collapsed');
        if (communityContainer) communityContainer.classList.add('sidebar-collapsed');
        const icon = sidebarToggle.querySelector('.toggle-icon');
        if (icon) icon.textContent = '❯';
    }

    // Auto-colapsar em telas menores que 1100px na carga inicial
    if (window.innerWidth <= 1100 && window.innerWidth > 768) {
        communitySidebar.classList.add('collapsed');
        if (communityContainer) communityContainer.classList.add('sidebar-collapsed');
        const icon = sidebarToggle.querySelector('.toggle-icon');
        if (icon) icon.textContent = '❯';
    }

    // --- Lógica de Mobile Nav (Menu Inferior) ---
    function setupMobileNav() {
        const closeMobileNav = () => {
            communitySidebar.classList.remove('mobile-open');
            mobileNavOverlay.classList.remove('visible');
            mobileNavBtns.forEach(b => b.classList.remove('active'));
            // Se o chat estiver ativo, marcar o botão de chat
            if (activeChatWrapper.style.display !== 'none') {
                const chatBtn = Array.from(mobileNavBtns).find(b => b.dataset.tab === 'chat-list');
                if (chatBtn) chatBtn.classList.add('active');
            }
        };

        const openMobileNav = (tabName) => {
            if (tabName === 'chat-list') {
                closeMobileNav();
                return;
            }

            communitySidebar.classList.add('mobile-open');
            mobileNavOverlay.classList.add('visible');
            
            // Mudar tab na sidebar original
            const originalTab = Array.from(sidebarTabs).find(t => t.dataset.tab === tabName);
            if (originalTab) originalTab.click();
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

                mobileNavBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                openMobileNav(tabName);
            });
        });
    }

    function closeSidebarOnMobile() {
        if (window.innerWidth <= 768) {
            communitySidebar.classList.remove('mobile-open');
            mobileNavOverlay.classList.remove('visible');
            
            // Ativa o ícone de chat no bottom nav
            mobileNavBtns.forEach(b => b.classList.remove('active'));
            const chatBtn = Array.from(mobileNavBtns).find(b => b.dataset.tab === 'chat-list');
            if (chatBtn) chatBtn.classList.add('active');
        }
    }

    setupMobileNav();

    // --- Lógica de Modais ---
    function openModal(modal) { 
        if (modal) modal.classList.add('visible'); 
    }
    
    function closeModal(modal) { 
        if (modal) modal.classList.remove('visible'); 
    }

    // Gerenciamento de Tabs no Modal de Configurações
    if (settingsTabs) {
        settingsTabs.forEach(btn => {
            btn.addEventListener('click', () => {
                settingsTabs.forEach(t => t.classList.remove('active'));
                settingsSections.forEach(s => s.classList.remove('visible'));
                btn.classList.add('active');
                const target = document.getElementById(btn.dataset.target);
                if (target) target.classList.add('visible');
            });
        });
    }

    document.querySelectorAll('.modal-close-btn, .modal-cancel').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.closest('.modal-overlay')));
    });

    if (createGroupBtn) {
        createGroupBtn.addEventListener('click', () => openModal(modalCreateGroup));
    }
    
    if (chatSettingsBtn) {
        chatSettingsBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (!currentChatId) {
                alert("Selecione uma conversa primeiro!");
                return;
            }
            
            // Abrir modal imediatamente
            openModal(modalChatSettings);
            
            // Reset tabs
            if (settingsTabs && settingsTabs.length > 0) {
                settingsTabs.forEach(t => t.classList.remove('active'));
                settingsSections.forEach(s => s.classList.remove('visible'));
                settingsTabs[0].classList.add('active');
                const defaultTarget = document.getElementById(settingsTabs[0].dataset.target);
                if (defaultTarget) defaultTarget.classList.add('visible');
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
                        if (adminTabBtn) adminTabBtn.style.display = 'none';
                    }
                }
            } catch (err) {
                console.error("Erro ao carregar configurações:", err);
            }
        });
    }

    // Ações de Administração do Grupo
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

    // Salvar Fundo do Chat
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
            
            // Dados para salvar
            const updateData = { 
                background_url: url,
                background_opacity: opacity
            };

            // Se for chat privado, garantimos que os participantes estejam no documento
            // para que as regras de segurança permitam a escrita se o doc for novo
            if (currentChatType === 'private') {
                updateData.participants = currentChatId.split('_');
                updateData.type = 'private';
            }

            await setDoc(chatRef, updateData, { merge: true });

            updateChatBackground(url, opacity);
            closeModal(modalChatSettings);
            
            // Feedback visual de sucesso
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

    // --- Lógica de Presença ---
    async function updatePresence(status) {
        const userRef = doc(db, 'profiles', user.uid);
        await updateDoc(userRef, { status: status, last_seen: serverTimestamp() });
    }
    updatePresence('online');
    window.addEventListener('beforeunload', () => updatePresence('offline'));

    // --- Sidebar Tabs ---
    sidebarTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            sidebarTabs.forEach(t => t.classList.remove('active'));
            tabSections.forEach(s => s.classList.remove('active'));
            tab.classList.add('active');
            
            const targetMap = { 
                'friends': 'friends-list-section', 
                'groups': 'groups-list-section', 
                'requests': 'requests-list-section',
                'message-requests': 'message-requests-list-section'
            };
            
            const targetId = targetMap[tab.dataset.tab];
            if (targetId) {
                const targetSection = document.getElementById(targetId);
                if (targetSection) targetSection.classList.add('active');
            }

            // Sincronizar com botões mobile
            mobileNavBtns.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === tab.dataset.tab);
            });
        });
    });

    // --- Lógica de Amizades ---
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
        });

        // Solicitações Recebidas
        const qPending = query(collection(db, 'friendships'), where('receiver_id', '==', user.uid), where('status', '==', 'pending'));
        onSnapshot(qPending, async (snapshot) => {
            const requests = [];
            for (const d of snapshot.docs) {
                const data = d.data();
                const senderDoc = await getDoc(doc(db, 'profiles', data.sender_id));
                if (senderDoc.exists()) requests.push({ request_id: d.id, ...data, sender_data: senderDoc.data() });
            }
            renderRequests(requests);
        });

        // Solicitações de Mensagem (Conversas com não-amigos que eu recebi)
        const qMsgRequests = query(collection(db, 'chats'), where('participants', 'array-contains', user.uid), where('type', '==', 'private'));
        onSnapshot(qMsgRequests, async (snapshot) => {
            const requests = [];
            for (const d of snapshot.docs) {
                const data = d.data();
                // Verificar se a conversa ainda não foi aceita por mim
                const acceptedBy = data.accepted_by || [];
                if (!acceptedBy.includes(user.uid)) {
                    const otherId = data.participants.find(id => id !== user.uid);
                    // Só é solicitação se o outro mandou mensagem e eu ainda não aceitei
                    // E se não somos amigos oficialmente
                    const friendDoc = await getDoc(doc(db, 'friendships', [user.uid, otherId].sort().join('_')));
                    if (!friendDoc.exists() || friendDoc.data().status !== 'accepted') {
                        const otherDoc = await getDoc(doc(db, 'profiles', otherId));
                        if (otherDoc.exists()) {
                            requests.push({ id: d.id, ...data, other_data: otherDoc.data(), other_id: otherId });
                        }
                    }
                }
            }
            renderMessageRequests(requests);
        });

        // Solicitações Enviadas
        const qSent = query(collection(db, 'friendships'), where('sender_id', '==', user.uid), where('status', '==', 'pending'));
        onSnapshot(qSent, async (snapshot) => {
            const sentRequests = [];
            for (const d of snapshot.docs) {
                const data = d.data();
                const receiverDoc = await getDoc(doc(db, 'profiles', data.receiver_id));
                if (receiverDoc.exists()) sentRequests.push({ request_id: d.id, ...data, receiver_data: receiverDoc.data() });
            }
            renderSentRequests(sentRequests);
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
                <div class="item-avatar" style="background-image: url('${req.receiver_data.avatar_url || 'https://via.placeholder.com/150?text=Avatar'}')">
                    <div class="frame-border frame-${req.receiver_data.current_frame || 'wood'}" style="border-width: 2px;"></div>
                </div>
                <div class="item-info">
                    <span class="item-name">${req.receiver_data.nickname || req.receiver_data.full_name}</span>
                    <div class="request-actions">
                        <button class="request-btn decline cancel-request" data-id="${req.request_id}">Cancelar</button>
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
        } catch (err) {
            console.error("Erro ao cancelar solicitação:", err);
            alert("Erro ao cancelar: " + err.message);
        }
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
                <div class="item-avatar" style="background-image: url('${friend.avatar_url || 'https://via.placeholder.com/150?text=Avatar'}')">
                    <div class="frame-glow glow-${(friend.current_frame || 'wood').toLowerCase()}"></div>
                    <div class="frame-border frame-${(friend.current_frame || 'wood').toLowerCase()}"></div>
                    <span class="item-status ${isOnline ? 'online' : ''}"></span>
                </div>
                <div class="item-info">
                    <span class="item-name">${friend.nickname || friend.full_name || 'Aventureiro'}</span>
                    <span class="item-sub ${isOnline ? 'online' : 'offline'}">${isOnline ? 'Online' : 'Offline'}</span>
                </div>
            `;
            item.addEventListener('click', () => startPrivateChat(friend));
            item.addEventListener('contextmenu', (e) => showContextMenu(e, friend));
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
            item.dataset.sender = req.sender_id; // Adicionado para mobile
            item.innerHTML = `
                <div class="item-avatar" style="background-image: url('${req.sender_data.avatar_url || 'https://via.placeholder.com/150?text=Avatar'}')">
                    <div class="frame-glow glow-${(req.sender_data.current_frame || 'wood').toLowerCase()}"></div>
                    <div class="frame-border frame-${(req.sender_data.current_frame || 'wood').toLowerCase()}" style="border-width: 2px;"></div>
                </div>
                <div class="item-info">
                    <span class="item-name">${req.sender_data.nickname || req.sender_data.full_name}</span>
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
            
            // Recarregar UI ou deixar o snapshot agir
        } catch (err) { console.error("Erro ao aceitar:", err); }
    }

    async function declineRequest(requestId) {
        if (!confirm("Deseja recusar esta solicitação?")) return;
        try { await deleteDoc(doc(db, 'friendships', requestId)); } catch (err) { console.error("Erro ao recusar:", err); }
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
        } catch (err) { console.error("Erro ao desfazer amizade:", err); }
    }

    // --- Sistema de Chat ---
    function renderMessageRequests(requests) {
        if (!messageRequestsList) return;
        messageRequestsList.innerHTML = '';
        
        const count = requests.length;
        msgRequestsBadge.textContent = count;
        msgRequestsBadge.style.display = count > 0 ? 'inline-block' : 'none';

        if (count === 0) {
            messageRequestsList.innerHTML = '<p style="padding: 1.5rem; text-align: center; font-size: 0.85rem; color: var(--dashboard-text-muted);">Nenhuma conversa pendente.</p>';
            return;
        }

        requests.forEach(req => {
            const item = document.createElement('div');
            item.className = 'friend-item';
            item.innerHTML = `
                <div class="item-avatar" style="background-image: url('${req.other_data.avatar_url || 'https://via.placeholder.com/150?text=Avatar'}')">
                    <div class="frame-glow glow-${(req.other_data.current_frame || 'wood').toLowerCase()}"></div>
                    <div class="frame-border frame-${(req.other_data.current_frame || 'wood').toLowerCase()}"></div>
                </div>
                <div class="item-info">
                    <span class="item-name">${req.other_data.nickname || req.other_data.full_name}</span>
                    <span class="item-last-msg" style="font-size: 0.7rem; color: var(--dashboard-text-muted); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${req.last_message || 'Nova conversa'}</span>
                </div>
            `;
            item.onclick = () => startPrivateChat({ id: req.other_id, ...req.other_data });
            messageRequestsList.appendChild(item);
        });
    }

    async function startPrivateChat(friend) {
        const chatId = [user.uid, friend.id].sort().join('_');
        currentChatId = chatId;
        currentChatType = 'private';
        noChatPlaceholder.style.display = 'none';
        activeChatWrapper.style.display = 'flex';
        chatHeaderName.textContent = friend.nickname || friend.full_name;
        chatHeaderStatus.textContent = friend.status === 'online' ? 'Online' : 'Offline';
        chatHeaderAvatar.style.backgroundImage = `url('${friend.avatar_url || 'https://via.placeholder.com/150?text=Avatar'}')`;
        
        closeSidebarOnMobile();
        if (unsubscribeChatDoc) unsubscribeChatDoc();
        unsubscribeChatDoc = onSnapshot(doc(db, 'chats', chatId), async (docSnap) => {
            if (docSnap.exists()) {
                const chatData = docSnap.data();
                const acceptedBy = chatData.accepted_by || [];
                
                // Se eu ainda não aceitei, mostrar banner de ações
                if (!acceptedBy.includes(user.uid)) {
                    // Verificar se somos amigos. Se formos, aceita automaticamente.
                    const friendDoc = await getDoc(doc(db, 'friendships', [user.uid, friend.id].sort().join('_')));
                    if (friendDoc.exists() && friendDoc.data().status === 'accepted') {
                        await updateDoc(doc(db, 'chats', chatId), {
                            accepted_by: arrayUnion(user.uid)
                        });
                        messageRequestActions.style.display = 'none';
                        chatInputForm.classList.remove('blocked');
                    } else {
                        messageRequestActions.style.display = 'block';
                        chatInputForm.classList.add('blocked');
                        
                        // Configurar botões
                        acceptMsgBtn.onclick = async () => {
                            await updateDoc(doc(db, 'chats', chatId), {
                                accepted_by: arrayUnion(user.uid)
                            });
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
                // Se o chat não existe, é uma nova conversa iniciada por mim
                await setDoc(doc(db, 'chats', chatId), {
                    participants: [user.uid, friend.id],
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
            snapshot.forEach(doc => {
                const msg = doc.data();
                const isSent = msg.sender_id === user.uid;
                const msgEl = document.createElement('div');
                msgEl.className = `message ${isSent ? 'sent' : 'received'}`;
                msgEl.innerHTML = `<div class="message-bubble">${msg.text}</div><div class="message-info">${formatTime(msg.timestamp?.toDate())}</div>`;
                chatMessages.appendChild(msgEl);
            });
            chatMessages.scrollTop = chatMessages.scrollHeight;
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
        } catch (err) { console.error("Erro ao enviar mensagem:", err); }
    });

    // --- Menu de Contexto ---
    function showContextMenu(e, friend) {
        e.preventDefault();
        friendContextMenu.style.display = 'block';
        friendContextMenu.style.left = `${e.pageX}px`;
        friendContextMenu.style.top = `${e.pageY}px`;
        document.getElementById('ctx-view-profile').onclick = () => {
            friendContextMenu.style.display = 'none';
            openProfilePopup(friend.id);
        };
        document.getElementById('ctx-send-message').onclick = () => {
            friendContextMenu.style.display = 'none';
            startPrivateChat(friend);
        };
        document.getElementById('ctx-unfriend').onclick = () => unfriend(friend.id);
    }
    document.addEventListener('click', () => { friendContextMenu.style.display = 'none'; });

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
        });
    }

    async function startGroupChat(group) {
        currentChatId = group.id;
        currentChatType = 'group';
        noChatPlaceholder.style.display = 'none';
        activeChatWrapper.style.display = 'flex';
        chatHeaderName.textContent = group.name;
        chatHeaderStatus.textContent = `${group.members.length} membros`;
        chatHeaderAvatar.style.backgroundImage = `url('${group.image || 'https://via.placeholder.com/150?text=Grupo'}')`;
        
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

    listenToFriendships();
    listenToGroups();
});
