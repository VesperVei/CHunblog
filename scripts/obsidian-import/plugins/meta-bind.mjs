export function transformMetaBindEmbeds(content) {
  const diagnostics = [];
  const nextContent = content.replace(/```meta-bind-embed\b[^\n]*\n([\s\S]*?)```\n*/gi, (match, body) => {
    diagnostics.push({
      type: 'meta-bind-embed',
      severity: 'info',
      message: 'meta-bind-embed block removed during static import.',
      target: body.trim(),
    });
    return '';
  });

  return { content: nextContent, diagnostics };
}
