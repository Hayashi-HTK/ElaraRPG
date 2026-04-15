import { auth, db, doc, getDoc, waitForAuth, signOut, collection, query, where, orderBy, limit, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp, setDoc, arrayUnion } from './firebase.js';
import './standby.js';
import './branding.js';
import { getPlanState, upgradeHref } from './plans.js';
import { initClickSound } from './ui-click.js';

function setupViewToggleTooltips() {
    const toggle = document.getElementById('nav-view-toggle');
    if (!toggle) return;

    const buttons = toggle.querySelectorAll('.nav-toggle-btn');
    let pressTimer = null;

    const clearTooltip = () => {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
        buttons.forEach((b) => b.classList.remove('show-tooltip'));
    };

    buttons.forEach((btn) => {
        btn.addEventListener('touchstart', () => {
            clearTooltip();
            pressTimer = setTimeout(() => {
                btn.classList.add('show-tooltip');
            }, 350);
        }, { passive: true });

        btn.addEventListener('touchend', clearTooltip, { passive: true });
        btn.addEventListener('touchcancel', clearTooltip, { passive: true });
        btn.addEventListener('click', clearTooltip);
        btn.addEventListener('blur', clearTooltip);
    });

    document.addEventListener('scroll', clearTooltip, { passive: true });
    document.addEventListener('touchstart', (e) => {
        if (!toggle.contains(e.target)) clearTooltip();
    }, { passive: true });
}

initClickSound();

// Cria o elemento header
const header = document.createElement('header');

// Adiciona conteúdo/estilo ao header
header.innerHTML = `
  <nav class="navbar">
    <div class="navbar-container">
      <a href="index.html?view=landing" class="brand brand-manual">
        <span class="brand-manual-title">ELARA</span>
      </a>

      <div id="nav-view-toggle" class="nav-view-toggle" style="display:none;">
        <a id="nav-toggle-landing" class="nav-toggle-btn" href="index.html?view=landing" data-tooltip="Início">
          <i class="fas fa-home"></i>
          <span class="nav-toggle-label">Início</span>
        </a>
        <a id="nav-toggle-feed" class="nav-toggle-btn" href="posts.html" data-tooltip="Posts">
          <i class="fas fa-stream"></i>
          <span class="nav-toggle-label">Posts</span>
        </a>
      </div>
      
      <ul class="nav-links" id="nav-links-menu">
        <li class="nav-li">
          <a href="play.html" class="nav-item btn-play-glow nav-item-play" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
            <i class="fas fa-dice-d20"></i> Jogar
          </a>
        </li>

        <li class="nav-li nav-group" data-group="grimorio">
          <button class="nav-item nav-group-toggle" type="button" data-group="grimorio" aria-expanded="false">
            Grimório <i class="fas fa-chevron-down"></i>
          </button>
          <div class="nav-group-menu" data-group-menu="grimorio">
            <a href="dashboard.html" class="nav-item nav-subitem">Fichas</a>
            <a href="enemies.html" class="nav-item nav-subitem">Inimigos</a>
            <a href="assets.html" class="nav-item nav-subitem">Assets</a>
            <a href="ElaraManual.html" class="nav-item nav-subitem">Manuais</a>
          </div>
        </li>

        <li class="nav-li nav-group" data-group="social">
          <button class="nav-item nav-group-toggle" type="button" data-group="social" aria-expanded="false">
            Social <i class="fas fa-chevron-down"></i>
          </button>
          <div class="nav-group-menu" data-group-menu="social">
            <a href="community.html?tab=message-requests" class="nav-item nav-subitem">Chat</a>
            <a href="profile.html" class="nav-item nav-subitem">Perfil</a>
            <a href="posts.html" class="nav-item nav-subitem">Posts</a>
            <a href="help.html" class="nav-item nav-subitem">Ajuda</a>
          </div>
        </li>
      </ul>
      
      <div class="nav-right">
        <button id="nav-notifications-btn" class="nav-notifications-btn" type="button" title="Notificações" aria-label="Notificações" style="display:none;">
          <i class="fas fa-bell"></i>
          <span id="nav-notifications-badge" class="nav-notifications-badge" style="display:none;">0</span>
        </button>

        <div class="user-menu" id="nav-auth-container">
          <!-- Inicialmente vazio para evitar flickering -->
        </div>

        <!-- Hamburger Button -->
        <div class="hamburger" id="hamburger-menu">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  </nav>

  <div id="notifications-overlay" class="notifications-overlay" style="display:none;">
    <div class="notifications-panel" role="dialog" aria-modal="true" aria-label="Notificações">
      <div class="notifications-header">
        <div class="notifications-title">Notificações</div>
        <div class="notifications-actions">
          <a href="atualizacoes.html" class="notifications-action-btn" style="text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
            <i class="fas fa-bullhorn"></i> Atualizações
          </a>
          <button type="button" id="btn-notifications-mark-all" class="notifications-action-btn">Ler todas</button>
          <button type="button" id="btn-notifications-close" class="notifications-close-btn" aria-label="Fechar">×</button>
        </div>
      </div>
      <div id="notifications-list" class="notifications-list"></div>
      <div id="notifications-empty" class="notifications-empty" style="display:none;">Nenhuma notificação.</div>
    </div>
  </div>

  <button id="chat-bubble-btn" class="chat-bubble-btn" type="button" title="Conversas" aria-label="Conversas" style="display:none;">
    <i class="fas fa-comment-dots"></i>
    <span id="chat-bubble-badge" class="chat-bubble-badge" style="display:none;">0</span>
  </button>
  <div id="chat-bubble-panel" class="chat-bubble-panel" style="display:none;" role="dialog" aria-label="Conversas recentes">
    <div class="chat-bubble-header">
      <div class="chat-bubble-title">Conversas</div>
      <a href="community.html?tab=message-requests" class="chat-bubble-open-full" title="Abrir Chat completo">Abrir</a>
    </div>
    <div id="chat-bubble-list" class="chat-bubble-list"></div>
    <div id="chat-bubble-empty" class="chat-bubble-empty" style="display:none;">Nenhuma conversa.</div>
  </div>

  <div id="chat-mini-modal" class="chat-mini-modal" style="display:none;" role="dialog" aria-label="Chat rápido">
    <div class="chat-mini-header">
      <div id="chat-mini-title" class="chat-mini-title">Chat</div>
      <div class="chat-mini-actions">
        <a id="chat-mini-open-full" href="community.html?tab=message-requests" class="chat-mini-open-full" title="Abrir chat completo">Abrir</a>
        <button id="chat-mini-close" class="chat-mini-close" type="button" aria-label="Fechar">×</button>
      </div>
    </div>
    <div id="chat-mini-messages" class="chat-mini-messages"></div>
    <div class="chat-mini-compose">
      <textarea id="chat-mini-input" rows="2" placeholder="Escreva uma mensagem..."></textarea>
      <button id="chat-mini-send" type="button">Enviar</button>
    </div>
  </div>
`;

