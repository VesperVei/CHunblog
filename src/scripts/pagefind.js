const SEARCH_CONTAINER_ID = 'search-container';
const SEARCH_INPUT_ID = 'search-bar';
const SEARCH_RESULTS_ID = 'search-results';
const SEARCH_TOGGLE_ID = 'search-toggle';

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLocale(value) {
  return (value ?? 'en').toLowerCase().replace('_', '-');
}

function isTypingTarget(target) {
  return target instanceof HTMLElement
    && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]') !== null);
}

function highlightText(text, query) {
  if (!query) {
    return escapeHtml(text);
  }

  const pattern = new RegExp(`(${escapeRegExp(query)})`, 'ig');
  return escapeHtml(text).replace(pattern, '<strong>$1</strong>');
}

function createExcerpt(text, query) {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  if (!normalizedText) {
    return '';
  }

  const lowerText = normalizedText.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) {
    return escapeHtml(normalizedText.slice(0, 180));
  }

  const start = Math.max(0, matchIndex - 70);
  const end = Math.min(normalizedText.length, matchIndex + query.length + 110);
  const prefix = start > 0 ? '... ' : '';
  const suffix = end < normalizedText.length ? ' ...' : '';
  const snippet = normalizedText.slice(start, end).trim();
  return `${prefix}${highlightText(snippet, query)}${suffix}`;
}

function renderResults(searchResults, results, untitledLabel, moreMatchesTemplate) {
  if (results.length === 0) {
    searchResults.style.display = 'none';
    searchResults.innerHTML = '';
    return;
  }

  const html = results.map((item) => {
    const title = item.title || untitledLabel;
    const excerpts = item.excerpts.map((excerpt) => `<span>${excerpt}</span>`).join('');
    const moreMatches = item.hiddenCount && item.hiddenCount > 0
      ? `<span class="more-matches">${escapeHtml(moreMatchesTemplate.replace('{count}', String(item.hiddenCount)))}</span>`
      : '';

    return `
      <div class="search-result item">
        <a class="result-title" href="${escapeHtml(item.url)}">${escapeHtml(title)}</a>
        ${excerpts}
        ${moreMatches}
      </div>
    `;
  }).join('');

  searchResults.style.display = 'flex';
  searchResults.innerHTML = html;
}

