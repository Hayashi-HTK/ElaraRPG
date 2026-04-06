export const BUILTIN_CHARACTERS = [
  { id: 'kael', name: 'Kael Cindervane', filename: '04 Finalizado.png' },
  { id: 'lyra', name: 'Lyron Tideborn', filename: '06 Finallizado.png' },
  { id: 'torak', name: 'Torak Stoneclaw', filename: '12 Finalizado.jpg' },
  { id: 'senna', name: 'Senno Galewing', filename: '13 Finalizado.jpg' },
  { id: 'mira', name: 'Mira Voidwhisper', filename: '14 Finalizado.jpg' },
  { id: 'dax', name: 'Dax Stormfist', filename: 'Atlas Finalizado.jpg' },
  { id: 'orin', name: 'Orin Mistwalker', filename: 'Daniel Finalizado.jpg' },
  { id: 'vera', name: 'Varo Sunshard', filename: 'Donnovan Finalizado.jpg' },
  { id: 'nyla', name: 'Nyla Frostveil', filename: 'Fernanda Finalizado.jpg' },
  { id: 'cassia', name: 'Cassia Thornveil', filename: 'Fiora Dr Maia Finalizado.jpg' },
  { id: 'riven', name: 'Riva Ashcroft', filename: 'Mandy Finalizado.jpg' }
]

export const getBuiltinCharacterAssets = () => {
  return BUILTIN_CHARACTERS.map((c, index) => {
    const filename = c.filename
    const path = `assets/Jogar/História/personagens/${filename}`
    return {
      id: c.id || `builtin_character_${index}`,
      name: c.name || String(filename).replace(/\.(png|jpe?g)$/i, ''),
      image_url: encodeURI(path)
    }
  })
}

export const BUILTIN_FLOOR_BASE_PATHS = [
  'assets/Jogar/Pisos/'
]

export const BUILTIN_FLOOR_FILES = [
  'Piso 3 areia.png',
  'Piso 3 grama.png',
  'Piso 3 poça.png',
  'Piso chão 3.2.png',
  'Piso chão 3.4.png',
  'Piso chão 3.5.png',
  'Piso curva 1.png',
  'Piso curva 2.png',
  'Piso curva 3.png',
  'Piso horizontal 2.png',
  'Piso horizontal 3.png',
  'Piso meio 2.png',
  'Piso meio 3.png',
  'Piso meio 4.png',
  'Piso tampão 3.png',
  'Piso tampão 4.png',
  'Piso trilha 4 Grama.png',
  'Piso trilha 4.1.png',
  'Piso trilha 4.2.png',
  'Piso trilha 4.png',
  'Piso trilha areia.png',
  'Piso trilha poça 1.2.png',
  'Piso trilha poça.png',
  'Piso vertical 1.png',
  'Piso vertical 2.png'
]

export const normalizeFloorUrl = (url) => {
  const raw = String(url || '').trim()
  if (!raw) return raw
  const a = raw.replace(/assets\/Jogar\/História\/Pisos\//g, 'assets/Jogar/Pisos/')
  const b = a.replace(/assets\/Jogar\/Hist%C3%B3ria\/Pisos\//g, 'assets/Jogar/Pisos/')
  return b
}

export const OBJECT_BOOK = {
  'Heróis': [],
  'Vilões': [
    {
      id: 'vilao_exemplo_01',
      name: 'Espantalho',
      image_url: 'assets/Jogar/Book/Viloes/espantalho.png'
    }
  ],
  "NPC's": [],
  'Animais': [],
  'Formas': [],
  'Efeitos': [],
  'Clima': [],
  'Estatuas': [],
  'Casas': [],
  'Prédios': [],
  'Cavernas': [],
  'Cidade': [],
  'Caixas': [],
  'Baús': [],
  'Escadas': [],
  'Florestas': [],
  'Explosões': [],
  'Vulcão': [],
  'Mares': [],
  'Portais': []
}

export const getObjectBookCategories = () => {
  return Object.entries(OBJECT_BOOK).map(([category, items]) => {
    const safeItems = Array.isArray(items) ? items : []
    return {
      category,
      items: safeItems
        .map((it, idx) => ({
          id: it?.id || `obj_${category}_${idx}`,
          name: String(it?.name || '').trim(),
          image_url: String(it?.image_url || '').trim()
        }))
        .filter(x => x.name)
    }
  })
}