// Adiciona o header ao início do body
document.body.prepend(header);
setupViewToggleTooltips();

// Toggle menu mobile
const hamburger = header.querySelector('#hamburger-menu');
const navLinksMenu = header.querySelector('#nav-links-menu');

hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinksMenu.classList.toggle('mobile-open');
    if (!navLinksMenu.classList.contains('mobile-open')) {
        closeAllNavGroups();
    }
});

function closeMobileMenu() {
    hamburger.classList.remove('active');
    navLinksMenu.classList.remove('mobile-open');
}

document.addEventListener('click', (e) => {
    if (!navLinksMenu.classList.contains('mobile-open')) return;
    if (e.target.closest('#nav-links-menu')) return;
    if (e.target.closest('#hamburger-menu')) return;
    closeAllNavGroups();
    closeMobileMenu();
});

function closeAllNavGroups() {
    header.querySelectorAll('.nav-group.open').forEach((li) => {
        li.classList.remove('open');
        const btn = li.querySelector('.nav-group-toggle');
        if (btn) btn.setAttribute('aria-expanded', 'false');
    });
}

function setupNavGroups() {
    const toggles = header.querySelectorAll('.nav-group-toggle');
    toggles.forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const li = btn.closest('.nav-group');
            if (!li) return;
            const willOpen = !li.classList.contains('open');
            closeAllNavGroups();
            if (willOpen) {
                li.classList.add('open');
                btn.setAttribute('aria-expanded', 'true');
            }
        });
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.nav-group')) closeAllNavGroups();
    });
}

setupNavGroups();

const chatBubbleBtn = document.getElementById('chat-bubble-btn');
if (chatBubbleBtn) {
    chatBubbleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleChatBubblePanel();
        if (currentChatsUserId) renderChatBubble(latestChatsCache, currentChatsUserId).catch(() => {});
    });
}
document.addEventListener('click', (e) => {
    if (!e.target.closest('#chat-bubble-panel') && !e.target.closest('#chat-bubble-btn')) {
        closeChatBubblePanel();
    }
});

const chatMiniClose = document.getElementById('chat-mini-close');
if (chatMiniClose) chatMiniClose.addEventListener('click', () => closeMiniChat());

async function sendMiniChatMessage() {
    const input = document.getElementById('chat-mini-input');
    const text = String(input?.value || '').trim();
    if (!text) return;
    if (!miniChatId || !currentChatsUserId || !miniChatOtherUid) return;

    const payload = {
        text,
        sender_id: currentChatsUserId,
        timestamp: serverTimestamp()
    };

    try {
        await addDoc(collection(db, 'chats', miniChatId, 'messages'), payload);
        await setDoc(doc(db, 'chats', miniChatId), {
            participants: [currentChatsUserId, miniChatOtherUid],
            type: 'private',
            last_message: text,
            last_timestamp: serverTimestamp()
        }, { merge: true });
        input.value = '';
    } catch {}
}

