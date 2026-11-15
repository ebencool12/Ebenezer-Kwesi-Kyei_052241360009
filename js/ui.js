// Modal dialogs and toast notifications.

export function openModal({ title, body, actions = [], onClose, id }) {
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"${id ? ` id="${id}"` : ''}>
      <h2 class="modal-title" id="modal-title"></h2>
      <div class="modal-body"></div>
      <div class="modal-actions"></div>
    </div>`;
  wrap.querySelector('.modal-title').textContent = title;
  const bodyEl = wrap.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.append(body);

  const previousFocus = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.classList.add('closing');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => wrap.remove(), 180);
    previousFocus?.focus?.({ preventScroll: true });
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  const actEl = wrap.querySelector('.modal-actions');
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + (a.kind || 'ghost');
    b.textContent = a.label;
    if (a.id) b.id = a.id;
    b.addEventListener('click', () => a.onClick?.(close, wrap));
    actEl.append(b);
  }
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', onKey);
  root.append(wrap);
  setTimeout(() => (wrap.querySelector('.modal-body input:not([type=hidden])') || wrap.querySelector('.btn.primary, .btn.gold, .btn.danger'))?.focus(), 40);
  return { close, el: wrap };
}

/** Promise<boolean>. `message` is HTML — escape user text before passing. */
export function confirmDialog({ title, message, okLabel = 'OK', kind = 'primary', cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    openModal({
      title,
      body: `<p>${message}</p>`,
      actions: [
        { label: cancelLabel, kind: 'ghost', onClick: (c) => { finish(false); c(); } },
        { label: okLabel, kind, onClick: (c) => { finish(true); c(); } },
      ],
      onClose: () => finish(false),
    });
  });
}

export function toast(message, kind = 'info', { action, duration = 3800 } = {}) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.innerHTML = '<span class="t-dot"></span><span class="t-msg"></span>';
  el.querySelector('.t-msg').textContent = message;
  if (action) {
    const b = document.createElement('button');
    b.className = 't-action';
    b.textContent = action.label;
    b.addEventListener('click', () => { action.onClick(); dismiss(); });
    el.append(b);
  }
  const dismiss = () => { el.classList.add('out'); setTimeout(() => el.remove(), 250); };
  root.append(el);
  while (root.children.length > 3) root.firstElementChild.remove();
  setTimeout(dismiss, duration);
}
