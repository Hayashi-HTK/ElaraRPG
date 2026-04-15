import { 
    auth, db, doc, getDoc, collection, query, where, getDocs, 
    waitForAuth, onSnapshot, setDoc, updateDoc, serverTimestamp, arrayUnion 
} from './firebase.js';
import { defaultEnemies } from './enemies.js';

// Estado da Guilda
let guildId = null;
let isMaster = false;
let selectedMap = null;
let communityEnemies = []; // Cache para inimigos da comunidade
let unsubscribeSession = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Salvar esta página como a última sessão visitada para redirecionamento do bestiário
    localStorage.setItem('last_session_page', window.location.href);

    const user = await waitForAuth();
    if (!user) {
        window.location.replace('login.html');
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    guildId = urlParams.get('id') || urlParams.get('join');

    // Se não tem ID na URL, o usuário é o Mestre criando uma nova sala
    if (!guildId) {
        guildId = user.uid; // Usamos o UID do mestre como ID da sala para simplificar
        isMaster = true;
        await createOrUpdateSession(user);
        // Atualiza URL sem recarregar para permitir compartilhamento
        const newUrl = `${window.location.origin}${window.location.pathname}?id=${guildId}`;
        window.history.replaceState({ path: newUrl }, '', newUrl);
    } else {
        isMaster = guildId === user.uid;
        await joinSession(user);
    }

    setupSessionListener();
    renderMapList('official');
    renderSessionEnemies();
    setupEnemySelection();
    setupInviteFriends(user);

    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelector('.filter-tab.active').classList.remove('active');
            tab.classList.add('active');
            renderMapList(tab.dataset.source);
        });
    });
});

async function createOrUpdateSession(user) {
    const sessionRef = doc(db, 'sessions', guildId);
    const sessionDoc = await getDoc(sessionRef);

    const profileDoc = await getDoc(doc(db, 'profiles', user.uid));
    const profile = profileDoc.exists() ? profileDoc.data() : {};

    const participant = {
        id: user.uid,
        name: profile.nickname || profile.full_name || user.displayName || 'Mestre',
        avatar: profile.avatar_url || user.photoURL || '',
        role: 'Mestre',
        joined_at: new Date().toISOString()
    };

    if (!sessionDoc.exists()) {
        await setDoc(sessionRef, {
            type: 'guild',
            is_private: false,
            master_id: user.uid,
            name: `Guilda de ${participant.name}`,
            participants: [participant],
            created_at: serverTimestamp(),
            status: 'lobby'
        });
    } else {
        // Se a sessão já existe, garante que o mestre está na lista
        const data = sessionDoc.data();
        const exists = data.participants.some(p => p.id === user.uid);
        if (!exists) {
            await updateDoc(sessionRef, {
                participants: arrayUnion(participant)
            });
        }
    }
}

async function joinSession(user) {
    const sessionRef = doc(db, 'sessions', guildId);
    const sessionDoc = await getDoc(sessionRef);

    if (!sessionDoc.exists()) {
        alert("Sessão não encontrada.");
        window.location.href = 'play.html';
        return;
    }

    const profileDoc = await getDoc(doc(db, 'profiles', user.uid));
    const profile = profileDoc.exists() ? profileDoc.data() : {};

    const participant = {
        id: user.uid,
        name: profile.nickname || profile.full_name || user.displayName || 'Aventureiro',
        avatar: profile.avatar_url || user.photoURL || '',
        role: isMaster ? 'Mestre' : 'Jogador',
        joined_at: new Date().toISOString()
    };

    const data = sessionDoc.data();
    const exists = data.participants.some(p => p.id === user.uid);
    if (!exists) {
        await updateDoc(sessionRef, {
            participants: arrayUnion(participant)
        });
    }
}

function setupSessionListener() {
    if (unsubscribeSession) unsubscribeSession();

    unsubscribeSession = onSnapshot(doc(db, 'sessions', guildId), (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            renderPlayerList(data.participants);
        }
    });
}

function setupInviteFriends(user) {
    const inviteBtn = document.getElementById('invite-btn');
    const modal = document.getElementById('invite-friends-modal');
    const closeBtn = modal.querySelector('.modal-close-btn');
    const friendsListEl = document.getElementById('friends-invite-list');
    const shareUrlInput = document.getElementById('guild-share-url');
    const copyBtn = document.getElementById('copy-guild-url');

    if (inviteBtn) {
        inviteBtn.addEventListener('click', () => {
            modal.classList.add('active');
            shareUrlInput.value = window.location.href;
            loadFriendsToInvite(user.uid, friendsListEl);
        });
    }

    closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    
    copyBtn.addEventListener('click', () => {
        shareUrlInput.select();
        document.execCommand('copy');
        copyBtn.innerHTML = '<i class="fas fa-check"></i>';
        setTimeout(() => copyBtn.innerHTML = '<i class="fas fa-copy"></i>', 2000);
    });
}

