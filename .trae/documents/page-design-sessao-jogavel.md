# Page Design — Sessão Jogável (desktop-first)

## 1) Layout
- **Estratégia (desktop-first):** layout em 3 colunas, com área central dominante.
- **Sistema:** CSS Grid no contêiner principal.
  - Coluna esquerda: barra de assets (fixa/rolável).
  - Coluna central: campo jogável (canvas/stage com 100% altura disponível).
  - Coluna direita: painel de propriedades (aparece no modo Mestre).
- **Espaçamento:** escala 8px (8/16/24).
- **Responsividade:**
  - >= 1280px: 3 colunas (assets | campo | propriedades).
  - 768–1279px: 2 colunas (assets colapsável + campo; propriedades em drawer).
  - < 768px (opcional): foco no campo; assets e propriedades como drawers.

## 2) Meta Information
- Title: “Sessão Jogável — {nomeDaSessão}”
- Description: “Campo jogável com tokens e assets arrastáveis.”
- Open Graph:
  - og:title: “Sessão Jogável — {nomeDaSessão}”
  - og:description: “Sessão jogável estilo mesa virtual.”

## 3) Global Styles
- **Cores (tokens):**
  - Background: #0B1220
  - Surface: #111A2E
  - Border: #22304D
  - Text: #E6EAF2
  - Muted: #9AA7C0
  - Accent: #6EA8FE
  - Danger: #FF5A6B
- **Tipografia:**
  - Base 14–16px; headings 18–24px; monospace opcional p/ IDs.
- **Componentes:**
  - Botões: padrão (surface) e primário (accent); hover com leve brilho/elevação.
  - Cards (assets): borda + hover com outline accent.
  - Estados: selected com outline accent; disabled com opacidade.

## 4) Page Structure
1. **Top Bar (fixa):** controles de sessão e modo.
2. **Workspace (grid):**
   - Left: **Assets Bar**
   - Center: **Play Field (Canvas/Stage)**
   - Right: **Properties Panel** (somente Mestre)

## 5) Sections & Components

### 5.1 Top Bar (Header)
- **Elementos:**
  - Nome da sessão / breadcrumb simples (“Sessão: X”).
  - **Toggle de modo:** “Mestre” / “Jogador”.
  - Indicador visual do modo ativo (chip/label).
- **Comportamento:**
  - Ao alternar para Mestre, habilitar UI de edição (drop de assets, propriedades editáveis).
  - Ao alternar para Jogador, manter visualização e interações permitidas (ex.: mover token permitido), ocultando ações destrutivas.

### 5.2 Assets Bar (coluna esquerda)
- **Objetivo:** ser a “barra de assets” com personagens arrastáveis.
- **Componentes:**
  - Campo de busca simples (filtra por nome).
  - Lista em cards/tiles:
    - Miniatura do personagem.
    - Nome curto.
- **Interações:**
  - Drag-start no card cria “ghost preview”.
  - Drop no campo cria token com:
    - imagem do asset
    - label (nome)
    - tamanho padrão

### 5.3 Campo Jogável (coluna central)
- **Objetivo:** área principal estilo Roll20.
- **Componentes:**
  - Canvas/Stage com:
    - camada de fundo (cor neutra)
    - camada opcional de grade
    - camada de tokens
  - Controles de navegação (mínimos):
    - Pan (arrastar com botão do meio/space)
    - Zoom (scroll/pinch)
- **Interações essenciais:**
  - Selecionar token por clique.
  - Arrastar token para mover; mostrar “snap” visual se grade estiver ativa.
  - Respeitar limites do campo (não “perder” token fora da área visível, mantendo clamp mínimo).

### 5.4 Properties Panel (coluna direita, apenas Mestre)
- **Gatilho:** aparece quando modo = Mestre.
- **Conteúdo (token selecionado):**
  - Preview (miniatura) + nome.
  - Campos editáveis:
    - Label/Nome do token
    - Escala/Tamanho (slider ou input numérico)
  - Ações:
    - Remover token do campo (confirmação leve)
- **Estado vazio:** quando nenhum token estiver selecionado, mostrar instrução (“Selecione um token para editar”).

### 5.5 Estados e Regras de Permissão (UI)
- **Modo Jogador:**
  - Botões de edição (remover/editar propriedades) ocultos ou desabilitados.
  - Drop de assets no campo desabilitado.
- **Modo Mestre:**
  - Todas as ações de edição habilitadas.
- **Feedback:**
  - Toast/snackbar para ações críticas (token removido, permissão negada).

## 6) Motion/Transitions (opcional)
- Transição de drawers (tablet/mobile): 150–200ms ease-out.
- Outline de seleção com animação sutil (100–150ms).