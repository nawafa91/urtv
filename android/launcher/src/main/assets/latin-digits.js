// Launcher WebView only: normalize visible card numbers without modifying the shared screensaver page.
(() => {
  if (window.urtvLatinDigits) return;
  window.urtvLatinDigits = true;
  const latin = value => value.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, c =>
    String(c.charCodeAt(0) - (c.charCodeAt(0) <= 0x0669 ? 0x0660 : 0x06f0)));
  const text = node => {
    if (node.parentElement && node.parentElement.closest('script,style')) return;
    const next = latin(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  };
  const visit = root => {
    if (root.nodeType === Node.TEXT_NODE) { text(root); return; }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) text(walker.currentNode);
  };
  visit(document.body);
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') text(record.target);
      else for (const node of record.addedNodes) visit(node);
    }
  }).observe(document.body, {childList: true, subtree: true, characterData: true});
})();