const chatMiniSend = document.getElementById('chat-mini-send');
if (chatMiniSend) chatMiniSend.addEventListener('click', () => sendMiniChatMessage());

const chatMiniInput = document.getElementById('chat-mini-input');
if (chatMiniInput) {
    chatMiniInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeMiniChat();
            return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMiniChatMessage();
        }
    });
}

// Fechar menu ao clicar em um link (somente <a>)
const allNavLinks = header.querySelectorAll('.nav-links a.nav-item');
allNavLinks.forEach(link => {
    link.addEventListener('click', () => {
        closeAllNavGroups();
        closeMobileMenu();
    });
});

// Lógica para marcar o link ativo
function setActiveLink() {
    const currentPath = window.location.pathname;
    const navLinks = header.querySelectorAll('.nav-links a.nav-item');
    
    navLinks.forEach(link => {
        const href = link.getAttribute('href') || '';
        let hrefPath = href;
        try {
            hrefPath = new URL(href, window.location.origin).pathname || href;
        } catch {}
        if (hrefPath.startsWith('/')) hrefPath = hrefPath.slice(1);
        // Verifica se o href está contido no path atual ou se é a página inicial
        if (currentPath.endsWith('/' + hrefPath) || (currentPath === "/" && hrefPath === "index.html") || (currentPath.endsWith("/") && hrefPath === "index.html")) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    header.querySelectorAll('.nav-group').forEach((li) => {
        const hasActive = !!li.querySelector('.nav-group-menu .nav-item.active');
        const btn = li.querySelector('.nav-group-toggle');
        if (btn) btn.classList.toggle('active', hasActive);
        const isMobile = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
        if (hasActive && isMobile) {
            li.classList.add('open');
            if (btn) btn.setAttribute('aria-expanded', 'true');
        }
    });
}

setActiveLink();

let unsubscribeNotifications = null;
let currentNotificationsUserId = null;
let latestNotificationsCache = [];
let unsubscribeUpdateBroadcasts = null;

function getNotificationTarget(n) {
    const type = n?.type || '';
    const payload = n?.payload || {};
    if (type === 'friend_request') return { href: 'community.html?tab=requests' };
    if (type === 'frame_unlocked') return { href: 'profile.html' };
    if (type === 'server_update' || type === 'server_down') return { href: 'atualizacoes.html' };
    if (type === 'offline_message') {
        const uid = payload.sender_id || payload.uid || '';
        if (uid) return { href: `community.html?tab=message-requests&chat=private&uid=${encodeURIComponent(uid)}` };
        return { href: 'community.html?tab=message-requests' };
    }
    if (type === 'discount') return { href: 'index.html#pricing' };
    if (type === 'plan_renewal') {
        const plan = payload.plan || 'basic';
        return { href: `payment.html?plan=${encodeURIComponent(plan)}` };
    }
    if (type === 'plan_update') return { href: upgradeHref() };
    if (n?.target?.href) return { href: String(n.target.href) };
    return { href: 'community.html' };
}

function formatNotification(n) {
    const type = n?.type || '';
    const payload = n?.payload || {};
    const title = n?.title || (
        type === 'friend_request' ? 'Solicitação de amizade' :
        type === 'frame_unlocked' ? 'Borda desbloqueada' :
        type === 'offline_message' ? 'Nova mensagem' :
        type === 'server_update' ? 'Atualizações' :
        type === 'server_down' ? 'Servidor' :
        type === 'discount' ? 'Desconto' :
        type === 'plan_renewal' ? 'Renovação do plano' :
        type === 'plan_update' ? 'Updated de plan' :
        'Notificação'
    );
    const body = n?.body || (
        type === 'friend_request' ? 'Você recebeu uma solicitação de amizade.' :
        type === 'frame_unlocked' ? `Você desbloqueou a borda ${payload.frame_name || payload.frameId || ''}.`.trim() :
        type === 'offline_message' ? (payload.preview || 'Você recebeu uma nova mensagem.') :
        type === 'server_update' ? 'Veja as atualizações da semana.' :
        type === 'server_down' ? 'Confira detalhes de disponibilidade.' :
        type === 'discount' ? 'Confira os planos com desconto.' :
        type === 'plan_renewal' ? 'Faltam 10 dias para renovar seu plano via Pix.' :
        type === 'plan_update' ? 'Você está no Plano Aventureiro (Free). Toque aqui para fazer upgrade.' :
        ''
    );
    return { title, body };
}

function renderNotifications(list, userId) {
    const overlay = document.getElementById('notifications-overlay');
    const listEl = document.getElementById('notifications-list');
    const emptyEl = document.getElementById('notifications-empty');
    const badgeEl = document.getElementById('nav-notifications-badge');
    const btn = document.getElementById('nav-notifications-btn');
    if (!listEl || !emptyEl || !badgeEl || !btn) return;

    const unreadCount = list.filter(n => !n.read).length;
    if (unreadCount > 0) {
        badgeEl.style.display = 'inline-flex';
        badgeEl.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    } else {
        badgeEl.style.display = 'none';
        badgeEl.textContent = '0';
    }

    listEl.innerHTML = '';
    if (list.length === 0) {
        emptyEl.style.display = 'block';
        return;
    }
    emptyEl.style.display = 'none';

    list.forEach((n) => {
        const row = document.createElement('div');
        row.className = `notification-item ${n.read ? 'is-read' : 'is-unread'}`;
        const meta = formatNotification(n);
        row.innerHTML = `
            <div class="notification-main">
              <div class="notification-title">${meta.title}</div>
              <div class="notification-body">${meta.body}</div>
              <div class="notification-date">${n._dateLabel || ''}</div>
            </div>
            <div class="notification-actions">
              <button type="button" class="notification-btn" data-action="toggle-read">${n.read ? 'Não lida' : 'Lida'}</button>
              <button type="button" class="notification-btn danger" data-action="delete">Apagar</button>
            </div>
        `;

        row.addEventListener('click', async () => {
            const target = getNotificationTarget(n);
            try {
                if (!n.read) {
                    await updateDoc(doc(db, 'profiles', userId, 'notifications', n.id), { read: true, read_at: serverTimestamp() });
                }
            } catch {}
            closeNotifications();
            window.location.href = target.href;
        });

        const btnRead = row.querySelector('[data-action="toggle-read"]');
        if (btnRead) {
            btnRead.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await updateDoc(doc(db, 'profiles', userId, 'notifications', n.id), { read: !n.read, updated_at: serverTimestamp() });
                } catch {}
            });
        }

        const btnDel = row.querySelector('[data-action="delete"]');
        if (btnDel) {
            btnDel.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await deleteDoc(doc(db, 'profiles', userId, 'notifications', n.id));
                } catch {}
            });
        }

        listEl.appendChild(row);
    });

    if (overlay && overlay.style.display === 'none') {
        overlay.style.display = 'none';
    }
}

