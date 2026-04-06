import { STORY_NODES, ELEMENTS, GAME_PLAYLIST } from './constants.js';
import { db, doc, updateDoc, arrayUnion, setDoc, getDoc } from '../firebase.js';

export class StoryEngine {
    constructor(character, onFinish) {
        this.character = character;
        this.onFinish = onFinish;
        this.currentNode = null;
        this.isTyping = false;
        this.isPaused = false;
        this.container = document.getElementById('active-story');
        this.narrativeBox = document.getElementById('narrative-box');
        this.pauseMenu = document.getElementById('pause-menu');
        this.pauseTrigger = document.getElementById('pause-trigger');
        this.battleSystem = null;
        this.unlockedSkills = []; // Armazena IDs de habilidades desbloqueadas
        this.user = null; // UID do Firebase
        this.gameAudio = null; // Elemento de áudio
        this.currentPlaylist = [...GAME_PLAYLIST];
        this.currentTrackIndex = -1;

        this.setupPauseMenu();
    }

    setupAudioSystem() {
        if (this.gameAudio) return; // Evita duplicar

        this.gameAudio = new Audio();
        this.gameAudio.volume = 0.5;
        
        // Quando a música acabar, toca a próxima aleatória
        this.gameAudio.onended = () => this.playRandomTrack();

        const audioControls = document.createElement('div');
        audioControls.className = 'audio-controls';
        audioControls.id = 'story-audio-player'; // ID para controle de visibilidade
        audioControls.style.display = 'none'; // Escondido por padrão no início
        audioControls.innerHTML = `
            <div id="audio-track-info" class="audio-track-info" style="font-size: 0.75rem; color: #ffd700; font-weight: bold; font-family: 'Cinzel', serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 116px;"></div>
            <button id="audio-toggle-btn" class="audio-btn" title="Play/Pause">
                <i class="fas fa-play"></i>
            </button>
            <button id="audio-next-btn" class="audio-btn" title="Próxima Faixa">
                <i class="fas fa-step-forward"></i>
            </button>
            <button id="audio-mute-btn" class="audio-btn" title="Mute/Unmute">
                <i class="fas fa-volume-up"></i>
            </button>
            <input type="range" id="audio-volume" class="volume-slider" min="0" max="1" step="0.1" value="0.1">
        `;
        document.body.appendChild(audioControls);

        const toggleBtn = document.getElementById('audio-toggle-btn');
        const nextBtn = document.getElementById('audio-next-btn');
        const muteBtn = document.getElementById('audio-mute-btn');
        const volumeSlider = document.getElementById('audio-volume');

        toggleBtn.onclick = () => {
            if (this.gameAudio.paused) {
                this.gameAudio.play().catch(e => console.log("Áudio aguardando interação..."));
                toggleBtn.innerHTML = '<i class="fas fa-pause"></i>';
            } else {
                this.gameAudio.pause();
                toggleBtn.innerHTML = '<i class="fas fa-play"></i>';
            }
        };

        nextBtn.onclick = () => this.playRandomTrack();

        muteBtn.onclick = () => {
            this.gameAudio.muted = !this.gameAudio.muted;
            muteBtn.innerHTML = this.gameAudio.muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
        };

        volumeSlider.oninput = (e) => {
            this.gameAudio.volume = e.target.value;
        };

        // Inicia a primeira música aleatória
        this.playRandomTrack();
    }

    playRandomTrack() {
        if (!this.gameAudio) return;

        // Escolhe um índice aleatório diferente do atual (se possível)
        let nextIndex;
        if (this.currentPlaylist.length > 1) {
            do {
                nextIndex = Math.floor(Math.random() * this.currentPlaylist.length);
            } while (nextIndex === this.currentTrackIndex);
        } else {
            nextIndex = 0;
        }

        this.currentTrackIndex = nextIndex;
        const track = this.currentPlaylist[this.currentTrackIndex];
        
        this.gameAudio.src = track.src;
        this.gameAudio.play().then(() => {
            const toggleBtn = document.getElementById('audio-toggle-btn');
            if (toggleBtn) toggleBtn.innerHTML = '<i class="fas fa-pause"></i>';
            
            const trackInfo = document.getElementById('audio-track-info');
            if (trackInfo) trackInfo.textContent = `🎵 ${track.title}`;
        }).catch(e => console.log("Autoplay bloqueado, aguardando clique..."));
    }

