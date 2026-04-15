import { auth, db, doc, getDoc, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp, waitForAuth } from './firebase.js';
import { addXP } from './gamification.js';
import { defaultEnemies } from './enemies.js';

// Elements
const selectionScreen = document.getElementById('selection-screen');
const skillSelectionScreen = document.getElementById('skill-selection-screen');
const upgradeScreen = document.getElementById('upgrade-screen');
const battleArena = document.getElementById('battle-arena');
const characterListEl = document.getElementById('character-list');
const skillsGrid = document.getElementById('skills-grid');
const upgradeGrid = document.getElementById('upgrade-grid');
const skillButtonsEl = document.getElementById('skill-buttons');
const confirmSkillsBtn = document.getElementById('confirm-skills-btn');
const startTowerBtn = document.getElementById('start-tower-btn');
const resetTowerBtn = document.getElementById('reset-tower-btn');
const floorNumberEl = document.getElementById('floor-number');
const roundNumberEl = document.getElementById('round-number');
const playerNameEl = document.getElementById('player-name');
const playerAvatarEl = document.getElementById('player-avatar');
const playerHealthBarEl = document.getElementById('player-health-bar');
const playerHealthTextEl = document.getElementById('player-health-text');
const enemyNameEl = document.getElementById('enemy-name');
const enemyAvatarEl = document.getElementById('enemy-avatar');
const enemyHealthBarEl = document.getElementById('enemy-health-bar');
const enemyHealthTextEl = document.getElementById('enemy-health-text');
const enemyStarsEl = document.getElementById('enemy-stars');
const enemyStatusEl = document.getElementById('enemy-status');
const combatLogEl = document.getElementById('combat-log');
const nextFloorBtn = document.getElementById('next-floor-btn');
const saveExitBtn = document.getElementById('save-exit-btn');
const exitTowerBtn = document.getElementById('exit-tower-btn');
const clashOverlay = document.getElementById('clash-overlay');

// Skill Definitions
const ALL_SKILLS = [
    { id: 'raio', name: 'Raio', damage: 5, cooldown: 2, type: 'attack', desc: 'Atinge o inimigo com um relâmpago.' },
    { id: 'bola_fogo', name: 'Bola de Fogo', damage: 7, cooldown: 3, type: 'attack', desc: 'Uma grande explosão de chamas.' },
    { id: 'cura', name: 'Cura', heal: 3, cooldown: 5, type: 'heal', desc: 'Recupera vida e fortalece o próximo ataque (+2 dano).' },
    { id: 'esquiva', name: 'Esquiva', cooldown: 0, uses: 1, type: 'buff', desc: 'Desvia do próximo ataque inimigo.' },
    { id: 'machado', name: 'Machado', damage: 4, cooldown: 2, type: 'attack', desc: 'Um golpe pesado de machado.' },
    { id: 'machado_duplo', name: 'Machado Duplo', damage: 6, cooldown: 7, type: 'attack', desc: 'Dois golpes rápidos e mortais.' },
    { id: 'vampirismo', name: 'Vampirismo', damage: 2, heal: 4, cooldown: 3, type: 'hybrid', desc: 'Rouba a essência vital do inimigo.' },
    { id: 'gelo', name: 'Gelo', damage: 4, cooldown: 6, type: 'debuff', desc: 'Congela o inimigo, diminuindo seu ataque.' },
    { id: 'veneno', name: 'Poça Venenosa', damage: 2, duration: 3, cooldown: 4, type: 'dot', desc: 'Cria uma poça que causa dano contínuo.' },
    
    // 12 Novas Habilidades
    { id: 'duas_adagas', name: 'Duas Adagas', damage: 4, cooldown: 2, type: 'attack', desc: 'Dois cortes rápidos que podem causar sangramento.' },
    { id: 'katana_slash', name: 'Corte de Katana', damage: 6, cooldown: 3, type: 'attack', desc: 'Um golpe preciso e letal com uma lâmina afiada.' },
    { id: 'flecha_venenosa', name: 'Flecha Venenosa', damage: 3, duration: 2, cooldown: 4, type: 'dot', desc: 'Dispara uma flecha embebida em toxinas.' },
    { id: 'escudo_espinhos', name: 'Escudo de Espinhos', damage: 2, cooldown: 5, type: 'buff', desc: 'Reflete parte do dano recebido no próximo turno.' },
    { id: 'tempestade_areia', name: 'Tempestade de Areia', damage: 3, cooldown: 6, type: 'debuff', desc: 'Cega o inimigo, aumentando sua chance de errar.' },
    { id: 'sopro_dragao', name: 'Sopro de Dragão', damage: 9, cooldown: 5, type: 'attack', desc: 'Uma rajada de fogo devastadora em linha reta.' },
    { id: 'meditacao_zen', name: 'Meditação Zen', heal: 6, cooldown: 8, type: 'heal', desc: 'Uma cura profunda que exige concentração.' },
    { id: 'golpe_atordoante', name: 'Golpe Atordoante', damage: 3, cooldown: 5, type: 'debuff', desc: 'Tenta atordoar o inimigo por um turno.' },
    { id: 'lanca_gelo', name: 'Lança de Gelo', damage: 5, cooldown: 4, type: 'attack', desc: 'Dispara um projétil de gelo perfurante.' },
    { id: 'furacao_laminas', name: 'Furacão de Lâminas', damage: 8, cooldown: 6, type: 'attack', desc: 'Gira com suas armas atingindo tudo ao redor.' },
    { id: 'bencao_solar', name: 'Bênção Solar', heal: 2, damage: 2, cooldown: 4, type: 'hybrid', desc: 'Cura leve e aumenta o dano do próximo golpe.' },
    { id: 'corte_dimensional', name: 'Corte Dimensional', damage: 12, cooldown: 10, type: 'attack', desc: 'Um golpe que rasga o próprio espaço-tempo.' }
];

// Game State
let user = null;
let selectedSheet = null;
let towerData = null; // Persisted tower sheet
let player = {};
let enemy = {};
let currentFloor = 1;
let currentRound = 1;
let isPlayerTurn = true;
let combatHistory = [];
let selectedSkills = [];
let skillCooldowns = {};
let poisonTicks = 0;
let isDodging = false;
let enemyAttackDebuff = 0;
let healBuffActive = false; // Indica se o próximo ataque terá +2 de dano
let unlockedSkillsGlobal = []; // Habilidades desbloqueadas no Modo História (UID)

