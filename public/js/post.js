import {
  waitForAuth,
  db,
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
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
  const maxFit = Math.min(Math.max(Math.floor(window.innerHeight * 0.78), 320), 620);
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

const params = new URLSearchParams(window.location.search);
const postId = String(params.get('id') || '').trim();
const from = String(params.get('from') || 'posts.html').trim();

const btnBack = getEl('btn-back');
const postContainer = getEl('post-container');
const commentsList = getEl('comments-list');
const commentText = getEl('comment-text');
const btnSendComment = getEl('btn-send-comment');

let currentUser = null;
let currentProfile = null;
let isAdmin = false;
let postCache = null;

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
  return u;
}

function authorSnapshotFromProfile() {
  const nickname = currentProfile?.nickname || currentProfile?.full_name || currentUser?.displayName || 'Aventureiro';
  return {
    nickname,
    avatar_url: currentProfile?.avatar_url || currentUser?.photoURL || '',
    current_frame: (currentProfile?.current_frame || 'wood').toLowerCase()
  };
}

async function toggleLike(liked) {
  if (!postId) return;
  await updateDoc(doc(db, 'posts', postId), {
    likes: liked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid)
  });
}

async function createComment() {
  const t = String(commentText?.value || '').trim();
  if (!t || !postId) return;
  await addDoc(collection(db, 'posts', postId, 'comments'), {
    text: t,
    author_id: currentUser.uid,
    author: authorSnapshotFromProfile(),
    created_at: serverTimestamp(),
    visibility: 'public'
  });
  await updateDoc(doc(db, 'posts', postId), { comments_count: increment(1) });
  commentText.value = '';
}

async function deletePost() {
  await deleteDoc(doc(db, 'posts', postId));
}

async function hidePost(hide) {
  await updateDoc(doc(db, 'posts', postId), {
    visibility: hide ? 'hidden' : 'public',
    moderated_at: serverTimestamp(),
    moderated_by: currentUser.uid
  });
}

async function editPost() {
  const current = String(postCache?.text || '');
  const next = String(prompt('Editar postagem:', current) || '').trim();
  if (!next) return;
  await updateDoc(doc(db, 'posts', postId), { text: next, updated_at: serverTimestamp() });
}