    setBattleSystem(battleSystem) {
        this.battleSystem = battleSystem;
        // Inicializa com a primeira habilidade do herói por padrão se for novo jogo
        if (this.unlockedSkills.length === 0 && this.character.skills.length > 0) {
            this.unlockedSkills = [this.character.skills[0].id];
        }
    }

    async start(nodeId = null) {
        this.pauseTrigger.style.display = 'flex';
        
        // Tenta carregar habilidades da sessão se existir
        const session = JSON.parse(localStorage.getItem('elara_story_session'));
        if (session) {
            if (session.unlockedSkills) this.unlockedSkills = session.unlockedSkills;
            // Se já existe um UID na sessão, usa ele, mas prioriza o objeto user passado pelo story.html
            if (session.uid && !this.user) this.user = { uid: session.uid };
        }

        // Sincroniza habilidades do Firestore se tivermos o usuário
        if (this.user && this.user.uid) {
            try {
                const profileDoc = await getDoc(doc(db, 'profiles', this.user.uid));
                if (profileDoc.exists()) {
                    const cloudSkills = profileDoc.data().unlocked_skills || [];
                    // Mescla as habilidades locais com as da nuvem, sem duplicar
                    cloudSkills.forEach(skillId => {
                        if (!this.unlockedSkills.includes(skillId)) {
                            this.unlockedSkills.push(skillId);
                        }
                    });
                    console.log("Habilidades sincronizadas com a nuvem:", this.unlockedSkills);
                }
            } catch (e) {
                console.error("Erro ao sincronizar habilidades com o Firestore:", e);
            }
        }

        if (this.unlockedSkills.length === 0 && this.character.skills.length > 0) {
            this.unlockedSkills = [this.character.skills[0].id];
        }

        if (!nodeId) {
            nodeId = this.character.elementId ? `${this.character.elementId}_start` : 'fire_start';
        }
        
        this.showStoryNode(nodeId);
    }

    async unlockSkill(skillId) {
        if (!this.unlockedSkills.includes(skillId)) {
            this.unlockedSkills.push(skillId);
            this.saveProgressSilent();
            
            // Sincroniza com o Firebase (UID do usuário)
            if (this.user && this.user.uid) {
                try {
                    const profileRef = doc(db, 'profiles', this.user.uid);
                    await setDoc(profileRef, {
                        unlocked_skills: arrayUnion(skillId)
                    }, { merge: true });
                    console.log(`Habilidade ${skillId} sincronizada com o perfil.`);
                } catch (e) {
                    console.error("Erro ao sincronizar habilidade com Firebase:", e);
                }
            }

            // Notificação visual simples
            const notify = document.createElement('div');
            notify.className = 'skill-unlock-toast animate-fade-in';
            notify.innerHTML = `Nova Habilidade Desbloqueada!`;
            document.body.appendChild(notify);
            setTimeout(() => notify.remove(), 3000);
            
            // Força o sistema de batalha a atualizar a lista de habilidades se estiver no meio de uma luta
            if (this.battleSystem) {
                this.battleSystem.unlockedSkills = this.unlockedSkills;
            }
        }
    }

