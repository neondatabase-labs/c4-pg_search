import { neon } from '@neondatabase/serverless';

export default {
	async fetch(req, env): Promise<Response> {
		const t0 = performance.now();
		const { searchParams } = new URL(req.url);
		const q = searchParams.get('q')?.replace(/[+]/g, ' ').trim() ?? '';
		const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10));

		let results = '';
		if (q !== '') {
			const sql = neon(env.DATABASE_URL!);
			const searchTerms = `"${q.replace(/"/g, ' ').replace(/\s+/g, ' ')}"~2`;

			const rows = await sql`
        SELECT id, url, body, paradedb.score(id), paradedb.snippet(body)
        FROM pages
        WHERE body @@@ ${searchTerms}
        ORDER BY paradedb.score(id) DESC, id ASC
        OFFSET ${offset} LIMIT ${resultsPerPage + 1}`; // ordering by id is for stability

			results = `
        <ol start="${offset + 1}">
          ${rows.slice(0, resultsPerPage).map((result) => {
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
          ${rows.length > resultsPerPage ? `<a href="?q=${queryEsc(q)}&offset=${offset + resultsPerPage}">Next ${resultsPerPage} &raquo;</a>` : ''}
        </div>`;
		}
    await new Promise(resolve => setTimeout(resolve, 2000));
		return new Response(html(q, results, performance.now() - t0), {
			headers: { 'Content-Type': 'text/html; charset=utf-8' }
		});

	},
} satisfies ExportedHandler<Env>;

const title = 'Full-text time machine';
const resultsPerPage = 20;

const htmlEsc = (s: string) => s.replace(/[&<>'"]/g, c => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', "'": 'apos', '"': 'quot' }[c] as string};`);
const queryEsc = (q: string) => encodeURIComponent(q).replace(/%20/g, '+');

const html = (q: string, results: string, t: number) => `<!DOCTYPE html>
  <html lang="en">
    <head>
      <title>${htmlEsc(title)}</title>
      <link rel="stylesheet" href="/style.css">
    </head>
    <body>
      <h1>
        <svg width="48" height="48" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <style>
            .spinner { transform-origin: center }
            .spinner_h { transform: rotate(45deg) }
            .spinner_h_anim { animation: spinner_ZpfF 9s linear infinite }
            .spinner_m_anim { animation: spinner_ZpfF .75s linear infinite }
            @keyframes spinner_ZpfF{ 100% { transform: rotate(-360deg) } }
          </style>
          <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,20a9,9,0,1,1,9-9A9,9,0,0,1,12,21Z"/>
          <rect id="handh" class="spinner spinner_h" x="11" y="6" rx="1" width="2" height="7"/>
          <rect id="handm" class="spinner" x="11" y="11" rx="1" width="2" height="9"/>
        </svg>
        ${htmlEsc(title)}
      </h1>
      <form method="GET">
        <p><input type="text" size="50" name="q" value="${htmlEsc(q)}"> <input type="submit" value="Search"></p>
        <p id="searching">Searching: this can take several minutes &hellip;</p>
      </form>
      ${results}
      <p class="description">
        Search the web like it’s 2019 — and <a href="https://web.stanford.edu/class/cs54n/handouts/24-GooglePageRankAlgorithm.pdf">PageRank</a> never existed.
        This is <a href="https://en.wikipedia.org/wiki/Okapi_BM25">BM25</a> full-text search over the 364,868,892 pages
        of the <a href="https://huggingface.co/datasets/allenai/c4">Colossal Common Crawl Corpus</a> (clean, English-only),
        powered by <a href="https://neon.tech/docs/extensions/pg_search">pg_search</a>, <a href="https://neon.tech">Neon</a>
        and <a href="https://vercel.com/docs/functions">Vercel</a>. Source <a href="https://github.com/neondatabase-labs/c4-pg_search/blob/main/api/search.ts">on GitHub</a>.
      </p>
      <p class="timing">${t.toFixed(2)} ms</p>
      <script>
        document.querySelector('form').addEventListener('submit', e => {
          e.target.classList.add('submitting');
          document.querySelector('#handh').classList.add('spinner_h_anim');
          document.querySelector('#handm').classList.add('spinner_m_anim');
        });
      </script>
    </body>
  </html>`;
