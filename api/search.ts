import { neon } from '@neondatabase/serverless';

export const config = {  // Vercel Edge Function config
  runtime: 'edge',
  regions: ['iad1'],
};

const title = 'Full-text time machine';
const resultsPerPage = 20;
const esc = (s: string) => s.replace(/[&<>'"]/g, c => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', "'": 'apos', '"': 'quot' }[c] as string};`);
const html = (q: string, results: string) => `<!DOCTYPE html>
  <html>
    <head>
      <title>${esc(title)}</title>
      <link rel="stylesheet" href="/style.css" />
    </head>
    <body>
      <h1>${esc(title)}</h1>
      <form method="GET">
        <p><input type="text" size="80" name="q" value="${esc(q.replace(/[+]/g, ' '))}" /> <input type="submit" value="Search" /></p>
      </form>
      ${results}
      <p class="description">
        Search the web like it’s 2019 and Google never existed.
        <a href="https://en.wikipedia.org/wiki/Okapi_BM25">BM25</a> full-text search over the 364,868,892 pages
        of the <a href="https://huggingface.co/datasets/allenai/c4">Colossal Common Crawl Corpus</a> (clean, English-only).
        Powered by <a href="https://neon.tech/docs/extensions/pg_search">pg_search</a>, <a href="https://neon.tech">Neon</a>
        and <a href="https://vercel.com/docs/functions">Vercel</a>. <a href="https://github.com/neondatabase-labs/c4-pg_search">Source code</a>.
      </p>
    </body>
  </html>`;

export default async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  let offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10));
  let results = '';

  if (q !== '') {
    const sql = neon(process.env.DATABASE_URL!);
    const searchTerms = `"${q.replace(/"/g, ' ').replace(/\s+/g, ' ')}"~2`;

    const rows = await sql`
      SELECT id, paradedb.score(id), paradedb.snippet(body), url, body
      FROM pages
      WHERE body @@@ ${searchTerms}
      ORDER BY paradedb.score(id) DESC, id 
      OFFSET ${offset} LIMIT ${resultsPerPage + 1}`;

    results = `
      <ol start="${offset + 1}">
        ${rows.slice(0, resultsPerPage).map((result) => `
          <li class="result">
            <div class="url">
              <a href="${result.url}"><span class="domain">${result.url.split('/')[2]}</span><span class="path">/${result.url.split('/').slice(3).join('/')}</span></a> 
              — <a href="https://web.archive.org/web/*/${result.url}">wayback</a> 
              / <label><input type="checkbox"><span class="link">text</span><div class="preview"><p>${esc(result.body).replace(/\n/g, '</p><p>')}</p></div></label>
            </div>
            <div class="snippet">&hellip;&nbsp;${result.snippet}&nbsp;&hellip;</div>
          </li>`
        ).join('\n')}
      </ol>
      <div class="controls">
        ${offset > 0 ? `<a href="?q=${esc(q)}&offset=${offset - resultsPerPage}">&laquo; Prev ${resultsPerPage}</a> &nbsp; ` : ''}
        ${rows.length > resultsPerPage ? `<a href="?q=${esc(q)}&offset=${offset + resultsPerPage}">Next ${resultsPerPage} &raquo;</a>` : ''}
      </div>`;
  }

  return new Response(html(q, results), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