function renderPost(post) {
  if (!postContainer) return;
  postContainer.innerHTML = '';
  postCache = post;

  const author = post.author || {};
  const avatar = author.avatar_url || 'assets/default-avatar.png';
  const name = author.nickname || 'Aventureiro';
  const createdMs = toMs(post.created_at);
  const timeLabel = formatAgo(createdMs);
  const likes = Array.isArray(post.likes) ? post.likes : [];
  const liked = likes.includes(currentUser.uid);
  const isOwner = post.author_id === currentUser.uid;
  const vis = String(post.visibility || 'public');
  const commentsCount = Number.isFinite(Number(post.comments_count)) ? Number(post.comments_count) : 0;

  const commentsTitle = document.querySelector('.comments-title');
  if (commentsTitle) commentsTitle.textContent = `Comentários (${commentsCount})`;

  const repostSnap = post?.type === 'repost' ? (post?.repost_snapshot || null) : null;
  const fallbackId = String(post?.repost_post_id || post?.repost_of || '').trim();
  const canFallback = !repostSnap && fallbackId && fallbackId.length >= 18 && !fallbackId.includes(' ');
  const repostWho = String(repostSnap?.author_name || post?.repost_of_username || post?.repost_of || '').trim();
  const repostPid = String(repostSnap?.post_id || fallbackId || '').trim();
  const repostText = String(repostSnap?.text || '').trim();
  const repostImg = String(repostSnap?.image_url || '').trim();
  const repostHtml = (repostSnap || canFallback) ? `
    <div class="repost-box" style="margin-top:12px;" ${repostPid ? `data-repost-post-id="${esc(repostPid)}"` : ''} ${canFallback ? `data-repost-fallback="1"` : ''}>
      <div class="repost-head">${esc(repostWho || (canFallback ? 'Carregando repost...' : 'Aventureiro'))}</div>
      ${repostText ? `<div class="repost-text">${esc(repostText)}</div>` : ''}
      ${repostImg ? `<div class="repost-media"><img alt="" src="${esc(repostImg)}"></div>` : ''}
    </div>
  ` : '';

  const root = document.createElement('div');
  root.className = `post-card ${post.type === 'sheet' ? 'is-sheet' : ''}`;

  const sheetId = String(post.sheet_id || '').trim();
  const sheetTpl = String(post.sheet_template || '').trim().toLowerCase();
  const sheetCoverHtml = (post.type === 'sheet' && sheetId) ? (() => {
    const cover = safeUrl(post.image_url) || (sheetTpl === 'dnd' ? 'assets/dnd5e/page1.png' : '');
    return `
      <div class="post-media sheet-media sheet-post-media" style="margin-top:12px;">
        <div class="sheet-post-card" style="--sheet-cover: url('${esc(cover)}');">
          <div class="sheet-post-bg"></div>
          <div class="sheet-post-overlay">
            <div class="sheet-post-title">${esc(String(post.title || 'Ficha'))}</div>
            <div class="sheet-post-stars" data-sheet-stars="0">${renderStars(0)}</div>
            <button class="sheet-post-open" type="button" data-sheet-id="${esc(sheetId)}" data-sheet-tpl="${esc(sheetTpl)}">Abrir</button>
          </div>
        </div>
      </div>
    `;
  })() : '';

  root.innerHTML = `
    <div class="post-header" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
      <div class="post-author" data-action="profile" style="display:flex; gap:10px; align-items:center; min-width:0; cursor:pointer;">
        <div class="post-avatar" style="width:44px; height:44px; border-radius:14px; border:2px solid rgba(201,168,76,0.22); overflow:hidden; flex:0 0 44px;">
          <img alt="" src="${esc(avatar)}" style="width:100%; height:100%; object-fit:cover;">
        </div>
        <div style="display:flex; flex-direction:column; gap:2px; overflow:hidden;">
          <div style="font-weight:900; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(name)}</div>
          <div style="font-size:0.75rem; color: var(--elara-text-dim);">${esc(timeLabel)}${post.type === 'repost' ? ' • Repost' : ''}${post.type === 'sheet' ? ' • Ficha' : ''}</div>
        </div>
      </div>
      ${(isOwner || isAdmin) ? `
        <div class="post-menu">
          <button class="icon-btn post-menu-toggle" type="button" title="Opções"><i class="fas fa-ellipsis-v"></i></button>
          <div class="post-menu-dropdown">
            <button class="post-menu-btn" type="button" data-action="edit" title="Editar"><i class="fas fa-pen"></i> <span class="post-menu-text">Editar</span></button>
            <button class="post-menu-btn" type="button" data-action="delete" title="Apagar"><i class="fas fa-trash"></i> <span class="post-menu-text">Apagar</span></button>
            ${isAdmin ? `<button class="post-menu-btn" type="button" data-action="hide" title="${vis === 'hidden' ? 'Reexibir' : 'Ocultar'}"><i class="fas fa-eye-slash"></i> <span class="post-menu-text">${vis === 'hidden' ? 'Reexibir' : 'Ocultar'}</span></button>` : ''}
          </div>
        </div>
      ` : ''}
    </div>
    ${repostHtml}
    ${(post.type !== 'repost' || String(post.text || '').trim()) ? `<div class="post-content" style="margin-top:12px; white-space:pre-wrap; line-height:1.6;">${esc(post.text || '')}</div>` : ''}
    ${sheetCoverHtml}
    <div class="post-actions" style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
      <button id="btn-like" class="btn-post" type="button" style="height:38px; background:${liked ? 'rgba(201,168,76,0.22)' : 'rgba(10,6,8,0.35)'}; border-color: rgba(201,168,76,0.18);">${liked ? 'Curtido' : 'Curtir'} (${likes.length})</button>
    </div>
  `;

  if (vis === 'hidden' && !isAdmin) {
    root.querySelector('.post-content').textContent = 'Postagem indisponível.';
  }
  if (vis === 'deleted') {
    root.querySelector('.post-content').textContent = 'Postagem apagada.';
  }

  postContainer.appendChild(root);

  const btnPrev = root.querySelector('.sheet-nav-prev');
  const btnNext = root.querySelector('.sheet-nav-next');
  if (btnPrev) btnPrev.remove();
  if (btnNext) btnNext.remove();

  const starsEl = root.querySelector('.sheet-post-stars');
  if (starsEl && sheetId) {
    getSheetRatingStars(sheetId).then((n) => {
      starsEl.innerHTML = renderStars(n);
      starsEl.dataset.sheetStars = String(n);
    }).catch(() => {});
  }

  const btnOpen = root.querySelector('.sheet-post-open');
  if (btnOpen) {
    btnOpen.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = String(btnOpen.dataset.sheetId || '').trim();
      const tpl = String(btnOpen.dataset.sheetTpl || '').trim().toLowerCase();
      const url = tpl === 'dnd'
        ? `ficha-dnd.html?id=${encodeURIComponent(id)}&readonly=1`
        : `sheet-editor.html?id=${encodeURIComponent(id)}&readonly=1`;
      window.open(url, '_blank', 'noopener');
    });
  }

  const menuToggle = root.querySelector('.post-menu-toggle');
  const menuDropdown = root.querySelector('.post-menu-dropdown');
  if (menuToggle && menuDropdown) {
    menuToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.querySelectorAll('.post-menu-dropdown.active').forEach((el) => {
        if (el !== menuDropdown) el.classList.remove('active');
      });
      menuDropdown.classList.toggle('active');
    });
  }

  const authorEl = root.querySelector('[data-action="profile"]');
  if (authorEl) {
    authorEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const uid = String(post.author_id || '').trim();
      if (uid) window.location.href = `profile.html?uid=${encodeURIComponent(uid)}`;
    });
  }

  const repostBox = root.querySelector('.repost-box');
  if (repostBox) {
    repostBox.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pid = repostBox.getAttribute('data-repost-post-id');
      if (pid) window.location.href = `post.html?id=${encodeURIComponent(pid)}&from=${encodeURIComponent('post.html?id=' + postId)}`;
    });
    const needFallback = repostBox.getAttribute('data-repost-fallback') === '1';
    if (needFallback) {
      const pid = repostBox.getAttribute('data-repost-post-id');
      if (pid) {
        getDoc(doc(db, 'posts', pid)).then((snap) => {
          if (!snap.exists()) return;
          const data = snap.data() || {};
          const a = data.author || {};
          const name = String(a.nickname || a.full_name || 'Aventureiro');
          const t = String(data.text || '').trim();
          const img = String(data.image_url || '').trim();
          repostBox.innerHTML = `
            <div class="repost-head">${esc(name)}</div>
            ${t ? `<div class="repost-text">${esc(t)}</div>` : ''}
            ${img ? `<div class="repost-media"><img alt="" src="${esc(img)}"></div>` : ''}
          `;
        }).catch(() => {});
      }
    }
  }

  const btnLike = getEl('btn-like');
  if (btnLike) btnLike.onclick = () => toggleLike(liked).catch(() => {});

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    const act = btn?.dataset?.action;
    if (!act) return;
    e.preventDefault();
    e.stopPropagation();
    if (act === 'edit') {
      editPost().catch(() => {});
      if (menuDropdown) menuDropdown.classList.remove('active');
      return;
    }
    if (act === 'delete') {
      if (confirm('Apagar esta postagem?')) {
        if (postContainer) postContainer.textContent = 'Apagando...';
        deletePost().catch(() => {});
      }
      if (menuDropdown) menuDropdown.classList.remove('active');
      return;
    }
    if (act === 'hide') {
      hidePost(vis !== 'hidden').catch(() => {});
      if (menuDropdown) menuDropdown.classList.remove('active');
      return;
    }
  });
}

