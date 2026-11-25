// Componenti di interfaccia condivisi: pannello dal basso, dialogo di conferma, avatar.
const UI = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Pannello dal basso. `html` è il contenuto (già escapato). Si chiude con Esc,
  // toccando fuori o con close(). onClose viene chiamato una volta sola.
  function sheet(html, { onClose, label } = {}) {
    const el = document.createElement('div');
    el.className = 'sheet-backdrop';
    el.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"${label ? ` aria-label="${esc(label)}"` : ''}>
      <div class="sheet-handle"></div>${html}</div>`;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      el.remove();
      document.removeEventListener('keydown', onKey);
      if (onClose) onClose();
    };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', e => { if (e.target === el) close(); });
    document.body.appendChild(el);
    return { el, root: el.querySelector('.sheet'), close };
  }

  // Dialogo di conferma centrato → Promise<boolean>. `body` è HTML già escapato.
  function confirm({ title, body = '', ok = 'Conferma', cancel = 'Annulla', danger = false }) {
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.className = 'sheet-backdrop dialog-backdrop';
      el.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true" aria-label="${esc(title)}">
        <h3>${esc(title)}</h3><div class="dialog-body">${body}</div>
        <button class="btn-primary${danger ? ' danger' : ''}" data-r="1">${esc(ok)}</button>
        <button class="sheet-cancel" data-r="0">${esc(cancel)}</button></div>`;
      const done = v => { el.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = e => { if (e.key === 'Escape') done(false); };
      document.addEventListener('keydown', onKey);
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-r]');
        if (b) done(b.dataset.r === '1');
        else if (e.target === el) done(false);
      });
      document.body.appendChild(el);
      el.querySelector('[data-r="1"]').focus();
    });
  }

  // Avatar con iniziali e colore stabile per persona.
  const initials = name => {
    const w = String(name || '?').trim().split(/\s+/);
    return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
  };
  const hue = id => [...String(id)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % 5;
  const avatar = (p, small) => `<span class="av${small ? ' s' : ''} a${hue(p.id) + 1}" aria-hidden="true">${esc(initials(p.name))}</span>`;
  const avatarMe = small => `<span class="av${small ? ' s' : ''} me" aria-hidden="true">IO</span>`;

  return { esc, sheet, confirm, avatar, avatarMe, initials };
})();
