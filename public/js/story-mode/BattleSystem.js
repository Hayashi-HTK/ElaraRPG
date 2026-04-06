import { ENEMIES, ELEMENTS } from './constants.js';

export class BattleSystem {
    constructor(character) {
        this.character = character;
        this.playerHp = character.stats.hp;
        this.playerMp = character.stats.mp;
        this.enemy = null;
        this.onWin = null;
        this.isPlayerTurn = true;
        this.container = document.getElementById('battle-screen');
        this.combatLogEl = null;
        this.isDefending = false;
        this.skillCooldowns = {};
        this.unlockedSkills = []; // Recebido do StoryEngine
    }

    // Busca o objeto completo da habilidade em qualquer elemento/herói pelo ID
    getSkillById(skillId) {
        // Primeiro tenta nas habilidades padrão do personagem atual
        let skill = this.character.skills.find(s => s.id === skillId);
        if (skill) return skill;

        // Se não achar, busca em todos os elementos de constants.js
        for (const elKey in ELEMENTS) {
            const element = ELEMENTS[elKey];
            for (const hero of element.heroes) {
                skill = hero.skills.find(s => s.id === skillId);
                if (skill) return skill;
            }
        }
        return null;
    }

    // Retorna a lista de objetos de habilidade desbloqueados
    getUnlockedSkillObjects() {
        return this.unlockedSkills
            .map(id => this.getSkillById(id))
            .filter(skill => skill !== null);
    }

    initBattle(enemyKey, onWin) {
        this.onWin = onWin;
        const enemyData = ENEMIES[enemyKey];
        if (!enemyData) return;

        this.enemy = JSON.parse(JSON.stringify(enemyData)); // Clone
        
        // Se for um Boss, equilibra HP para ser igual ao do herói (conforme pedido)
        if (this.enemy.isBoss) {
            this.enemy.maxHp = this.character.stats.hp;
            this.enemy.hp = this.enemy.maxHp;
        }

        // Não reseta HP/MP no meio da história para manter o desafio
        // exceto se for a primeira batalha ou se estiver muito baixo (menos de 20%)
        const minHp = this.character.stats.hp * 0.2;
        if (!this.playerHp || this.playerHp < minHp) {
            this.playerHp = this.character.stats.hp;
            this.playerMp = this.character.stats.mp;
        }

        this.isPlayerTurn = true;
        this.isDefending = false;
        this.skillCooldowns = {}; // Reset total de recargas

        this.container.style.display = 'flex';
        this.renderBattle();
        this.updateUI();
        this.updateButtonStates(); // Garante que os botões reflitam o reset imediato
    }

    renderBattle() {
        this.container.innerHTML = `
            <div class="battle-arena story-battle animate-fade-in">
                <div class="tower-header story-header">
                    <div class="floor-counter">Modo História</div>
                    <div class="turn-counter">Round <span id="round-number">1</span></div>
                </div>

                <div class="clash-container" id="clash-overlay">
                    <div class="clash-side player-clash"></div>
                    <div class="clash-vs">VS</div>
                    <div class="clash-side enemy-clash"></div>
                </div>

                <div class="arena">
                    <!-- Player Side -->
                    <div class="combatant player-side">
                        <div class="combatant-card">
                            <div id="player-avatar" class="combatant-avatar" style="background-image: url('${this.character.image}')"></div>
                            <div class="combatant-info">
                                <h2 id="player-name">${this.character.name}</h2>
                                <div class="health-bar-container">
                                    <div id="player-health-bar" class="health-bar" style="width: 100%"></div>
                                </div>
                                <p id="player-health-text">${this.playerHp} / ${this.character.stats.hp}</p>
                                
                                <div class="mp-bar-container-v2" style="height: 6px; background: rgba(0,0,0,0.3); border-radius: 3px; margin-top: 4px;">
                                    <div id="player-mp-bar" class="mp-bar-fill-v2 mp-blue" style="width: 100%; height: 100%; background: #3b82f6; border-radius: 3px;"></div>
                                </div>
                                <p id="player-mp-text" style="font-size: 0.6rem; margin: 0; opacity: 0.8;">MP: ${this.playerMp} / ${this.character.stats.mp}</p>
                            </div>
                        </div>
                        
                        <div id="player-actions" class="player-actions">
                            <div id="skill-buttons" class="skill-buttons">
                                <!-- JS insere botões aqui -->
                            </div>
                        </div>
                    </div>

                    <!-- VS Badge central para mobile herdar tower.css -->
                    <div class="vs-badge" id="vs-badge">VS</div>

                    <!-- Enemy Side -->
                    <div class="combatant enemy-side">
                        <div class="combatant-card">
                            <div id="enemy-avatar" class="combatant-avatar" style="background-image: url('${this.enemy.image}')"></div>
                            <div class="combatant-info">
                                <h2 id="enemy-name">${this.enemy.name}</h2>
                                <div class="health-bar-container">
                                    <div id="enemy-health-bar" class="health-bar" style="width: 100%; background: #ff416c;"></div>
                                </div>
                                <p id="enemy-health-text">${this.enemy.hp} / ${this.enemy.maxHp}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="combat-log-container" id="story-log-container">
                    <div class="combat-log-header" onclick="this.parentElement.classList.toggle('collapsed')">
                        <h3>Log de Batalha</h3>
                        <i class="fas fa-chevron-left"></i>
                    </div>
                    <div id="combat-log" class="combat-log"></div>
                </div>
            </div>
        `;

        this.combatLogEl = this.container.querySelector('#combat-log');
        this.renderSkillButtons();
        this.runClashAnimation();
    }

