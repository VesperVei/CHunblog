function transformOutsideFences(content, transformLine) {
  const lines = content.split('\n');
  const nextLines = [];
  const diagnostics = [];
  let inFence = false;
  let fenceMarker = '';

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fenceMatch[1][0];
      } else if (fenceMatch[1].startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = '';
      }
      nextLines.push(line);
      continue;
    }

    if (inFence) {
      nextLines.push(line);
      continue;
    }

    const result = transformLine(line);
    nextLines.push(result.line);
    diagnostics.push(...result.diagnostics);
  }

  return { content: nextLines.join('\n'), diagnostics };
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function cleanupHtmlLine(line) {
  const diagnostics = [];
  let next = line;

  const progressCount = countMatches(next, /<progress\b[^>]*><\/progress>/gi);
  if (progressCount > 0) {
    next = next.replace(/<progress\b[^>]*><\/progress>\s*/gi, '');
    diagnostics.push({
      type: 'html-cleanup',
      severity: 'info',
      message: 'Removed Obsidian progress element from imported Markdown.',
      count: progressCount,
    });
  }

  const fontCount = countMatches(next, /<font\b[^>]*>[\s\S]*?<\/font>/gi);
  if (fontCount > 0) {
    next = next.replace(/<font\b[^>]*>([\s\S]*?)<\/font>/gi, '$1');
    diagnostics.push({
      type: 'html-cleanup',
      severity: 'info',
      message: 'Removed font tag while preserving its text.',
      count: fontCount,
    });
  }

  const styledMarkCount = countMatches(next, /<mark\b[^>]*\sstyle=("[^"]*"|'[^']*')[^>]*>/gi);
  if (styledMarkCount > 0) {
    next = next.replace(/<mark\b[^>]*\sstyle=("[^"]*"|'[^']*')[^>]*>/gi, '<mark>');
    diagnostics.push({
      type: 'html-cleanup',
      severity: 'info',
      message: 'Removed inline style from mark tag.',
      count: styledMarkCount,
    });
  }

  const backgroundSpanCount = countMatches(next, /<span\b[^>]*\sstyle=("[^"']*background[^"']*"|'[^"']*background[^"']*')[^>]*>[\s\S]*?<\/span>/gi);
  if (backgroundSpanCount > 0) {
    next = next.replace(/<span\b[^>]*\sstyle=("[^"']*background[^"']*"|'[^"']*background[^"']*')[^>]*>([\s\S]*?)<\/span>/gi, '<mark>$2</mark>');
    diagnostics.push({
      type: 'html-cleanup',
      severity: 'info',
      message: 'Converted background styled span to mark tag.',
      count: backgroundSpanCount,
    });
  }

  const styledSpanCount = countMatches(next, /<span\b[^>]*\sstyle=("[^"]*"|'[^']*')[^>]*>[\s\S]*?<\/span>/gi);
  if (styledSpanCount > 0) {
    next = next.replace(/<span\b[^>]*\sstyle=("[^"]*"|'[^']*')[^>]*>([\s\S]*?)<\/span>/gi, '$2');
    diagnostics.push({
      type: 'html-cleanup',
      severity: 'info',
      message: 'Removed styled span while preserving its text.',
      count: styledSpanCount,
    });
  }

  const styleAttrCount = countMatches(next, /\sstyle=("[^"]*"|'[^']*')/gi);
  if (styleAttrCount > 0) {
    next = next.replace(/\sstyle=("[^"]*"|'[^']*')/gi, '');
    diagnostics.push({
      type: 'html-cleanup',
      severity: 'info',
      message: 'Removed remaining inline style attributes.',
      count: styleAttrCount,
    });
  }

  return { line: next, diagnostics };
}

export function transformHtmlCleanup(content) {
  return transformOutsideFences(content, cleanupHtmlLine);
}