async function initTower() {
    user = await waitForAuth();
    if (!user) {
        window.location.replace('login.html');
        return;
    }

    // Carrega habilidades desbloqueadas do perfil global
    try {
        const profileDoc = await getDoc(doc(db, 'profiles', user.uid));
        if (profileDoc.exists()) {
            unlockedSkillsGlobal = profileDoc.data().unlocked_skills || [];
        }
    } catch (e) {
        console.error("Erro ao carregar habilidades globais:", e);
    }

    await loadUserSheets();
    
    // Configuração da criação de ficha básica
    setupBasicCreation();
    
    startTowerBtn.addEventListener('click', () => {
        startTowerFlow();
    });
    confirmSkillsBtn.addEventListener('click', confirmSkillSelection);
    resetTowerBtn.addEventListener('click', resetTowerProgress);
    nextFloorBtn.addEventListener('click', goToNextFloor);
    saveExitBtn.addEventListener('click', saveAndExitTower);
    
    // Edit Character Listeners
    const editBtn = document.getElementById('edit-tower-char-btn');
    const closeEditBtn = document.getElementById('close-tower-edit');
    const saveEditBtn = document.getElementById('save-tower-edit');
    
    if (editBtn) editBtn.addEventListener('click', openEditModal);
    if (closeEditBtn) closeEditBtn.addEventListener('click', () => document.getElementById('edit-tower-modal').style.display = 'none');
    if (saveEditBtn) saveEditBtn.addEventListener('click', saveCharacterEdit);

    exitTowerBtn.addEventListener('click', () => {
        if (confirm("Se sair sem salvar, seu progresso será perdido. Deseja sair?")) {
            window.location.replace('play.html');
        }
    });

    // Configura o Log de Batalha Colapsável
    setupCollapsibleLog();
}

function setupCollapsibleLog() {
    const logContainer = document.querySelector('.combat-log-container');
    if (!logContainer) return;

    // Adiciona o cabeçalho se não existir
    if (!logContainer.querySelector('.combat-log-header')) {
        const header = document.createElement('div');
        header.className = 'combat-log-header';
        header.innerHTML = `
            <h3>Log de Batalha</h3>
            <i class="fas fa-chevron-left"></i>
        `;
        logContainer.prepend(header);

        header.onclick = () => {
            logContainer.classList.toggle('collapsed');
            const icon = header.querySelector('i');
            icon.className = logContainer.classList.contains('collapsed') ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
        };
    }
}

