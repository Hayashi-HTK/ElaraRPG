import { ELEMENTS } from './constants.js';

export class CharacterSelection {
    constructor(onSelect) {
        this.onSelect = onSelect;
        this.container = document.getElementById('story-selection');
        this.activeSession = JSON.parse(localStorage.getItem('elara_story_session'));
    }

    render() {
        let sessionInfo = '';
        if (this.activeSession) {
            const element = ELEMENTS[this.activeSession.elementId];
            const hero = element?.heroes.find(h => h.id === this.activeSession.charId);
            if (element && hero) {
                sessionInfo = `<div class="active-session-banner animate-fade-in">
                    <i class="fas fa-exclamation-circle"></i>
                    Sessão Ativa: <strong>${hero.name}</strong> (Elemento ${element.name} ${element.icon})
                </div>`;
            }
        }

        this.container.innerHTML = `
            <div class="selection-screen animate-fade-in">
                <div class="selection-header">
                    <h1 class="title-cinzel">Escolha seu Elemento</h1>
                    ${sessionInfo}
                    <p>${this.activeSession ? 'Você possui uma sessão ativa. Finalize-a para escolher outro herói.' : 'Selecione o elemento que guiará sua jornada narrativa.'}</p>
                </div>
                
                <div class="char-cards-container" id="cards-carousel">
                    ${Object.values(ELEMENTS).map(element => this.createElementCard(element)).join('')}
                </div>

                <div class="carousel-nav">
                    <button class="nav-arrow" id="prev-char"><i class="fas fa-chevron-left"></i></button>
                    <button class="nav-arrow" id="next-char"><i class="fas fa-chevron-right"></i></button>
                </div>
            </div>

            <!-- Modal de Sub-seleção de Herói -->
            <div id="hero-modal" class="modal-overlay" style="display: none;">
                <div class="modal-content hero-modal-content">
                    <div class="hero-modal-header">
                        <h2 class="title-cinzel" id="modal-element-title">Heróis de Fogo</h2>
                        <button class="modal-close-x" id="close-hero-modal">&times;</button>
                    </div>
                    <div class="hero-selection-grid" id="hero-grid">
                        <!-- Heróis injetados aqui -->
                    </div>
                </div>
            </div>
        `;

        this.carousel = this.container.querySelector('#cards-carousel');
        this.attachEvents();
        
        // Modal events
        document.getElementById('close-hero-modal').onclick = () => {
            document.getElementById('hero-modal').style.display = 'none';
        };

        setTimeout(() => {
            const cards = Array.from(this.carousel.querySelectorAll('.char-card'));
            if (cards.length > 0) {
                this.scrollToCard(cards[0]);
            }
        }, 100);
    }

    createElementCard(element) {
        return `
            <div class="char-card" 
                 data-id="${element.id}" 
                 style="--glow-color: ${element.glowColor}">
                <div class="char-card-inner">
                    <div class="char-image" style="background-image: url('${element.coverImage}')">
                        <div class="char-element-badge" style="background: ${element.color}">
                            ${element.icon} ${element.name}
                        </div>
                    </div>
                    <div class="char-info">
                        <h3>Domínio de ${element.name}</h3>
                        <p class="char-desc">${element.description}</p>
                        <button class="btn-select-char btn-element-select" style="background: ${element.color}">
                            Selecionar Elemento
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    attachEvents() {
        const cards = this.container.querySelectorAll('.char-card');
        const prevBtn = this.container.querySelector('#prev-char');
        const nextBtn = this.container.querySelector('#next-char');

        cards.forEach(card => {
            const btn = card.querySelector('.btn-element-select');
            if (btn) {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    this.openHeroModal(card.dataset.id);
                };
            }
            
            card.onclick = () => {
                this.scrollToCard(card);
            };
        });

        // Navigation arrows
        prevBtn.onclick = () => {
            const active = this.carousel.querySelector('.char-card.active');
            const prev = active?.previousElementSibling;
            if (prev) this.scrollToCard(prev);
        };

        nextBtn.onclick = () => {
            const active = this.carousel.querySelector('.char-card.active');
            const next = active?.nextElementSibling;
            if (next) this.scrollToCard(next);
        };

        const observerOptions = {
            root: this.carousel,
            rootMargin: '0px -40% 0px -40%',
            threshold: 0
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    cards.forEach(c => c.classList.remove('active'));
                    entry.target.classList.add('active');
                }
            });
        }, observerOptions);

        cards.forEach(card => observer.observe(card));
    }

    scrollToCard(card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    openHeroModal(elementId) {
        const element = ELEMENTS[elementId];
        const modal = document.getElementById('hero-modal');
        const title = document.getElementById('modal-element-title');
        const grid = document.getElementById('hero-grid');

        title.textContent = `Heróis de ${element.name}`;
        title.style.color = element.color;

        grid.innerHTML = element.heroes.map(hero => {
            // Verifica se o herói deve estar bloqueado (se houver sessão ativa com outro herói do mesmo elemento)
            const isLocked = this.activeSession && 
                            ELEMENTS[this.activeSession.elementId]?.id === elementId && 
                            this.activeSession.charId !== hero.id;

            return `
                <div class="hero-sub-card animate-fade-in ${isLocked ? 'locked-hero' : ''}" 
                     style="border-top: 4px solid ${element.color}; ${isLocked ? 'filter: grayscale(1); opacity: 0.6;' : ''}">
                    <div class="hero-sub-image" style="background-image: url('${hero.image}')"></div>
                    <div class="hero-sub-info">
                        <h4>${hero.name}</h4>
                        <span class="hero-class">${hero.class}</span>
                        <p>${hero.description}</p>
                        ${isLocked ? '<p class="locked-msg" style="color: #ff4d4d; font-weight: 800; font-size: 0.7rem;">SESSÃO ATIVA COM OUTRO HERÓI</p>' : ''}
                        <div class="hero-sub-stats">
                            <span>❤️ ${hero.stats.hp}</span>
                            <span>💧 ${hero.stats.mp}</span>
                            <span>⚔️ ${hero.stats.attack}</span>
                        </div>
                        <button class="btn-primary confirm-hero-btn" 
                                data-hero-id="${hero.id}" 
                                data-element-id="${element.id}"
                                ${isLocked ? 'disabled style="background: #333; cursor: not-allowed;"' : ''}>
                            ${isLocked ? 'Indisponível' : `Escolher ${hero.name}`}
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        modal.style.display = 'flex';

        grid.querySelectorAll('.confirm-hero-btn').forEach(btn => {
            if (!btn.disabled) {
                btn.onclick = () => {
                    const hId = btn.dataset.heroId;
                    const eId = btn.dataset.elementId;
                    this.handleHeroSelect(eId, hId);
                };
            }
        });
    }

    handleHeroSelect(elementId, heroId) {
        const element = ELEMENTS[elementId];
        const hero = element.heroes.find(h => h.id === heroId);
        
        // Vincula o elemento ao herói para o StoryEngine saber qual rota seguir
        const finalCharacter = {
            ...hero,
            elementId: elementId,
            elementIcon: element.icon,
            elementColor: element.color
        };

        const modal = document.getElementById('hero-modal');
        modal.style.display = 'none';

        // Salva o elementId na sessão para o bloqueio funcionar
        if (!this.activeSession) {
            localStorage.setItem('elara_story_session', JSON.stringify({
                charId: heroId,
                elementId: elementId,
                nodeId: null,
                timestamp: Date.now()
            }));
        }

        // Chama o callback de seleção diretamente, sem o fade-out do body
        this.onSelect(finalCharacter);
    }
}