function openNotifications() {
    const overlay = document.getElementById('notifications-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('active'));
}

function closeNotifications() {
    const overlay = document.getElementById('notifications-overlay');
    if (!overlay) return;
    overlay.classList.remove('active');
    setTimeout(() => { overlay.style.display = 'none'; }, 120);
}

let unsubscribeChats = null;
let currentChatsUserId = null;
let latestChatsCache = [];
const chatProfileCache = new Map();
let unsubscribeMiniChat = null;
let miniChatId = null;
let miniChatOtherUid = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
}[m]));

async function getChatProfile(uid) {
    if (!uid) return {};
    if (chatProfileCache.has(uid)) return chatProfileCache.get(uid);
    const p = (async () => {
        try {
            const ref = doc(db, 'profiles', uid);
            const snap = await getDoc(ref);
            return snap.exists() ? (snap.data() || {}) : {};
        } catch {
            return {};
        }
    })();
    chatProfileCache.set(uid, p);
    return p;
}

function openChatBubblePanel() {
    const panel = document.getElementById('chat-bubble-panel');
    if (!panel) return;
    panel.style.display = 'flex';
}

function closeChatBubblePanel() {
    const panel = document.getElementById('chat-bubble-panel');
    if (!panel) return;
    panel.style.display = 'none';
}

function toggleChatBubblePanel() {
    const panel = document.getElementById('chat-bubble-panel');
    if (!panel) return;
    if (panel.style.display === 'none' || !panel.style.display) openChatBubblePanel();
    else closeChatBubblePanel();
}

