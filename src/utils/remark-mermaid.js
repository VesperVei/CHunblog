function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function transformNode(node) {
  if (!node || typeof node !== 'object' || !Array.isArray(node.children)) {
    return;
  }

  node.children = node.children.map((child) => {
    if (child?.type === 'code' && child.lang === 'mermaid') {
      return {
        type: 'html',
        value: `<div class="mermaid">${escapeHtml(child.value)}</div>`,
      };
    }

    transformNode(child);
    return child;
  });
}

export default function remarkMermaid() {
  return (tree) => {
    transformNode(tree);
  };
}