async function loadFriendsToInvite(userId, container) {
    container.innerHTML = '<p class="empty-state">Buscando aliados...</p>';

    try {
        const q = query(collection(db, 'friendships'), where('participants', 'array-contains', userId), where('status', '==', 'accepted'));
        const snapshot = await getDocs(q);
        
        const friendIds = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const friendId = data.participants.find(id => id !== userId);
            if (friendId) friendIds.push(friendId);
        });

        if (friendIds.length === 0) {
            container.innerHTML = '<p class="empty-state">Você ainda não tem amigos adicionados.</p>';
            return;
        }

        container.innerHTML = '';
        for (const id of friendIds) {
            const pDoc = await getDoc(doc(db, 'profiles', id));
            if (pDoc.exists()) {
                const friend = { id: pDoc.id, ...pDoc.data() };
                const card = document.createElement('div');
                card.className = 'enemy-selection-card'; // Reutilizando estilo de card
                card.innerHTML = `
                    <img src="${friend.avatar_url || 'https://via.placeholder.com/150?text=Avatar'}" style="border-radius: 50%; width: 60px; height: 60px; margin: 0 auto 0.5rem;">
                    <h4>${friend.nickname || friend.full_name}</h4>
                    <button class="btn-primary" style="font-size: 0.7rem; padding: 5px 10px; margin-top: 0.5rem;">Convidar</button>
                `;
                
                card.querySelector('button').onclick = () => {
                    alert(`Convite enviado para ${friend.nickname || friend.full_name}! (Simulado - Compartilhe o link da sala)`);
                };
                
                container.appendChild(card);
            }
        }
    } catch (err) {
        console.error("Erro ao carregar amigos:", err);
        container.innerHTML = '<p class="empty-state">Erro ao carregar amigos.</p>';
    }
}