function showFloatingText(targetId, text, type) {
    const target = document.getElementById(targetId);
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

function setupBasicCreation() {
    const showBtn = document.getElementById('show-create-basic-btn');
    const form = document.getElementById('basic-create-form');
    const confirmBtn = document.getElementById('confirm-basic-create');
    const cancelBtn = document.getElementById('cancel-basic-create');
    const nameInput = document.getElementById('basic-char-name');
    const avatarInput = document.getElementById('basic-char-avatar');

    if (showBtn) {
        showBtn.onclick = () => {
            form.style.display = 'block';
            showBtn.style.display = 'none';
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = () => {
            form.style.display = 'none';
            showBtn.style.display = 'block';
            nameInput.value = '';
            avatarInput.value = '';
        };
    }

    if (confirmBtn) {
        confirmBtn.onclick = async () => {
            const name = nameInput.value.trim();
            const avatar = avatarInput.value.trim();

            if (!name) {
                alert("Por favor, insira o nome do personagem.");
                return;
            }

            confirmBtn.disabled = true;
            confirmBtn.textContent = "Criando...";

            try {
                const newSheet = {
                    user_id: user.uid,
                    author_nickname: user.displayName || 'Aventureiro',
                    name: name,
                    image_url: avatar || 'assets/default-avatar.png',
                    template: 'dnd', // Define como ficha D&D para abrir no editor correto
                    system: 'D&D 5e',
                    created_at: serverTimestamp(),
                    updated_at: serverTimestamp(),
                    data: {
                        image: avatar || 'assets/default-avatar.png',
                        dnd_character_name: name,
                        dnd_character_name_2: name,
                        dnd_class_level: '',
                        dnd_background: '',
                        dnd_player_name: '',
                        dnd_race: '',
                        dnd_alignment: '',
                        dnd_xp: '',
                        dnd_inspiration: 0,
                        dnd_proficiency_bonus: 0,
                        dnd_ac: 0,
                        dnd_initiative: 0,
                        dnd_speed: '',
                        dnd_hp_max: 0,
                        dnd_hp_current: 0,
                        dnd_hp_temp: 0,
                        dnd_hd_total: '',
                        dnd_hd_used: '',
                        dnd_death_success: '',
                        dnd_death_fail: '',
                        dnd_str: 0,
                        dnd_dex: 0,
                        dnd_con: 0,
                        dnd_int: 0,
                        dnd_wis: 0,
                        dnd_cha: 0,
                        dnd_saves_skills: '',
                        dnd_passive_perception: 0,
                        dnd_attacks_spellcasting: '',
                        dnd_personality_traits: '',
                        dnd_ideals: '',
                        dnd_bonds: '',
                        dnd_flaws: '',
                        dnd_features_traits: '',
                        dnd_other_proficiencies: '',
                        dnd_equipment: '',
                        dnd_age: '',
                        dnd_height: '',
                        dnd_weight: '',
                        dnd_eyes: '',
                        dnd_skin: '',
                        dnd_hair: '',
                        dnd_appearance: '',
                        dnd_allies: '',
                        dnd_history: '',
                        dnd_features_additional: '',
                        dnd_treasures: '',
                        dnd_spellcasting_class: '',
                        dnd_spellcasting_ability: '',
                        dnd_spell_save_dc: '',
                        dnd_spell_attack_bonus: '',
                        dnd_spells_0: '',
                        dnd_spells_1: '',
                        dnd_spells_2: '',
                        dnd_spells_3: '',
                        dnd_spells_4: '',
                        dnd_spells_5: '',
                        dnd_spells_6: '',
                        dnd_spells_7: '',
                        dnd_spells_8: '',
                        dnd_spells_9: ''
                    }
                };

                const docRef = await addDoc(collection(db, 'sheets'), newSheet);
                alert("Ficha criada com sucesso!");
                
                // Recarrega as fichas e fecha o formulário
                await loadUserSheets();
                form.style.display = 'none';
                showBtn.style.display = 'block';
                nameInput.value = '';
                avatarInput.value = '';

                // Seleciona automaticamente a nova ficha (procurando pelo ID recém-criado)
                // O loadUserSheets já foi chamado, então o elemento já existe no DOM
                setTimeout(() => {
                    const cards = document.querySelectorAll('.char-card');
                    cards.forEach(card => {
                        // O onclick do card no tower.js não guarda o id no elemento, 
                        // mas podemos forçar o clique se soubermos qual é.
                        // Para simplificar, o usuário clica na ficha nova que apareceu.
                    });
                }, 500);

            } catch (err) {
                console.error("Erro ao criar ficha básica:", err);
                alert("Erro ao criar ficha básica.");
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.textContent = "Criar e Selecionar";
            }
        };
    }
}

function openEditModal() {
    if (!player) return;
    const modal = document.getElementById('edit-tower-modal');
    const nameInput = document.getElementById('edit-tower-name');
    const avatarInput = document.getElementById('edit-tower-avatar');
    
    nameInput.value = player.name;
    avatarInput.value = player.avatar;
    modal.style.display = 'flex';
}

// Global function for editing from a card
window.openEditFromCard = (id, name, avatar) => {
    const modal = document.getElementById('edit-tower-modal');
    const nameInput = document.getElementById('edit-tower-name');
    const avatarInput = document.getElementById('edit-tower-avatar');
    
    if (modal && nameInput && avatarInput) {
        nameInput.value = name;
        avatarInput.value = avatar;
        window.editingSheetId = id;
        modal.style.display = 'flex';
    } else {
        console.error("Elementos do modal de edição não encontrados!");
    }
};

async function saveCharacterEdit() {
    const newName = document.getElementById('edit-tower-name').value.trim();
    const newAvatar = document.getElementById('edit-tower-avatar').value.trim();
    const saveBtn = document.getElementById('save-tower-edit');
    const sheetId = window.editingSheetId;

    if (!sheetId) {
        alert("ID da ficha não encontrado. Não foi possível salvar.");
        return;
    }
    if (!newName) {
        alert("O nome não pode ser vazio.");
        return;
    }

    try {
        saveBtn.disabled = true;
        saveBtn.textContent = "Salvando...";

        const finalAvatar = newAvatar || 'assets/default-avatar.png';

        // 1. Atualiza a ficha ORIGINAL na coleção 'sheets'
        // Atualizamos tanto o topo quanto dentro do objeto 'data' para compatibilidade total
        await updateDoc(doc(db, 'sheets', sheetId), {
            name: newName,
            image_url: finalAvatar,
            template: 'dnd', // Garante que a ficha se torne compatível com o novo editor
            system: 'D&D 5e',
            'data.nomePersonagem': newName,
            'data.image': finalAvatar,
            'data.background_url': finalAvatar, // Algumas fichas usam esse campo
            updated_at: serverTimestamp()
        });

        // 2. Se houver progresso na torre (tower_sheets), atualiza o nickname lá também
        const towerQuery = query(collection(db, 'tower_sheets'), where('sheet_id', '==', sheetId));
        const towerSnapshot = await getDocs(towerQuery);
        if (!towerSnapshot.empty) {
            await updateDoc(doc(db, 'tower_sheets', towerSnapshot.docs[0].id), {
                nickname: newName
            });
            // Se for a ficha carregada no estado atual, atualiza o objeto towerData
            if (towerData && towerData.sheet_id === sheetId) {
                towerData.nickname = newName;
            }
        }

        // 3. Se o jogador estiver ativo na arena e for a mesma ficha, atualiza o estado local e a UI
        if (selectedSheet && selectedSheet.id === sheetId) {
            selectedSheet.name = newName;
            selectedSheet.image_url = finalAvatar;
            if (selectedSheet.data) {
                selectedSheet.data.nomePersonagem = newName;
                selectedSheet.data.image = finalAvatar;
            }

            // Se estiver em batalha
            if (player && player.name !== undefined) {
                player.name = newName;
                player.avatar = finalAvatar;
                updateUI();
            }
        }
        
        // Recarrega a lista de fichas para refletir no HTML de seleção
        await loadUserSheets();
        
        document.getElementById('edit-tower-modal').style.display = 'none';
        alert(`Personagem "${newName}" atualizado com sucesso!`);
        
    } catch (err) {
        console.error("Erro ao salvar alterações do campeão:", err);
        alert("Erro ao salvar alterações.");
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Salvar";
        delete window.editingSheetId;
    }
}

// Global function for editing a sheet from its card
window.openEditFromCard = (id, name, avatar) => {
    const modal = document.getElementById('edit-tower-modal');
    const nameInput = document.getElementById('edit-tower-name');
    const avatarInput = document.getElementById('edit-tower-avatar');
    
    if (modal && nameInput && avatarInput) {
        nameInput.value = name;
        avatarInput.value = avatar;
        window.editingSheetId = id;
        modal.style.display = 'flex';
    } else {
        console.error("Elementos do modal de edição não encontrados!");
    }
};

// Global function for deleting from a card
window.deleteSheetFromCard = async (sheetId, sheetName) => {
    if (confirm(`Tem certeza que deseja apagar a ficha "${sheetName}"? Esta ação não pode ser desfeita.`)) {
        try {
            // 1. Encontra e apaga o progresso da torre associado, se existir, garantindo que pertence ao usuário.
            const towerSheetQuery = query(
                collection(db, 'tower_sheets'), 
                where('sheet_id', '==', sheetId), 
                where('user_id', '==', user.uid)
            );
            const towerSheetSnapshot = await getDocs(towerSheetQuery);
            
            if (!towerSheetSnapshot.empty) {
                const towerDoc = towerSheetSnapshot.docs[0];
                await deleteDoc(doc(db, 'tower_sheets', towerDoc.id));
            }

            // 2. Apaga a ficha principal da coleção 'sheets'
            await deleteDoc(doc(db, 'sheets', sheetId));

            // 3. Reseta seleção se a ficha apagada era a selecionada
            if (selectedSheet && selectedSheet.id === sheetId) {
                selectedSheet = null;
                startTowerBtn.disabled = true;
                startTowerBtn.classList.remove('ready');
                startTowerBtn.textContent = "Começar Desafio";
                resetTowerBtn.style.display = 'none';
            }

            alert(`Ficha "${sheetName}" apagada com sucesso.`);
            loadUserSheets(); // Recarrega a lista

        } catch (err) {
            console.error("Erro ao apagar a ficha:", err);
            alert("Ocorreu um erro ao apagar a ficha.");
        }
    }
};

async function loadUserSheets() {
    if (!user) return;
    try {
        const q = query(collection(db, 'sheets'), where('user_id', '==', user.uid));
        const snapshot = await getDocs(q);
        characterListEl.innerHTML = '';
        
        snapshot.forEach(doc => {
            const sheetId = doc.id;
            const sheet = doc.data();
            const d = sheet.data || {};
            const charName = sheet.name || d.nomePersonagem || 'Aventureiro';
            const charImg = sheet.image_url || d.image || d.background_url || 'assets/default-avatar.png';

            const card = document.createElement('div');
            card.className = 'char-card';
            card.innerHTML = `
                <div class="char-card-actions">
                    <button class="char-action-btn edit" title="Editar Ficha" onclick="event.preventDefault(); event.stopPropagation(); window.openEditFromCard('${sheetId}', '${charName}', '${charImg}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="char-action-btn delete" title="Apagar Ficha" onclick="event.preventDefault(); event.stopPropagation(); window.deleteSheetFromCard('${sheetId}', '${charName}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="char-card-avatar" style="background-image: url('${charImg}')"></div>
                <strong>${charName}</strong>
            `;
            
            card.onclick = async (e) => {
                // Evita seleção se o clique foi em um botão de ação
                if (e.target.closest('.char-action-btn')) return;

                document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedSheet = { id: sheetId, ...sheet };
                
                // Verifica se já existe uma tower_sheet para habilitar o botão de reset
                const tq = query(collection(db, 'tower_sheets'), where('user_id', '==', user.uid), where('sheet_id', '==', sheetId));
                const tSnapshot = await getDocs(tq);
                
                if (!tSnapshot.empty) {
                    towerData = { id: tSnapshot.docs[0].id, ...tSnapshot.docs[0].data() };
                    resetTowerBtn.style.display = 'block';
                    startTowerBtn.textContent = `Continuar (Andar ${towerData.floor || 1})`;
                } else {
                    towerData = null;
                    resetTowerBtn.style.display = 'none';
                    startTowerBtn.textContent = "Começar Desafio";
                }
                
                startTowerBtn.disabled = false;
                startTowerBtn.classList.add('ready');
            };
            characterListEl.appendChild(card);
        });
    } catch (err) { console.error(err); }
}

async function resetTowerProgress() {
    if (!selectedSheet || !towerData) return;
    
    const confirmReset = confirm(`Tem certeza que deseja ZERAR o progresso de "${selectedSheet.name || 'este personagem'}"? Todos os upgrades, habilidades e andares serão perdidos.`);
    
    if (confirmReset) {
        try {
            await deleteDoc(doc(db, 'tower_sheets', towerData.id));
            
            // Também limpa o checkpoint antigo se houver
            const cpQuery = query(collection(db, 'tower_checkpoints'), 
                where('user_id', '==', user.uid), 
                where('sheet_id', '==', selectedSheet.id));
            const cpSnapshot = await getDocs(cpQuery);
            if (!cpSnapshot.empty) {
                await deleteDoc(doc(db, 'tower_checkpoints', cpSnapshot.docs[0].id));
            }

            alert("Progresso zerado com sucesso!");
            window.location.reload();
        } catch (e) {
            console.error("Erro ao zerar progresso:", e);
            alert("Erro ao zerar progresso.");
        }
    }
}

async function startTowerFlow() {
    // Check if user has a tower sheet for this character
    const q = query(collection(db, 'tower_sheets'), where('user_id', '==', user.uid), where('sheet_id', '==', selectedSheet.id));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        // Create new tower sheet
        showSkillSelection();
    } else {
        towerData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        currentFloor = towerData.floor || 1;
        
        // Every 10 floors, can change skills
        if (currentFloor > 1 && (currentFloor - 1) % 10 === 0) {
            showSkillSelection(true);
        } else {
            startDesafio();
        }
    }
}

function showSkillSelection(isChange = false) {
    selectionScreen.style.display = 'none';
    skillSelectionScreen.style.display = 'block';
    skillsGrid.innerHTML = '';
    selectedSkills = isChange ? towerData.skills.map(s => s.id) : [];
    
    if (isChange) {
        document.getElementById('skill-selection-msg').textContent = "Você atingiu um marco! Pode mudar suas habilidades.";
    }

    ALL_SKILLS.forEach(skill => {
        const isLocked = !unlockedSkillsGlobal.includes(skill.id) && 
                         !['raio', 'bola_fogo', 'cura', 'esquiva', 'machado', 'machado_duplo', 'vampirismo', 'gelo', 'veneno'].includes(skill.id);
        
        const card = document.createElement('div');
        card.className = `skill-card ${selectedSkills.includes(skill.id) ? 'selected' : ''} ${isLocked ? 'locked' : ''}`;
        
        // Get current damage (if already has towerData)
        let currentDamage = skill.damage;
        if (towerData && towerData.skills) {
            const savedSkill = towerData.skills.find(s => s.id === skill.id);
            if (savedSkill) currentDamage = savedSkill.damage;
        }

        card.innerHTML = `
            <h4>${skill.name} <span>${skill.damage ? `💥${currentDamage}` : ''}</span></h4>
            <p>${isLocked ? '🔒 Bloqueada (Desbloqueie no Modo História)' : skill.desc}</p>
            <div class="skill-info">
                ${skill.cooldown ? `⏱️ Recarga: ${skill.cooldown} rounds` : ''}
                ${skill.uses ? `🔋 Usos: ${skill.uses} por luta` : ''}
                ${skill.heal ? `💚 Cura: ${skill.heal}` : ''}
            </div>
        `;

        if (!isLocked) {
            card.onclick = () => {
                console.log("Skill clicada:", skill.id);
                if (selectedSkills.includes(skill.id)) {
                    selectedSkills = selectedSkills.filter(id => id !== skill.id);
                    card.classList.remove('selected');
                } else if (selectedSkills.length < 4) {
                    // Regra: Não pode ter Vampirismo e Cura juntos
                    if (skill.id === 'vampirismo' && selectedSkills.includes('cura')) {
                        alert("Você não pode equipar Vampirismo e Cura ao mesmo tempo!");
                        return;
                    }
                    if (skill.id === 'cura' && selectedSkills.includes('vampirismo')) {
                        alert("Você não pode equipar Cura e Vampirismo ao mesmo tempo!");
                        return;
                    }

                    selectedSkills.push(skill.id);
                    card.classList.add('selected');
                }
                
                // Atualiza o Kit de Habilidades Visual
                updateSkillKitUI();
                
                console.log("Habilidades selecionadas:", selectedSkills);
                const isReady = selectedSkills.length === 4;
                confirmSkillsBtn.disabled = !isReady;
                
                // Forçar atualização visual agressiva
                if (!isReady) {
                    confirmSkillsBtn.style.setProperty('opacity', '0.5', 'important');
                    confirmSkillsBtn.style.setProperty('cursor', 'not-allowed', 'important');
                    confirmSkillsBtn.style.setProperty('pointer-events', 'none', 'important');
                } else {
                    confirmSkillsBtn.style.setProperty('opacity', '1', 'important');
                    confirmSkillsBtn.style.setProperty('cursor', 'pointer', 'important');
                    confirmSkillsBtn.style.setProperty('pointer-events', 'auto', 'important');
                }
            };
        }
        skillsGrid.appendChild(card);
    });
    
    // Inicializa o kit visual (vazio ou com as habilidades atuais)
    updateSkillKitUI();
    
    confirmSkillsBtn.disabled = selectedSkills.length !== 4;
}

function updateSkillKitUI() {
    const slots = document.querySelectorAll('.kit-slot');
    
    slots.forEach((slot, index) => {
        const skillId = selectedSkills[index];
        if (skillId) {
            const skill = ALL_SKILLS.find(s => s.id === skillId);
            let icon = '⚔️';
            if (skillId === 'bola_fogo') icon = '🔥';
            else if (skillId === 'raio') icon = '⚡'; 
            else if (skillId === 'cura') icon = '💚';
            else if (skillId === 'esquiva') icon = '🛡️';
            else if (skillId === 'gelo') icon = '❄️';
            else if (skillId === 'veneno') icon = '🧪';
            else if (skillId === 'vampirismo') icon = '🧛';
            else if (skillId.includes('machado')) icon = '🪓';

            slot.classList.add('filled');
            slot.innerHTML = `<span>${icon}</span>`;
            slot.setAttribute('data-name', skill.name);
        } else {
            slot.classList.remove('filled');
            slot.innerHTML = `<span>+</span>`;
            slot.removeAttribute('data-name');
        }
    });
}

async function confirmSkillSelection() {
    console.log("Tentando confirmar habilidades...");
    if (selectedSkills.length !== 4) {
        alert("Você precisa escolher exatamente 4 habilidades!");
        return;
    }

    try {
        confirmSkillsBtn.disabled = true;
        confirmSkillsBtn.textContent = "Salvando...";

        const skillsToSave = selectedSkills.map(id => {
            const base = ALL_SKILLS.find(s => s.id === id);
            // Preserve damage from previous towerData if exists
            let damage = base.damage;
            if (towerData && towerData.skills) {
                const oldSkill = towerData.skills.find(s => s.id === id);
                if (oldSkill) damage = oldSkill.damage;
            }
            return { ...base, damage };
        });

        if (!towerData) {
            console.log("Criando nova tower_sheet...");
            const payload = {
                user_id: user.uid,
                sheet_id: selectedSheet.id,
                nickname: String(selectedSheet.name || (selectedSheet.data && selectedSheet.data.nomePersonagem) || 'Aventureiro'),
                skills: JSON.parse(JSON.stringify(skillsToSave)), // Garantir que são dados planos
                floor: 1,
                max_hp: 36,
                created_at: serverTimestamp()
            };
            const docRef = await addDoc(collection(db, 'tower_sheets'), payload);
            towerData = { id: docRef.id, ...payload };
        } else {
            console.log("Atualizando tower_sheet existente...", towerData.id);
            await updateDoc(doc(db, 'tower_sheets', towerData.id), {
                skills: JSON.parse(JSON.stringify(skillsToSave))
            });
            towerData.skills = skillsToSave;
        }

        console.log("Habilidades confirmadas com sucesso!");
        confirmSkillsBtn.textContent = "Confirmar Habilidades";
        startDesafio();
    } catch (err) {
        console.error("Erro detalhado ao confirmar habilidades:", err);
        alert(`Erro ao salvar habilidades: ${err.message || 'Erro desconhecido'}`);
        confirmSkillsBtn.disabled = false;
        confirmSkillsBtn.textContent = "Confirmar Habilidades";
    }
}

async function startDesafio() {
    const d = selectedSheet.data || {};
    const baseMaxHP = towerData.max_hp || 36;

    player = {
        name: towerData.nickname || 'Aventureiro',
        avatar: d.image || d.background_url || selectedSheet.image_url || 'assets/default-avatar.png',
        maxHealth: baseMaxHP,
        currentHealth: baseMaxHP,
        skills: towerData.skills
    };

    skillSelectionScreen.style.display = 'none';
    selectionScreen.style.display = 'none';
    battleArena.style.display = 'block';
    
    await prepareFloor();
}

async function prepareFloor() {
    console.log("Preparando andar...");
    nextFloorBtn.style.display = 'none';
    saveExitBtn.style.display = 'none';
    combatLogEl.innerHTML = '';
    currentRound = 1;
    roundNumberEl.textContent = currentRound;
    updateTurn(true); // Garante que o jogador começa o turno e atualiza UI
    skillCooldowns = {};
    poisonTicks = 0;
    isDodging = false;
    enemyAttackDebuff = 0;
    healBuffActive = false; // Reseta o buff da cura
    enemyStatusEl.innerHTML = '';

    // Recupera 4 de vida ao começar a luta
    const healAmount = 4;
    const oldHealth = player.currentHealth;
    player.currentHealth = Math.min(player.maxHealth, player.currentHealth + healAmount);
    if (player.currentHealth > oldHealth) {
        logSystem(`Você recuperou <strong>${player.currentHealth - oldHealth}</strong> de vida ao subir de andar!`);
    }

    // Lógica de Inimigos por Estrelas
    let enemyData;
    const enemyStars = Math.min(5, Math.ceil(currentFloor / 10));
    
    // 1. Tentar buscar inimigos oficiais da lista exportada que combinem com o nível de estrelas
    const officialMatches = defaultEnemies.filter(e => e.level === enemyStars);
    
    if (officialMatches.length > 0) {
        const randomOfficial = officialMatches[Math.floor(Math.random() * officialMatches.length)];
        enemyData = {
            name: randomOfficial.name,
            image_url: randomOfficial.image,
            hp: 15 + (currentFloor * 3), // HP ajustado
            damage: 2 + Math.floor(currentFloor / 6), // Dano inicial menor (2 no andar 1)
            type: randomOfficial.type,
            species: randomOfficial.species,
            description: randomOfficial.description,
            level: randomOfficial.level
        };
    } else {
        // 2. Se não houver oficiais, busca na comunidade
        const q = query(collection(db, 'enemies'), where('stars', '==', enemyStars));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            const randomDoc = snapshot.docs[Math.floor(Math.random() * snapshot.docs.length)];
            const data = randomDoc.data();
            enemyData = {
                name: data.name,
                image_url: data.image_url,
                hp: parseInt(data.hp) || (15 + currentFloor * 3),
                damage: 2 + Math.floor(currentFloor / 6),
                type: data.type || 'Desconhecido',
                species: data.species || 'Desconhecida',
                description: data.description || 'Uma criatura misteriosa da torre.',
                level: data.stars || enemyStars
            };
        } else {
            // 3. Fallback final se nada for encontrado
            enemyData = {
                name: `Guardião ${currentFloor}`,
                image_url: 'https://i.postimg.cc/L6Rj3Z7j/DALL-E-2024-03-14-A-dark-and-imposing-tower-piercing-the-stormy-clouds-digital-art-epic-fantasy.webp',
                hp: 20 + (currentFloor * 4),
                damage: 3 + Math.floor(currentFloor / 5),
                type: 'Entidade da Torre',
                species: 'Ethereal',
                description: 'Um guardião ancestral que protege os segredos da torre.',
                level: enemyStars
            };
        }
    }

    enemy = {
        name: enemyData.name,
        avatar: enemyData.image_url,
        maxHealth: enemyData.hp,
        currentHealth: enemyData.hp,
        damage: enemyData.damage,
        stars: enemyStars,
        type: enemyData.type,
        species: enemyData.species,
        description: enemyData.description
    };

    updateUI();
    renderSkillButtons();
    console.log("Turno resetado. isPlayerTurn:", isPlayerTurn);
    await runClashAnimation();
    logSystem("Sua vez! Escolha uma habilidade.");
}