async function loadDevIndex() {
  if (!window.__goosequillDevSearchIndex) {
    window.__goosequillDevSearchIndex = fetch('/dev-search-index.json', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Dev search index request failed: ${response.status}`);
      }
      return response.json();
    });
  }

  return window.__goosequillDevSearchIndex;
}

async function initCustomSearch() {
  const searchContainer = document.getElementById(SEARCH_CONTAINER_ID);
  const searchInput = document.getElementById(SEARCH_INPUT_ID);
  const searchResults = document.getElementById(SEARCH_RESULTS_ID);
  const searchToggle = document.getElementById(SEARCH_TOGGLE_ID);

  if (!searchContainer || !searchInput || !searchResults || !searchToggle) {
    return;
  }

  if (searchContainer.dataset.searchInitialized === 'true') {
    return;
  }

  searchContainer.dataset.searchInitialized = 'true';
  const input = searchInput;
  const resultsElement = searchResults;
  const toggle = searchToggle;

  const isDev = import.meta.env.DEV;
  const currentLocale = normalizeLocale(searchContainer.dataset.locale);
  const placeholderLoading = searchContainer.dataset.placeholderLoading ?? 'Loading search...';
  const placeholderReady = searchContainer.dataset.placeholderReady ?? 'Search...';
  const placeholderDev = searchContainer.dataset.placeholderDev ?? 'Search (Dev)...';
  const placeholderError = searchContainer.dataset.placeholderError ?? 'Search unavailable';
  const untitledLabel = searchContainer.dataset.untitledLabel ?? 'Untitled';
  const moreMatchesTemplate = searchContainer.dataset.moreMatchesTemplate ?? '{count} more matches';

  let pagefind = null;

  const openSearch = () => {
    searchContainer.classList.add('active');
    input.focus();
  };

  const closeSearch = () => {
    searchContainer.classList.remove('active');
    if (!input.value.trim()) {
      resultsElement.style.display = 'none';
      resultsElement.innerHTML = '';
    }
  };

  const toggleSearch = () => {
    if (searchContainer.classList.contains('active')) {
      closeSearch();
      return;
    }

    openSearch();
  };

  toggle.addEventListener('click', () => {
    toggleSearch();
  });

  document.addEventListener('keydown', (event) => {
    if (isTypingTarget(event.target)) {
      if (event.key === 'Escape' && searchContainer.classList.contains('active')) {
        closeSearch();
      }
      return;
    }

    if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key === '/') {
      event.preventDefault();
      openSearch();
      return;
    }

    if (event.key === 'Escape' && searchContainer.classList.contains('active')) {
      closeSearch();
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    if (!searchContainer.contains(target) && !toggle.contains(target)) {
      closeSearch();
    }
  });

  input.placeholder = placeholderLoading;

  async function loadEngine() {
    if (isDev) {
      await loadDevIndex();
      input.disabled = false;
      input.placeholder = placeholderDev;
      return;
    }

    try {
      const path = '/pagefind/pagefind.js';
      pagefind = await import(/* @vite-ignore */ path);
      await pagefind.init();
      input.disabled = false;
      input.placeholder = placeholderReady;
    } catch (error) {
      input.placeholder = placeholderError;
      console.error('Pagefind load failed', error);
    }
  }

  async function searchDevPosts(query) {
    const { posts } = await loadDevIndex();
    const normalizedQuery = query.trim().toLowerCase();

    return posts
      .filter((post) => normalizeLocale(post.lang) === currentLocale)
      .map((post) => {
        const haystacks = [
          post.title,
          post.description,
          post.text,
          post.tags.join(' '),
          post.aliases.join(' '),
        ];
        const score = haystacks.reduce((total, value, index) => {
          const hit = value.toLowerCase().includes(normalizedQuery);
          if (!hit) {
            return total;
          }

          return total + (index === 0 ? 12 : index === 1 ? 7 : index === 2 ? 4 : 2);
        }, 0);

        return { post, score };
      })
      .filter((item) => item.score > 0)
      .sort((first, second) => second.score - first.score)
      .slice(0, 8)
      .map(({ post }) => ({
        title: post.title,
        url: post.url,
        excerpts: [createExcerpt(`${post.description} ${post.text}`.trim(), query)],
      }))
      .filter((item) => item.excerpts[0]);
  }

  async function searchPagefind(query) {
    if (!pagefind) {
      return [];
    }

    const response = await pagefind.search(query, {
      filters: {
        section: 'blog',
      },
    });
    const topResults = response.results.slice(0, 8);
    const resultData = await Promise.all(topResults.map((result) => result.data()));

    return resultData.map((item) => {
      const excerpts = (item.sub_results && item.sub_results.length > 0
        ? item.sub_results.map((sub) => sub.excerpt)
        : [item.excerpt]
      )
        .filter(Boolean)
        .slice(0, 4)
        .map((excerpt) => excerpt.replace(/<mark>/g, '<strong>').replace(/<\/mark>/g, '</strong>'));

      const hiddenCount = Math.max(0, (item.sub_results?.length ?? 0) - excerpts.length);

      return {
        title: item.meta?.title ?? untitledLabel,
        url: item.url,
        excerpts,
        hiddenCount,
      };
    });
  }

  async function performSearch(query) {
    if (!query.trim()) {
      resultsElement.style.display = 'none';
      resultsElement.innerHTML = '';
      return;
    }

    try {
      const nextResults = isDev
        ? await searchDevPosts(query)
        : await searchPagefind(query);

      renderResults(resultsElement, nextResults, untitledLabel, moreMatchesTemplate);
    } catch (error) {
      resultsElement.style.display = 'none';
      resultsElement.innerHTML = '';
      console.error('Pagefind error:', error);
    }
  }

  let debounceTimeout = null;
  input.addEventListener('input', (event) => {
    const query = event.target.value;
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }

    debounceTimeout = setTimeout(() => {
      void performSearch(query);
    }, 200);
  });

  await loadEngine();
}

document.addEventListener('astro:page-load', () => {
  void initCustomSearch();
});

if (document.readyState === 'interactive' || document.readyState === 'complete') {
  void initCustomSearch();
} else {
  document.addEventListener('DOMContentLoaded', () => {
    void initCustomSearch();
  });
}