async function renderChatBubble(chats, myUid) {
    const listEl = document.getElementById('chat-bubble-list');
    const emptyEl = document.getElementById('chat-bubble-empty');
    const badgeEl = document.getElementById('chat-bubble-badge');
    if (!listEl || !emptyEl || !badgeEl) return;

    const visible = Array.isArray(chats) ? chats.slice(0, 6) : [];

    if (visible.length > 0) {
        badgeEl.style.display = 'inline-flex';
        badgeEl.textContent = visible.length > 9 ? '9+' : String(visible.length);
    } else {
        badgeEl.style.display = 'none';
        badgeEl.textContent = '0';
    }

    listEl.innerHTML = '';
    if (visible.length === 0) {
        emptyEl.style.display = 'block';
        return;
    }
    emptyEl.style.display = 'none';

    for (const c of visible) {
        const parts = Array.isArray(c.participants) ? c.participants : [];
        const otherUid = parts.find((p) => p && p !== myUid) || '';
        const otherProfile = await getChatProfile(otherUid);
        const name = otherProfile.nickname || otherProfile.full_name || 'Aventureiro';
        const avatar = otherProfile.avatar_url || '/assets/default-avatar.png';
        const last = c.last_message || '';

        const row = document.createElement('div');
        row.className = 'chat-bubble-item';
        row.innerHTML = `
            <div class="chat-bubble-avatar"><img alt="" src="${esc(avatar)}"></div>
            <div class="chat-bubble-meta">
              <div class="chat-bubble-name">${esc(name)}</div>
              <div class="chat-bubble-last">${esc(last || 'Abrir conversa')}</div>
            </div>
        `;
        row.addEventListener('click', () => {
            closeChatBubblePanel();
            if (!otherUid) {
                window.location.href = 'community.html?tab=message-requests';
                return;
            }
            openMiniChat(otherUid).catch(() => {});
        });
        listEl.appendChild(row);
    }
}

function getPrivateChatId(a, b) {
    return [String(a || ''), String(b || '')].sort().join('_');
}

async function ensurePrivateChat(chatId, myUid, otherUid) {
    if (!chatId || !myUid || !otherUid) return;
    try {
        const ref = doc(db, 'chats', chatId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            await setDoc(ref, {
                participants: [myUid, otherUid],
                type: 'private',
                accepted_by: [myUid],
                created_at: serverTimestamp()
            });
            return;
        }
        const data = snap.data() || {};
        const accepted = Array.isArray(data.accepted_by) ? data.accepted_by : [];
        if (!accepted.includes(myUid)) {
            await updateDoc(ref, { accepted_by: arrayUnion(myUid) });
        }
    } catch {}
}

function closeMiniChat() {
    const modal = document.getElementById('chat-mini-modal');
    if (modal) modal.style.display = 'none';
    if (unsubscribeMiniChat) {
        unsubscribeMiniChat();
        unsubscribeMiniChat = null;
    }
    miniChatId = null;
    miniChatOtherUid = null;
    const msgEl = document.getElementById('chat-mini-messages');
    if (msgEl) msgEl.innerHTML = '';
}

function openMiniChatModal() {
    const modal = document.getElementById('chat-mini-modal');
    if (modal) modal.style.display = 'flex';
}

function renderMiniMessages(msgs, myUid) {
    const listEl = document.getElementById('chat-mini-messages');
    if (!listEl) return;
    listEl.innerHTML = '';
    msgs.forEach((m) => {
        const isMine = String(m.sender_id || '') === String(myUid || '');
        const item = document.createElement('div');
        item.className = `chat-mini-msg ${isMine ? 'mine' : 'theirs'}`;
        item.innerHTML = `<div class="chat-mini-bubble">${esc(m.text || '')}</div>`;
        listEl.appendChild(item);
    });
    listEl.scrollTop = listEl.scrollHeight;
}

async function openMiniChat(otherUid) {
    const myUid = currentChatsUserId;
    if (!myUid) return;
    if (!otherUid) return;
    miniChatOtherUid = otherUid;
    miniChatId = getPrivateChatId(myUid, otherUid);

    const titleEl = document.getElementById('chat-mini-title');
    const openFull = document.getElementById('chat-mini-open-full');
    const otherProfile = await getChatProfile(otherUid);
    const otherName = otherProfile.nickname || otherProfile.full_name || 'Aventureiro';
    if (titleEl) titleEl.textContent = otherName;
    if (openFull) openFull.href = `community.html?tab=message-requests&chat=private&uid=${encodeURIComponent(otherUid)}`;

    await ensurePrivateChat(miniChatId, myUid, otherUid);

    if (unsubscribeMiniChat) {
        unsubscribeMiniChat();
        unsubscribeMiniChat = null;
    }

    openMiniChatModal();
    const input = document.getElementById('chat-mini-input');
    if (input) {
        input.value = '';
        input.focus();
    }

    const qMsgs = query(
        collection(db, 'chats', miniChatId, 'messages'),
        orderBy('timestamp', 'desc'),
        limit(30)
    );

    unsubscribeMiniChat = onSnapshot(qMsgs, (snap) => {
        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() || {}) }));
        list.reverse();
        renderMiniMessages(list, myUid);
    }, () => {
        renderMiniMessages([], myUid);
    });
}

