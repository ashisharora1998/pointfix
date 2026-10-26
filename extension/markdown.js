// Small Markdown renderer for agent replies. Builds DOM nodes directly (never
// innerHTML), so text from the agent can't inject markup into the page.
// Supports code blocks, inline code, bold, links, headings and lists.
globalThis.__pointfixMarkdown = (() => {
  const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[[^\]\n]+\]\([^)\s]+\))/g;

  function inline(parent, text) {
    let last = 0;
    for (const m of text.matchAll(INLINE)) {
      if (m.index > last) parent.append(text.slice(last, m.index));
      const token = m[0];
      if (m[1]) {
        const code = document.createElement('code');
        code.textContent = token.slice(1, -1);
        parent.append(code);
      } else if (m[2]) {
        const strong = document.createElement('strong');
        strong.textContent = token.slice(2, -2);
        parent.append(strong);
      } else {
        const [, label, href] = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (/^https?:\/\//i.test(href)) {
          const a = document.createElement('a');
          a.href = href;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = label;
          parent.append(a);
        } else {
          // Local file links from the agent: show the name, keep the path as a tooltip.
          const span = document.createElement('code');
          span.textContent = label;
          span.title = href;
          parent.append(span);
        }
      }
      last = m.index + token.length;
    }
    if (last < text.length) parent.append(text.slice(last));
  }

  return function render(text) {
    const frag = document.createDocumentFragment();
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    let list = null;
    let paragraph = null;

    const closeBlocks = () => {
      list = null;
      paragraph = null;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (/^\s*```/.test(line)) {
        closeBlocks();
        const pre = document.createElement('pre');
        const body = [];
        while (++i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i]);
        pre.textContent = body.join('\n');
        frag.append(pre);
        continue;
      }

      const heading = line.match(/^#{1,6}\s+(.*)$/);
      if (heading) {
        closeBlocks();
        const h = document.createElement('div');
        h.className = 'md-heading';
        inline(h, heading[1]);
        frag.append(h);
        continue;
      }

      const item = line.match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/);
      if (item) {
        paragraph = null;
        const tag = item[1] ? 'UL' : 'OL';
        if (!list || list.tagName !== tag) {
          list = document.createElement(tag.toLowerCase());
          frag.append(list);
        }
        const li = document.createElement('li');
        inline(li, item[3]);
        list.append(li);
        continue;
      }

      if (!line.trim()) {
        closeBlocks();
        continue;
      }

      list = null;
      if (paragraph) {
        paragraph.append(document.createElement('br'));
      } else {
        paragraph = document.createElement('p');
        frag.append(paragraph);
      }
      inline(paragraph, line);
    }
    return frag;
  };
})();
