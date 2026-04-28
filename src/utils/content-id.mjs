export function getLangFromId(id) {
  const match = id.match(/index_([a-z]{2}(?:-[a-z]{2})?)$/i) || id.match(/_([a-z]{2}(?:-[a-z]{2})?)$/i);
  return match ? match[1].toLowerCase() : null;
}

export function getSlugFromId(id, forMultiLang = false) {
  const withoutLangSuffix = id.replace(/_[a-z]{2}(?:-[a-z]{2})?$/i, '');

  if (/^index$/i.test(withoutLangSuffix) || /^index\.mdx?$/i.test(withoutLangSuffix)) {
    return '';
  }

  if (/\/index$/i.test(withoutLangSuffix)) {
    return withoutLangSuffix.replace(/\/index$/i, '');
  }

  if (withoutLangSuffix !== id) {
    return withoutLangSuffix;
  }

  if (forMultiLang) {
    return '';
  }

  return id;
}
