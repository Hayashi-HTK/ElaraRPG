import { auth, db, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, getDoc, doc, waitForAuth, setDoc, where, updateDoc } from './firebase.js';

const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => (
  c === '&' ? '&amp;' :
  c === '<' ? '&lt;' :
  c === '>' ? '&gt;' :
  c === '"' ? '&quot;' : '&#39;'
));

const normalizeTag = (t) => {
  const v = String(t || '').toLowerCase().trim();
  if (v === 'novo' || v === 'new') return 'new';
  if (v === 'melhoria' || v === 'ui') return 'ui';
  if (v === 'correção' || v === 'correcao' || v === 'fix') return 'fix';
  return 'ui';
};

const tagLabel = (t) => (t === 'new' ? 'Novo' : t === 'fix' ? 'Correção' : 'Melhoria');

const renderUpdates = (list) => {
  const timeline = document.getElementById('updates-timeline');
  if (!timeline) return;
  timeline.innerHTML = '';

  if (!list.length) {
    timeline.innerHTML = `<div class="release-card" style="opacity: 0.85;"><div class="release-header"><div class="release-title"><span class="version-badge" style="background: rgba(255,255,255,0.16);">v0.0.0</span><h2 style="margin:0; font-size:1.2rem;">Sem atualizações</h2></div><span class="release-date">—</span></div><div class="release-content"><ul><li><span class="tag ui">Melhoria</span>As atualizações aparecerão aqui assim que forem publicadas.</li></ul></div></div>`;
    return;
  }

  list.forEach((u) => {
    const version = escapeHtml(u.version || 'v1.0.0');
    const title = escapeHtml(u.title || 'Atualização');
    const dateLabel = escapeHtml(u.date_label || '');
    const items = Array.isArray(u.items) ? u.items : [];
    const li = items.map((it) => {
      const tag = normalizeTag(it?.tag);
      const text = escapeHtml(it?.text || '');
      if (!text) return '';
      return `<li><span class="tag ${tag}">${tagLabel(tag)}</span>${text}</li>`;
    }).filter(Boolean).join('');

    const card = document.createElement('div');
    card.className = 'release-card';
    card.innerHTML = `
      <div class="release-header">
        <div class="release-title">
          <span class="version-badge">${version}</span>
          <h2 style="margin: 0; font-size: 1.3rem;">${title}</h2>
        </div>
        <span class="release-date">${dateLabel}</span>
      </div>
      <div class="release-content">
        <ul>${li || `<li><span class="tag ui">Melhoria</span>Sem itens detalhados.</li>`}</ul>
      </div>
    `;
    timeline.appendChild(card);
  });
};

const setAdminPanelVisible = (visible) => {
  const panel = document.getElementById('updates-admin-panel');
  if (panel) panel.style.display = visible ? 'block' : 'none';
  const pay = document.getElementById('payments-admin-panel');
  if (pay) pay.style.display = visible ? 'block' : 'none';
};

