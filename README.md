# C4-pg_search

BM25 search over the Colossal Common Crawl Corpus using pg_search.

```bash
pnpm install

# dev
echo 'DATABASE_URL="postgresql://..."' > .dev.vars
pnpm dev

# deploy
pnpx wrangler secret put DATABASE_URL
pnpm run deploy
```