function listenPost() {
  if (!postId) {
    if (postContainer) postContainer.textContent = 'Postagem inválida.';
    return;
  }
  onSnapshot(doc(db, 'posts', postId), (snap) => {
    if (!snap.exists()) {
      if (postContainer) postContainer.textContent = 'Postagem não encontrada.';
      setTimeout(() => {
        window.location.href = from || 'posts.html';
      }, 600);
      return;
    }
    const data = snap.data() || {};
    const vis = String(data.visibility || 'public');
    if (vis === 'deleted') {
      if (postContainer) postContainer.textContent = 'Postagem apagada.';
      setTimeout(() => {
        window.location.href = from || 'posts.html';
      }, 600);
      return;
    }
    renderPost({ id: snap.id, ...data });
  }, () => {
    if (postContainer) postContainer.textContent = 'Erro ao carregar postagem.';
  });
}

function listenComments() {
  if (!postId || !commentsList) return;
  const q = query(collection(db, 'posts', postId, 'comments'), orderBy('created_at', 'asc'));
  onSnapshot(q, (snap) => {
    commentsList.innerHTML = '';
    snap.forEach((d) => {
      const c = d.data() || {};
      const vis = String(c.visibility || 'public');
      if (!isAdmin && vis !== 'public') return;
      const meta = c.author || {};
      const name = meta.nickname || 'Aventureiro';
      const ago = formatAgo(toMs(c.created_at));
      const isOwner = c.author_id === currentUser.uid;
      const canDelete = isOwner || isAdmin;
      const canHide = isAdmin;

      const item = document.createElement('div');
      item.className = 'comment-item';
      item.innerHTML = `
        <div class="comment-meta" style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
          <div style="display:flex; gap:10px; align-items:center;">
            <strong>${esc(name)}</strong><span>${esc(ago)}</span>
          </div>
          ${(canHide || canDelete) ? `
            <div class="post-menu comment-menu">
              <button class="icon-btn post-menu-toggle" type="button" title="Opções"><i class="fas fa-ellipsis-v"></i></button>
              <div class="post-menu-dropdown">
                ${canHide ? `<button class="post-menu-btn" type="button" data-action="edit" title="Editar"><i class="fas fa-pen"></i> <span class="post-menu-text">Editar</span></button>` : ''}
                ${canHide ? `<button class="post-menu-btn" type="button" data-action="hide" title="${vis === 'hidden' ? 'Reexibir' : 'Ocultar'}"><i class="fas fa-eye-slash"></i> <span class="post-menu-text">${vis === 'hidden' ? 'Reexibir' : 'Ocultar'}</span></button>` : ''}
                ${canDelete ? `<button class="post-menu-btn" type="button" data-action="delete" title="Apagar"><i class="fas fa-trash"></i> <span class="post-menu-text">Apagar</span></button>` : ''}
              </div>
            </div>
          ` : ''}
        </div>
        <div class="comment-text">${esc(vis === 'deleted' ? 'Comentário apagado.' : (vis === 'hidden' && !isAdmin ? 'Comentário oculto.' : (c.text || '')))}</div>
      `;

      const cMenuToggle = item.querySelector('.post-menu-toggle');
      const cMenuDropdown = item.querySelector('.post-menu-dropdown');
      if (cMenuToggle && cMenuDropdown) {
        cMenuToggle.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          document.querySelectorAll('.post-menu-dropdown.active').forEach((el) => {
            if (el !== cMenuDropdown) el.classList.remove('active');
          });
          cMenuDropdown.classList.toggle('active');
        });
      }

      item.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        const act = btn?.dataset?.action;
        if (!act) return;
        e.preventDefault();
        e.stopPropagation();
        if (cMenuDropdown) cMenuDropdown.classList.remove('active');

        if (act === 'hide' && canHide) {
          await updateDoc(doc(db, 'posts', postId, 'comments', d.id), {
            visibility: vis === 'hidden' ? 'public' : 'hidden',
            moderated_at: serverTimestamp(),
            moderated_by: currentUser.uid
          });
          return;
        }

        if (act === 'edit' && canHide) {
          const current = String(c.text || '');
          const next = String(prompt('Editar comentário:', current) || '').trim();
          if (!next) return;
          await updateDoc(doc(db, 'posts', postId, 'comments', d.id), {
            text: next,
            edited_at: serverTimestamp(),
            edited_by: currentUser.uid
          });
          return;
        }

        if (act === 'delete' && canDelete) {
          if (!confirm('Apagar este comentário?')) return;
          await updateDoc(doc(db, 'posts', postId, 'comments', d.id), {
            visibility: 'deleted',
            deleted_at: serverTimestamp(),
            deleted_by: currentUser.uid
          });
          if (vis !== 'deleted') {
            await updateDoc(doc(db, 'posts', postId), { comments_count: increment(-1) });
          }
        }
      });
      commentsList.appendChild(item);
    });
  }, () => {
    commentsList.innerHTML = '';
  });
}

async function init() {
  await ensureAuth();
  if (!currentUser) return;

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.post-menu')) {
      document.querySelectorAll('.post-menu-dropdown.active').forEach((el) => el.classList.remove('active'));
    }
  });

  if (btnBack) {
    btnBack.onclick = () => {
      if (history.length > 1) {
        history.back();
      } else {
        window.location.href = from || 'posts.html';
      }
    };
  }

  if (btnSendComment) btnSendComment.onclick = () => createComment().catch(() => {});

  listenPost();
  listenComments();
}

init().catch(() => {});