// Garante que os botões de skill atualizem quando o turno mudar
function updateTurn(playerTurn) {
    isPlayerTurn = playerTurn;
    renderSkillButtons();
}

function renderSkillButtons() {
    skillButtonsEl.innerHTML = '';

    // 1. Adiciona o Ataque Básico (Sempre disponível)
    const basicSkill = { id: 'basic_atk', name: 'Ataque Básico', damage: 2, cooldown: 0, desc: 'Um golpe simples e rápido.' };
    renderSingleSkillButton(basicSkill);

    // 2. Adiciona as habilidades escolhidas da ficha
    player.skills.forEach(skill => {
        renderSingleSkillButton(skill);
    });
}

function renderSingleSkillButton(skill) {
    const btn = document.createElement('button');
    btn.className = 'skill-card-btn';
    
    // Diferencia visualmente o ataque básico
    if (skill.id === 'basic_atk') {
        btn.style.borderColor = '#888';
        btn.style.background = 'rgba(255, 255, 255, 0.05)';
    }

    const cd = skillCooldowns[skill.id] || 0;
    
    // Desativa botão se estiver em CD ou se não for o turno do jogador
    const isSkillOnCD = cd > 0;
    const isUsesExhausted = skill.uses !== undefined && (skillCooldowns[skill.id + '_uses'] || 0) >= skill.uses;
    
    btn.disabled = isSkillOnCD || isUsesExhausted || !isPlayerTurn;
    
    // Aplica estilo visual de desativado/escuro
    if (btn.disabled) {
        btn.style.opacity = '0.4';
        btn.style.filter = 'grayscale(0.8) brightness(0.5)';
        btn.style.cursor = 'not-allowed';
        btn.style.pointerEvents = 'none';
    } else {
        btn.style.opacity = '1';
        btn.style.filter = 'none';
        btn.style.cursor = 'pointer';
        btn.style.pointerEvents = 'auto';
    }

    // Determina ícone e valor (Dano ou Cura)
    let skillIcon = '⚔️';
    let skillValue = '';
    if (skill.damage) {
        skillValue = `Dano: ${skill.damage}`;
        if (skill.id === 'bola_fogo') skillIcon = '🔥';
        else if (skill.id === 'raio') skillIcon = '⚡';
        else if (skill.id === 'gelo') skillIcon = '❄️';
        else if (skill.id === 'basic_atk') skillIcon = '👊';
    } else if (skill.heal) {
        skillValue = `Cura: ${skill.heal}`;
        skillIcon = '💚';
    } else if (skill.id === 'esquiva') {
        skillIcon = '🛡️';
        skillValue = 'Esquiva';
    }

    btn.innerHTML = `
        <div class="skill-name">
            <span>${skillIcon} ${skill.name}</span>
            <div style="display: flex; gap: 5px; align-items: center;">
                ${skill.cooldown > 0 ? `<span style="font-size: 0.65rem; color: #666;">CD: ${skill.cooldown}r</span>` : ''}
                ${cd > 0 ? `<span class="skill-cd">⏱️ ${cd}</span>` : ''}
            </div>
        </div>
        <div class="skill-stats">
            <span>${skillValue}</span>
            ${skill.uses ? `<span>🔋 ${skill.uses - (skillCooldowns[skill.id + '_uses'] || 0)}/1</span>` : ''}
        </div>
    `;

    btn.onclick = () => useSkill(skill);
    skillButtonsEl.appendChild(btn);
}

