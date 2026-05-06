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

function cleanAltText(value) {
  const cleaned = String(value ?? '').split('|')[0].trim();
  return cleaned || 'image';
}

function cleanupImageLine(line) {
  const diagnostics = [];
  let imageSizeSyntaxCount = 0;
  let emptyAltCount = 0;

  const next = line.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, rawAlt, url) => {
    const alt = cleanAltText(rawAlt);
    if (String(rawAlt).includes('|')) imageSizeSyntaxCount += 1;
    if (!String(rawAlt).trim()) emptyAltCount += 1;
    return `![${alt}](${url})`;
  });

  const embedMatches = [...next.matchAll(/!\[\[([^\]]+)\]\]/g)];
  if (embedMatches.length > 0) {
    diagnostics.push({
      type: 'image-cleanup',
      severity: 'warning',
      message: 'Obsidian image embeds are not imported as local attachments yet.',
      targets: embedMatches.map((match) => match[1]),
    });
  }

  if (imageSizeSyntaxCount > 0) {
    diagnostics.push({
      type: 'image-cleanup',
      severity: 'info',
      message: 'Removed Obsidian image size syntax from Markdown image alt text.',
      count: imageSizeSyntaxCount,
    });
  }

  if (emptyAltCount > 0) {
    diagnostics.push({
      type: 'image-cleanup',
      severity: 'info',
      message: 'Filled empty image alt text with a stable fallback.',
      count: emptyAltCount,
    });
  }

  return { line: next, diagnostics };
}

export function transformImages(content) {
  return transformOutsideFences(content, cleanupImageLine);
}
