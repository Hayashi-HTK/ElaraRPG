export const ELEMENTS = {
    fire: {
        id: 'fire',
        name: 'Fogo',
        icon: '🔥',
        color: '#ff4d4d',
        glowColor: 'rgba(255, 77, 77, 0.6)',
        coverImage: 'assets/Jogar/História/Elementos/Fogo.png',
        description: 'Domine as chamas e purifique a escuridão com calor intenso.',
        heroes: [
            {
                id: 'fire_assassin',
                name: 'Dante',
                class: 'Assassino de Chamas',
                description: 'Controla o poder bruto do fogo para devastar campos de batalha inteiros com magias explosivas.',
                image: 'assets/Jogar/História/personagens/13 Finalizado.jpg',
                stats: { hp: 90, mp: 40, attack: 30, defense: 8 },
                skills: [
                    { id: 'shadow_strike', name: 'Golpe Sombrio', cost: 10, damage: 35, effect: 'bleed' },
                    { id: 'fire_dance', name: 'Dança de Fogo', cost: 20, damage: 55, effect: 'burn' },
                    { id: 'ember_shield', name: 'Escudo de Brasas', cost: 15, damage: 0, effect: 'defense_up' },
                    { id: 'blazing_dash', name: 'Avanço Flamejante', cost: 25, damage: 45, effect: 'agility_up' },
                    { id: 'inferno_burst', name: 'Explosão Infernal', cost: 40, damage: 80, effect: 'stun' }
                ]
            },
            {
                id: 'fire_mage',
                name: 'Ignis',
                class: 'Maga das Cinzas',
                description: 'Controla o poder bruto do fogo para devastar campos de batalha inteiros com magias explosivas.',
                image: 'assets/Jogar/História/personagens/14 Finalizado.jpg',
                stats: { hp: 100, mp: 70, attack: 25, defense: 10 },
                skills: [
                    { id: 'fireball', name: 'Bola de Fogo', cost: 15, damage: 40, effect: 'burn' },
                    { id: 'meteor', name: 'Meteoro', cost: 30, damage: 65, effect: 'explosion' },
                    { id: 'phoenix_soul', name: 'Alma da Fênix', cost: 25, damage: -30, effect: 'heal' },
                    { id: 'lava_floor', name: 'Chão de Lava', cost: 35, damage: 50, effect: 'slow' },
                    { id: 'supernova', name: 'Supernova', cost: 50, damage: 100, effect: 'burn' }
                ]
            }
        ]
    },
    water: {
        id: 'water',
        name: 'Água',
        icon: '💧',
        color: '#4da6ff',
        glowColor: 'rgba(77, 166, 255, 0.6)',
        coverImage: 'assets/Jogar/História/Elementos/Água.png',
        description: 'Flua como um rio ou destrua como um tsunami.',
        heroes: [
            {
                id: 'water_warrior',
                name: 'Triton',
                class: 'Guerreiro das Marés',
                description: 'Um mestre do tridente que utiliza a pressão hidrostática para esmagar seus oponentes.',
                image: 'assets/Jogar/História/personagens/Daniel Finalizado.jpg',
                stats: { hp: 130, mp: 30, attack: 22, defense: 18 },
                skills: [
                    { id: 'wave_crash', name: 'Impacto de Onda', cost: 12, damage: 30, effect: 'stun' },
                    { id: 'whirlpool', name: 'Redemoinho', cost: 20, damage: 45, effect: 'slow' },
                    { id: 'tidal_guard', name: 'Guarda das Marés', cost: 15, damage: 0, effect: 'defense_up' },
                    { id: 'aqua_thrust', name: 'Estocada Aquática', cost: 18, damage: 35, effect: 'pierce' },
                    { id: 'tsunami_roar', name: 'Rugido do Tsunami', cost: 35, damage: 70, effect: 'stun' }
                ]
            },
            {
                id: 'water_priestess',
                name: 'Marina',
                class: 'Sacerdotisa Lunar',
                description: 'Utiliza o poder da água e da lua para curar feridas e enfraquecer as sombras.',
                image: 'assets/Jogar/História/personagens/Mandy Finalizado.jpg',
                stats: { hp: 110, mp: 80, attack: 15, defense: 15 },
                skills: [
                    { id: 'purify', name: 'Purificação', cost: 15, damage: -40, effect: 'heal' },
                    { id: 'ice_shard', name: 'Estilhaço de Gelo', cost: 10, damage: 25, effect: 'freeze' },
                    { id: 'lunar_blessing', name: 'Bênção Lunar', cost: 20, damage: 0, effect: 'buff' },
                    { id: 'mist_veil', name: 'Véu de Névoa', cost: 25, damage: 0, effect: 'dodge_up' },
                    { id: 'arctic_storm', name: 'Tempestade Ártica', cost: 45, damage: 85, effect: 'freeze' }
                ]
            }
        ]
    },
    air: {
        id: 'air',
        name: 'Ar',
        icon: '🌪️',
        color: '#a0e9ff',
        glowColor: 'rgba(160, 233, 255, 0.6)',
        coverImage: 'assets/Jogar/História/Elementos/Ar.png',
        description: 'Invisível como a brisa, devastador como um furacão.',
        heroes: [
            {
                id: 'air_archer',
                name: 'Zephyr',
                class: 'Arqueiro do Vento',
                description: 'Suas flechas viajam na velocidade do som, guiadas pelas correntes de ar.',
                image: 'assets/Jogar/História/personagens/12 Finalizado.jpg',
                stats: { hp: 95, mp: 50, attack: 28, defense: 10 },
                skills: [
                    { id: 'wind_arrow', name: 'Flecha de Vento', cost: 10, damage: 30, effect: 'pierce' },
                    { id: 'hurricane', name: 'Furacão', cost: 25, damage: 50, effect: 'knockback' },
                    { id: 'zephyr_step', name: 'Passo de Brisa', cost: 15, damage: 0, effect: 'speed_up' },
                    { id: 'cloud_shot', name: 'Disparo das Nuvens', cost: 20, damage: 40, effect: 'blind' },
                    { id: 'storm_eye', name: 'Olho da Tempestade', cost: 40, damage: 75, effect: 'aoe' }
                ]
            },
            {
                id: 'air_monk',
                name: 'Lian',
                class: 'Monge Celestial',
                description: 'Mestre das artes marciais que utiliza o ar para flutuar e desferir golpes rápidos.',
                image: 'assets/Jogar/História/personagens/04 Finalizado.png',
                stats: { hp: 115, mp: 60, attack: 24, defense: 14 },
                skills: [
                    { id: 'palm_strike', name: 'Palma de Ar', cost: 12, damage: 35, effect: 'stun' },
                    { id: 'cyclone_kick', name: 'Chute Ciclone', cost: 18, damage: 45, effect: 'aoe' },
                    { id: 'zen_breath', name: 'Sopro Zen', cost: 15, damage: -25, effect: 'heal' },
                    { id: 'tornado_spin', name: 'Giro de Tornado', cost: 22, damage: 50, effect: 'knockback' },
                    { id: 'heavenly_punch', name: 'Soco Celestial', cost: 35, damage: 70, effect: 'stun' }
                ]
            }
        ]
    },
    earth: {
        id: 'earth',
        name: 'Terra',
        icon: '⛰️',
        color: '#8b4513',
        glowColor: 'rgba(139, 69, 19, 0.6)',
        coverImage: 'assets/Jogar/História/Elementos/Terra.png',
        description: 'A força inabalável das montanhas e a resiliência da natureza.',
        heroes: [
            {
                id: 'earth_tank',
                name: 'Grom',
                class: 'Guardião de Pedra',
                description: 'Uma muralha viva capaz de suportar os golpes mais pesados sem recuar.',
                image: 'assets/Jogar/História/personagens/Donnovan Finalizado.jpg',
                stats: { hp: 160, mp: 20, attack: 18, defense: 25 },
                skills: [
                    { id: 'stone_shield', name: 'Escudo de Pedra', cost: 10, damage: 15, effect: 'defense_up' },
                    { id: 'earthquake', name: 'Terremoto', cost: 25, damage: 50, effect: 'slow' },
                    { id: 'mountain_heart', name: 'Coração da Montanha', cost: 15, damage: -35, effect: 'heal' },
                    { id: 'iron_fist', name: 'Punho de Ferro', cost: 20, damage: 40, effect: 'stun' },
                    { id: 'avalanche', name: 'Avalanche', cost: 35, damage: 85, effect: 'stun' }
                ]
            },
            {
                id: 'earth_druid',
                name: 'Levi',
                class: 'Druida da Terra',
                description: 'Comanda as raízes e a fauna para proteger a vida e punir os invasores. Ele finge não se importar com os humanos.',
                image: 'assets/Jogar/História/personagens/06 Finallizado.png',
                stats: { hp: 120, mp: 70, attack: 20, defense: 15 },
                skills: [
                    { id: 'entangle', name: 'Emaranhado', cost: 15, damage: 25, effect: 'root' },
                    { id: 'nature_wrath', name: 'Ira da Natureza', cost: 22, damage: 55, effect: 'poison' },
                    { id: 'bloom_heal', name: 'Florescer Curativo', cost: 18, damage: -40, effect: 'heal' },
                    { id: 'vine_whip', name: 'Chicote de Vinha', cost: 15, damage: 35, effect: 'slow' },
                    { id: 'forest_judgment', name: 'Julgamento da Floresta', cost: 40, damage: 90, effect: 'root' }
                ]
            }
        ]
    }
};

