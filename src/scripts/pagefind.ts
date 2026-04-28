function toggleSearch() {
  const searchBar = document.getElementById("search-bar");
  const searchContainer = document.getElementById("search-container");
  searchContainer.classList.toggle("active");
  searchBar.focus();
}

document.addEventListener("keydown", function(event) {
  if (event.key === "/") {
    event.preventDefault();
    toggleSearch();
  }
});

document.getElementById("search-toggle").addEventListener("click", toggleSearch);

function initCustomSearch() {
  const searchInput = document.getElementById('search-bar') as HTMLInputElement;
  const searchResults = document.getElementById('search-results');
  
  if (!searchInput || !searchResults) return;

  let pagefind: any = null;
  const isDev = import.meta.env.DEV;

  async function loadEngine() {
    if (isDev) {
      searchInput.disabled = false;
      searchInput.placeholder = "Search (Dev Mode)...";
      return;
    }
    try {
      const path = "/pagefind/pagefind.js";
      pagefind = await import(/* @vite-ignore */ path);
      await pagefind.init();
      searchInput.disabled = false;
    } catch (e) {
      console.error("Pagefind load failed", e);
    }
  }

  async function performSearch(query: string) {
    if (!query.trim()) {
      searchResults.style.display = 'none';
      searchResults.innerHTML = '';
      return;
    }

    try {
      let resultsData = [];
      
      if (isDev) {
        resultsData = [{
          url: "/demo",
          meta: { title: "Demo Page (Dev)" },
          excerpt: "Test <mark>query</mark>",
          sub_results: [
            { excerpt: "This is the first <mark>query</mark> snippet." },
            { excerpt: "Another <mark>query</mark> found here." },
            { excerpt: "More <mark>query</mark> things." },
            { excerpt: "Hidden <mark>query</mark> snippet." },
            { excerpt: "Hidden <mark>query</mark> snippet 2." }
          ]
        }];
      } else if (pagefind) {
        const response = await pagefind.search(query);
        const topResults = response.results.slice(0, 8);
        resultsData = await Promise.all(topResults.map((r: any) => r.data()));
      }

      const html = resultsData.map(item => {
        const title = item.meta?.title || "Untitled";
        const url = item.url;
        
        let excerpts = item.sub_results && item.sub_results.length > 0 
          ? item.sub_results.map((sub: any) => sub.excerpt)
          : [item.excerpt];

        excerpts = excerpts.map((ex: string) => 
          ex.replace(/<mark>/g, '<strong>').replace(/<\/mark>/g, '</strong>')
        );

        const maxSnippets = 4;
        const visibleExcerpts = excerpts.slice(0, maxSnippets);
        const hiddenCount = excerpts.length - visibleExcerpts.length;

        let spansHtml = visibleExcerpts.map((ex: string) => `<span>${ex}</span>`).join('');
        
        if (hiddenCount > 0) {
          spansHtml += `<span class="more-matches">+${hiddenCount} more matches</span>`;
        }

        return `
          <div class="search-result item">
            <a class="result-title" href="${url}">${title}</a>
            ${spansHtml}
          </div>
        `;
      }).join('');

      if (resultsData.length !== 0) {
        searchResults.style.display = 'flex';
        searchResults.innerHTML = html;
      }

    } catch (err) {
      console.error("Pagefind error:", err);
    }
  }

  let debounceTimeout: any;
  searchInput.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value;
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      performSearch(query);
    }, 200);
  });

  loadEngine();
}

document.addEventListener('astro:page-load', initCustomSearch);
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  initCustomSearch();
} else {
  document.addEventListener('DOMContentLoaded', initCustomSearch);
}
