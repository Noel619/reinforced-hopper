/** Crea un elemento con clase, texto y/o hijos. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '', children: Node[] = []): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  for (const c of children) e.appendChild(c);
  return e;
}

export function button(text: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = el('button', cls, text);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export function money(n: number): string {
  const s = Math.round(n).toLocaleString('es-AR');
  return `$${s}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