    async runClashAnimation() {
        const overlay = this.container.querySelector('#clash-overlay');
        const pSide = overlay.querySelector('.player-clash');
        const eSide = overlay.querySelector('.enemy-clash');
        
        pSide.style.backgroundImage = `url('${this.character.image}')`;
        eSide.style.backgroundImage = `url('${this.enemy.image}')`;

        overlay.style.display = 'flex';
        await new Promise(r => setTimeout(r, 50));
        overlay.classList.add('active');

        setTimeout(() => {
            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.style.display = 'none';
                this.logSystem("Sua vez de atacar!");
            }, 300);
        }, 2500);
    }

    renderSkillButtons() {
        const grid = this.container.querySelector('#skill-buttons');
        const unlockedSkillObjects = this.getUnlockedSkillObjects();

        grid.innerHTML = `
            <button class="skill-card-btn" id="btn-attack">
                <div class="skill-icon">👊</div>
                <div class="skill-info">
                    <span class="skill-name">Atacar</span>
                </div>
            </button>
            
            ${unlockedSkillObjects.map(skill => {
                return `
                    <button class="skill-card-btn skill-special-btn" data-id="${skill.id}">
                        <div class="skill-icon">${skill.damage < 0 ? '💚' : '✨'}</div>
                        <div class="skill-info">
                            <span class="skill-name">${skill.name}</span>
                        </div>
                        <div class="skill-cd-overlay" id="cd-${skill.id}"></div>
                    </button>
                `;
            }).join('')}

            <button class="skill-card-btn" id="btn-defend">
                <div class="skill-icon">🛡️</div>
                <div class="skill-info">
                    <span class="skill-name">Defesa</span>
                </div>
            </button>
        `;
        this.attachEvents();
        this.updateButtonStates();
    }

    attachEvents() {
        const attackBtn = this.container.querySelector('#btn-attack');
        const defendBtn = this.container.querySelector('#btn-defend');
        const skillBtns = this.container.querySelectorAll('.skill-special-btn');

        if (attackBtn) {
            attackBtn.onclick = () => {
                if (!this.isPlayerTurn) return;
                // Para o ataque básico, o "dano base" é menor pois somamos com o dado e o modificador
                this.useSkill({ id: 'basic', name: 'Ataque Básico', damage: 10 });
            };
        }

        if (defendBtn) {
            defendBtn.onclick = () => {
                if (!this.isPlayerTurn) return;
                this.useDefend();
            };
        }

        skillBtns.forEach(btn => {
            btn.onclick = () => {
                if (!this.isPlayerTurn) return;
                const skillId = btn.dataset.id;
                const skill = this.getSkillById(skillId);
                
                if (!skill) return;

                if (this.playerMp < skill.cost) {
                    this.logSystem("MP insuficiente!");
                    return;
                }

                if (this.skillCooldowns[skillId] > 0) {
                    this.logSystem("Habilidade em recarga!");
                    return;
                }

                this.useSkill(skill);
            };
        });
    }

    async useSkill(skill) {
        this.isPlayerTurn = false;
        this.updateButtonStates();

        this.logCombat('player', `${this.character.name} usa <strong>${skill.name}</strong>!`);

        if (skill.cost) {
            this.playerMp -= skill.cost;
            this.skillCooldowns[skill.id] = 2; // Exemplo de CD de 2 turnos
        }

        // --- REGENERAÇÃO DE MANA (+4 POR ATAQUE) ---
        const oldMp = this.playerMp;
        this.playerMp = Math.min(this.character.stats.mp, this.playerMp + 4);
        if (this.playerMp > oldMp) {
            this.logSystem(`Regeneração: +4 MP recuperados.`);
            this.showFloatingText('player-avatar', '+4 MP', 'mana');
            this.updateUI();
        }

        // --- SISTEMA D&D (ROLAGEM DE DADOS) ---
        // 1. Rolagem de ACERTO (d20)
        const hitRoll = await this.showDiceModal('Ataque (d20)', 20);
        const attackMod = Math.floor(this.character.stats.attack / 5);
        const totalHit = hitRoll + attackMod;
        const enemyDefense = this.enemy.isBoss ? Math.floor(this.character.stats.defense * 0.8) : 12; // Exemplo de CA do inimigo

        this.logSystem(`Rolagem: ${hitRoll} + ${attackMod} = ${totalHit} (vs Defesa: ${enemyDefense})`);

        if (totalHit >= enemyDefense) {
            // ACERTOU!
            this.showFloatingText('enemy-avatar', 'ACERTOU!', 'crit');
            // 2. Rolagem de DANO (d10)
            const damageRoll = await this.showDiceModal('Dano (d10)', 10);
            const totalDmg = damageRoll + (skill.damage || 0) + attackMod;

            if (skill.damage > 0) {
                this.enemy.hp = Math.max(0, this.enemy.hp - totalDmg);
                this.animateHit('enemy-sprite', skill.effect || 'hit');
                this.logCombat('player-atk', `ACERTO CRÍTICO! Causa <strong>${totalDmg}</strong> de dano.`);
                this.showFloatingText('enemy-avatar', `-${totalDmg}`, 'dmg');
            } else if (skill.damage < 0) {
                // ROLAGEM DE CURA (Dado Verde)
                const healRoll = await this.showDiceModal('Cura (d10)', 10, 'heal');
                const heal = Math.abs(skill.damage) + healRoll;
                
                this.playerHp = Math.min(this.character.stats.hp, this.playerHp + heal);
                this.animateHit('player-sprite', 'heal');
                this.logCombat('system', `Cura sagrada! Recupera <strong>${heal}</strong> de vida.`);
                this.showFloatingText('player-avatar', `+${heal}`, 'heal');
            }
        } else {
            // ERROU!
            this.logCombat('system', `O ataque de ${this.character.name} <strong>ERROU</strong>!`);
            this.showFloatingText('enemy-avatar', 'ERROU!', 'miss');
            this.animateHit('enemy-sprite', 'miss');
        }

        this.updateUI();
        await new Promise(r => setTimeout(r, 1200));

        if (this.enemy.hp <= 0) {
            this.handleWin();
        } else {
            this.executeEnemyTurn();
        }
    }

    showFloatingText(targetId, text, type) {
        const target = this.container.querySelector(`#${targetId}`);
        if (!target) return;

        const rect = target.getBoundingClientRect();
        const floating = document.createElement('div');
        floating.className = `floating-text floating-${type}`;
        floating.textContent = text;
        
        // Posiciona no centro do target
        floating.style.left = `${rect.left + rect.width / 2}px`;
        floating.style.top = `${rect.top + rect.height / 2}px`;
        
        document.body.appendChild(floating);
        setTimeout(() => floating.remove(), 1200);
    }

    async showDiceModal(title, sides, type = 'attack') {
        return new Promise(resolve => {
            const modal = document.createElement('div');
            modal.className = 'dice-modal-overlay';
            modal.style.zIndex = '20000';
            
            const diceClass = type === 'heal' ? 'heal-dice' : '';

            modal.innerHTML = `
                <div class="dice-modal-content animate-fade-in">
                    <h3 class="dice-title" style="${type === 'heal' ? 'color: #4caf50' : ''}">${title}</h3>
                    <div class="dice-container">
                        <div class="dice d${sides} ${diceClass}" id="dice-visual">?</div>
                    </div>
                    <p class="dice-instruction">Toque para girar o dado</p>
                </div>
            `;
            document.body.appendChild(modal);

            const dice = modal.querySelector('#dice-visual');
            let rolling = false;

            dice.onclick = () => {
                if (rolling) return;
                rolling = true;
                dice.classList.add('rolling');
                
                let counter = 0;
                const interval = setInterval(() => {
                    dice.textContent = Math.floor(Math.random() * sides) + 1;
                    counter++;
                    if (counter > 15) {
                        clearInterval(interval);
                        const result = Math.floor(Math.random() * sides) + 1;
                        dice.textContent = result;
                        dice.classList.remove('rolling');
                        dice.classList.add('result');
                        
                        setTimeout(() => {
                            modal.remove();
                            resolve(result);
                        }, 1200);
                    }
                }, 80);
            };
        });
    }

    async useDefend() {
        this.isPlayerTurn = false;
        this.isDefending = true;
        this.updateButtonStates();
        
        this.logCombat('player', `${this.character.name} entra em <strong>Postura Defensiva</strong>!`);
        this.animateHit('player-sprite', 'defend');
        
        await new Promise(r => setTimeout(r, 1000));
        this.executeEnemyTurn();
    }

    async executeEnemyTurn() {
        if (!this.enemy || this.enemy.hp <= 0) return;

        this.logCombat('enemy', `${this.enemy.name} prepara um ataque...`);
        await new Promise(r => setTimeout(r, 800));

        // 1. Rolagem de ACERTO do Inimigo (d20)
        const hitRoll = Math.floor(Math.random() * 20) + 1;
        const enemyAtkMod = Math.floor(this.enemy.attack / 5);
        const totalHit = hitRoll + enemyAtkMod;
        const playerDefense = 10 + Math.floor(this.character.stats.defense / 4);

        this.logSystem(`${this.enemy.name} rolou: ${hitRoll} + ${enemyAtkMod} = ${totalHit} (vs sua Defesa: ${playerDefense})`);

        if (totalHit >= playerDefense) {
            // ACERTOU!
            let dmg = this.enemy.attack + Math.floor(Math.random() * 10);
            if (this.isDefending) {
                dmg = Math.floor(dmg / 2);
                this.isDefending = false;
                this.logCombat('system', `Sua defesa reduziu o dano!`);
                this.showFloatingText('player-avatar', 'DEFESA!', 'miss');
            }

            this.playerHp = Math.max(0, this.playerHp - dmg);
            this.animateHit('player-sprite');
            this.logCombat('enemy-atk', `${this.enemy.name} ACERTOU! Causa <strong>${dmg}</strong> de dano.`);
            this.showFloatingText('player-avatar', `-${dmg}`, 'dmg');
        } else {
            // ERROU!
            this.logCombat('system', `${this.enemy.name} <strong>ERROU</strong> o ataque!`);
            this.showFloatingText('player-avatar', 'ERROU!', 'miss');
            this.animateHit('player-sprite', 'miss');
            this.isDefending = false; // Consome a defesa mesmo se errar
        }
        
        this.updateUI();
        await new Promise(r => setTimeout(r, 1000));

        if (this.playerHp <= 0) {
            this.handleLoss();
        } else {
            this.startNextRound();
        }
    }

    startNextRound() {
        this.isPlayerTurn = true;
        // Diminuir cooldowns
        for (let id in this.skillCooldowns) {
            if (this.skillCooldowns[id] > 0) this.skillCooldowns[id]--;
        }
        this.updateButtonStates();
        this.logSystem("Sua vez!");
    }

    updateUI() {
        if (!this.enemy) return;
        const e_hp_p = (this.enemy.hp / this.enemy.maxHp) * 100;
        const p_hp_p = (this.playerHp / this.character.stats.hp) * 100;
        const p_mp_p = (this.playerMp / this.character.stats.mp) * 100;

        const e_bar = this.container.querySelector('#enemy-health-bar');
        const e_text = this.container.querySelector('#enemy-health-text');
        const p_bar = this.container.querySelector('#player-health-bar');
        const p_text = this.container.querySelector('#player-health-text');
        const p_mp_bar = this.container.querySelector('#player-mp-bar');
        const p_mp_text = this.container.querySelector('#player-mp-text');

        if (e_bar) e_bar.style.width = `${e_hp_p}%`;
        if (e_text) e_text.textContent = `${this.enemy.hp} / ${this.enemy.maxHp}`;
        
        if (p_bar) p_bar.style.width = `${p_hp_p}%`;
        if (p_text) p_text.textContent = `${this.playerHp} / ${this.character.stats.hp}`;
        
        if (p_mp_bar) p_mp_bar.style.width = `${p_mp_p}%`;
        if (p_mp_text) p_mp_text.textContent = `MP: ${this.playerMp} / ${this.character.stats.mp}`;

        // Atualiza VS Badge (Igual a torre)
        const vsBadge = this.container.querySelector('#vs-badge');
        if (vsBadge) {
            vsBadge.classList.remove('turn-player', 'turn-enemy');
            vsBadge.classList.add(this.isPlayerTurn ? 'turn-player' : 'turn-enemy');
        }
    }

    updateButtonStates() {
        const btns = this.container.querySelectorAll('.skill-card-btn');
        btns.forEach(btn => {
            btn.disabled = !this.isPlayerTurn;
            btn.style.opacity = this.isPlayerTurn ? '1' : '0.5';
            
            if (btn.classList.contains('skill-special-btn')) {
                const skillId = btn.dataset.id;
                const skill = this.getSkillById(skillId);
                const cd = this.skillCooldowns[skillId] || 0;
                const overlay = btn.querySelector('.skill-cd-overlay');
                
                // Reset title/tooltip
                btn.title = "";

                if (skill) {
                    if (this.playerMp < skill.cost) {
                        btn.disabled = true;
                        btn.style.opacity = '0.5';
                        btn.title = "MP Insuficiente";
                    } else if (cd > 0) {
                        btn.disabled = true;
                        btn.style.opacity = '0.8';
                        btn.title = `Aguarde ${cd} turnos`;
                    }
                }
                
                if (overlay) {
                    overlay.style.height = cd > 0 ? '100%' : '0%';
                    overlay.textContent = cd > 0 ? cd : '';
                }
            }
        });
    }

    logCombat(type, msg) {
        if (!this.combatLogEl) return;
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.innerHTML = msg;
        this.combatLogEl.appendChild(entry);
        this.combatLogEl.scrollTop = this.combatLogEl.scrollHeight;
    }

    logSystem(msg) { this.logCombat('system', msg); }

    animateHit(id, effect) {
        // Adaptado para os IDs do novo layout
        const targetId = id === 'enemy-sprite' ? 'enemy-avatar' : 'player-avatar';
        const el = this.container.querySelector(`#${targetId}`);
        if (!el) return;
        
        // Efeito de tremer no card inteiro para maior impacto
        const card = el.closest('.combatant-card');
        if (card) {
            card.classList.remove('hit-anim');
            void card.offsetWidth;
            card.classList.add('hit-anim');
        }

        el.classList.remove('sprite-hit');
        void el.offsetWidth;
        el.classList.add('sprite-hit');
    }

    handleWin() {
        this.logSystem(`Vitória! ${this.enemy.name} foi derrotado.`);
        setTimeout(() => {
            this.container.style.display = 'none';
            if (this.onWin) this.onWin();
        }, 1500);
    }

    handleLoss() {
        this.logSystem(`Você foi derrotado...`);
        setTimeout(() => {
            if (this.storyEngine) {
                this.container.style.display = 'none';
                this.storyEngine.showEndModal(false);
            } else {
                location.reload();
            }
        }, 1500);
    }
}