    openSkillSelectionModal(onSelect) {
        // Coleta todas as habilidades de todos os elementos que o jogador ainda não tem
        const allSkills = [];
        Object.values(ELEMENTS).forEach(el => {
            el.heroes.forEach(h => {
                h.skills.forEach(s => {
                    if (!this.unlockedSkills.includes(s.id)) {
                        allSkills.push({ ...s, elementColor: el.color, elementIcon: el.icon });
                    }
                });
            });
        });

        // Sorteia 3 habilidades aleatórias para oferecer ao jogador
        const shuffled = allSkills.sort(() => 0.5 - Math.random());
        const options = shuffled.slice(0, 3);

        const modal = document.createElement('div');
        modal.className = 'modal-overlay animate-fade-in';
        modal.style.zIndex = '10001';
        
        modal.innerHTML = `
            <div class="modal-content skill-selection-modal" style="max-width: 800px; padding: 2rem;">
                <h2 class="title-cinzel" style="color: #ffd700; margin-bottom: 1rem;">Domínio de Habilidade</h2>
                <p style="color: #ccc; margin-bottom: 2rem;">Escolha uma nova técnica para incorporar ao seu arsenal:</p>
                <div class="skill-options-grid">
                    ${options.map(s => `
                        <div class="skill-option-card" data-id="${s.id}" style="border: 1px solid ${s.elementColor}; padding: 1.5rem; border-radius: 12px; cursor: pointer; transition: all 0.3s; background: rgba(0,0,0,0.3);">
                            <div style="font-size: 2rem; margin-bottom: 1rem;">${s.elementIcon}</div>
                            <h4 style="color: ${s.elementColor}; margin-bottom: 0.5rem;">${s.name}</h4>
                            <p style="font-size: 0.8rem; color: #aaa; margin-bottom: 1rem;">Custo: ${s.cost} MP | Dano: ${s.damage}</p>
                            <button class="btn-primary" style="width: 100%; padding: 0.5rem; font-size: 0.8rem; background: ${s.elementColor}">Aprender</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelectorAll('.skill-option-card').forEach(card => {
            card.onclick = () => {
                const skillId = card.dataset.id;
                const skill = options.find(s => s.id === skillId);
                this.unlockSkill(skillId);
                modal.remove();
                if (onSelect) onSelect(skill);
            };
        });
    }

    setupPauseMenu() {
        if (this.pauseTrigger) {
            this.pauseTrigger.onclick = () => this.togglePause();
        }
        
        const resumeBtn = document.getElementById('resume-btn');
        const saveBtn = document.getElementById('save-progress-btn');
        const homeBtn = document.getElementById('back-home-btn');
        const abandonBtn = document.getElementById('abandon-story-btn');

        if (resumeBtn) resumeBtn.onclick = () => this.togglePause();
        if (saveBtn) saveBtn.onclick = () => this.saveProgress();
        if (homeBtn) homeBtn.onclick = () => this.goHome();
        if (abandonBtn) abandonBtn.onclick = () => this.abandonStory();
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        this.pauseMenu.style.display = this.isPaused ? 'flex' : 'none';
        
        // Controle da música e visibilidade do player ao pausar
        const audioPlayer = document.getElementById('story-audio-player');
        if (this.gameAudio) {
            if (this.isPaused) {
                this.gameAudio.pause();
                if (audioPlayer) audioPlayer.style.display = 'flex'; // Mostra controles apenas no pause
            } else {
                this.gameAudio.play().catch(e => console.log("Áudio aguardando interação..."));
                if (audioPlayer) audioPlayer.style.display = 'none'; // Esconde controles ao voltar pro jogo
            }
            
            // Atualiza ícone do botão de play/pause do player de música
            const toggleBtn = document.getElementById('audio-toggle-btn');
            if (toggleBtn) {
                toggleBtn.innerHTML = this.gameAudio.paused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
            }
        }

        if (this.isPaused) {
            this.pauseMenu.classList.add('visible');
        } else {
            this.pauseMenu.classList.remove('visible');
        }
    }

    saveProgress() {
        const session = {
            charId: this.character.id,
            nodeId: this.currentNode.id,
            playerHp: this.battleSystem?.playerHp || this.character.stats.hp,
            playerMp: this.battleSystem?.playerMp || this.character.stats.mp,
            unlockedSkills: this.unlockedSkills, // Salva habilidades desbloqueadas
            uid: this.user?.uid, // Mantém o UID na sessão
            timestamp: Date.now()
        };
        
        localStorage.setItem('elara_story_session', JSON.stringify(session));
        alert('Progresso salvo com sucesso!');
        this.togglePause();
    }

