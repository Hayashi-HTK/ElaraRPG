import {
  auth,
  db,
  waitForAuth,
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment
} from './firebase.js';

const getEl = (id) => document.getElementById(id);

const esc = (v) =>
  String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const toMs = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0);

const formatAgo = (ms) => {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d`;
};

window.addEventListener('message', (event) => {
  const data = event?.data;
  if (!data || typeof data !== 'object') return;
  if (data.type !== 'sheet-iframe-height') return;
  const maxFit = Math.min(Math.max(Math.floor(window.innerHeight * 0.72), 320), 560);
  const iframes = document.querySelectorAll('.sheet-carousel iframe');
  for (const fr of iframes) {
    if (fr.contentWindow === event.source) {
      fr.style.height = `${maxFit}px`;
      break;
    }
  }
});

const safeUrl = (raw) => {
  const u = String(raw || '').trim();
  if (!u) return '';
  if (/^\s*javascript:/i.test(u)) return '';
  return u;
};

const sheetRatingCache = new Map();
async function getSheetRatingStars(sheetId) {
  const id = String(sheetId || '').trim();
  if (!id) return 0;
  if (sheetRatingCache.has(id)) return sheetRatingCache.get(id);
  const p = (async () => {
    try {
      const snap = await getDoc(doc(db, 'sheets', id));
      if (!snap.exists()) return 0;
      const d = snap.data() || {};
      const n = parseInt(d.rating_stars ?? 0);
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, Math.min(5, n));
    } catch {
      return 0;
    }
  })();
  sheetRatingCache.set(id, p);
  return p;
}

const renderStars = (n) => {
  const v = Math.max(0, Math.min(5, parseInt(n || 0)));
  let out = '';
  for (let i = 1; i <= 5; i++) {
    out += i <= v ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
  }
  return out;
};

let currentUser = null;
let currentProfile = null;
let isAdmin = false;

const feedList = getEl('feed-list');
const feedEmpty = getEl('feed-empty');

const storiesList = getEl('stories-list');
const storyModal = getEl('story-modal');
const storyStage = getEl('story-stage');
const storyMeta = getEl('story-meta');
const btnStoryClose = getEl('btn-story-close');
const btnStoryPrev = getEl('btn-story-prev');
const btnStoryNext = getEl('btn-story-next');

const btnAddStory = getEl('btn-add-story');
const createStoryModal = getEl('create-story-modal');
const btnCreateStoryClose = getEl('btn-create-story-close');
const btnCreateStoryCancel = getEl('btn-create-story-cancel');
const btnCreateStorySubmit = getEl('btn-create-story-submit');
const storyMediaUrl = getEl('story-media-url');
const storyText = getEl('story-text');
const storySessionTitle = getEl('story-session-title');
const storySessionUrl = getEl('story-session-url');
const storyFieldMedia = getEl('story-field-media');
const storyFieldText = getEl('story-field-text');
const storyFieldSession = getEl('story-field-session');
const storyError = getEl('story-error');

const composerText = getEl('composer-text');
const composerSheetRow = getEl('composer-sheet-row');
const composerSheetSelect = getEl('composer-sheet-select');
const composerSheetPreview = getEl('composer-sheet-preview');
const composerSheetPreviewImg = getEl('composer-sheet-preview-img');
const composerSheetPreviewTitle = getEl('composer-sheet-preview-title');
const btnPost = getEl('btn-post');
const btnClear = getEl('btn-clear');

const adminPanelLink = getEl('admin-panel-link');
const btnOpenReports = getEl('btn-open-reports');
const reportsModal = getEl('reports-modal');
const reportsList = getEl('reports-list');
const btnReportsClose = getEl('btn-reports-close');

const repostModal = getEl('repost-modal');
const btnRepostClose = getEl('btn-repost-close');
const btnRepostCancel = getEl('btn-repost-cancel');
const btnRepostSubmit = getEl('btn-repost-submit');
const repostComment = getEl('repost-comment');
const repostPreviewAvatar = getEl('repost-preview-avatar');
const repostPreviewName = getEl('repost-preview-name');
const repostPreviewSnippet = getEl('repost-preview-snippet');
const repostPreviewMedia = getEl('repost-preview-media');

let composerType = 'text';

let storiesCache = [];
let storyIndex = 0;
const repostSnapshotCache = new Map();
let repostModalResolve = null;
let repostModalOriginal = null;

async function resolveRepostSnapshot(postId) {
  const id = String(postId || '').trim();
  if (!id) return null;
  if (repostSnapshotCache.has(id)) return repostSnapshotCache.get(id);
  const p = (async () => {
    try {
      const snap = await getDoc(doc(db, 'posts', id));
      if (!snap.exists()) return null;
      const data = snap.data() || {};
      const a = data.author || {};
      return {
        post_id: id,
        type: String(data.type || 'text'),
        author_name: String(a.nickname || a.full_name || 'Aventureiro'),
        text: String(data.text || ''),
        image_url: String(data.image_url || '')
      };
    } catch {
      return null;
    }
  })();
  repostSnapshotCache.set(id, p);
  return p;
}

function setComposerType(type) {
  composerType = type;
  document.querySelectorAll('.composer-tab').forEach((b) => b.classList.toggle('active', b.dataset.type === type));
  if (composerSheetRow) composerSheetRow.style.display = type === 'sheet' ? 'block' : 'none';
  if (composerText) composerText.placeholder = type === 'sheet' ? 'Escreva uma legenda para a ficha (opcional)...' : 'O que você quer compartilhar?';
  
  if (type === 'sheet' && (!composerSheetSelect.options.length || composerSheetSelect.options[0].value === '')) {
    loadUserSheets();
  }
}

async function loadUserSheets() {
  if (!composerSheetSelect) return;
  
  composerSheetSelect.innerHTML = '<option value="">Carregando...</option>';
  
  try {
    const sheetsRef = collection(db, 'sheets');
    let snapshot = null;
    try {
      const q = query(sheetsRef, where('user_id', '==', currentUser.uid), orderBy('created_at', 'desc'));
      snapshot = await getDocs(q);
    } catch (error) {
      const code = String(error?.code || '');
      const msg = String(error?.message || '');
      if (code === 'failed-precondition' || /requires an index|index/i.test(msg)) {
        snapshot = await getDocs(query(sheetsRef, where('user_id', '==', currentUser.uid)));
      } else {
        throw error;
      }
    }
    
    composerSheetSelect.innerHTML = '<option value="">Selecione uma ficha...</option>';
    
    if (snapshot.empty) {
      composerSheetSelect.innerHTML = '<option value="">Nenhuma ficha encontrada</option>';
      return;
    }
    
    const docs = [];
    snapshot.forEach(docSnap => {
      docs.push({ id: docSnap.id, data: docSnap.data() || {} });
    });
    docs.sort((a, b) => {
      const aMs = toMs(a.data?.created_at) || toMs(a.data?.updated_at);
      const bMs = toMs(b.data?.created_at) || toMs(b.data?.updated_at);
      return (bMs || 0) - (aMs || 0);
    });

    docs.forEach(({ id, data }) => {
      const option = document.createElement('option');
      option.value = id;
      const tpl = String(data?.template || 'free');
      const photo = data?.data?.image || data?.image_url || (tpl.toLowerCase() === 'dnd' ? 'assets/dnd5e/page1.png' : 'assets/default-avatar.png');
      option.dataset.photo = photo;
      option.dataset.template = tpl;
      option.textContent = data?.name || data?.data?.nomePersonagem || 'Ficha sem nome';
      composerSheetSelect.appendChild(option);
    });
    
    composerSheetSelect.onchange = (e) => {
      const selected = e.target.options[e.target.selectedIndex];
      if (selected && selected.value && selected.dataset.photo) {
        composerSheetPreviewImg.src = selected.dataset.photo;
        composerSheetPreviewTitle.textContent = selected.textContent;
        composerSheetPreview.style.display = 'flex';
      } else {
        composerSheetPreview.style.display = 'none';
      }
    };
    
  } catch (error) {
    console.error("Erro ao carregar fichas:", error);
    composerSheetSelect.innerHTML = '<option value="">Erro ao carregar fichas</option>';
  }
}

function getAuthorSnapshot() {
  const nickname = currentProfile?.nickname || currentProfile?.full_name || currentUser?.displayName || 'Aventureiro';
  return {
    nickname,
    avatar_url: currentProfile?.avatar_url || currentUser?.photoURL || '',
    current_frame: (currentProfile?.current_frame || 'wood').toLowerCase()
  };
}

async function ensureAuth() {
  const u = await waitForAuth();
  if (!u) {
    window.location.href = 'index.html';
    return null;
  }
  currentUser = u;
  const p = await getDoc(doc(db, 'profiles', u.uid));
  currentProfile = p.exists() ? p.data() : {};
  isAdmin = currentProfile?.is_admin === true || u?.email === 'hayagames@outlook.com';
  if (adminPanelLink) adminPanelLink.style.display = isAdmin ? 'block' : 'none';
  return u;
}

function closeModal(modal) {
  if (modal) modal.style.display = 'none';
}

function openModal(modal) {
  if (modal) modal.style.display = 'flex';
}

function renderStoryStage(story) {
  if (!storyStage) return;
  storyStage.innerHTML = '';

  const type = String(story?.type || 'image');

  if (type === 'text') {
    const el = document.createElement('div');
    el.className = 'modal-story-text';
    el.textContent = String(story?.text || '');
    storyStage.appendChild(el);
    return;
  }

  if (type === 'session') {
    const wrap = document.createElement('div');
    wrap.style.width = '100%';
    wrap.style.height = '100%';
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'center';
    wrap.style.gap = '12px';
    wrap.style.padding = '16px';

    const title = document.createElement('div');
    title.className = 'modal-story-text';
    title.style.fontSize = '1rem';
    title.textContent = String(story?.text || 'Sessão de RPG');

    const btn = document.createElement('button');
    btn.className = 'btn-post';
    btn.type = 'button';
    btn.textContent = 'Entrar na Sessão';
    btn.onclick = () => {
      const link = String(story?.session_url || '').trim();
      if (!link) return;
      const ok = confirm('Quer entrar nessa sessão?');
      if (ok) window.location.href = link;
    };

    wrap.appendChild(title);
    wrap.appendChild(btn);
    storyStage.appendChild(wrap);
    return;
  }

  const img = document.createElement('img');
  img.alt = '';
  img.src = String(story?.media_url || story?.image_url || '');
  storyStage.appendChild(img);
}

function openStoryAt(index) {
  storyIndex = Math.max(0, Math.min(index, storiesCache.length - 1));
  const story = storiesCache[storyIndex];
  const nick = story?.author?.nickname || 'Aventureiro';
  const label = story?.duration === '7d' ? '7 dias' : '24h';
  if (storyMeta) storyMeta.textContent = `${nick} • ${label}`;
  renderStoryStage(story);
  openModal(storyModal);
}

function wireStoryModal() {
  if (btnStoryClose) btnStoryClose.onclick = () => closeModal(storyModal);
  if (storyModal) {
    storyModal.addEventListener('click', (e) => {
      if (e.target === storyModal) closeModal(storyModal);
    });
  }
  if (btnStoryPrev) btnStoryPrev.onclick = () => openStoryAt(storyIndex - 1);
  if (btnStoryNext) btnStoryNext.onclick = () => openStoryAt(storyIndex + 1);
}

async function createStory() {
  if (!currentUser) return;

  const type = String(document.querySelector('input[name="story-type"]:checked')?.value || 'image');
  const duration = String(document.querySelector('input[name="story-duration"]:checked')?.value || '24h');
  const expiresAtMs = Date.now() + (duration === '7d' ? 7 : 1) * 24 * 60 * 60 * 1000;

  const mediaUrl = String(storyMediaUrl?.value || '').trim();
  const text = String(storyText?.value || '').trim();
  const sessionTitle = String(storySessionTitle?.value || '').trim();
  const sessionUrl = String(storySessionUrl?.value || '').trim();

  if (storyError) storyError.style.display = 'none';

  if ((type === 'image' || type === 'gif') && !mediaUrl) {
    if (storyError) {
      storyError.textContent = 'Cole a URL da imagem/GIF para postar.';
      storyError.style.display = 'block';
    }
    return;
  }
  if (type === 'text' && !text) {
    if (storyError) {
      storyError.textContent = 'Digite um texto para postar.';
      storyError.style.display = 'block';
    }
    return;
  }
  if (type === 'session' && !sessionUrl) {
    if (storyError) {
      storyError.textContent = 'Cole o link da sala para postar um story de sessão.';
      storyError.style.display = 'block';
    }
    return;
  }

  await addDoc(collection(db, 'stories'), {
    author_id: currentUser.uid,
    author: getAuthorSnapshot(),
    type,
    text: type === 'session' ? (sessionTitle || 'Mesa aberta') : (text || ''),
    media_url: (type === 'image' || type === 'gif') ? mediaUrl : '',
    session_url: type === 'session' ? sessionUrl : '',
    duration,
    expires_at_ms: expiresAtMs,
    created_at: serverTimestamp()
  });

  if (storyMediaUrl) storyMediaUrl.value = '';
  if (storyText) storyText.value = '';
  if (storySessionTitle) storySessionTitle.value = '';
  if (storySessionUrl) storySessionUrl.value = '';
  closeModal(createStoryModal);
}

function updateCreateStoryFields() {
  const type = String(document.querySelector('input[name="story-type"]:checked')?.value || 'image');
  if (storyFieldMedia) storyFieldMedia.style.display = (type === 'image' || type === 'gif') ? 'grid' : 'none';
  if (storyFieldText) storyFieldText.style.display = type === 'text' ? 'grid' : 'none';
  if (storyFieldSession) storyFieldSession.style.display = type === 'session' ? 'grid' : 'none';
  if (storyError) storyError.style.display = 'none';
}

function wireCreateStoryModal() {
  if (btnAddStory) btnAddStory.onclick = () => {
    updateCreateStoryFields();
    openModal(createStoryModal);
  };

  if (btnCreateStoryClose) btnCreateStoryClose.onclick = () => closeModal(createStoryModal);
  if (btnCreateStoryCancel) btnCreateStoryCancel.onclick = () => closeModal(createStoryModal);
  if (btnCreateStorySubmit) btnCreateStorySubmit.onclick = () => createStory().catch(() => {});

  if (createStoryModal) {
    createStoryModal.addEventListener('click', (e) => {
      if (e.target === createStoryModal) closeModal(createStoryModal);
    });
  }

  document.querySelectorAll('input[name="story-type"]').forEach((el) => {
    el.addEventListener('change', updateCreateStoryFields);
  });
  document.querySelectorAll('input[name="story-duration"]').forEach((el) => {
    el.addEventListener('change', () => {
      if (storyError) storyError.style.display = 'none';
    });
  });
}

function renderStories(stories) {
  if (!storiesList) return;
  storiesList.innerHTML = '';

  storiesCache = stories;

  stories.forEach((s, idx) => {
    const chip = document.createElement('div');
    chip.className = 'story-chip';
    const imgUrl = s?.author?.avatar_url || 'assets/default-avatar.png';
    chip.innerHTML = `
      <div class="story-avatar"><img alt="" src="${esc(imgUrl)}"></div>
      <div class="story-username">${esc(s?.author?.nickname || 'Story')}</div>
    `;
    chip.onclick = () => openStoryAt(idx);
    storiesList.appendChild(chip);
  });
}

function listenStories() {
  const q = query(collection(db, 'stories'), orderBy('created_at', 'desc'), limit(50));
  onSnapshot(q, (snap) => {
    const now = Date.now();
    const list = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      const exp = Number(data.expires_at_ms || 0);
      if (exp && exp < now) return;
      list.push({ id: d.id, ...data });
    });
    renderStories(list);
  }, () => {
    renderStories([]);
  });
}

async function notifyAdmins(title, body, payload) {
  const senderId = currentUser?.uid || '';
  if (!senderId) return;

  const admins = await getDocs(query(collection(db, 'profiles'), where('is_admin', '==', true)));
  const jobs = [];
  admins.forEach((d) => {
    const adminId = d.id;
    const notifId = `post_report_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`;
    jobs.push(setDoc(doc(db, 'profiles', adminId, 'notifications', notifId), {
      type: 'post_report',
      title,
      body,
      payload: { sender_id: senderId, ...payload },
      read: false,
      created_at: serverTimestamp()
    }));
  });
  await Promise.all(jobs);
}

async function reportPost(postId) {
  const reason = String(prompt('Motivo da denúncia:', '') || '').trim();
  if (!reason) return;

  const ref = await addDoc(collection(db, 'reports'), {
    type: 'post',
    post_id: postId,
    reason,
    reported_by: currentUser.uid,
    created_at: serverTimestamp(),
    status: 'open'
  });

  await notifyAdmins('Denúncia de postagem', 'Uma postagem foi denunciada.', { report_id: ref.id, post_id: postId, reason });
  alert('Denúncia enviada.');
}

function closeRepostModal(result) {
  closeModal(repostModal);
  if (repostComment) repostComment.value = '';
  repostModalOriginal = null;
  if (repostModalResolve) {
    const resolve = repostModalResolve;
    repostModalResolve = null;
    resolve(result);
  }
}

function openRepostModal(original) {
  if (!repostModal) return Promise.resolve(null);
  if (repostModalResolve) closeRepostModal(null);

  repostModalOriginal = original || null;

  const a = original?.author || {};
  const name = String(a.nickname || a.full_name || original?.repost_of_username || original?.user_name || 'Aventureiro');
  const avatar = String(a.avatar_url || 'assets/default-avatar.png');
  const snippetBase = String(original?.text || '').trim();
  const isSheet = String(original?.type || '') === 'sheet';
  const snippet = snippetBase ? snippetBase : (isSheet ? 'Postou uma ficha' : 'Postagem');

  if (repostPreviewAvatar) repostPreviewAvatar.src = avatar;
  if (repostPreviewName) repostPreviewName.textContent = name;
  if (repostPreviewSnippet) repostPreviewSnippet.textContent = snippet;

  const img = String(original?.image_url || '').trim();
  if (repostPreviewMedia) {
    if (img) {
      repostPreviewMedia.style.display = 'block';
      repostPreviewMedia.innerHTML = `<img alt="" src="${esc(img)}">`;
    } else {
      repostPreviewMedia.style.display = 'none';
      repostPreviewMedia.innerHTML = '';
    }
  }

  if (repostComment) repostComment.value = '';
  openModal(repostModal);
  if (repostComment) repostComment.focus();

  return new Promise((resolve) => {
    repostModalResolve = resolve;
  });
}

async function toggleLike(postId, liked) {
  const ref = doc(db, 'posts', postId);
  await updateDoc(ref, {
    likes: liked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid)
  });
}

async function createRepost(original) {
  const text = await openRepostModal(original);
  if (text === null) return;
  const originalAuthor = original?.author || {};
  const originalName = originalAuthor.nickname || original?.user_name || 'Aventureiro';
  const originalText = String(original?.text || '');
  const originalImg = String(original?.image_url || '');
  const originalType = String(original?.type || 'text');
  await addDoc(collection(db, 'posts'), {
    type: 'repost',
    repost_of_username: originalName,
    repost_post_id: String(original?.id || ''),
    repost_snapshot: {
      post_id: String(original?.id || ''),
      type: originalType,
      author_name: originalName,
      text: originalText,
      image_url: originalImg
    },
    text: String(text || ''),
    author_id: currentUser.uid,
    author: getAuthorSnapshot(),
    likes: [],
    visibility: 'public',
    created_at: serverTimestamp()
  });
}

async function createComment(postId, text) {
  const t = String(text || '').trim();
  if (!t) return;

  await addDoc(collection(db, 'posts', postId, 'comments'), {
    text: t,
    author_id: currentUser.uid,
    author: getAuthorSnapshot(),
    created_at: serverTimestamp(),
    visibility: 'public'
  });

  await updateDoc(doc(db, 'posts', postId), {
    comments_count: increment(1)
  });
}

async function deletePost(postId) {
  await deleteDoc(doc(db, 'posts', postId));
}

async function hidePost(postId, hide) {
  await updateDoc(doc(db, 'posts', postId), {
    visibility: hide ? 'hidden' : 'public',
    moderated_at: serverTimestamp(),
    moderated_by: currentUser.uid
  });
}

async function editPost(post) {
  const current = String(post?.text || '');
  const next = String(prompt('Editar postagem:', current) || '').trim();
  if (!next) return;
  await updateDoc(doc(db, 'posts', post.id), {
    text: next,
    updated_at: serverTimestamp()
  });
}

function renderPostCard(post) {
  const wrapper = document.createElement('div');
  wrapper.className = 'post-card';

  const author = post.author || {};
  const avatar = author.avatar_url || 'assets/default-avatar.png';
  const name = author.nickname || 'Aventureiro';
  const createdMs = toMs(post.created_at);
  const timeLabel = formatAgo(createdMs);

  const likes = Array.isArray(post.likes) ? post.likes : [];
  const liked = likes.includes(currentUser.uid);
  const commentsCount = Number.isFinite(Number(post.comments_count)) ? Number(post.comments_count) : 0;

  const isOwner = post.author_id === currentUser.uid;
  const vis = String(post.visibility || 'public');

  wrapper.className = `post-card ${vis === 'hidden' ? 'is-hidden' : ''} ${post.type === 'sheet' ? 'is-sheet' : ''}`;
  wrapper.dataset.id = post.id;

  const header = document.createElement('div');
  header.className = 'post-header';
  header.dataset.action = 'open';

  header.innerHTML = `
    <div class="post-author" data-action="profile">
      <div class="post-avatar"><img alt="" src="${esc(avatar)}"></div>
      <div class="post-author-meta">
        <div class="post-author-name">${esc(name)}</div>
        <div class="post-author-sub">${esc(timeLabel)}${post.type === 'sheet' ? ' • Ficha' : ''}${post.type === 'repost' ? ' • Repost' : ''}</div>
      </div>
    </div>
    <div class="post-menu">
      <button class="icon-btn post-menu-toggle" type="button" title="Opções"><i class="fas fa-ellipsis-v"></i></button>
      <div class="post-menu-dropdown">
        <button class="post-menu-btn" type="button" data-action="report" title="Denunciar"><i class="fas fa-flag"></i> <span class="post-menu-text">Denunciar</span></button>
        ${(isOwner || isAdmin) ? `<button class="post-menu-btn" type="button" data-action="edit" title="Editar"><i class="fas fa-pen"></i> <span class="post-menu-text">Editar</span></button>` : ''}
        ${(isOwner || isAdmin) ? `<button class="post-menu-btn" type="button" data-action="delete" title="Apagar"><i class="fas fa-trash"></i> <span class="post-menu-text">Apagar</span></button>` : ''}
        ${isAdmin ? `<button class="post-menu-btn" type="button" data-action="hide" title="${vis === 'hidden' ? 'Reexibir' : 'Ocultar'}"><i class="fas fa-eye-slash"></i> <span class="post-menu-text">${vis === 'hidden' ? 'Reexibir' : 'Ocultar'}</span></button>` : ''}
      </div>
    </div>
  `;

  const content = document.createElement('div');
  content.className = 'post-content';
  content.textContent = String(post.text || '');

  const menuToggle = header.querySelector('.post-menu-toggle');
  const menuDropdown = header.querySelector('.post-menu-dropdown');
  if (menuToggle && menuDropdown) {
    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      // Fecha outros menus abertos
      document.querySelectorAll('.post-menu-dropdown.active').forEach(el => {
        if (el !== menuDropdown) el.classList.remove('active');
      });
      menuDropdown.classList.toggle('active');
    });
  }

  const media = document.createElement('div');
  media.className = 'post-media';
  media.style.display = 'none';

  if (post.type === 'sheet') {
    const sheetId = String(post.sheet_id || '').trim();
    const tpl = String(post.sheet_template || '').trim().toLowerCase();

    const cover = safeUrl(post.image_url) || (tpl === 'dnd' ? 'assets/dnd5e/page1.png' : '');
    media.style.display = 'block';
    media.classList.add('sheet-post-media');
    media.innerHTML = `
      <div class="sheet-post-card" style="--sheet-cover: url('${esc(cover)}');">
        <div class="sheet-post-bg"></div>
        <div class="sheet-post-overlay">
          <div class="sheet-post-title">${esc(String(post.title || 'Ficha'))}</div>
          <div class="sheet-post-stars" data-sheet-stars="0">${renderStars(0)}</div>
          <button class="sheet-post-open" type="button">Abrir</button>
        </div>
      </div>
    `;

    const starsEl = media.querySelector('.sheet-post-stars');
    if (starsEl && sheetId) {
      getSheetRatingStars(sheetId).then((n) => {
        starsEl.innerHTML = renderStars(n);
        starsEl.dataset.sheetStars = String(n);
      }).catch(() => {});
    }

    const btnOpen = media.querySelector('.sheet-post-open');
    if (btnOpen) {
      btnOpen.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const url = tpl === 'dnd'
          ? `ficha-dnd.html?id=${encodeURIComponent(sheetId)}&readonly=1`
          : `sheet-editor.html?id=${encodeURIComponent(sheetId)}&readonly=1`;
        window.open(url, '_blank', 'noopener');
      });
    }
  }

  const actions = document.createElement('div');
  actions.className = 'post-actions';
  actions.innerHTML = `
    <button class="post-action-btn ${liked ? 'active' : ''}" type="button" data-action="like">
      <i class="fas fa-heart"></i> ${likes.length}
    </button>
    <button class="post-action-btn" type="button" data-action="comment">
      <i class="fas fa-comment"></i> ${commentsCount}
    </button>
    <button class="post-action-btn" type="button" data-action="repost">
      <i class="fas fa-retweet"></i> Repostar
    </button>
  `;

  const commentBox = document.createElement('div');
  commentBox.className = 'post-comment-box';
  commentBox.innerHTML = `
    <textarea rows="2" placeholder="Escreva um comentário..."></textarea>
    <div style="display:flex; justify-content:flex-end; gap:10px;">
      <button class="btn-post btn-post-secondary" type="button" data-action="cancel-comment">Cancelar</button>
      <button class="btn-post" type="button" data-action="send-comment">Enviar</button>
    </div>
  `;

  wrapper.appendChild(header);

  if (vis === 'hidden') {
    const warn = document.createElement('div');
    warn.className = 'post-content';
    warn.style.color = 'var(--posts-muted)';
    warn.textContent = isAdmin ? 'Postagem ocultada (visível para admin).' : 'Postagem indisponível.';
    wrapper.appendChild(warn);
    if (isAdmin) wrapper.appendChild(content);
  } else if (vis === 'deleted') {
    const warn = document.createElement('div');
    warn.className = 'post-content';
    warn.style.color = 'var(--posts-muted)';
    warn.textContent = 'Postagem apagada.';
    wrapper.appendChild(warn);
  } else {
    if (post.type === 'repost') {
      const info = document.createElement('div');
      info.className = 'post-content';
      info.style.color = 'var(--posts-muted)';
      const whoRaw = String(post?.repost_snapshot?.author_name || post?.repost_of_username || post?.repost_of || '').trim();
      const looksLikeId = whoRaw && whoRaw.length >= 18 && !whoRaw.includes(' ') && !whoRaw.includes('.');
      const who = looksLikeId ? '' : whoRaw;
      info.textContent = who ? `Repost de ${who}` : 'Repost';
      wrapper.appendChild(info);

      const snap = post?.repost_snapshot || null;
      const fallbackId = !snap ? String(post?.repost_post_id || post?.repost_of || '').trim() : '';
      const canFallback = !!fallbackId && fallbackId.length >= 18 && !fallbackId.includes(' ');
      const effectiveSnap = snap;
      if (effectiveSnap) {
        const box = document.createElement('div');
        box.className = 'repost-box';
        const snapName = String(effectiveSnap.author_name || '').trim() || 'Aventureiro';
        const snapText = String(effectiveSnap.text || '').trim();
        const snapImg = String(effectiveSnap.image_url || '').trim();
        box.innerHTML = `
          <div class="repost-head">${esc(snapName)}</div>
          ${snapText ? `<div class="repost-text">${esc(snapText)}</div>` : ''}
          ${snapImg ? `<div class="repost-media"><img alt="" src="${esc(snapImg)}"></div>` : ''}
        `;
        const pid = String(effectiveSnap.post_id || '').trim();
        if (pid) {
          box.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = `post.html?id=${encodeURIComponent(pid)}&from=${encodeURIComponent('posts.html')}`;
          });
        }
        wrapper.appendChild(box);
      } else if (canFallback) {
        const box = document.createElement('div');
        box.className = 'repost-box';
        box.innerHTML = `<div class="repost-head">Carregando repost...</div>`;
        wrapper.appendChild(box);
        resolveRepostSnapshot(fallbackId).then((resolved) => {
          if (!resolved) {
            box.innerHTML = `<div class="repost-head">Repost</div>`;
            return;
          }
          const snapName = String(resolved.author_name || '').trim() || 'Aventureiro';
          const snapText = String(resolved.text || '').trim();
          const snapImg = String(resolved.image_url || '').trim();
          box.innerHTML = `
            <div class="repost-head">${esc(snapName)}</div>
            ${snapText ? `<div class="repost-text">${esc(snapText)}</div>` : ''}
            ${snapImg ? `<div class="repost-media"><img alt="" src="${esc(snapImg)}"></div>` : ''}
          `;
          const pid = String(resolved.post_id || '').trim();
          if (pid) {
            box.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              window.location.href = `post.html?id=${encodeURIComponent(pid)}&from=${encodeURIComponent('posts.html')}`;
            });
          }
        }).catch(() => {});
      }
    }
    if (post.type !== 'repost' || String(post.text || '').trim()) wrapper.appendChild(content);
    wrapper.appendChild(media);
  }

  wrapper.appendChild(actions);
  wrapper.appendChild(commentBox);

  wrapper.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    const act = btn?.dataset?.action;
    if (!act && e.target.closest('[data-action="profile"]')) {
      const uid = String(post.author_id || '').trim();
      if (uid) window.location.href = `profile.html?uid=${encodeURIComponent(uid)}`;
      return;
    }
    if (!act && e.target.closest('[data-action="open"]')) {
      window.location.href = `post.html?id=${encodeURIComponent(post.id)}&from=${encodeURIComponent('posts.html')}`;
      return;
    }
    if (!act) return;
    e.preventDefault();
    e.stopPropagation();

    if (act === 'like') {
      await toggleLike(post.id, liked);
      return;
    }
    if (act === 'comment') {
      commentBox.style.display = commentBox.style.display === 'flex' ? 'none' : 'flex';
      return;
    }
    if (act === 'cancel-comment') {
      commentBox.style.display = 'none';
      return;
    }
    if (act === 'send-comment') {
      const ta = commentBox.querySelector('textarea');
      const val = String(ta?.value || '').trim();
      if (!val) return;
      await createComment(post.id, val);
      ta.value = '';
      commentBox.style.display = 'none';
      return;
    }
    if (act === 'repost') {
      await createRepost(post);
      return;
    }
    if (act === 'report') {
      await reportPost(post.id);
      return;
    }
    if (act === 'delete') {
      if (confirm('Apagar esta postagem?')) {
        wrapper.remove();
        await deletePost(post.id);
      }
      return;
    }
    if (act === 'edit') {
      await editPost(post);
      return;
    }
    if (act === 'hide') {
      await hidePost(post.id, vis !== 'hidden');
      return;
    }
  });

  return wrapper;
}

function renderFeed(posts) {
  if (!feedList) return;
  feedList.innerHTML = '';

  if (!posts.length) {
    if (feedEmpty) feedEmpty.style.display = 'block';
    return;
  }
  if (feedEmpty) feedEmpty.style.display = 'none';

  posts.forEach((p) => feedList.appendChild(renderPostCard(p)));
}

function listenPosts() {
  const q = query(collection(db, 'posts'), orderBy('created_at', 'desc'), limit(50));
  onSnapshot(q, (snap) => {
    const now = Date.now();
    const list = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      const id = d.id;
      const vis = String(data.visibility || 'public');
      if (vis === 'deleted') return;
      if (!isAdmin && vis !== 'public') return;
      const exp = Number(data.expires_at_ms || 0);
      if (exp && exp < now) return;
      list.push({ id, ...data });
    });
    renderFeed(list);
  }, () => {
    renderFeed([]);
  });
}

async function createPost() {
  const text = String(composerText?.value || '').trim();
  if (!text && composerType !== 'sheet') return;

  const data = {
    type: composerType,
    text: text || '',
    author_id: currentUser.uid,
    author: getAuthorSnapshot(),
    likes: [],
    comments_count: 0,
    visibility: 'public',
    created_at: serverTimestamp()
  };

  if (composerType === 'sheet') {
    const selectedOption = composerSheetSelect.options[composerSheetSelect.selectedIndex];
    if (!selectedOption || !selectedOption.value) {
      alert('Selecione uma ficha.');
      return;
    }
    
    const sheetId = selectedOption.value;
    const sheetTitle = selectedOption.textContent;
    const sheetImg = selectedOption.dataset.photo;
    const sheetTemplate = String(selectedOption.dataset.template || 'free');
    
    if (!sheetImg && sheetTemplate.toLowerCase() !== 'dnd') {
      alert('Esta ficha não possui uma imagem de perfil. Adicione uma foto na ficha antes de postar.');
      return;
    }
    
    if (sheetImg) data.image_url = sheetImg;
    data.title = sheetTitle;
    data.sheet_id = sheetId;
    data.sheet_template = sheetTemplate;
  }

  await addDoc(collection(db, 'posts'), data);
  if (composerText) composerText.value = '';
  if (composerSheetSelect) composerSheetSelect.value = '';
  if (composerSheetPreview) composerSheetPreview.style.display = 'none';
  setComposerType('text');
}

function openReportsModal() {
  openModal(reportsModal);
}

function renderReports(items) {
  if (!reportsList) return;
  reportsList.innerHTML = '';
  items.forEach((r) => {
    const el = document.createElement('div');
    el.className = 'report-item';
    el.innerHTML = `
      <div class="report-row"><strong>Post:</strong> <span>${esc(r.post_id || '')}</span></div>
      <div class="report-row"><strong>Motivo:</strong> <span>${esc(r.reason || '')}</span></div>
      <div class="report-row"><strong>Por:</strong> <span>${esc(r.reported_by || '')}</span></div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
        <button class="btn-post btn-post-secondary" type="button" data-action="open">Abrir</button>
        <button class="btn-post btn-post-secondary" type="button" data-action="hide">Ocultar Post</button>
        <button class="btn-post" type="button" data-action="resolve">Resolver</button>
      </div>
    `;

    el.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      const act = btn?.dataset?.action;
      if (!act) return;
      e.preventDefault();
      e.stopPropagation();

      if (act === 'open') {
        window.location.href = `post.html?id=${encodeURIComponent(r.post_id)}&from=${encodeURIComponent('posts.html')}`;
        return;
      }
      if (act === 'hide') {
        await hidePost(r.post_id, true);
        return;
      }
      if (act === 'resolve') {
        await updateDoc(doc(db, 'reports', r.id), { status: 'resolved', resolved_at: serverTimestamp(), resolved_by: currentUser.uid });
        return;
      }
    });

    reportsList.appendChild(el);
  });
}

function listenReports() {
  if (!isAdmin) return;
  const q = query(collection(db, 'reports'), orderBy('created_at', 'desc'), limit(50));
  onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      if (data.status !== 'open') return;
      list.push({ id: d.id, ...data });
    });
    renderReports(list);
  }, () => {
    renderReports([]);
  });
}

function wireComposer() {
  document.querySelectorAll('.composer-tab').forEach((b) => b.addEventListener('click', () => setComposerType(String(b.dataset.type || 'text'))));
  if (btnPost) btnPost.onclick = () => createPost().catch(() => {});
  if (btnClear) btnClear.onclick = () => {
    if (composerText) composerText.value = '';
    if (composerSheetSelect) composerSheetSelect.value = '';
    if (composerSheetPreview) composerSheetPreview.style.display = 'none';
    setComposerType('text');
  };
}

function wireAdmin() {
  if (btnOpenReports) btnOpenReports.onclick = () => openReportsModal();
  if (btnReportsClose) btnReportsClose.onclick = () => closeModal(reportsModal);
  if (reportsModal) {
    reportsModal.addEventListener('click', (e) => {
      if (e.target === reportsModal) closeModal(reportsModal);
    });
  }
}

function wireRepostModal() {
  if (btnRepostClose) btnRepostClose.onclick = () => closeRepostModal(null);
  if (btnRepostCancel) btnRepostCancel.onclick = () => closeRepostModal(null);
  if (btnRepostSubmit) btnRepostSubmit.onclick = () => closeRepostModal(String(repostComment?.value || '').trim());
  if (repostModal) {
    repostModal.addEventListener('click', (e) => {
      if (e.target === repostModal) closeRepostModal(null);
    });
  }
  if (repostComment) {
    repostComment.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRepostModal(null);
        return;
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        closeRepostModal(String(repostComment.value || '').trim());
      }
    });
  }
}

// Eventos Globais
document.addEventListener('click', (e) => {
  if (!e.target.closest('.post-menu')) {
    document.querySelectorAll('.post-menu-dropdown.active').forEach(el => {
      el.classList.remove('active');
    });
  }
});

async function init() {
  await ensureAuth();
  if (!currentUser) return;

  wireComposer();
  wireStoryModal();
  wireCreateStoryModal();
  wireAdmin();
  wireRepostModal();

  listenStories();
  listenPosts();
  listenReports();
}

init().catch(() => {});
