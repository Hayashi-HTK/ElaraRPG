
import { auth, db, collection, addDoc, getDocs, query, where, doc, getDoc, waitForAuth, deleteDoc, setDoc, serverTimestamp } from './firebase.js';

export const defaultEnemies = [
    {
        id: 'def_1',
        name: 'Goblin',
        type: 'Humanoide Pequeno',
        species: 'Humanoide',
        level: 1,
        image: 'https://i.postimg.cc/J7c05S4m/Goblins.png',
        description: 'Criaturas pequenas e maliciosas que vivem em tribos e emboscam viajantes desavisados.',
        stats: { hp: '7 (2d6)', ac: 15, speed: '9m' },
        is_default: true
    },
    {
        id: 'def_2',
        name: 'Esqueleto',
        type: 'Morto-Vivo Médio',
        species: 'Morto-Vivo',
        level: 1,
        image: 'https://i.postimg.cc/59qySDNJ/esqueleto.png',
        description: 'Restos reanimados de mortos, que obedecem cegamente às ordens de seu mestre necromante.',
        stats: { hp: '13 (2d8 + 4)', ac: 13, speed: '9m' },
        is_default: true
    },
    {
        id: 'def_3',
        name: 'Lobo Atroz',
        type: 'Besta Média',
        species: 'Besta',
        level: 2,
        image: 'https://wiki.runarcana.org/images/d/dc/Lobo_Atroz.png',
        description: 'Um lobo anormalmente grande e feroz, conhecido por sua astúcia e força predatória.',
        stats: { hp: '37 (5d10 + 10)', ac: 14, speed: '15m' },
        is_default: true
    },
    {
        id: 'def_4',
        name: 'Zumbi de Elite',
        type: 'Morto-Vivo Médio',
        species: 'Morto-Vivo',
        level: 2,
        image: 'https://i.postimg.cc/qRPdh6jk/Zumbi.png',
        description: 'Um cadáver reanimado que reteve parte de sua força bruta e resistência, tornando-se uma ameaça muito maior que um zumbi comum.',
        stats: { hp: '45 (6d10 + 12)', ac: 10, speed: '6m' },
        is_default: true
    },
    {
        id: 'def_5',
        name: 'Gárgula',
        type: 'Elemental Médio',
        species: 'Elemental',
        level: 3,
        image: 'https://i.postimg.cc/7YgqzXvY/Gargula.png',
        description: 'Uma estátua de pedra que ganha vida, servindo como guardiã incansável de templos e castelos antigos.',
        stats: { hp: '52 (7d8 + 21)', ac: 15, speed: '9m, voo 18m' },
        is_default: true
    },
    {
        id: 'def_6',
        name: 'Aranha Gigante',
        type: 'Besta Grande',
        species: 'Besta',
        level: 3,
        image: 'https://i.postimg.cc/hvmcp1fp/Aranha.png',
        description: 'Uma predadora colossal que usa suas teias pegajosas para imobilizar presas antes de desferir uma picada venenosa fatal.',
        stats: { hp: '44 (8d8 + 8)', ac: 14, speed: '9m, escalar 9m' },
        is_default: true
    },
    {
        id: 'def_7',
        name: 'Golem de Ferro',
        type: 'Construto Grande',
        species: 'Construto',
        level: 4,
        image: 'https://i.postimg.cc/nLwxxPmj/Golem.png',
        description: 'Um construto maciço de metal, imune à maioria das formas de dano e possuindo uma força física devastadora.',
        stats: { hp: '210 (20d10 + 100)', ac: 20, speed: '9m' },
        is_default: true
    },
    {
        id: 'def_8',
        name: 'Quimera',
        type: 'Monstruosidade Grande',
        species: 'Besta',
        level: 4,
        image: 'https://i.postimg.cc/MKwhCS4p/Quimera.jpg',
        description: 'Uma abominação com cabeças de leão, bode e dragão, capaz de atacar de múltiplas formas simultaneamente.',
        stats: { hp: '114 (12d10 + 48)', ac: 14, speed: '9m, voo 18m' },
        is_default: true
    },
    {
        id: 'def_9',
        name: 'Observador',
        type: 'Aberração Grande',
        species: 'Aberração',
        level: 5,
        image: 'https://i.postimg.cc/13YfN6RG/Observador.png',
        description: 'Uma criatura tirânica e xenófoba que dispara raios mágicos de seus múltiplos olhos.',
        stats: { hp: '180 (19d10 + 76)', ac: 18, speed: '0m, voo 6m' },
        is_default: true
    },
    {
        id: 'def_10',
        name: 'Dragão Vermelho',
        type: 'Dragão Enorme',
        species: 'Dragão',
        level: 5,
        image: 'https://img.pikbest.com/origin/09/30/95/865pIkbEsTAcw.png!sw800',
        description: 'Um dragão vaidoso e ganancioso, cujo sopro de fogo pode incinerar exércitos inteiros.',
        stats: { hp: '256 (19d12 + 133)', ac: 19, speed: '12m, voo 24m' },
        is_default: true
    },
    {
        id: 'def_boss_1',
        name: 'THE FIRST',
        type: 'Deus Primordial',
        species: 'Divindade',
        level: 5,
        image: 'assets/inimigos/The first.png',
        description: 'O primeiro e único Deus, uma entidade de poder incomensurável que observa o destino de todos os seres em ELARA.',
        stats: { hp: '999 (???)', ac: 25, speed: 'Teletransporte' },
        is_default: true
    }
];

