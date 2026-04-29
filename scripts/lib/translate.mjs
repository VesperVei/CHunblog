const DEFAULT_BASE_URL = 'http://127.0.0.1:8317/v1';

function parseBoolean(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return undefined;
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/g, '');
}

function protectMarkdownSegments(markdown) {
  const protectedSegments = [];
  let protectedMarkdown = markdown;

  const protect = (pattern, tokenPrefix) => {
    protectedMarkdown = protectedMarkdown.replace(pattern, (match) => {
      const token = `@@${tokenPrefix}_${protectedSegments.length}@@`;
      protectedSegments.push({ token, value: match });
      return token;
    });
  };

  protect(/```[\s\S]*?```/g, 'CODE_BLOCK');
  protect(/`[^`\n]+`/g, 'INLINE_CODE');
  protect(/!?\[\[[^\]]+\]\]/g, 'WIKILINK');

  return { protectedMarkdown, protectedSegments };
}

function restoreMarkdownSegments(markdown, protectedSegments) {
  let restored = markdown;
  for (const segment of protectedSegments) {
    restored = restored.replaceAll(segment.token, segment.value);
  }
  return restored;
}

function normalizeJsonCandidate(text) {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch ? fencedMatch[1].trim() : trimmed;
}

function parseJsonObject(text) {
  const normalized = normalizeJsonCandidate(text);

  try {
    return JSON.parse(normalized);
  } catch {
    const start = normalized.indexOf('{');
    const end = normalized.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Translation response did not contain JSON.');
    }
    return JSON.parse(normalized.slice(start, end + 1));
  }
}

function cleanString(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : undefined;
}

export function getTranslationConfig(env = process.env) {
  const baseUrl = cleanString(env.OBSIDIAN_LLM_BASE_URL ?? env.LLM_BASE_URL) ?? DEFAULT_BASE_URL;
  const apiKey = cleanString(env.OBSIDIAN_LLM_API_KEY ?? env.LLM_API_KEY) ?? 'local';
  const model = cleanString(env.OBSIDIAN_LLM_MODEL ?? env.LLM_MODEL);
  const translateEnabled = parseBoolean(env.OBSIDIAN_TRANSLATE);
  const translateInDev = parseBoolean(env.OBSIDIAN_TRANSLATE_IN_DEV) ?? false;
  const forceRetranslate = parseBoolean(env.OBSIDIAN_FORCE_RETRANSLATE) ?? false;
  const targetLocales = cleanString(env.OBSIDIAN_TRANSLATION_TARGET_LOCALES)
    ?.split(',')
    .map((locale) => locale.trim().toLowerCase())
    .filter(Boolean) ?? ['en'];

  return {
    baseUrl: trimTrailingSlash(baseUrl),
    apiKey,
    model,
    translateEnabled,
    translateInDev,
    forceRetranslate,
    targetLocales,
  };
}

export function shouldTranslate({ config, context, targetLocale }) {
  if (!config.targetLocales.includes(targetLocale)) {
    return false;
  }

  if (!config.model) {
    return false;
  }

  if (config.translateEnabled === false) {
    return false;
  }

  if (context === 'dev' && !config.translateInDev) {
    return false;
  }

  return true;
}

export async function translateDocument({
  config,
  sourceLocale,
  targetLocale,
  title,
  description,
  content,
}) {
  if (!config.model) {
    throw new Error('Missing translation model configuration.');
  }

  const { protectedMarkdown, protectedSegments } = protectMarkdownSegments(content);

  const systemPrompt = [
    `Translate ${sourceLocale} technical Markdown/MDX into ${targetLocale}.`,
    'Return valid JSON only with keys: title, description, content.',
    'Preserve Markdown and MDX structure.',
    'Do not change fenced code blocks, inline code, or wikilinks.',
    'Tokens wrapped like @@TOKEN@@ must remain byte-for-byte unchanged.',
    'You may translate user-visible prose, headings, table text, blockquote text, and wikilink alias text only when the alias is not protected as a token.',
    'Do not add explanations or extra keys.',
  ].join(' ');

  const userPrompt = JSON.stringify({
    sourceLocale,
    targetLocale,
    title,
    description,
    content: protectedMarkdown,
  });

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Translation request failed (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  const rawContent = payload?.choices?.[0]?.message?.content;
  const translated = parseJsonObject(typeof rawContent === 'string' ? rawContent : '');
  const translatedTitle = cleanString(translated.title);
  const translatedDescription = cleanString(translated.description);
  const translatedContent = cleanString(translated.content);

  if (!translatedTitle || !translatedDescription || !translatedContent) {
    throw new Error('Translation response was missing title, description, or content.');
  }

  return {
    title: translatedTitle,
    description: translatedDescription,
    content: restoreMarkdownSegments(translatedContent, protectedSegments),
  };
}