const fmtBRL = (value) => {
  const v = Number.isFinite(value) ? value : Number(String(value || '').replace(',', '.'));
  if (!Number.isFinite(v)) return 'R$ 0,00';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const esc = escapeHtml;

const renderPlanRequests = (list) => {
  const wrap = document.getElementById('payment-requests-list');
  if (!wrap) return;
  if (!list.length) {
    wrap.innerHTML = '<div style="opacity:0.75;">Nenhum pagamento pendente.</div>';
    return;
  }
  wrap.innerHTML = list.map((r) => {
    const name = esc(r.user_name || r.user_email || r.user_id || '—');
    const plan = esc(r.plan || '—');
    const amount = fmtBRL(r.amount);
    const txid = esc(r.txid || '—');
    return `
      <div style="display:flex; gap:12px; align-items:flex-start; justify-content:space-between; padding: 12px 0; border-top: 1px solid rgba(255,255,255,0.06);">
        <div style="min-width:0;">
          <div style="font-weight:900;">${name}</div>
          <div style="opacity:0.75; font-size:0.92rem;">Plano: <strong>${plan}</strong> • ${amount}</div>
          <div style="opacity:0.6; font-size:0.85rem;">TXID: ${txid}</div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
          <button class="upd-btn" data-action="approve" data-id="${esc(r.id)}">Aprovar</button>
          <button class="upd-btn" data-action="reject" data-id="${esc(r.id)}">Recusar</button>
        </div>
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('button[data-action][data-id]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const id = btn.getAttribute('data-id');
      const action = btn.getAttribute('data-action');
      if (!id || !action) return;
      btn.disabled = true;
      const prev = btn.textContent;
      btn.textContent = 'Salvando...';
      try {
        if (action === 'approve') {
          await updateDoc(doc(db, 'plan_requests', id), {
            status: 'approved',
            approved_at: serverTimestamp(),
            approved_by: auth.currentUser?.uid || null
          });
        }
        if (action === 'reject') {
          await updateDoc(doc(db, 'plan_requests', id), {
            status: 'rejected',
            rejected_at: serverTimestamp(),
            rejected_by: auth.currentUser?.uid || null
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });
  });
};

const readAdminFlag = async (user) => {
  if (!user) return false;
  try {
    const p = await getDoc(doc(db, 'profiles', user.uid));
    const d = p.exists() ? (p.data() || {}) : {};
    return !!d.is_admin || user.email === 'hayagames@outlook.com';
  } catch {
    return user.email === 'hayagames@outlook.com';
  }
};

const getFormData = () => {
  const version = document.getElementById('upd-version')?.value?.trim() || '';
  const title = document.getElementById('upd-title')?.value?.trim() || '';
  const dateLabel = document.getElementById('upd-date-label')?.value?.trim() || '';
  const itemsWrap = document.getElementById('upd-items');
  const items = [];
  if (itemsWrap) {
    const rows = itemsWrap.querySelectorAll('.upd-item-row');
    rows.forEach((row) => {
      const tag = normalizeTag(row.querySelector('select')?.value);
      const text = row.querySelector('input')?.value?.trim() || '';
      if (!text) return;
      items.push({ tag, text });
    });
  }
  return { version, title, dateLabel, items };
};

const resetForm = () => {
  const v = document.getElementById('upd-version');
  const t = document.getElementById('upd-title');
  const d = document.getElementById('upd-date-label');
  if (v) v.value = '';
  if (t) t.value = '';
  if (d) d.value = '';
  const itemsWrap = document.getElementById('upd-items');
  if (itemsWrap) itemsWrap.innerHTML = '';
  addItemRow('new', 'Nova funcionalidade...');
  addItemRow('ui', 'Melhoria de interface...');
  addItemRow('fix', 'Correção de bug...');
};

const addItemRow = (tag = 'ui', placeholder = '') => {
  const itemsWrap = document.getElementById('upd-items');
  if (!itemsWrap) return;
  const row = document.createElement('div');
  row.className = 'upd-item-row';
  row.innerHTML = `
    <select>
      <option value="new"${tag === 'new' ? ' selected' : ''}>Novo</option>
      <option value="ui"${tag === 'ui' ? ' selected' : ''}>Melhoria</option>
      <option value="fix"${tag === 'fix' ? ' selected' : ''}>Correção</option>
    </select>
    <input type="text" placeholder="${escapeHtml(placeholder)}">
    <button type="button" class="upd-remove">×</button>
  `;
  row.querySelector('.upd-remove')?.addEventListener('click', () => row.remove());
  itemsWrap.appendChild(row);
};

document.addEventListener('DOMContentLoaded', async () => {
  const q = query(collection(db, 'updates'), orderBy('created_at', 'desc'), limit(20));
  onSnapshot(q, (snap) => {
    const list = [];
    snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
    renderUpdates(list);
  }, () => {
    renderUpdates([]);
  });

  const user = await waitForAuth();
  const isAdmin = await readAdminFlag(user);
  setAdminPanelVisible(isAdmin);

  if (isAdmin) {
    try {
      const cfgSnap = await getDoc(doc(db, 'app_config', 'payment'));
      const cfg = cfgSnap.exists() ? (cfgSnap.data() || {}) : {};
      const elBackend = document.getElementById('mp-backend-url');
      const elBasic = document.getElementById('pix-basic');
      const elPremium = document.getElementById('pix-premium');
      if (elBackend) elBackend.value = String(cfg.mp_backend_base_url || '').trim();
      if (elBasic) elBasic.value = String(cfg.basic_amount ?? 19.9);
      if (elPremium) elPremium.value = String(cfg.premium_amount ?? 49.9);
    } catch {}

    const formPayCfg = document.getElementById('payment-config-form');
    const statusEl = document.getElementById('payment-config-status');
    if (formPayCfg) {
      formPayCfg.addEventListener('submit', async (e) => {
        e.preventDefault();
        const elBackend = document.getElementById('mp-backend-url');
        const elBasic = document.getElementById('pix-basic');
        const elPremium = document.getElementById('pix-premium');
        const mp_backend_base_url = String(elBackend?.value || '').trim();
        const basic_amount = Number(String(elBasic?.value || '').replace(',', '.'));
        const premium_amount = Number(String(elPremium?.value || '').replace(',', '.'));
        if (statusEl) {
          statusEl.textContent = 'Salvando...';
          statusEl.style.color = 'rgba(255,255,255,0.7)';
        }
        try {
          await setDoc(doc(db, 'app_config', 'payment'), {
            mp_backend_base_url,
            basic_amount: Number.isFinite(basic_amount) ? basic_amount : 19.9,
            premium_amount: Number.isFinite(premium_amount) ? premium_amount : 49.9,
            updated_at: serverTimestamp(),
            updated_by: auth.currentUser?.uid || null
          }, { merge: true });
          if (statusEl) {
            statusEl.textContent = 'Configuração salva.';
            statusEl.style.color = '#4ade80';
          }
        } catch (err) {
          console.error(err);
          if (statusEl) {
            statusEl.textContent = 'Erro ao salvar configuração.';
            statusEl.style.color = '#ef4444';
          }
        }
      });
    }

    const qReq = query(collection(db, 'plan_requests'), where('status', '==', 'pending'), orderBy('created_at', 'desc'), limit(50));
    onSnapshot(qReq, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      renderPlanRequests(list);
    }, () => {
      renderPlanRequests([]);
    });
  }

  const btnAddItem = document.getElementById('btn-upd-add-item');
  if (btnAddItem) btnAddItem.addEventListener('click', () => addItemRow('ui', 'Descreva a mudança...'));

  const form = document.getElementById('updates-admin-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = auth.currentUser;
      const ok = await readAdminFlag(u);
      if (!ok) return;
      const data = getFormData();
      if (!data.title || !data.version) return;
      const payload = {
        version: data.version,
        title: data.title,
        date_label: data.dateLabel || 'Hoje',
        items: data.items,
        created_at: serverTimestamp(),
        created_by: u.uid
      };
      try {
        const ref = await addDoc(collection(db, 'updates'), payload);
        const firstItem = Array.isArray(data.items) && data.items.length ? String(data.items[0]?.text || '').trim() : '';
        const body = firstItem ? firstItem : 'Novidades disponíveis. Toque para ver.';
        await setDoc(doc(db, 'update_broadcasts', ref.id), {
          update_id: ref.id,
          title: `Atualizações ${data.version}`,
          body,
          created_at: serverTimestamp(),
          created_by: u.uid
        }, { merge: true });
        resetForm();
      } catch (err) {
        console.error(err);
      }
    });
  }

  const btnPreset = document.getElementById('btn-upd-preset');
  if (btnPreset) btnPreset.addEventListener('click', () => resetForm());

  if (isAdmin) resetForm();
});