document.addEventListener('DOMContentLoaded', async () => {
    // const defaultEnemies = [ ... ] foi removido daqui e movido para o topo com export

    let communityEnemies = [];
    let currentSourceFilter = 'all';
    let currentLevelFilter = '';
    let currentSpeciesFilter = '';

    const enemiesGrid = document.getElementById('enemies-grid');
    const communityGrid = document.getElementById('community-enemies-grid');
    const communityTitle = document.getElementById('community-title');
    const modalContainer = document.getElementById('enemy-modal-container');
    const profileModalContainer = document.getElementById('profile-modal-container');

    const user = await waitForAuth();

    // Sistema de Áudio para Bosses
    let bossAudio = null;
    const THE_FIRST_THEME = 'assets/song/track3.mp3'; // COLOQUE O LINK DA MÚSICA AQUI

    function playBossMusic(url) {
        if (bossAudio) {
            bossAudio.pause();
            bossAudio = null;
        }
        bossAudio = new Audio(url);
        bossAudio.loop = true;
        bossAudio.volume = 0.5;
        bossAudio.play().catch(e => console.log("Autoplay bloqueado pelo navegador. Clique no modal para tocar."));
    }

    function stopBossMusic() {
        if (bossAudio) {
            bossAudio.pause();
            bossAudio = null;
        }
    }

    async function loadCommunityEnemies() {
        try {
            const q = query(collection(db, 'enemies'));
            const snapshot = await getDocs(q);
            communityEnemies = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                is_default: false
            }));
        } catch (error) {
            console.error("Erro ao carregar inimigos da comunidade:", error);
        }
    }

    function renderEnemyCards() {
        if (!enemiesGrid) return;
        
        enemiesGrid.innerHTML = '';
        communityGrid.innerHTML = '';
        const finalBossGrid = document.getElementById('final-boss-grid');
        const finalBossContainer = document.getElementById('final-boss-container');
        if (finalBossGrid) finalBossGrid.innerHTML = '';

        const allEnemies = [...defaultEnemies, ...communityEnemies];
        
        const filteredEnemies = allEnemies.filter(enemy => {
            const matchesLevel = !currentLevelFilter || enemy.level.toString() === currentLevelFilter;
            const matchesSpecies = !currentSpeciesFilter || enemy.species === currentSpeciesFilter;
            const matchesSource = currentSourceFilter === 'all' || 
                                 (currentSourceFilter === 'official' && enemy.is_default) || 
                                 (currentSourceFilter === 'community' && !enemy.is_default);
            return matchesLevel && matchesSpecies && matchesSource;
        });

        // Separar o Boss Final (THE FIRST)
        const finalBoss = filteredEnemies.find(e => e.name.toUpperCase() === 'THE FIRST');
        const others = filteredEnemies.filter(e => e.name.toUpperCase() !== 'THE FIRST');

        if (finalBoss && finalBossGrid) {
            finalBossContainer.style.display = 'block';
            const bossCard = createCardElement(finalBoss);
            bossCard.classList.add('final-boss');
            finalBossGrid.appendChild(bossCard);
        } else if (finalBossContainer) {
            finalBossContainer.style.display = 'none';
        }

        const officialFiltered = others.filter(e => e.is_default);
        const communityFiltered = others.filter(e => !e.is_default);

        officialFiltered.forEach(enemy => {
            enemiesGrid.appendChild(createCardElement(enemy));
        });

        if (communityFiltered.length > 0) {
            communityTitle.style.display = 'block';
            communityFiltered.forEach(enemy => {
                communityGrid.appendChild(createCardElement(enemy));
            });
        } else {
            communityTitle.style.display = 'none';
        }
    }

    function createCardElement(enemy) {
        const card = document.createElement('div');
        card.className = 'enemy-card';
        
        let stars = '';
        for (let i = 0; i < enemy.level; i++) {
            stars += '<span class="star">★</span>';
        }

        const badge = enemy.is_default ? '' : '<div class="community-badge">Comunidade</div>';
        const creatorInfo = enemy.is_default ? '' : `
            <a href="profile.html?uid=${enemy.creator_id}" class="creator-link">
                Por: <strong>${enemy.creator_name || 'Anônimo'}</strong>
            </a>
        `;

        card.innerHTML = `
            ${badge}
            <div class="enemy-card-image">
                <img src="${enemy.image}" alt="${enemy.name}" onerror="this.src='https://wiki.runarcana.org/images/d/dc/Lobo_Atroz.png'">
            </div>
            <div class="enemy-card-content">
                <div>
                    <h3 class="enemy-name">${enemy.name}</h3>
                    <p class="enemy-type">${enemy.type}</p>
                    ${creatorInfo}
                </div>
                <div class="enemy-stars">
                    ${stars}
                </div>
            </div>
        `;
        card.addEventListener('click', (e) => {
            const creatorLink = e.target.closest('.creator-link');
            if (creatorLink) {
                e.preventDefault();
                e.stopPropagation();
                openProfilePopup(enemy.creator_id);
                return;
            }
            openEnemyModal(enemy);
        });
        return card;
    }

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
            
            // Banner padrão
            const defaultBanner = 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1000&auto=format&fit=crop';
            const bannerUrl = data.banner_url || defaultBanner;
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
            const towerRecord = data.tower_record || 0;

            const isOwnProfile = uid === user.uid;

            // Verificar status de amizade atual
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

                            ${towerRecord > 0 ? `
                            <div class="tower-record-badge" style="background: rgba(255, 215, 0, 0.1); border: 1px solid #ffd700; color: #ffd700; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; margin: 10px auto; display: inline-block;">
                                <i class="fas fa-chess-rook"></i> Recorde na Torre: <strong>${towerRecord} Andares</strong>
                            </div>
                            ` : ''}
                            
                            <div class="profile-popup-stats">
                                <div class="profile-popup-stat">
                                    <span class="popup-stat-label">Nível</span>
                                    <span class="popup-stat-value">${level}</span>
                                </div>
                                <div class="profile-popup-stat">
                                    <span class="popup-stat-label">XP</span>
                                    <span class="popup-stat-value">${xp}</span>
                                </div>
                                <div class="profile-popup-stat" id="view-friends-btn" style="cursor: pointer;">
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
                                    <button class="btn-secondary" id="msg-btn">Mandar Mensagem</button>
                                ` : ''}
                                <button class="btn-secondary" id="view-full-profile" style="${isOwnProfile ? 'flex: 1' : ''}">
                                    ${isOwnProfile ? 'Ver Meu Perfil' : 'Ver Perfil'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            profileModalContainer.querySelector('.modal-close-btn').addEventListener('click', closeProfileModal);
            profileModalContainer.querySelector('.modal-overlay').addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-overlay')) closeProfileModal();
            });
            
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
                    } catch (err) {
                        console.error("Erro ao adicionar amigo:", err);
                        addBtn.disabled = false;
                        addBtn.textContent = "Adicionar Amigo";
                    }
                });

                document.getElementById('msg-btn').addEventListener('click', () => {
                    alert("Redirecionando para o chat...");
                    window.location.href = `community.html?chat=${uid}`;
                });
            }

            document.getElementById('view-full-profile').addEventListener('click', () => {
                window.location.href = `profile.html?uid=${uid}`;
            });

            const viewFriendsBtn = document.getElementById('view-friends-btn');
            if (viewFriendsBtn) {
                viewFriendsBtn.addEventListener('click', () => {
                    alert(`Este usuário tem ${friendsCount} amigos em ELARA RPG!`);
                    // Futuramente abrir uma lista real de amigos
                });
            }

            profileModalContainer.querySelector('.modal-overlay').addEventListener('click', (e) => {
                if (e.target === profileModalContainer.querySelector('.modal-overlay')) {
                    closeProfileModal();
                }
            });

        } catch (error) {
            console.error("Erro ao carregar perfil:", error);
            alert("Erro ao carregar os dados do perfil.");
        }
    }

    function closeProfileModal() {
        const modalOverlay = profileModalContainer.querySelector('.modal-overlay');
        if (modalOverlay) {
            modalOverlay.classList.remove('visible');
            setTimeout(() => {
                profileModalContainer.innerHTML = '';
            }, 300);
        }
    }

    function openEnemyModal(enemy) {
        let stars = '';
        for (let i = 0; i < enemy.level; i++) {
            stars += '<span class="star">★</span>';
        }

        // Se for o Boss Final, toca a música tema
        if (enemy.name.toUpperCase() === 'THE FIRST') {
            playBossMusic(THE_FIRST_THEME);
        }

        modalContainer.innerHTML = `
            <div class="modal-overlay visible">
                <div class="modal-content enemy-modal-content">
                    <button class="modal-close-btn">&times;</button>
                    
                    <div class="enemy-modal-banner" style="background-image: url('${enemy.image}')">
                        <div class="enemy-modal-banner-overlay"></div>
                    </div>
                    
                    <div class="enemy-modal-info">
                        <div class="enemy-modal-title-row">
                            <div>
                                <h2 class="enemy-modal-name">${enemy.name}</h2>
                                <p class="enemy-modal-type">${enemy.type}</p>
                            </div>
                            <div class="enemy-stars">${stars}</div>
                        </div>

                        <div class="enemy-modal-body">
                            <div class="enemy-modal-section">
                                <h3>História / Descrição</h3>
                                <p class="enemy-modal-description">${enemy.description}</p>
                            </div>

                            <div class="enemy-modal-section">
                                <h3>Atributos de Combate</h3>
                                <div class="stats-grid">
                                    <div class="stat-item">
                                        <div class="stat-label">Pontos de Vida</div>
                                        <div class="stat-value">${enemy.stats.hp}</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-label">Classe de Armadura</div>
                                        <div class="stat-value">${enemy.stats.ac}</div>
                                    </div>
                                    <div class="stat-item">
                                        <div class="stat-label">Deslocamento</div>
                                        <div class="stat-value">${enemy.stats.speed}</div>
                                    </div>
                                </div>
                            </div>

                            <div class="modal-actions-container">
                                <button class="btn-primary add-to-map-btn" id="add-to-map-confirm">Adicionar à Sessão</button>
                                ${user && enemy.creator_id === user.uid ? `<button class="btn-logout delete-enemy-btn" id="delete-enemy-btn">Banir do Bestiário</button>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        modalContainer.querySelector('.modal-close-btn').addEventListener('click', closeEnemyModal);
        
        // Lógica de Deletar
        const deleteBtn = document.getElementById('delete-enemy-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                if (confirm(`Tem certeza que deseja banir o ${enemy.name} permanentemente do bestiário?`)) {
                    try {
                        deleteBtn.disabled = true;
                        deleteBtn.textContent = "Excluindo...";
                        await deleteDoc(doc(db, 'enemies', enemy.id));
                        await loadCommunityEnemies();
                        renderEnemyCards();
                        closeEnemyModal();
                    } catch (error) {
                        console.error("Erro ao deletar inimigo:", error);
                        alert("Erro ao excluir. Verifique suas permissões.");
                        deleteBtn.disabled = false;
                        deleteBtn.textContent = "Excluir Criatura";
                    }
                }
            });
        }

        document.getElementById('add-to-map-confirm').addEventListener('click', async () => {
            // Verificação para o Boss Final
            if (enemy.name.toUpperCase() === 'THE FIRST') {
                try {
                    const profileRef = doc(db, 'profiles', user.uid);
                    const profileDoc = await getDoc(profileRef);
                    if (profileDoc.exists()) {
                        const data = profileDoc.data();
                        const currentFrame = data.current_frame || 'wood';
                        const isUserAdmin = data.is_admin || (data.email === 'hayagames@outlook.com');
                        
                        // Lista de elos que NÃO podem desafiar (inferiores a ouro)
                        const forbiddenFrames = ['wood', 'iron', 'bronze', 'silver'];
                        
                        if (forbiddenFrames.includes(currentFrame.toLowerCase()) && !isUserAdmin) {
                            showXPInfoDialog();
                            return;
                        }
                    }
                } catch (err) {
                    console.error("Erro ao verificar nível para boss:", err);
                }
            }

            // Novo comportamento: Adicionar à sessão ativa (Guilda Livre ou Simples)
            const sessionEnemies = JSON.parse(localStorage.getItem('session_enemies') || '[]');
            
            // Evitar duplicatas na mesma sessão
            if (!sessionEnemies.some(e => e.id === enemy.id)) {
                sessionEnemies.push({
                    id: enemy.id,
                    name: enemy.name,
                    image: enemy.image,
                    level: enemy.level,
                    stats: enemy.stats,
                    type: enemy.type,
                    added_at: new Date().toISOString()
                });
                localStorage.setItem('session_enemies', JSON.stringify(sessionEnemies));
                
                const lastSessionPage = localStorage.getItem('last_session_page');
                if (lastSessionPage) {
                    if (confirm(`Inimigo "${enemy.name}" adicionado à sessão! Deseja voltar para a sala agora?`)) {
                        window.location.href = lastSessionPage;
                        return;
                    }
                } else {
                    alert(`Inimigo "${enemy.name}" adicionado à lista da sessão!`);
                }
            } else {
                alert('Este inimigo já está na lista da sessão.');
            }
            
            closeEnemyModal();
        });
    }

    function closeEnemyModal() {
        const modalOverlay = modalContainer.querySelector('.modal-overlay');
        if (modalOverlay) {
            modalOverlay.classList.remove('visible');
            stopBossMusic(); // Para a música quando fechar o modal
            setTimeout(() => {
                modalContainer.innerHTML = '';
            }, 300);
        }
    }

    async function openAddEnemyModal() {
        if (!user) {
            alert("Você precisa estar logado para criar inimigos!");
            return;
        }

        // Buscar nome do criador do perfil
        let creatorName = user.displayName || "Aventureiro";
        const profileDoc = await getDoc(doc(db, 'profiles', user.uid));
        if (profileDoc.exists()) {
            creatorName = profileDoc.data().nickname || profileDoc.data().full_name || creatorName;
        }

        modalContainer.innerHTML = `
            <div class="modal-overlay visible">
                <div class="modal-content form-modal-content">
                    <button class="modal-close-btn">&times;</button>
                    <h2>Criar Criatura da Comunidade</h2>
                    <form id="add-enemy-form">
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="enemy-name">Nome</label>
                                <input type="text" id="enemy-name" class="form-input" required>
                            </div>
                            <div class="form-group">
                                <label for="enemy-species">Espécie</label>
                                <select id="enemy-species" class="form-input" required>
                                    <option value="Humanoide">Humanoide</option>
                                    <option value="Besta">Besta</option>
                                    <option value="Morto-Vivo">Morto-Vivo</option>
                                    <option value="Dragão">Dragão</option>
                                    <option value="Aberração">Aberração</option>
                                    <option value="Elemental">Elemental</option>
                                    <option value="Construto">Construto</option>
                                    <option value="Divindade">Divindade</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="enemy-level">Nível (1-5 Estrelas)</label>
                                <input type="number" id="enemy-level" class="form-input" min="1" max="5" value="1" required>
                            </div>
                            <div class="form-group">
                                <label for="enemy-image">URL da Arte</label>
                                <input type="url" id="enemy-image" class="form-input" placeholder="https://..." required>
                            </div>
                        </div>

                        <div class="form-divider">Atributos (Opcional - Padrão por Nível se vazio)</div>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="enemy-hp">Pontos de Vida (Ex: 15 ou 2d8+4)</label>
                                <input type="text" id="enemy-hp" class="form-input" placeholder="Automático por nível">
                            </div>
                            <div class="form-group">
                                <label for="enemy-ac">Classe de Armadura (CA)</label>
                                <input type="number" id="enemy-ac" class="form-input" placeholder="Automático por nível">
                            </div>
                            <div class="form-group">
                                <label for="enemy-speed">Deslocamento (Ex: 9m)</label>
                                <input type="text" id="enemy-speed" class="form-input" placeholder="Padrão: 9m">
                            </div>
                        </div>

                        <div class="form-group" style="margin-top: 1.5rem;">
                            <label for="enemy-description">História / Lore</label>
                            <textarea id="enemy-description" class="form-textarea" placeholder="Conte sobre esta criatura..." required></textarea>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn-secondary" id="cancel-add-btn">Cancelar</button>
                            <button type="submit" class="btn-primary" id="save-enemy-btn">Publicar Bestiário</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        modalContainer.querySelector('.modal-close-btn').addEventListener('click', closeEnemyModal);
        modalContainer.querySelector('#cancel-add-btn').addEventListener('click', closeEnemyModal);
        
        document.getElementById('add-enemy-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const saveBtn = document.getElementById('save-enemy-btn');
            saveBtn.disabled = true;
            saveBtn.textContent = "Publicando...";

            const level = parseInt(document.getElementById('enemy-level').value);
            
            // Lógica de valores padrão baseados no nível (Estrelas)
            const defaultStats = {
                1: { hp: '15 (2d10 + 4)', ac: 12, speed: '9m' },
                2: { hp: '45 (6d10 + 12)', ac: 14, speed: '9m' },
                3: { hp: '90 (12d10 + 24)', ac: 16, speed: '12m' },
                4: { hp: '150 (20d10 + 40)', ac: 18, speed: '12m' },
                5: { hp: '300 (30d10 + 100)', ac: 20, speed: '15m' }
            };

            const selectedDefault = defaultStats[level] || defaultStats[1];

            const newEnemy = {
                name: document.getElementById('enemy-name').value,
                species: document.getElementById('enemy-species').value,
                type: document.getElementById('enemy-species').value, // Simplificado
                level: level,
                image: document.getElementById('enemy-image').value,
                description: document.getElementById('enemy-description').value,
                creator_id: user.uid,
                creator_name: creatorName,
                created_at: new Date().toISOString(),
                stats: { 
                    hp: document.getElementById('enemy-hp').value || selectedDefault.hp, 
                    ac: document.getElementById('enemy-ac').value || selectedDefault.ac, 
                    speed: document.getElementById('enemy-speed').value || selectedDefault.speed 
                }
            };

            try {
                await addDoc(collection(db, 'enemies'), newEnemy);
                await loadCommunityEnemies();
                renderEnemyCards();
                closeEnemyModal();
            } catch (error) {
                console.error("Erro ao salvar inimigo:", error);
                alert("Erro ao salvar no banco de dados.");
                saveBtn.disabled = false;
                saveBtn.textContent = "Publicar Bestiário";
            }
        });
    }

    function showXPInfoDialog() {
        const dialogOverlay = document.createElement('div');
        dialogOverlay.className = 'modal-overlay visible';
        dialogOverlay.style.zIndex = '5000';
        
        dialogOverlay.innerHTML = `
            <div class="modal-content" style="max-width: 500px; text-align: left; border: 2px solid #ffd700;">
                <button class="modal-close-btn">&times;</button>
                <h2 style="font-family: 'Cinzel', serif; color: #ffd700; margin-bottom: 1.5rem; text-align: center;">Desafio Bloqueado</h2>
                <p style="color: #eee; margin-bottom: 1.5rem; line-height: 1.6;">
                    A aura de <strong>The First</strong> é esmagadora. Apenas aventureiros que alcançaram o elo <span style="color: #ffd700; font-weight: bold;">Ouro</span> ou superior possuem a resiliência necessária para enfrentá-lo.
                </p>
                
                <h3 style="font-family: 'Cinzel', serif; font-size: 1.1rem; color: var(--dashboard-accent); margin-bottom: 1rem;">Como subir de nível?</h3>
                <ul style="color: #ccc; padding-left: 1.5rem; margin-bottom: 2rem; line-height: 1.8;">
                    <li><strong>Crie Personagens</strong>: Cada nova ficha de personagem rende XP de criação.</li>
                    <li><strong>Explore o Mundo</strong>: Interagir com mapas e ferramentas do site aumenta sua experiência.</li>
                    <li><strong>Comunidade</strong>: Adicione amigos e participe de grupos para ganhar bônus de interação.</li>
                    <li><strong>Bestiário</strong>: Registrar novas criaturas descobertas concede XP de pesquisador.</li>
                </ul>
                
                <div style="text-align: center;">
                    <button class="btn-primary" id="close-xp-dialog" style="padding: 0.8rem 2rem;">Entendido</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialogOverlay);
        
        const close = () => {
            dialogOverlay.classList.remove('visible');
            setTimeout(() => dialogOverlay.remove(), 300);
        };
        
        dialogOverlay.querySelector('.modal-close-btn').onclick = close;
        document.getElementById('close-xp-dialog').onclick = close;
    }

    // Event Listeners para Filtros
    document.getElementById('filter-level').addEventListener('change', (e) => {
        currentLevelFilter = e.target.value;
        renderEnemyCards();
    });

    document.getElementById('filter-species').addEventListener('change', (e) => {
        currentSpeciesFilter = e.target.value;
        renderEnemyCards();
    });

    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentSourceFilter = tab.dataset.source;
            renderEnemyCards();
        });
    });

    document.getElementById('add-enemy-btn').addEventListener('click', openAddEnemyModal);

    // Inicialização
    await loadCommunityEnemies();
    renderEnemyCards();
});