function renderSessionEnemies() {
    const enemyListEl = document.getElementById('session-enemy-list');
    if (!enemyListEl) return;

    const sessionEnemies = JSON.parse(localStorage.getItem('session_enemies') || '[]');
    
    if (sessionEnemies.length === 0) {
        enemyListEl.innerHTML = '<p class="empty-state">Nenhum inimigo na sessão.</p>';
        return;
    }

    enemyListEl.innerHTML = '';
    sessionEnemies.forEach(enemy => {
        let stars = '';
        for (let i = 0; i < enemy.level; i++) {
            stars += '★';
        }

        const card = document.createElement('div');
        card.className = 'enemy-session-card';
        card.innerHTML = `
            <div class="enemy-session-avatar" style="background-image: url('${enemy.image}')"></div>
            <div class="enemy-session-info">
                <span class="enemy-session-name">${enemy.name}</span>
                <span class="enemy-session-stars">${stars}</span>
            </div>
            <button class="btn-remove-enemy" data-id="${enemy.id}" title="Remover da Sessão">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        card.querySelector('.btn-remove-enemy').addEventListener('click', (e) => {
            e.stopPropagation();
            removeEnemyFromSession(enemy.id);
        });

        enemyListEl.appendChild(card);
    });
}

function removeEnemyFromSession(enemyId) {
    let sessionEnemies = JSON.parse(localStorage.getItem('session_enemies') || '[]');
    sessionEnemies = sessionEnemies.filter(e => e.id !== enemyId);
    localStorage.setItem('session_enemies', JSON.stringify(sessionEnemies));
    renderSessionEnemies();
}

async function setupEnemySelection() {
    const openModalBtn = document.querySelector('.btn-add-enemy-session');
    const modal = document.getElementById('enemy-selection-modal');
    const closeBtn = modal.querySelector('.modal-close-btn');
    const searchInput = document.getElementById('enemy-search');
    const levelFilter = document.getElementById('enemy-filter-level');

    if (openModalBtn) {
        openModalBtn.addEventListener('click', (e) => {
            e.preventDefault();
            modal.classList.add('active');
            loadEnemiesForSelection();
        });
    }

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });

    searchInput.addEventListener('input', () => renderAvailableEnemies());
    levelFilter.addEventListener('change', () => renderAvailableEnemies());
}

async function loadEnemiesForSelection() {
    const grid = document.getElementById('available-enemies-grid');
    grid.innerHTML = '<p class="empty-state">Carregando bestiário...</p>';

    try {
        if (communityEnemies.length === 0) {
            const q = query(collection(db, 'enemies'));
            const snapshot = await getDocs(q);
            communityEnemies = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                is_default: false
            }));
        }
        renderAvailableEnemies();
    } catch (error) {
        console.error("Erro ao carregar inimigos para seleção:", error);
        grid.innerHTML = '<p class="empty-state">Erro ao carregar inimigos.</p>';
    }
}

function renderAvailableEnemies() {
    const grid = document.getElementById('available-enemies-grid');
    const searchTerm = document.getElementById('enemy-search').value.toLowerCase();
    const levelFilter = document.getElementById('enemy-filter-level').value;
    const sessionEnemies = JSON.parse(localStorage.getItem('session_enemies') || '[]');

    const allEnemies = [...defaultEnemies, ...communityEnemies];
    
    const filtered = allEnemies.filter(enemy => {
        const matchesSearch = enemy.name.toLowerCase().includes(searchTerm);
        const matchesLevel = !levelFilter || enemy.level.toString() === levelFilter;
        return matchesSearch && matchesLevel;
    });

    if (filtered.length === 0) {
        grid.innerHTML = '<p class="empty-state">Nenhum inimigo encontrado.</p>';
        return;
    }

    grid.innerHTML = '';
    filtered.forEach(enemy => {
        const isAlreadyInSession = sessionEnemies.some(se => se.id === enemy.id);
        
        let stars = '';
        for (let i = 0; i < enemy.level; i++) {
            stars += '★';
        }

        const card = document.createElement('div');
        card.className = `enemy-selection-card ${isAlreadyInSession ? 'selected-in-session' : ''}`;
        card.innerHTML = `
            <img src="${enemy.image}" alt="${enemy.name}" onerror="this.src='https://wiki.runarcana.org/images/d/dc/Lobo_Atroz.png'">
            <h4>${enemy.name}</h4>
            <span class="stars">${stars}</span>
        `;

        if (!isAlreadyInSession) {
            card.addEventListener('click', () => {
                addEnemyToSession(enemy);
                renderAvailableEnemies();
            });
        }

        grid.appendChild(card);
    });
}

function addEnemyToSession(enemy) {
    const sessionEnemies = JSON.parse(localStorage.getItem('session_enemies') || '[]');
    
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
        renderSessionEnemies();
    }
}

function renderPlayerList(players) {
    const playerListEl = document.getElementById('player-list');
    playerListEl.innerHTML = '';
    players.forEach(player => {
        const playerCard = document.createElement('div');
        playerCard.className = 'player-card';
        playerCard.innerHTML = `
            <div class="player-avatar" style="background-image: url(${player.avatar || 'https://via.placeholder.com/40'})"></div>
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div class="player-role">${player.role}</div>
            </div>
        `;
        playerListEl.appendChild(playerCard);
    });
}

async function renderMapList(source) {
    const mapListEl = document.getElementById('map-list');
    mapListEl.innerHTML = '<p>Carregando mapas...</p>';

    // Simulação de mapas
    const maps = [
        { id: 'map1', name: 'Escudo Elara', img: 'assets/Jogar/História/Fundos/Escudo.png', source: 'official' },
        { id: 'map2', name: 'Cavernas de Cristal', img: 'https://i.postimg.cc/d1mZz6g5/DALL-E-2024-03-14-A-vast-underground-cavern-filled-with-glowing-crystals-of-various-colors-dig.webp', source: 'official' },
        { id: 'map3', name: 'Cidade Flutuante', img: 'https://i.postimg.cc/Y0d7Y0c1/DALL-E-2024-03-14-A-majestic-city-with-waterfalls-and-bridges-floating-in-the-sky-digital-art-f.webp', source: 'community' },
    ];

    const filteredMaps = maps.filter(map => map.source === source);
    mapListEl.innerHTML = '';

    if (filteredMaps.length === 0) {
        mapListEl.innerHTML = '<p>Nenhum mapa encontrado.</p>';
        return;
    }

    filteredMaps.forEach(map => {
        const mapCard = document.createElement('div');
        mapCard.className = 'map-card';
        mapCard.dataset.mapId = map.id;
        mapCard.innerHTML = `
            <img src="${map.url || map.img}" alt="${map.name}">
            <p>${map.name}</p>
        `;
        mapCard.addEventListener('click', () => {
            document.querySelectorAll('.map-card.selected').forEach(c => c.classList.remove('selected'));
            mapCard.classList.add('selected');
            selectedMap = map.id;
        });
        mapListEl.appendChild(mapCard);
    });
}