function startChatsListener(userId) {
    if (unsubscribeChats) {
        unsubscribeChats();
        unsubscribeChats = null;
    }
    currentChatsUserId = userId;
    const qChats = query(
        collection(db, 'chats'),
        where('participants', 'array-contains', userId),
        where('type', '==', 'private'),
        limit(50)
    );
    unsubscribeChats = onSnapshot(qChats, async (snap) => {
        const list = [];
        snap.forEach((d) => {
            const data = d.data() || {};
            const t = data.last_timestamp?.toMillis ? data.last_timestamp.toMillis() : (data.created_at?.toMillis ? data.created_at.toMillis() : 0);
            list.push({ id: d.id, ...data, _ts: t });
        });
        list.sort((a, b) => (b._ts || 0) - (a._ts || 0));
        latestChatsCache = list;
        await renderChatBubble(list, userId);
    }, async () => {
        latestChatsCache = [];
        await renderChatBubble([], userId);
    });
}

// Lógica do botão flutuante de "Retornar à História" (Modo História)
function updateStoryReturnButton() {
    const sessionData = localStorage.getItem('elara_story_session');
    if (!sessionData || window.location.pathname.includes('story.html')) {
        const existingBtn = document.getElementById('story-return-btn');
        if (existingBtn) existingBtn.remove();
        return;
    }

    const session = JSON.parse(sessionData);
    if (!session.expiry) return;

    const now = Date.now();
    const remainingMs = session.expiry - now;

    if (remainingMs <= 0) {
        // Sessão expirou: salva (já está salvo) e limpa o status de ativa
        delete session.expiry;
        localStorage.setItem('elara_story_session', JSON.stringify(session));
        const existingBtn = document.getElementById('story-return-btn');
        if (existingBtn) existingBtn.remove();
        return;
    }

    // Cria ou atualiza o botão
    let returnBtn = document.getElementById('story-return-btn');
    if (!returnBtn) {
        returnBtn = document.createElement('a');
        returnBtn.id = 'story-return-btn';
        returnBtn.href = 'story.html';
        returnBtn.className = 'return-story-float';
        document.body.appendChild(returnBtn);
    }

    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);
    const timerStr = `${mins}:${secs.toString().padStart(2, '0')}`;

    returnBtn.innerHTML = `
        <i class="fas fa-history"></i> Retornar à História 
        <span class="timer">${timerStr}</span>
    `;
}

// Atualiza o timer a cada segundo
setInterval(updateStoryReturnButton, 1000);
updateStoryReturnButton();

// Lógica de Autenticação com Cache para evitar flickering
let authStateResolved = false;
let loginTimeout = null;

function renderUserMenu(data) {
    const authContainer = document.getElementById('nav-auth-container');
    const navLinksMenu = document.getElementById('nav-links-menu');
    const viewToggle = document.getElementById('nav-view-toggle');
    const toggleLanding = document.getElementById('nav-toggle-landing');
    const toggleFeed = document.getElementById('nav-toggle-feed');
    if (!authContainer) return;

    if (data) {
        // Se temos dados, cancelamos qualquer timeout de login pendente
        if (loginTimeout) {
            clearTimeout(loginTimeout);
            loginTimeout = null;
        }
        
        const { displayName, avatarUrl, currentFrame } = data;
        const avatarStyle = avatarUrl ? `background-image: url('${avatarUrl}'); background-size: cover; background-position: center; display: block;` : 'display: block;';
        
        authContainer.innerHTML = `
            <a href="profile.html" class="user-name">
                <div class="user-avatar-small" style="${avatarStyle}">
                    <div class="frame-glow glow-${currentFrame.toLowerCase()}" style="display: none;"></div>
                    <div class="frame-border frame-${currentFrame.toLowerCase()}" style="display: none;"></div>
                </div>
                <span id="nav-username">${displayName}</span>
            </a> 
            <button id="logout-btn" class="btn-logout desktop-only">Sair</button>
        `;

        // Botão Sair Desktop
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleSignOut);
        }

        // Botão Sair Mobile
        const mobileLogoutId = 'logout-btn-mobile';
        if (navLinksMenu && !navLinksMenu.querySelector(`#${mobileLogoutId}`)) {
            const mobileLogoutBtn = document.createElement('button');
            mobileLogoutBtn.id = mobileLogoutId;
            mobileLogoutBtn.className = 'btn-logout mobile-only';
            mobileLogoutBtn.textContent = 'Sair';
            mobileLogoutBtn.style.marginTop = 'auto';
            mobileLogoutBtn.style.width = '90%';
            navLinksMenu.appendChild(mobileLogoutBtn);
            mobileLogoutBtn.addEventListener('click', handleSignOut);
        }
        
        authStateResolved = true;

        if (viewToggle) {
            const path = window.location.pathname || '';
            const isIndex = path.endsWith('/index.html') || path.endsWith('index.html') || path === '/' || path.endsWith('/');
            const isFeed = path.endsWith('/posts.html') || path.endsWith('posts.html');
            
            if (isIndex || isFeed) {
                viewToggle.style.display = 'flex';
                if (toggleLanding) toggleLanding.classList.toggle('active', isIndex);
                if (toggleFeed) toggleFeed.classList.toggle('active', isFeed);
            } else {
                viewToggle.style.display = 'none';
            }
        }
    } else {
        // Se não temos dados, esperamos um pouco antes de mostrar "Entrar/Criar"
        // para evitar flickering enquanto o Firebase resolve o estado
        if (!authStateResolved && !loginTimeout) {
            loginTimeout = setTimeout(() => {
                showLoginButtons(authContainer, navLinksMenu);
                authStateResolved = true;
                loginTimeout = null;
            }, 800); // 800ms de atraso conforme solicitado para estabilidade
        } else if (authStateResolved) {
            // Se já resolvemos que não está logado, mostra imediatamente
            showLoginButtons(authContainer, navLinksMenu);
        }

        if (viewToggle) viewToggle.style.display = 'none';
    }
}

