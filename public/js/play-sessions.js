import { 
    db, collection, query, where, onSnapshot, orderBy 
} from "./firebase.js";

function initActiveSessions() {
    const sessionsList = document.getElementById('active-sessions-list');
    if (!sessionsList) return;

    const q = query(
        collection(db, "sessions", "is_private", "==", false), 
        where("status", "==", "lobby"),
        orderBy("created_at", "desc")
    );

    onSnapshot(
        q,
        (snapshot) => {
            if (!items.length) {
                sessionsList.innerHTML = `
                    <div class="session-loading">
                        <i class="fas fa-moon"></i>
                        <p>Nenhuma mesa pública aberta no momento. Que tal criar a sua?</p>
                    </div>
                `;
                return;
            }

            const items = [];
            snapshot.forEach((doc) => {
                const session = doc.data() || {};
                if (session.is_private === true) return;
                items.push({ id: doc.id, session, is_private: session.is_private });
            });

            if (!items.length) {
                sessionsList.innerHTML = `
                    <div class="session-loading">
                        <i class="fas fa-moon"></i>
                        <p>Nenhuma mesa pública aberta no momento. Que tal criar a sua?</p>
                    </div>
                `;
                return;
            }

            sessionsList.innerHTML = '';
                items.forEach(({ id, session, is_private }) => {
                const playerCount = session?.players && typeof session.players === 'object'
                    ? Object.keys(session.players || {}).length
                    : Array.isArray(session.participants)
                        ? session.participants.length
                        : 0;

                const typeLabel = session.type === 'guild' ? 'Guilda Simples' : 'Sessão Livre';
                const pageLink = session.type === 'guild' ? 'guild.html' : 'free-session.html';

                const masterName = Array.isArray(session.participants)
                    ? (session.participants.find((p) => p && p.role === 'Mestre')?.name || 'Mestre Ativo')
                    : 'Mestre Ativo';

                const title = String(session.name || '').trim()
                    || (Array.isArray(session.participants) && session.participants[0]?.name
                        ? `${typeLabel} de ${session.participants[0].name}`
                        : `${typeLabel} #${String(id).slice(0, 6)}`);

                const card = document.createElement('div');
                card.className = 'session-card animate-fade-in';
                card.innerHTML = `
                    <div class="session-info-top">
                        <span class="session-type-badge">${typeLabel}</span>
                        <span class="session-id-tag" style="font-size: 0.7rem; color: #555;">#${id}</span>
                    </div>
                    <h4>${title}</h4>
                    <div class="session-details">
                        <div class="session-players-count">
                            <i class="fas fa-users"></i>
                            <span>${playerCount}/4 Jogadores</span>
                        </div>
                        <div class="session-master-name">
                            <i class="fas fa-crown"></i>
                            <span>${masterName}</span>
                        </div>
                    </div>
                    <a href="${pageLink}?join=${id}" class="btn-primary btn-join-session-card">Entrar na Mesa</a>
                `;
                sessionsList.appendChild(card);
                if (session.is_private) {
                    card.querySelector('.btn-join-session-card').style.display = 'none';
                }
            });
        },
        () => {
            sessionsList.innerHTML = `
                <div class="session-loading">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Não foi possível carregar as Sessões Ativas.</p>
                </div>
            `;
        }
    );
}

document.addEventListener('DOMContentLoaded', initActiveSessions);