export const ENEMIES = {
    fire_minion: { name: 'Dragão Negro', hp: 70, maxHp: 70, attack: 15, image: 'assets/inimigos/dragão preto.png' },
    water_minion: { name: 'Quimera Abissal', hp: 80, maxHp: 80, attack: 12, image: 'assets/inimigos/Quimera.jpeg' },
    air_minion: { name: 'Gárgula de Tempestade', hp: 75, maxHp: 75, attack: 18, image: 'assets/inimigos/Gargula.png' },
    earth_minion: { name: 'Golem de Terra', hp: 100, maxHp: 100, attack: 10, image: 'assets/inimigos/Golem.png' },
    the_first: { name: 'The First', hp: 250, maxHp: 250, attack: 35, image: 'assets/inimigos/The first.png', isBoss: true }
};

export const STORY_NODES = {
    // ==========================================
    // ROTA DE FOGO (DANTE / KATARINA)
    // ==========================================
    fire_start: {
        id: 'fire_start',
        background: 'assets/Jogar/História/Fundos/Vulcão.png',
        speaker: 'Narrador',
        text: 'O vulcão de Elara despertou, mas suas cinzas são negras como a morte. O elemento Fogo clama por um herói para purificar suas chamas.',
        choices: [{ text: 'Entrar na Caverna de Magma', nextNode: 'fire_intro_2' }]
    },
    fire_intro_2: {
        id: 'fire_intro_2',
        background: 'assets/Jogar/História/Fundos/Vulcão.png',
        leftSprite: 'assets/Jogar/História/personagens/13 Finalizado.jpg',
        speaker: 'Dante',
        speakerColor: '#ff4d4d',
        text: 'Sinto o calor... mas não é o calor da vida. É o calor da destruição pura. Ignis, você sente isso?',
        choices: [{ text: 'Avançar com cautela', nextNode: 'fire_intro_3' }]
    },
    fire_intro_3: {
        id: 'fire_intro_3',
        background: 'assets/Jogar/História/Fundos/Vulcão.png',
        rightSprite: 'assets/Jogar/História/personagens/14 Finalizado.jpg',
        speaker: 'Ignis',
        speakerColor: '#ff4d4d',
        text: 'Sim, Dante. As chamas estão sendo sugadas para o centro da montanha. Precisamos parar o que quer que esteja fazendo isso.',
        choices: [{ text: 'Investigar o movimento', nextNode: 'fire_battle_1' }]
    },
    fire_battle_1: {
        id: 'fire_battle_1',
        background: 'assets/Jogar/História/Fundos/Vulcão.png',
        speaker: 'Narrador',
        text: 'Um Dragão Negro emerge do magma, bloqueando o caminho!',
        onEnter: (engine) => engine.startBattle('fire_minion', 'fire_after_1'),
        choices: []
    },
    fire_after_1: {
        id: 'fire_after_1',
        background: 'assets/Jogar/História/Fundos/Vulcão.png',
        leftSprite: 'assets/Jogar/História/personagens/13 Finalizado.jpg',
        speaker: 'Dante',
        text: 'Isso foi apenas o começo. Sinto que minha conexão com as chamas está ficando mais forte.',
        onEnter: (engine) => {
            engine.openSkillSelectionModal((skill) => {
                // Após escolher, o motor pula para o próximo nó de diálogo reagindo à escolha
                engine.showStoryNode('fire_skill_reaction');
            });
        },
        choices: []
    },
    fire_skill_reaction: {
        id: 'fire_skill_reaction',
        background: 'assets/Jogar/História/Fundos/Vulcão.png',
        rightSprite: 'assets/Jogar/História/personagens/14 Finalizado.jpg',
        speaker: 'Ignis',
        text: 'Essa técnica... eu nunca vi nada igual. Você realmente tem um talento natural para absorver o éter elemental. Isso será muito útil adiante.',
        choices: [{ text: 'Continuar subindo', nextNode: 'fire_intro_4' }]
    },
    fire_intro_4: {
        id: 'fire_intro_4',
        background: 'assets/Jogar/História/Fundos/Vulcão.png',
        rightSprite: 'assets/Jogar/História/personagens/14 Finalizado.jpg',
        speaker: 'Ignis',
        text: 'Olhe aquelas inscrições nas paredes... elas brilham conforme avançamos. O vulcão está reagindo à nossa presença.',
        choices: [{ text: 'Ler as inscrições', nextNode: 'fire_intro_5' }]
    },
    fire_intro_5: {
        id: 'fire_intro_5',
        background: 'assets/Jogar/História/Fundos/Vulcão.png',
        speaker: 'Narrador',
        text: '"Aquele que domina o calor deve também dominar a si mesmo. Somente a chama pura pode dissipar o vazio."',
        choices: [{ text: 'Meditar sobre as palavras', nextNode: 'fire_battle_2' }]
    },
    fire_battle_2: {
        id: 'fire_battle_2',
        background: 'assets/Jogar/História/Fundos/Vulcão.png',
        speaker: 'Narrador',
        text: 'Enquanto você medita, o magma ao redor começa a borbulhar violentamente. Dragões Negros saltam das chamas!',
        onEnter: (engine) => engine.startBattle('fire_minion', 'fire_after_2'),
        choices: []
    },
    fire_after_2: {
        id: 'fire_after_2',
        background: 'assets/Jogar/História/Fundos/Vulcão.png',
        leftSprite: 'assets/Jogar/História/personagens/13 Finalizado.jpg',
        speaker: 'Dante',
        text: 'Elas estão ficando mais rápidas... Mas eu também estou. Sinto que posso aprender algo novo agora!',
        onEnter: (engine) => {
            engine.openSkillSelectionModal((skill) => {
                engine.showStoryNode('fire_skill_reaction_2');
            });
        },
        choices: []
    },
    fire_skill_reaction_2: {
        id: 'fire_skill_reaction_2',
        background: 'assets/Jogar/História/Fundos/Vulcão.png',
        rightSprite: 'assets/Jogar/História/personagens/14 Finalizado.jpg',
        speaker: 'Ignis',
        text: 'Incrível! Sua aura elemental está mudando de forma. Estamos quase no topo, use esse novo poder com sabedoria.',
        choices: [{ text: 'Seguir para o topo', nextNode: 'fire_intro_6' }]
    },
    fire_intro_6: {
        id: 'fire_intro_6',
        background: 'assets/Jogar/História/Fundos/Vulcão.png',
        speaker: 'Voz Misteriosa',
        text: 'Vocês heróis são tão previsíveis... acreditam que podem apagar o sol com um balde d\'água.',
        choices: [{ text: 'Quem está aí?', nextNode: 'fire_battle_3' }]
    },
    fire_battle_3: {
        id: 'fire_battle_3',
        background: 'assets/Jogar/História/Fundos/Vulcão.png',
        speaker: 'Narrador',
        text: 'Uma horda de criaturas menores bloqueia a entrada da câmara principal!',
        onEnter: (engine) => engine.startBattle('fire_minion', 'fire_pre_boss'),
        choices: []
    },
    fire_pre_boss: {
        id: 'fire_pre_boss',
        background: 'assets/Jogar/História/Fundos/Vulcão.png',
        speaker: 'Narrador',
        text: 'Na câmara final, o ar é denso e frio, apesar do magma ao redor. No centro, uma fenda dimensional pulsa com energia negra.',
        choices: [{ text: 'Aproximar-se da fenda', nextNode: 'fire_boss_reveal' }]
    },
    fire_boss_reveal: {
        id: 'fire_boss_reveal',
        background: 'assets/Jogar/História/Fundos/Vulcão.png',
        speaker: 'Narrador',
        text: 'Da fenda, emerge The First. Uma criatura gigante com olhos brilhantes e uma boca semelhante a uma serpente. Ela parece buscar sua própria felicidade através da nossa extinção.',
        choices: [{ text: 'Enfrentar o destino', nextNode: 'final_gate' }]
    },

    // ==========================================
    // ROTA DE TERRA (GROM / LEVI)
    // ==========================================
    earth_start: {
        id: 'earth_start',
        background: 'assets/Jogar/História/Fundos/Caverna.png',
        speaker: 'Narrador',
        text: 'As florestas ancestrais de Elara estão morrendo. As árvores secam em segundos e o solo racha, expelindo um gás escuro.',
        choices: [{ text: 'Investigar as raízes', nextNode: 'earth_intro_2' }]
    },
    earth_intro_2: {
        id: 'earth_intro_2',
        background: 'assets/Jogar/História/Fundos/Caverna.png',
        leftSprite: 'assets/Jogar/História/personagens/Donnovan Finalizado.jpg',
        speaker: 'Grom',
        speakerColor: '#8b4513',
        text: 'A terra está chorando... Levi, você sente essa dor sob seus pés?',
        choices: [{ text: 'Escutar o solo', nextNode: 'earth_intro_3' }]
    },
    earth_intro_3: {
        id: 'earth_intro_3',
        background: 'assets/Jogar/História/Fundos/Caverna.png',
        rightSprite: 'assets/Jogar/História/personagens/06 Finallizado.png',
        speaker: 'Levi',
        speakerColor: '#8b4513',
        text: 'Eu finjo não me importar com esses humanos... mas se a floresta cair, nada restará para ninguém.',
        choices: [{ text: 'Avançar pelo matagal', nextNode: 'earth_battle_1' }]
    },
    earth_battle_1: {
        id: 'earth_battle_1',
        background: 'assets/Jogar/História/Fundos/Caverna.png',
        speaker: 'Narrador',
        text: 'Um Golem de Terra corrompido surge do pântano!',
        onEnter: (engine) => engine.startBattle('earth_minion', 'earth_after_1'),
        choices: []
    },
    earth_after_1: {
        id: 'earth_after_1',
        background: 'assets/Jogar/História/Fundos/Caverna.png',
        rightSprite: 'assets/Jogar/História/personagens/06 Finallizado.png',
        speaker: 'Levi',
        text: 'Eles estão usando o núcleo da terra para alimentar o vazio. Sinto que posso canalizar mais poder agora.',
        onEnter: (engine) => {
            engine.openSkillSelectionModal((skill) => {
                engine.showStoryNode('earth_skill_reaction');
            });
        },
        choices: []
    },
    earth_skill_reaction: {
        id: 'earth_skill_reaction',
        background: 'assets/Jogar/História/Fundos/Caverna.png',
        leftSprite: 'assets/Jogar/História/personagens/Donnovan Finalizado.jpg',
        speaker: 'Grom',
        text: 'Sua conexão com a natureza está se aprofundando. Continue assim, e talvez possamos realmente salvar este mundo.',
        choices: [{ text: 'Ir ao encontro da fenda', nextNode: 'final_gate' }]
    },

    // ==========================================
    // FINAL COMUM
    // ==========================================
    final_gate: {
        id: 'final_gate',
        background: 'assets/Jogar/História/Fundos/Vulcão_luz.jpg',
        speaker: '???',
        text: 'Não importa se você traz o calor do sol, o frio do abismo, a fúria do vento ou a força da terra. No fim, tudo se torna nada.',
        choices: [{ text: 'Desafiar a sombra', nextNode: 'boss_fight' }]
    },
    boss_fight: {
        id: 'boss_fight',
        background: 'assets/Jogar/História/Fundos/Vulcão_luz.jpg',
        speaker: 'The First',
        text: 'Eu sou o vazio que existia antes da luz. Eu sou o Primeiro, e serei o Último. Sua existência é apenas um erro que eu vou corrigir agora.',
        onEnter: (engine) => engine.startBattle('the_first', 'ending'),
        choices: []
    },
    ending: {
        id: 'ending',
        background: 'assets/Jogar/História/Fundos/Vulcão_luz.jpg',
        speaker: 'Narrador',
        text: 'Com o último golpe, a escuridão se dissipa. A harmonia elemental é restaurada e Elara volta a respirar. Você se tornou a lenda que o mundo precisava.',
        choices: [{ text: 'Finalizar Jornada', action: 'exit' }]
    }
};

export const GAME_PLAYLIST = [];
