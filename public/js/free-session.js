import { 
    auth, db, doc, getDoc, collection, query, where, getDocs, 
    onSnapshot, setDoc, updateDoc, serverTimestamp, arrayUnion 
} from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { defaultEnemies } from './enemies.js';
import { GAME_PLAYLIST } from './story-mode/constants.js';

// Estado da Sessão Livre
let sessionId = null;
let isSpectator = false;
let user = null;
let communityEnemies = []; // Cache para inimigos da comunidade
let unsubscribeSession = null;
let gameAudio = null;
let currentTrackIndex = -1;

document.addEventListener('DOMContentLoaded', async () => {
    // Salvar esta página como a última sessão visitada para redirecionamento do bestiário
    localStorage.setItem('last_session_page', window.location.href);

    setupAudioSystem();

    // Verificar se é um espectador pelo link
    const urlParams = new URLSearchParams(window.location.search);
    isSpectator = urlParams.get('mode') === 'spectator';
    sessionId = urlParams.get('id') || urlParams.get('join');

    onAuthStateChanged(auth, async (authUser) => {
        user = authUser;
        
        if (!user && !isSpectator) {
            window.location.replace('login.html');
            return;
        }

        // Se não tem ID na URL e o usuário está logado, ele é o Mestre
        if (!sessionId && user) {
            sessionId = user.uid;
            await createOrUpdateSession(user);
            const newUrl = `${window.location.origin}${window.location.pathname}?id=${sessionId}`;
            window.history.replaceState({ path: newUrl }, '', newUrl);
        } else if (sessionId) {
            if (user) await joinSession(user);
        }

        if (user && !isSpectator) {
            setupMasterUI();
            setupInviteFriends(user);
        }

        setupSessionListener();
        renderMaps('official');
        renderSessionEnemies();
        setupEnemySelection();
    });
});

function setupAudioSystem() {
    gameAudio = new Audio();
    gameAudio.volume = 0.5;
    gameAudio.onended = () => playRandomTrack();

    const audioControls = document.createElement('div');
    audioControls.className = 'audio-controls';
    audioControls.innerHTML = `
        <div id="audio-track-info" class="audio-track-info"></div>
        <button id="audio-toggle-btn" class="audio-btn" title="Play/Pause">
            <i class="fas fa-play"></i>
        </button>
        <button id="audio-next-btn" class="audio-btn" title="Próxima Faixa">
            <i class="fas fa-step-forward"></i>
        </button>
        <button id="audio-mute-btn" class="audio-btn" title="Mute/Unmute">
            <i class="fas fa-volume-up"></i>
        </button>
        <input type="range" id="audio-volume" class="volume-slider" min="0" max="1" step="0.1" value="0.5">
    `;
    document.body.appendChild(audioControls);

    const toggleBtn = document.getElementById('audio-toggle-btn');
    const nextBtn = document.getElementById('audio-next-btn');
    const muteBtn = document.getElementById('audio-mute-btn');
    const volumeSlider = document.getElementById('audio-volume');

    toggleBtn.onclick = () => {
        if (gameAudio.paused) {
            gameAudio.play().catch(e => console.log("Interação necessária"));
            toggleBtn.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            gameAudio.pause();
            toggleBtn.innerHTML = '<i class="fas fa-play"></i>';
        }
    };

    nextBtn.onclick = () => playRandomTrack();

    muteBtn.onclick = () => {
        gameAudio.muted = !gameAudio.muted;
        muteBtn.innerHTML = gameAudio.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
    };

    volumeSlider.oninput = (e) => {
        gameAudio.volume = e.target.value;
    };

    playRandomTrack();
}

function playRandomTrack() {
    if (!gameAudio) return;

    let nextIndex;
    if (GAME_PLAYLIST.length > 1) {
        do {
            nextIndex = Math.floor(Math.random() * GAME_PLAYLIST.length);
        } while (nextIndex === currentTrackIndex);
    } else {
        nextIndex = 0;
    }

    currentTrackIndex = nextIndex;
    const track = GAME_PLAYLIST[currentTrackIndex];
    
    gameAudio.src = track.src;
    gameAudio.play().then(() => {
        const toggleBtn = document.getElementById('audio-toggle-btn');
        if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-pause"></i>';
        
        const trackInfo = document.getElementById('audio-track-info');
        if (trackInfo) trackInfo.textContent = `🎵 ${track.title}`;
    }).catch(e => console.log("Autoplay bloqueado"));
}

async function createOrUpdateSession(user) {
    const sessionRef = doc(db, 'sessions', sessionId);
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
            type: 'free',
            is_private: false,
            master_id: user.uid,
            name: `Sessão de ${participant.name}`,
            participants: [participant],
            spectators: [],
            created_at: serverTimestamp(),
            status: 'lobby'
        });
    } else {
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
    const sessionRef = doc(db, 'sessions', sessionId);
    const sessionDoc = await getDoc(sessionRef);

    if (!sessionDoc.exists()) return;

    const profileDoc = await getDoc(doc(db, 'profiles', user.uid));
    const profile = profileDoc.exists() ? profileDoc.data() : {};

    const isMaster = sessionId === user.uid;
    
    const person = {
        id: user.uid,
        name: profile.nickname || profile.full_name || user.displayName || (isSpectator ? 'Espectador' : 'Aventureiro'),
        avatar: profile.avatar_url || user.photoURL || '',
        role: isMaster ? 'Mestre' : (isSpectator ? 'Espectador' : 'Jogador'),
        joined_at: new Date().toISOString()
    };

    if (isSpectator) {
        await updateDoc(sessionRef, { spectators: arrayUnion(person) });
    } else {
        const data = sessionDoc.data();
        if (!data.participants.some(p => p.id === user.uid)) {
            await updateDoc(sessionRef, { participants: arrayUnion(person) });
        }
    }
}

