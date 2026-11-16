// _header.html owns the header; embedded copies preserve file:// and no-JS use.
// States: fallback → loading → loaded; failure returns to the usable fallback.
// Accordions use native HTML details elements.
(() => {
  if (typeof document === 'undefined') return;
  const host = document.querySelector('[data-shared-header]');
  if (!host) return;
  const markCurrentPage = () => {
    const page = location.pathname.split('/').pop() || 'index.html';
    host.querySelectorAll('a[href]').forEach(link => {
      if (link.getAttribute('href') === page) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  };
  markCurrentPage();
  if (!['http:', 'https:'].includes(location.protocol)) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  fetch('_header.html', { signal: controller.signal })
    .then(response => {
      if (!response.ok) throw new Error('Header unavailable');
      return response.text();
    })
    .then(html => {
      const template = document.createElement('template');
      template.innerHTML = html;
      if (!template.content.querySelector('.site-header .brand[href="index.html"]')) {
        throw new Error('Invalid header');
      }
      host.replaceChildren(template.content.cloneNode(true));
      markCurrentPage();
    })
    .catch(() => { /* The embedded header remains usable. */ })
    .finally(() => clearTimeout(timeout));
})();

// One registry drives the bar, help and page keys. Browser shortcuts stay native.
const WEBSITE_PAGES = [
  { key: '1', label: 'Home', href: 'index.html' },
  { key: '2', label: 'Manifesto', href: 'manifesto.html' },
];

// Action callbacks keep the keyboard contract testable without a browser.
function createWebsiteKeyboard(actions) {
  return {
    handleKey(event, context = {}) {
      if (event.defaultPrevented || event.repeat || event.isComposing ||
          event.metaKey || event.ctrlKey || event.altKey ||
          event.shiftKey || context.blocked) return;
      const perform = action => { event.preventDefault(); action(); };
      if (context.editable || context.selectedText) return;
      const page = WEBSITE_PAGES.find(item => item.key === event.key);
      if (page) return perform(() => actions.navigate(page.href));
      if (event.key === 'Escape' && context.openDisclosure) {
        return perform(() => actions.closeDisclosure(context.openDisclosure));
      }
      const index = context.summaryIndex;
      const count = context.summaryCount;
      if (!Number.isInteger(index) || index < 0 || index >= count) return;
      const destination = {
        ArrowUp: Math.max(0, index - 1), ArrowDown: Math.min(count - 1, index + 1),
        Home: 0, End: count - 1,
      }[event.key];
      if (Number.isInteger(destination)) perform(() => actions.focusSummary(destination));
    },
  };
}

function mountWebsiteKeyboard(doc, win) {
  if (!doc.querySelector('main') || doc.getElementById('website-keybar')) return;
  const pageName = win.location.pathname.split('/').pop() || 'index.html';
  const summaries = [...doc.querySelectorAll('main details > summary')];
  const element = (tag, attributes = {}, text = '') => {
    const node = doc.createElement(tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    if (text) node.textContent = text;
    return node;
  };
  const keycap = key => element('kbd', { 'aria-hidden': 'true' }, key);
  const bar = element('nav', { id: 'website-keybar', class: 'website-keybar', 'aria-label': 'Page navigation' });
  const barInner = element('div', { class: 'website-keybar-inner' });
  const pageLinks = WEBSITE_PAGES.map(page => {
    const link = element('a', { href: page.href, 'data-key': page.key });
    link.append(keycap(page.key), element('span', {}, page.label));
    if (page.href === pageName) link.setAttribute('aria-current', 'page');
    barInner.append(link);
    return link;
  });
  const contextHint = element('div', { class: 'website-key-context' });
  contextHint.hidden = true;
  bar.append(barInner, contextHint);
  doc.body.append(bar);
  const updateContext = () => {
    const summary = doc.activeElement?.closest('summary');
    const item = doc.activeElement?.closest('main details[open]');
    const parts = [];
    if (summaries.includes(summary)) parts.push('↑ ↓ Select item', '⏎ Toggle');
    if (item) parts.push('Esc Collapse');
    contextHint.textContent = parts.join('  ·  ');
    contextHint.hidden = parts.length === 0;
    measureBar();
  };
  const keyboard = createWebsiteKeyboard({
    navigate: href => { win.location.assign(href); },
    focusSummary: index => summaries[index].focus(),
    closeDisclosure: item => {
      item.open = false;
      item.querySelector('summary').focus();
      updateContext();
    },
  });
  pageLinks.forEach((link, index) => {
    const page = WEBSITE_PAGES[index];
    link.setAttribute('aria-keyshortcuts', page.key);
    link.setAttribute('aria-label', `${page.label}, shortcut ${page.key}`);
  });
  doc.addEventListener('keydown', event => {
    const target = event.target;
    if (!target?.closest) return;
    const otherDialog = doc.querySelector('dialog[open], [role="dialog"][aria-modal="true"]');
    keyboard.handleKey(event, {
      blocked: otherDialog,
      editable: Boolean(target.closest('input, textarea, select, [contenteditable], [role="textbox"], [role="combobox"], [role="slider"], [role="spinbutton"], audio, video')),
      selectedText: win.getSelection()?.isCollapsed === false,
      summaryIndex: summaries.indexOf(target.closest('summary')),
      summaryCount: summaries.length,
      openDisclosure: target.closest('main details[open]'),
    });
  });
  doc.addEventListener('focusin', updateContext);
  doc.addEventListener('toggle', updateContext, true);
  function measureBar() {
    doc.documentElement.style.setProperty('--website-keybar-height', `${Math.ceil(bar.getBoundingClientRect().height)}px`);
  }
  doc.documentElement.classList.add('has-website-keybar');
  measureBar();
  if (win.ResizeObserver) new win.ResizeObserver(measureBar).observe(bar);
  else win.addEventListener('resize', measureBar);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createWebsiteKeyboard, mountWebsiteKeyboard };
} else if (typeof document !== 'undefined') {
  mountWebsiteKeyboard(document, window);
}
