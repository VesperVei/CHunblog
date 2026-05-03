function dataviewPlaceholder(locale, query) {
  const summary = query.trim().split('\n').slice(0, 3).join(' / ');
  if (locale === 'en') {
    return [
      '> [!note]',
      '> The Dataview query from the original note is not executed on the static site yet.',
      summary ? `> Query: \`${summary.replace(/`/g, '\\`')}\`` : undefined,
    ].filter(Boolean).join('\n');
  }

  return [
    '> [!note]',
    '> 原始笔记中的 Dataview 查询暂未在静态站点执行。',
    summary ? `> 查询：\`${summary.replace(/`/g, '\\`')}\`` : undefined,
  ].filter(Boolean).join('\n');
}

export function transformDataviewBlocks(content, context) {
  const diagnostics = [];
  const nextContent = content.replace(/```(dataview|dataviewjs)\b[^\n]*\n([\s\S]*?)```/gi, (match, kind, query) => {
    diagnostics.push({
      type: 'dataview',
      severity: 'info',
      message: `${kind} block replaced with a static placeholder.`,
      supported: false,
      query: query.trim(),
    });
    return dataviewPlaceholder(context.locale, query);
  });

  return { content: nextContent, diagnostics };
}