function showLoginButtons(authContainer, navLinksMenu) {
    authContainer.innerHTML = `
        <a href="login.html" class="nav-item">Entrar</a>
        <a href="register.html" class="btn-primary btn-login">Criar</a>
    `;
    // Remove botão mobile se existir
    const mobileBtn = document.getElementById('logout-btn-mobile');
    if (mobileBtn) mobileBtn.remove();
}

async function handleSignOut() {
    localStorage.removeItem('elara_user_cache');
    await signOut(auth);
    window.location.href = 'index.html';
}

// 1. Tentar carregar do cache imediatamente
const cachedUser = localStorage.getItem('elara_user_cache');
if (cachedUser) {
    try {
        renderUserMenu(JSON.parse(cachedUser));
    } catch (e) {
        localStorage.removeItem('elara_user_cache');
    }
}

// 2. Aguardar confirmação oficial do Firebase
waitForAuth().then(async (user) => {
    const notifBtn = document.getElementById('nav-notifications-btn');
    const notifOverlay = document.getElementById('notifications-overlay');
    const notifPanel = notifOverlay ? notifOverlay.querySelector('.notifications-panel') : null;
    const notifCloseBtn = document.getElementById('btn-notifications-close');
    const notifMarkAllBtn = document.getElementById('btn-notifications-mark-all');
    const chatBtn = document.getElementById('chat-bubble-btn');

    if (notifOverlay && notifPanel) {
        notifOverlay.addEventListener('click', () => closeNotifications());
        notifPanel.addEventListener('click', (e) => e.stopPropagation());
    }
    if (notifCloseBtn) notifCloseBtn.addEventListener('click', () => closeNotifications());
    if (notifBtn) notifBtn.addEventListener('click', () => openNotifications());

    if (user) {
        let userData = {
            displayName: user.displayName || 'Viajante',
            avatarUrl: '',
            currentFrame: 'wood'
        };
        
        try {
            const profileRef = doc(db, 'profiles', user.uid);
            const profileDoc = await getDoc(profileRef);
            if (profileDoc.exists()) {
                const profile = profileDoc.data();
                userData.displayName = profile.nickname || profile.full_name || user.displayName || 'Viajante';
                userData.avatarUrl = profile.avatar_url || '';
                
                const isUserAdmin = profile.is_admin || (user.email === 'hayagames@outlook.com');
                userData.currentFrame = isUserAdmin ? 'adm' : (profile.current_frame || 'wood');
            }
        } catch (error) {
            console.error("Erro ao buscar perfil para o header:", error);
        }

        // Salvar no cache e renderizar (atualizando se necessário)
        localStorage.setItem('elara_user_cache', JSON.stringify(userData));
        renderUserMenu(userData);

        if (notifBtn) notifBtn.style.display = 'inline-flex';
        const path = window.location.pathname || '';
        const isCommunity = path.endsWith('/community.html') || path.endsWith('community.html');
        if (chatBtn) chatBtn.style.display = isCommunity ? 'none' : 'inline-flex';
        if (!isCommunity) startChatsListener(user.uid);

        const profileRef = doc(db, 'profiles', user.uid);
        try {
            const profileDoc = await getDoc(profileRef);
            const profile = profileDoc.exists() ? profileDoc.data() : {};
            const planState = getPlanState({ user, profile });

            const freeNotifRef = doc(db, 'profiles', user.uid, 'notifications', 'plan_update_fixed');
            if (!planState.admin && planState.key === 'free') {
                await setDoc(freeNotifRef, {
                    type: 'plan_update',
                    title: 'Updated de plan',
                    body: 'Você está no Plano Aventureiro (Free). Toque aqui para fazer upgrade.',
                    read: true,
                    created_at: serverTimestamp()
                }, { merge: true });
            } else {
                try { await deleteDoc(freeNotifRef); } catch {}
            }

            if (planState.isPaid && String(planState.status || '') === 'active' && planState.periodStartsAt) {
                const startMs = planState.periodStartsAt.getTime();
                const endsAt = planState.periodEndsAt || new Date(startMs + (30 * 24 * 60 * 60 * 1000));
                const diffDays = Math.ceil((endsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                if (diffDays <= 10 && diffDays >= 0) {
                    const notifId = `plan_renewal_${startMs}`;
                    await setDoc(doc(db, 'profiles', user.uid, 'notifications', notifId), {
                        type: 'plan_renewal',
                        title: 'Renovação do plano',
                        body: `Faltam ${diffDays} dias para renovar seu plano via Pix.`,
                        payload: { plan: planState.rawKey },
                        read: false,
                        created_at: serverTimestamp()
                    }, { merge: true });
                }
            }
        } catch {}

        if (unsubscribeNotifications) {
            unsubscribeNotifications();
            unsubscribeNotifications = null;
        }
        currentNotificationsUserId = user.uid;
        const qNotifs = query(collection(db, 'profiles', user.uid, 'notifications'), orderBy('created_at', 'desc'), limit(50));
        unsubscribeNotifications = onSnapshot(qNotifs, (snap) => {
            const list = [];
            snap.forEach((d) => {
                const data = d.data() || {};
                const dt = data.created_at?.toDate ? data.created_at.toDate() : null;
                const dateLabel = dt ? dt.toLocaleString('pt-BR') : '';
                list.push({ id: d.id, ...data, _dateLabel: dateLabel });
            });
            latestNotificationsCache = list;
            renderNotifications(list, user.uid);
        }, (err) => {
            console.error('Erro ao ouvir notificações:', err);
            latestNotificationsCache = [];
            renderNotifications([], user.uid);
        });

        if (notifMarkAllBtn) {
            notifMarkAllBtn.onclick = async () => {
                try {
                    const unread = latestNotificationsCache.filter(n => !n.read);
                    await Promise.all(unread.map(n => updateDoc(doc(db, 'profiles', user.uid, 'notifications', n.id), { read: true, read_at: serverTimestamp() })));
                } catch {}
            };
        }

        if (unsubscribeUpdateBroadcasts) {
            unsubscribeUpdateBroadcasts();
            unsubscribeUpdateBroadcasts = null;
        }
        const seenKey = `elara_update_broadcast_seen_${user.uid}`;
        const loadSeen = () => {
            try {
                const raw = localStorage.getItem(seenKey);
                const arr = raw ? JSON.parse(raw) : [];
                return Array.isArray(arr) ? new Set(arr) : new Set();
            } catch {
                return new Set();
            }
        };
        const saveSeen = (set) => {
            try {
                const arr = Array.from(set).slice(-80);
                localStorage.setItem(seenKey, JSON.stringify(arr));
            } catch {}
        };
        let seen = loadSeen();
        const qBroadcasts = query(collection(db, 'update_broadcasts'), orderBy('created_at', 'desc'), limit(10));
        unsubscribeUpdateBroadcasts = onSnapshot(qBroadcasts, (snap) => {
            const toProcess = [];
            snap.forEach((d) => {
                if (!seen.has(d.id)) toProcess.push({ id: d.id, ...d.data() });
            });
            if (toProcess.length === 0) return;
            const ps = toProcess.map(async (b) => {
                const notifId = `server_update_${b.id}`;
                const notifRef = doc(db, 'profiles', user.uid, 'notifications', notifId);
                try {
                    const exists = await getDoc(notifRef);
                    if (exists.exists()) {
                        seen.add(b.id);
                        return;
                    }
                } catch {}
                const title = b.title || 'Atualizações';
                const body = b.body || 'Veja as novidades da semana.';
                const updateId = b.update_id || '';
                try {
                    await setDoc(notifRef, {
                        type: 'server_update',
                        title,
                        body,
                        payload: { update_id: updateId },
                        read: false,
                        created_at: b.created_at || serverTimestamp()
                    });
                } catch {}
                seen.add(b.id);
            });
            Promise.all(ps).then(() => saveSeen(seen)).catch(() => {});
        }, (err) => {
            console.error('Erro ao ouvir broadcasts de atualizações:', err);
        });
    } else {
        // Usuário não logado
        localStorage.removeItem('elara_user_cache');
        renderUserMenu(null);

        if (notifBtn) notifBtn.style.display = 'none';
        if (chatBtn) chatBtn.style.display = 'none';
        closeChatBubblePanel();
        closeMiniChat();
        if (unsubscribeChats) {
            unsubscribeChats();
            unsubscribeChats = null;
        }
        currentChatsUserId = null;
        closeNotifications();
        if (unsubscribeNotifications) {
            unsubscribeNotifications();
            unsubscribeNotifications = null;
        }
        if (unsubscribeUpdateBroadcasts) {
            unsubscribeUpdateBroadcasts();
            unsubscribeUpdateBroadcasts = null;
        }
        currentNotificationsUserId = null;
    }
});