    goHome() {
        // Salva silenciosamente e define expiração de 5 minutos para o botão de retorno
        const session = {
            charId: this.character.id,
            nodeId: this.currentNode.id,
            playerHp: this.battleSystem?.playerHp || this.character.stats.hp,
            playerMp: this.battleSystem?.playerMp || this.character.stats.mp,
            timestamp: Date.now(),
            expiry: Date.now() + (5 * 60 * 1000) // 5 minutos
        };
        localStorage.setItem('elara_story_session', JSON.stringify(session));
        window.location.href = 'index.html';
    }

    abandonStory() {
        if (confirm('Tem certeza que deseja abandonar? Todo o progresso não salvo será perdido e esta história será trancada até você começar de novo.')) {
            localStorage.removeItem('elara_story_session');
            window.location.reload();
        }
    }

    showStoryNode(nodeId) {
        const node = STORY_NODES[nodeId];
        if (!node) {
            console.error(`Nó da história não encontrado: ${nodeId}`);
            return;
        }

        console.log(`Iniciando nó: ${nodeId}`, node);

        this.currentNode = node;
        this.currentNodeId = nodeId;
        
        // Garante que o container da história esteja visível
        this.container.style.display = 'flex';
        
        // Lógica de sprites (personagem conversando)
        const leftSprite = node.leftSprite ? `<img src="${node.leftSprite}" class="char-sprite left-sprite animate-slide-left">` : '';
        const rightSprite = node.rightSprite ? `<img src="${node.rightSprite}" class="char-sprite right-sprite animate-slide-right">` : '';

        this.container.innerHTML = `
            <div class="story-scene animate-fade-in" style="background-image: url('${node.background}')">
                <div class="story-overlay"></div>
                
                <div class="character-display-area">
                    ${leftSprite}
                    ${rightSprite}
                </div>

                <div class="story-content">
                    <div class="dialogue-box">
                        <div class="speaker-name" style="background: ${node.speakerColor || '#8b0000'}">${node.speaker}</div>
                        <div class="dialogue-text" id="typewriter-text"></div>
                    </div>

                    <div class="story-choices" id="choices-container">
                        <!-- Botões de escolha aparecem aqui após o texto -->
                    </div>
                </div>
            </div>
        `;

        this.typeWriter(node.text, () => {
            this.renderChoices(node.choices);
            
            // Verifica se o nó desbloqueia habilidade
            if (node.unlockSkill) {
                this.unlockSkill(node.unlockSkill);
            }

            // Executa evento ao entrar no nó, se houver (ex: iniciar batalha)
            if (node.onEnter) {
                console.log(`Executando onEnter para o nó: ${nodeId}`);
                node.onEnter(this);
            }
        });

        this.saveProgressSilent();
    }

    typeWriter(text, callback) {
        const el = this.container.querySelector('#typewriter-text');
        let i = 0;
        el.textContent = '';
        
        const interval = setInterval(() => {
            el.textContent += text[i];
            i++;
            if (i >= text.length) {
                clearInterval(interval);
                if (callback) callback();
            }
        }, 30);

        // Permitir pular animação de texto ao clicar na caixa de diálogo
        this.container.querySelector('.dialogue-box').onclick = () => {
            clearInterval(interval);
            el.textContent = text;
            if (callback) {
                callback();
                callback = null; // Evita chamar duas vezes
            }
        };
    }

