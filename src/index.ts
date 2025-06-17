import { Pool } from 'pg';

// We use pg (over TCP) instead of @neondatabase/serverless (over WebSockets)
// because Cloudflare Workers disconnect WebSockets if there is no traffic for
// 100s. We plan to start sending WebSocket Ping frames from the Neon proxy to
// fix this, but the change is not yet implemented.

export default {
  async fetch(req, env, ctx): Promise<Response> {
    const t0 = performance.now();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.replace(/[+]/g, ' ').trim() ?? '';
    const searchTerms = `"${q.replace(/"/g, ' ').replace(/\s+/g, ' ')}"~2`;
    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10));
    let fromCache = false;
    let results = '';

    if (q !== '') {
      let hits: any[];
      const cache = caches.default;
      const cacheKey = `https://c4-pg-search/${encodeURIComponent(searchTerms)}/${offset}/${resultsPerPage}`;
      const cachedHits = await cache.match(cacheKey);
      
      if (cachedHits) {
        hits = await cachedHits.json();
        fromCache = true;

      } else {
        const pool = new Pool({ connectionString: env.DATABASE_URL });
        const qresult = await pool.query(`
          SELECT id, url, body, paradedb.score(id), paradedb.snippet(body)
          FROM pages
          WHERE body @@@ $1
          ORDER BY paradedb.score(id) DESC, id ASC
          OFFSET $2 LIMIT $3`,
          [searchTerms, offset, resultsPerPage + 1] // we request one extra result to know whether to display the 'Next' button
        );
        hits = qresult.rows;
        ctx.waitUntil(pool.end());
        ctx.waitUntil(caches.default.put(cacheKey, new Response(JSON.stringify(hits), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=2592000' /* 30 days */ }
        })));
      }

      results = hits.length === 0 ? '<p>No results.</p>' : `
        <ol start="${offset + 1}">
          ${hits.slice(0, resultsPerPage).map((result) => {
        const { url, snippet, body } = result;
        const [, host, path] = url.match(/[/]([^/]+)(.*)$/) ?? [];
        return `
              <li class="result">
                <div class="url">
                  <a href="${url}"><span class="domain">${host}</span><span class="path">${path}</span></a>
                  — <a href="https://web.archive.org/web/*/${url}">wayback</a>
                  / <label><input type="checkbox"><span class="link">text</span><div class="preview"><p>${htmlEsc(body).replace(/\n/g, '</p><p>')}</p></div></label>
                </div>
                <div class="snippet">&hellip;&nbsp;${snippet}&nbsp;&hellip;</div>
              </li>`;
      }).join('\n')}
        </ol>
        <div class="controls">
          ${offset > 0 ? `<a href="?q=${queryEsc(q)}&offset=${offset - resultsPerPage}">&laquo; Prev ${resultsPerPage}</a> &nbsp; ` : ''}
          ${hits.length > resultsPerPage ? `<a href="?q=${queryEsc(q)}&offset=${offset + resultsPerPage}">Next ${resultsPerPage} &raquo;</a>` : ''}
        </div>`;
    }

    return new Response(html(q, results, performance.now() - t0, fromCache), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });

  },
} satisfies ExportedHandler<Env>;

const title = 'Full-text time machine';
const resultsPerPage = 20;

const htmlEsc = (s: string) => s.replace(/[&<>'"]/g, c => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', "'": 'apos', '"': 'quot' }[c] as string};`);
const queryEsc = (q: string) => encodeURIComponent(q).replace(/%20/g, '+');

const html = (q: string, results: string, t: number, fromCache: boolean) => `<!DOCTYPE html>
  <html lang="en">
    <head>
      <title>${htmlEsc(title)}</title>
      <link rel="stylesheet" href="/style.css">
    </head>
    <body>
      <h1>
        <svg width="48" height="48" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,20a9,9,0,1,1,9-9A9,9,0,0,1,12,21Z"/>
          <rect id="handh" class="spinner spinner_h" x="11" y="6" rx="1" width="2" height="7"/>
          <rect id="handm" class="spinner" x="11" y="11" rx="1" width="2" height="9"/>
        </svg>
        ${htmlEsc(title)}
      </h1>
      <form method="GET">
        <p><input type="text" size="50" name="q" value="${htmlEsc(q)}"> <input type="submit" value="Search"></p>
        <p id="searching">Please wait: this can take several minutes &hellip;</p>
      </form>
      ${results}
      <p class="description">
        Search the web like it’s 2019 — and <a href="https://web.stanford.edu/class/cs54n/handouts/24-GooglePageRankAlgorithm.pdf">PageRank</a> never existed.
        This is <a href="https://en.wikipedia.org/wiki/Okapi_BM25">BM25</a> full-text search over the 364,868,892 pages
        of the <a href="https://huggingface.co/datasets/allenai/c4">Colossal Common Crawl Corpus</a> (clean, English-only),
        powered by <a href="https://neon.tech/docs/extensions/pg_search">pg_search</a> and <a href="https://neon.tech">Neon</a>.
        Source <a href="https://github.com/neondatabase-labs/c4-pg_search/blob/main/api/search.ts">on GitHub</a>.
      </p>
      <p class="timing">${t.toFixed(2)} ms${fromCache ? ' (from cache)' : ''}</p>
      <script>
        document.querySelector('form').addEventListener('submit', e => {
          e.target.classList.add('submitting');
          // sadly, Safari appears not to run SVG animations during form subission/page load
          document.querySelector('#handh').classList.add('spinner_h_anim');
          document.querySelector('#handm').classList.add('spinner_m_anim');
        });
      </script>
    </body>
  </html>`;