function setupSessionListener() {
    if (unsubscribeSession) unsubscribeSession();

    unsubscribeSession = onSnapshot(doc(db, 'sessions', sessionId), (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            renderList('player-list', data.participants, 'player-count-badge');
            renderList('spectator-list', data.spectators || [], 'spectator-count-badge');
        }
    });
}

function setupInviteFriends(user) {
    // Adicionar botão de convite se não existir no HTML original (ou usar o existente se houver)
    // No HTML de free-session não tem o botão invite-btn explicitamente como no guild.html, 
    // mas vamos adicionar a lógica para o botão que criamos ou para o link area
    
    const modal = document.getElementById('invite-friends-modal');
    const closeBtn = modal.querySelector('.modal-close-btn');
    const friendsListEl = document.getElementById('friends-invite-list');
    const shareUrlInput = document.getElementById('guild-share-url');
    const copyBtn = document.getElementById('copy-guild-url');

    // Podemos usar o spectator link area para abrir o modal de amigos também
    const linkArea = document.getElementById('spectator-link-area');
    if (linkArea) {
        const inviteFriendsBtn = document.createElement('button');
        inviteFriendsBtn.className = 'btn-secondary';
        inviteFriendsBtn.style.width = '100%';
        inviteFriendsBtn.style.marginTop = '1rem';
        inviteFriendsBtn.textContent = 'Convidar Amigos';
        inviteFriendsBtn.onclick = () => {
            modal.classList.add('active');
            shareUrlInput.value = `${window.location.origin}${window.location.pathname}?id=${sessionId}`;
            loadFriendsToInvite(user.uid, friendsListEl);
        };
        linkArea.appendChild(inviteFriendsBtn);
    }

    closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            shareUrlInput.select();
            document.execCommand('copy');
            copyBtn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => copyBtn.innerHTML = '<i class="fas fa-copy"></i>', 2000);
        });
    }
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
                card.className = 'enemy-selection-card';
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

async function setupEnemySelection() {
    const openModalBtn = document.querySelector('.btn-add-enemy-session');
    const modal = document.getElementById('enemy-selection-modal');
    const closeBtn = modal.querySelector('.modal-close-btn');
    const searchInput = document.getElementById('enemy-search');
    const levelFilter = document.getElementById('enemy-filter-level');

    // Evitar que o link recarregue a página
    if (openModalBtn) {
        openModalBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            modal.classList.add('active');
            await loadEnemiesForSelection();
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
        // Carregar inimigos da comunidade (se ainda não carregados)
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
                renderAvailableEnemies(); // Atualiza visual do card
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

function renderSessionEnemies() {
    const enemyListEl = document.getElementById('session-enemy-list');
    if (!enemyListEl) return;

    const sessionEnemies = JSON.parse(localStorage.getItem('session_enemies') || '[]');
    
    if (sessionEnemies.length === 0) {
        enemyListEl.innerHTML = '<p class="empty-state">Nenhum inimigo adicionado à sessão.</p>';
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

function setupMasterUI() {
    const linkArea = document.getElementById('spectator-link-area');
    const urlInput = document.getElementById('spectator-url');
    const copyBtn = document.getElementById('copy-url-btn');

    if (linkArea) {
        linkArea.style.display = 'block';
        // Gera link real (exemplo)
        const spectatorUrl = `${window.location.origin}${window.location.pathname}?mode=spectator&id=${user.uid}`;
        urlInput.value = spectatorUrl;

        copyBtn.onclick = () => {
            urlInput.select();
            document.execCommand('copy');
            copyBtn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => copyBtn.innerHTML = '<i class="fas fa-copy"></i>', 2000);
        };
    }
}

async function initLobby() {
    renderMaps('official');

    // Tabs de mapas
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelector('.filter-tab.active').classList.remove('active');
            tab.classList.add('active');
            renderMaps(tab.dataset.source);
        });
    });
}

function renderList(elementId, items, badgeId) {
    const list = document.getElementById(elementId);
    const badge = document.getElementById(badgeId);
    if (!list) return;

    list.innerHTML = '';
    badge.textContent = items.length;

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = `player-card ${item.role.toLowerCase()}`;
        card.innerHTML = `
            <div class="player-avatar" style="background-image: url(${item.avatar || 'https://via.placeholder.com/40?text=?'})"></div>
            <div class="player-info">
                <div class="player-name">${item.name}</div>
                <div class="player-role">${item.role}</div>
            </div>
        `;
        list.appendChild(card);
    });
}

async function renderMaps(source) {
    const list = document.getElementById('map-list');
    list.innerHTML = '';

    const maps = [
        { id: 'm1', name: 'Arena de Batalha', img: 'https://i.postimg.cc/tJ3gYjJg/DALL-E-2024-03-14-A-massive-battle-scene-with-dozens-of-fantasy-characters-clashing-digital-art.webp', source: 'official' },
        { id: 'm2', name: 'Taverna do Dragão', img: 'https://i.postimg.cc/k4xYqYjH/DALL-E-2024-03-14-An-ancient-glowing-book-of-lore-open-on-a-pedestal-in-a-mystical-library-dig.webp', source: 'official' },
        { id: 'm3', name: 'Mapa do Deserto', img: 'https://i.postimg.cc/L6Rj3Z7j/DALL-E-2024-03-14-A-dark-and-imposing-tower-piercing-the-stormy-clouds-digital-art-epic-fantasy.webp', source: 'community' }
    ];

    maps.filter(m => m.source === source).forEach(map => {
        const card = document.createElement('div');
        card.className = 'map-card';
        card.innerHTML = `
            <img src="${map.img}" alt="${map.name}">
            <p>${map.name}</p>
        `;
        list.appendChild(card);
    });
}