async function showDiceModal(title, sides, type = 'attack') {
    return new Promise(resolve => {
        const modal = document.createElement('div');
        modal.className = 'dice-modal-overlay';
        modal.style.zIndex = '10000';
        
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

async function useSkill(skill) {
    if (!isPlayerTurn) return;
    updateTurn(false);

    logCombat('player', `${player.name} usa <strong>${skill.name}</strong>!`);

    // --- SISTEMA D&D (ROLAGEM DE DADOS) ---
    // 1. Rolagem de ACERTO (d20) - Só rola se for ataque ou efeito que pode falhar
    if (skill.type === 'attack' || skill.type === 'hybrid' || skill.type === 'dot' || skill.type === 'debuff' || skill.id === 'basic_atk') {
        const hitRoll = await showDiceModal('Ataque (d20)', 20);
        const attackMod = 2; // Bônus base da torre
        const totalHit = hitRoll + attackMod;
        const enemyDefense = 10 + Math.floor(enemy.stars * 1.5);

        logSystem(`Rolagem: ${hitRoll} + ${attackMod} = ${totalHit} (vs Defesa: ${enemyDefense})`);

        if (totalHit >= enemyDefense) {
            // ACERTOU!
            showFloatingText('enemy-avatar', 'ACERTOU!', 'crit');
            const damageRoll = await showDiceModal('Dano (d10)', 10);
            
            if (skill.damage) {
                let dmg = damageRoll + skill.damage + attackMod;
                if (healBuffActive) { dmg += 2; healBuffActive = false; }

                enemy.currentHealth = Math.max(0, enemy.currentHealth - dmg);
                logCombat('player-atk', `Causa <strong>${dmg}</strong> de dano.`);
                showFloatingText('enemy-avatar', `-${dmg}`, 'dmg');
                
                // Tremer o inimigo
                const enemyEl = document.querySelector('.enemy-side .combatant-card');
                if (enemyEl) {
                    enemyEl.classList.remove('hit-anim');
                    void enemyEl.offsetWidth;
                    enemyEl.classList.add('hit-anim');
                }
            }
        } else {
            // ERROU!
            logCombat('system', `O ataque de ${player.name} <strong>ERROU</strong>!`);
            showFloatingText('enemy-avatar', 'ERROU!', 'miss');
        }
    } else if (skill.type === 'heal' || skill.heal) {
        // ROLAGEM DE CURA (Dado Verde)
        const healRoll = await showDiceModal('Cura (d10)', 10, 'heal');
        const totalHeal = healRoll + (skill.heal || 0);
        
        player.currentHealth = Math.min(player.maxHealth, player.currentHealth + totalHeal);
        logCombat('system', `Cura sagrada! Recupera <strong>${totalHeal}</strong> de vida.`);
        showFloatingText('player-avatar', `+${totalHeal}`, 'heal');
        
        if (skill.id === 'cura') {
            healBuffActive = true;
            logSystem(`Próximo ataque terá <strong>+2</strong> de dano!`);
        }
    }

    if (skill.id === 'esquiva') {
        isDodging = true;
        showFloatingText('player-avatar', 'DEFESA!', 'crit');
        skillCooldowns[skill.id + '_uses'] = (skillCooldowns[skill.id + '_uses'] || 0) + 1;
    }

    if (skill.id === 'vampirismo') {
        skillCooldowns[skill.id + '_uses'] = (skillCooldowns[skill.id + '_uses'] || 0) + 1;
    }

    if (skill.id === 'gelo') {
        enemyAttackDebuff = 2;
        enemyStatusEl.innerHTML = '<span class="status-icon" title="Congelado">❄️</span>';
    }

    if (skill.id === 'veneno') {
        poisonTicks = skill.duration;
        enemyStatusEl.innerHTML += '<span class="status-icon" title="Envenenado">🧪</span>';
    }

    // Set cooldown
    if (skill.cooldown > 0) {
        skillCooldowns[skill.id] = skill.cooldown + 1;
    }

    updateUI();
    await new Promise(r => setTimeout(r, 1500));

    if (enemy.currentHealth <= 0) {
        await handleWin();
    } else {
        await executeEnemyTurn();
    }
}

async function executeEnemyTurn() {
    logCombat('enemy', `${enemy.name} prepara um ataque...`);
    await new Promise(r => setTimeout(r, 800));

    const hitRoll = Math.floor(Math.random() * 20) + 1;
    const enemyAtkMod = Math.floor(enemy.damage / 2);
    const totalHit = hitRoll + enemyAtkMod;
    const playerDefense = 12;

    logSystem(`${enemy.name} rolou: ${hitRoll} + ${enemyAtkMod} = ${totalHit} (vs sua Defesa: ${playerDefense})`);

    if (totalHit >= playerDefense) {
        if (isDodging) {
            logCombat('system', `Você se esquivou do ataque!`);
            showFloatingText('player-avatar', 'ESQUIVA!', 'miss');
            isDodging = false;
        } else {
            let dmg = Math.max(1, enemy.damage - enemyAttackDebuff + Math.floor(Math.random() * 5));
            player.currentHealth = Math.max(0, player.currentHealth - dmg);
            logCombat('enemy-atk', `${enemy.name} ACERTOU! Causa <strong>${dmg}</strong> de dano.`);
            showFloatingText('player-avatar', `-${dmg}`, 'dmg');
            
            // Tremer o jogador
            const playerEl = document.querySelector('.player-side .combatant-card');
            if (playerEl) {
                playerEl.classList.remove('hit-anim');
                void playerEl.offsetWidth;
                playerEl.classList.add('hit-anim');
            }
        }
    } else {
        logCombat('system', `${enemy.name} <strong>ERROU</strong> o ataque!`);
        showFloatingText('player-avatar', 'ERROU!', 'miss');
        isDodging = false;
    }

    updateUI();
    await new Promise(r => setTimeout(r, 1000));

    if (player.currentHealth <= 0) {
        handleLoss();
    } else {
        startNextRound();
    }
}

function startNextRound() {
    currentRound++;
    roundNumberEl.textContent = currentRound;
    updateTurn(true);

    // Tick Poison
    if (poisonTicks > 0) {
        const poisonDmg = 2;
        enemy.currentHealth = Math.max(0, enemy.currentHealth - poisonDmg);
        logCombat('system', `O veneno causa <strong>${poisonDmg}</strong> de dano.`);
        poisonTicks--;
        if (poisonTicks === 0) enemyStatusEl.innerHTML = enemyStatusEl.innerHTML.replace('🧪', '');
    }

    // Decrease Cooldowns
    for (let id in skillCooldowns) {
        if (!id.endsWith('_uses') && skillCooldowns[id] > 0) {
            skillCooldowns[id]--;
        }
    }

    updateUI();
    renderSkillButtons();
    
    if (enemy.currentHealth <= 0) {
        handleWin();
    } else {
        logSystem("Sua vez!");
    }
}

async function handleWin() {
    logSystem(`${enemy.name} derrotado!`);
    await addXP(user.uid, 5, `Andar ${currentFloor}`);
    
    // Upgrade Screen
    battleArena.style.display = 'none';
    upgradeScreen.style.display = 'block';
    upgradeGrid.innerHTML = '';

    player.skills.forEach(skill => {
        // Agora Cura e Esquiva (que não tem damage) também podem aparecer para upgrade
        if (!skill.damage && !skill.heal && skill.id !== 'esquiva') return;
        
        const card = document.createElement('div');
        card.className = 'skill-card';
        
        let upgradeText = '';
        if (skill.damage) upgradeText = `Dano: ${skill.damage} ➔ <strong>${skill.damage + 1}</strong>`;
        if (skill.heal) {
            upgradeText += (upgradeText ? ' e ' : '') + `Cura: ${skill.heal} ➔ <strong>${skill.heal + 1}</strong>`;
        }
        if (skill.id === 'esquiva') upgradeText = `Melhorar Esquiva (Dano Básico +1)`;

        card.innerHTML = `<h4>${skill.name}</h4><p>${upgradeText}</p>`;
        card.onclick = () => applyUpgrade(skill.id);
        upgradeGrid.appendChild(card);
    });

    // If no upgradable skills, just continue
    if (upgradeGrid.innerHTML === '') {
        setTimeout(goToNextFloor, 1000);
    }
}

async function applyUpgrade(skillId) {
    const skill = towerData.skills.find(s => s.id === skillId);
    if (skill) {
        if (skill.damage) skill.damage += 1;
        if (skill.heal) skill.heal += 1;
        
        // Se for vampirismo, o upgrade é duplo (já aumentou dano acima, agora aumenta cura se não for o mesmo campo)
        // No ALL_SKILLS o vampirismo tem damage e heal separados.
    }
    
    // Aumenta 2 pontos de vida máxima automaticamente a cada vitória
    const newMaxHP = (towerData.max_hp || 36) + 2;
    towerData.max_hp = newMaxHP;
    player.maxHealth = newMaxHP;
    
    await updateDoc(doc(db, 'tower_sheets', towerData.id), {
        skills: JSON.parse(JSON.stringify(towerData.skills)),
        floor: currentFloor + 1,
        max_hp: newMaxHP
    });

    // Atualiza o recorde no perfil do usuário
    try {
        const profileRef = doc(db, 'profiles', user.uid);
        const profileDoc = await getDoc(profileRef);
        if (profileDoc.exists()) {
            const currentRecord = profileDoc.data().tower_record || 0;
            if (currentFloor > currentRecord) {
                await updateDoc(profileRef, {
                    tower_record: currentFloor
                });
            }
        }
    } catch (e) {
        console.error("Erro ao atualizar recorde no perfil:", e);
    }

    // IMPORTANTE: Atualiza o estado local do player antes de continuar
    player.skills = towerData.skills;
    
    upgradeScreen.style.display = 'none';
    battleArena.style.display = 'block';
    
    nextFloorBtn.style.display = 'block';
    nextFloorBtn.textContent = `Subir para o Andar ${currentFloor + 1}`;
    
    if (currentFloor % 10 === 0) {
        saveExitBtn.style.display = 'block';
    }
}

async function saveTowerProgress() {
    if (!user || !towerData) return;

    try {
        await updateDoc(doc(db, 'tower_sheets', towerData.id), {
            floor: currentFloor,
            max_hp: player.maxHealth,
            skills: JSON.parse(JSON.stringify(player.skills)),
            updated_at: serverTimestamp()
        });
        
        console.log("Progresso salvo com sucesso!");
    } catch (err) {
        console.error("Erro ao salvar progresso:", err);
    }
}

async function goToNextFloor() {
    currentFloor++;
    await saveTowerProgress(); // Salva o progresso automaticamente ao subir de andar
    upgradeScreen.style.display = 'none';
    battleArena.style.display = 'block';
    await prepareFloor();
}

async function saveAndExitTower() {
    alert("Progresso salvo! Você pode voltar a qualquer momento.");
    window.location.replace('play.html');
}

function handleLoss() {
    // Exibe o modal de derrota
    const modal = document.getElementById('game-over-modal');
    const msg = document.getElementById('game-over-msg');
    const retryBtn = document.getElementById('retry-tower-btn');
    const exitBtn = document.getElementById('exit-to-play-btn');

    if (modal && msg) {
        msg.textContent = `Sua jornada terminou no andar ${currentFloor}. O progresso desta ficha foi resetado.`;
        modal.style.display = 'flex';

        // Configura botões do modal
        retryBtn.onclick = () => {
            modal.style.display = 'none';
            window.location.reload(); // Reinicia o desafio
        };

        exitBtn.onclick = () => {
            modal.style.display = 'none';
            window.location.replace('play.html');
        };
    }

    // Apaga o progresso no banco de dados
    if (towerData && towerData.id) {
        deleteDoc(doc(db, 'tower_sheets', towerData.id)).catch(err => {
            console.error("Erro ao deletar progresso após derrota:", err);
        });
    }
}


function updateUI() {
    playerNameEl.textContent = player.name;
    playerAvatarEl.style.backgroundImage = `url('${player.avatar}')`;
    playerHealthTextEl.textContent = `${player.currentHealth} / ${player.maxHealth}`;
    playerHealthBarEl.style.width = `${(player.currentHealth / player.maxHealth) * 100}%`;

    enemyNameEl.textContent = enemy.name;
    enemyAvatarEl.style.backgroundImage = `url('${enemy.avatar}')`;
    enemyHealthTextEl.textContent = `${enemy.currentHealth} / ${enemy.maxHealth}`;
    enemyHealthBarEl.style.width = `${(enemy.currentHealth / enemy.maxHealth) * 100}%`;
    
    // Atualiza a rotação do VS Badge conforme o turno
    const vsBadge = document.querySelector('.vs-badge');
    if (vsBadge) {
        vsBadge.classList.remove('turn-player', 'turn-enemy');
        vsBadge.classList.add(isPlayerTurn ? 'turn-player' : 'turn-enemy');
    }

    // Atualiza informações básicas do inimigo
    const enemyInfoHTML = `
        <div class="enemy-details" style="font-size: 0.75rem; color: #aaa; margin-top: 10px; line-height: 1.4;">
            <p><strong>Tipo:</strong> ${enemy.type}</p>
            <p><strong>Espécie:</strong> ${enemy.species}</p>
            <p><strong>Nível:</strong> ${enemy.stars} Estrelas</p>
            <p style="font-style: italic; margin-top: 5px;">"${enemy.description}"</p>
        </div>
    `;
    
    // Insere ou atualiza o container de informações
    let infoContainer = enemyAvatarEl.parentElement.querySelector('.enemy-details');
    if (!infoContainer) {
        enemyStarsEl.insertAdjacentHTML('afterend', enemyInfoHTML);
    } else {
        infoContainer.outerHTML = enemyInfoHTML;
    }
    
    enemyStarsEl.innerHTML = '⭐'.repeat(enemy.stars);
    floorNumberEl.textContent = currentFloor;
}

function logCombat(type, msg) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = msg;
    combatLogEl.appendChild(entry);
    combatLogEl.scrollTop = combatLogEl.scrollHeight;
}

function logSystem(msg) { logCombat('system', msg); }

async function runClashAnimation() {
    if (!clashOverlay) {
        console.error("clashOverlay não encontrado!");
        return;
    }
    
    // Configura as fotos
    const playerSide = clashOverlay.querySelector('.player-clash');
    const enemySide = clashOverlay.querySelector('.enemy-clash');
    
    if (playerSide) playerSide.style.backgroundImage = `url('${player.avatar}')`;
    if (enemySide) enemySide.style.backgroundImage = `url('${enemy.avatar}')`;
    
    // Mostra o container
    clashOverlay.style.display = 'flex';
    
    // Pequeno delay para o browser registrar o display:flex antes da animação
    await new Promise(r => setTimeout(r, 50));
    
    // Ativa animação
    clashOverlay.classList.add('active');
    
    // Tempo da animação (2.5 segundos)
    await new Promise(r => setTimeout(r, 2500));
    
    // Remove animação
    clashOverlay.classList.remove('active');
    
    // Delay para o fadeout
    await new Promise(r => setTimeout(r, 300));
    clashOverlay.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', initTower);