    renderChoices(choices) {
        const container = this.container.querySelector('#choices-container');
        if (!container) return;
        container.innerHTML = '';
        
        // Se for o nó de finalização da jornada, chama o modal de vitória
        if (this.currentNodeId === 'ending') {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = 'Finalizar Jornada';
            btn.style.borderLeftColor = '#ffd700';
            btn.onclick = () => this.showEndModal(true);
            container.appendChild(btn);
            return;
        }

        choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = choice.text;
            btn.style.borderLeftColor = this.character.color;
            btn.onclick = () => {
                if (choice.action === 'exit') {
                    localStorage.removeItem('elara_story_session');
                    window.location.replace('dashboard.html');
                } else if (choice.nextNode) {
                    this.showStoryNode(choice.nextNode);
                }
            };
            container.appendChild(btn);
        });
    }

    startBattle(enemyKey, nextNodeOnWin) {
        // Oculta UI de história e mostra combate
        const storyScene = this.container.querySelector('.story-scene');
        if (storyScene) storyScene.style.display = 'none';

        // Cria container para batalha se não existir
        let battleContainer = document.getElementById('story-battle-container');
        if (!battleContainer) {
            battleContainer = document.createElement('div');
            battleContainer.id = 'story-battle-container';
            battleContainer.className = 'battle-container-v2';
            this.container.appendChild(battleContainer);
        }
        battleContainer.style.display = 'flex';

        // Passa as habilidades desbloqueadas para o sistema de batalha
        this.battleSystem.container = battleContainer;
        this.battleSystem.unlockedSkills = this.unlockedSkills;
        this.battleSystem.storyEngine = this; // Injeta o engine no battle system para modais de derrota
        
        this.battleSystem.initBattle(enemyKey, () => {
            // Quando a batalha terminar (vitória)
            battleContainer.style.display = 'none';
            if (storyScene) storyScene.style.display = 'flex';
            
            // Cura pós-batalha: recupera 25% do HP e MP máximo
            const healAmount = Math.floor(this.character.stats.hp * 0.25);
            const mpAmount = Math.floor(this.character.stats.mp * 0.25);
            
            this.battleSystem.playerHp = Math.min(this.character.stats.hp, (this.battleSystem.playerHp || 0) + healAmount);
            this.battleSystem.playerMp = Math.min(this.character.stats.mp, (this.battleSystem.playerMp || 0) + mpAmount);
            
            this.showStoryNode(nextNodeOnWin);
            
            // Salva automaticamente após a batalha
            this.saveProgressSilent();
        });
    }

    saveProgressSilent() {
        const session = {
            charId: this.character.id,
            nodeId: this.currentNode.id,
            playerHp: this.battleSystem?.playerHp || this.character.stats.hp,
            playerMp: this.battleSystem?.playerMp || this.character.stats.mp,
            unlockedSkills: this.unlockedSkills, // Salva habilidades desbloqueadas
            uid: this.user?.uid, // Mantém o UID na sessão
            timestamp: Date.now()
        };
        localStorage.setItem('elara_story_session', JSON.stringify(session));
    }

    showEndModal(isWin) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay animate-fade-in';
        modal.style.zIndex = '10000';
        
        const title = isWin ? 'Vitória Épica!' : 'Derrota Amarga';
        const message = isWin ? 'Você salvou Elara da escuridão!' : 'Tentaremos te destruir novamente em breve The First';
        const btnText = isWin ? 'Voltar ao Dashboard' : 'Tentar Novamente';
        
        modal.innerHTML = `
            <div class="modal-content" style="text-align: center; padding: 3rem;">
                <h2 class="title-cinzel" style="color: ${isWin ? '#ffd700' : '#ff4d4d'}">${title}</h2>
                <p style="margin: 2rem 0; font-size: 1.2rem; color: #eee;">"${message}"</p>
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <button id="end-modal-btn" class="btn-primary" style="width: 100%">${btnText}</button>
                    ${!isWin ? '<button id="exit-story-btn" class="btn-logout" style="width: 100%">Sair da História</button>' : ''}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        document.getElementById('end-modal-btn').onclick = () => {
            if (isWin) {
                localStorage.removeItem('elara_story_session');
                window.location.href = 'dashboard.html';
            } else {
                window.location.reload();
            }
        };

        const exitBtn = document.getElementById('exit-story-btn');
        if (exitBtn) {
            exitBtn.onclick = () => {
                localStorage.removeItem('elara_story_session');
                window.location.href = 'dashboard.html';
            };
        }
    }
}
