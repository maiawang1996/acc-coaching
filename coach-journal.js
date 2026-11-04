(() => {
  const storageKey = 'acc-coach-journal-v1';
  const sections = {
    experience: {
      title: '记录一次教练体验', submit: '保存这次体验', saved: '教练体验已保存',
      placeholder: '从一个会谈片段、一种感受开始写…', empty: '这里记录你作为教练的真实感受。\n写下第一次体验吧。',
      prompts: [['有能量的瞬间', '哪个瞬间，让你觉得「我喜欢做教练」？'], ['让我卡住的地方', '什么让我感到卡住或疲惫？这让我看见了什么？']],
    },
    clients: {
      title: '记录一个关于客户的发现', submit: '保存这个发现', saved: '关于客户的发现已保存',
      placeholder: '是什么让我感到合拍？我想进一步确认什么？', empty: '什么样的合作让你期待？\n从一个关于客户的发现开始写。',
      prompts: [['合适的合作', '什么样的客户，让你期待下一次会谈？'], ['我会说不的情况', '什么情况下我会选择不合作？我的边界是什么？']],
    },
  };
  const $ = id => document.getElementById(id);
  let cache;
  try { cache = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { cache = {}; }
  let entries = Array.isArray(cache.entries) ? cache.entries : [];
  let pending = cache.pending && typeof cache.pending === 'object' ? cache.pending : {};
  let drafts = cache.drafts && typeof cache.drafts === 'object' ? cache.drafts : {};
  let section = 'experience', busy = false, retryTimer = null, saveVersion = 0;
  const localDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };
  const draft = () => drafts[section] ||= { content: '', prompt: sections[section].prompts[0][0], editingId: null };
  const store = () => localStorage.setItem(storageKey, JSON.stringify({ entries, pending, drafts }));
  const notice = text => { $('coach-notice').textContent = text; $('coach-notice').hidden = !text; };
  const status = (kind, text) => {
    window.accCoachJournalSync = { kind, text };
    window.dispatchEvent(new CustomEvent('acc-coach-sync', { detail: { kind, text } }));
  };
  const announce = (title, detail) => { if (typeof toast === 'function') toast(title, detail); };
  const retry = () => {
    if (retryTimer) return;
    retryTimer = setTimeout(() => { retryTimer = null; sync(); }, 30000);
  };
  async function request(method, body) {
    const response = await fetch('/api/coach-journal', {
      method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {},
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`同步失败 (${response.status})`);
    return response.json();
  }
  async function sync() {
    if (busy) return;
    busy = true;
    status('syncing', '正在同步教练探索记录…');
    try {
      // One key per entry: retries are idempotent and cannot replace another device's notes.
      while (Object.keys(pending).length) {
        const [id, item] = Object.entries(pending)[0];
        const saved = await request('POST', item.entry);
        if (saved.id !== id) throw new Error('数据库没有返回对应记录');
        if (pending[id]?.revision === item.revision) {
          delete pending[id];
          entries = entries.map(entry => entry.id === id ? saved : entry);
          store();
          renderEntries();
        }
      }
      const cloud = await request('GET');
      if (!Array.isArray(cloud.entries)) throw new Error('无法读取云端记录');
      const merged = new Map(cloud.entries.map(entry => [entry.id, entry]));
      for (const item of Object.values(pending)) merged.set(item.entry.id, item.entry);
      entries = [...merged.values()];
      store();
      renderEntries();
      if (Object.keys(pending).length) retry();
      else { clearTimeout(retryTimer); retryTimer = null; notice(''); status('synced', '教练探索记录已同步到数据库'); }
    } catch {
      const text = Object.keys(pending).length ? '记录已暂存于本机，联网后会自动重试同步。' : '暂时无法连接数据库，正在显示本机记录。';
      notice(text);
      status('pending', text);
      retry();
    } finally {
      busy = false;
    }
  }
  function renderForm() {
    const config = sections[section], current = draft();
    const editing = entries.find(entry => entry.id === current.editingId);
    $('coach-form-title').textContent = current.editingId ? '编辑探索记录' : config.title;
    const date = editing?.date || localDate();
    $('coach-form-date').textContent = current.editingId ? date.replaceAll('-', '.') : new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
    $('coach-content').value = current.content;
    $('coach-content').placeholder = config.placeholder;
    $('coach-submit').textContent = current.editingId ? '保存修改' : config.submit;
    $('coach-cancel').hidden = !current.editingId;
    $('coach-prompts').replaceChildren(...config.prompts.map(([label]) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'coach-prompt'; button.textContent = label;
      button.dataset.prompt = label; button.setAttribute('aria-pressed', String(current.prompt === label));
      return button;
    }));
    $('coach-cue').textContent = config.prompts.find(([label]) => label === current.prompt)?.[1] || '自由写下此刻最想记录的感受或发现。';
    document.querySelectorAll('[data-coach-section]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.coachSection === section)));
  }
  function renderEntries() {
    const list = entries.filter(entry => entry.section === section).sort((a, b) => b.date.localeCompare(a.date) || (b.updatedAt || '').localeCompare(a.updatedAt || '') || b.id.localeCompare(a.id));
    $('coach-record-count').textContent = `${list.length} 条`;
    $('coach-entries').replaceChildren();
    if (!list.length) {
      const empty = document.createElement('div'); empty.className = 'card coach-empty';
      empty.textContent = sections[section].empty; empty.style.whiteSpace = 'pre-line';
      $('coach-entries').append(empty); return;
    }
    for (const entry of list) {
      const article = document.createElement('article'); article.className = 'card coach-entry';
      const head = document.createElement('div'); head.className = 'coach-entry-head';
      const date = document.createElement('div'); date.className = 'coach-entry-date'; date.textContent = entry.date.replaceAll('-', '.');
      if (pending[entry.id]) { const label = document.createElement('span'); label.className = 'coach-entry-pending'; label.textContent = '待同步'; date.append(label); }
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'coach-entry-edit'; edit.dataset.entryId = entry.id;
      edit.setAttribute('aria-label', `编辑 ${entry.date} 的探索记录`);
      edit.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z"/></svg>';
      const content = document.createElement('p'); content.className = 'coach-entry-content'; content.textContent = entry.content;
      head.append(date, edit); article.append(head, content); $('coach-entries').append(article);
    }
  }
  const saveDraft = () => {
    draft().content = $('coach-content').value;
    try { store(); } catch { notice('本机存储空间不足，请先复制保留文字，再重试。'); }
  };
  $('coach-content').addEventListener('input', saveDraft);
  $('coach-prompts').addEventListener('click', event => {
    const button = event.target.closest('[data-prompt]'); if (!button) return;
    saveDraft(); draft().prompt = draft().prompt === button.dataset.prompt ? '' : button.dataset.prompt;
    try { store(); } catch { notice('草稿暂时无法保存在本机，请先保留文字。'); }
    renderForm();
  });
  document.querySelectorAll('[data-coach-section]').forEach(button => button.addEventListener('click', () => {
    saveDraft(); section = button.dataset.coachSection; renderForm(); renderEntries();
  }));
  $('coach-entries').addEventListener('click', event => {
    const button = event.target.closest('[data-entry-id]'); if (!button) return;
    const entry = entries.find(item => item.id === button.dataset.entryId); if (!entry) return;
    const current = draft();
    if (current.content.trim() && !window.confirm('当前还有未保存的文字，确定切换到编辑这条记录吗？')) return;
    drafts[section] = { content: entry.content, prompt: entry.prompt || '', editingId: entry.id };
    try { store(); } catch { notice('编辑草稿暂时无法保存在本机，请先保留文字。'); }
    renderForm(); $('coach-content').focus();
    $('coach-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('coach-cancel').addEventListener('click', () => { drafts[section] = { content: '', prompt: sections[section].prompts[0][0], editingId: null }; try { store(); } catch {} renderForm(); });
  $('coach-form').addEventListener('submit', event => {
    event.preventDefault();
    const content = $('coach-content').value.trim(); if (!content) { $('coach-content').focus(); return; }
    const current = draft(), previous = entries.find(entry => entry.id === current.editingId);
    const id = current.editingId || crypto.randomUUID();
    const entry = { id, section, date: previous?.date || localDate(), content, prompt: current.prompt, updatedAt: new Date().toISOString() };
    const oldEntries = entries, oldPending = pending, oldDrafts = drafts;
    entries = [...entries.filter(item => item.id !== id), entry];
    pending = { ...pending, [id]: { entry, revision: `${Date.now()}-${++saveVersion}` } };
    drafts = { ...drafts, [section]: { content: '', prompt: sections[section].prompts[0][0], editingId: null } };
    try { store(); } catch {
      entries = oldEntries; pending = oldPending; drafts = oldDrafts;
      notice('保存失败：本机存储空间不足。文字仍保留在输入框，请先复制备份。'); return;
    }
    renderForm(); renderEntries();
    status('syncing', '正在同步教练探索记录…');
    announce(previous ? '探索记录已更新' : sections[section].saved, '已保存在本机，正在同步到数据库。');
    sync();
  });
  document.querySelector('[data-view="coach-self"]').addEventListener('click', () => { renderForm(); renderEntries(); sync(); });
  window.addEventListener('online', sync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && $('coach-self').classList.contains('active')) sync(); });
  setInterval(() => { if (!document.hidden && $('coach-self').classList.contains('active')) sync(); }, 30000);
  renderForm(); renderEntries(); sync();
})();
