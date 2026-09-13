-- Fix: small matters got zero vector hits.
-- The HNSW index returns the ~40 nearest chunks across ALL matters and the matter filter
-- is applied afterwards, so a matter with few chunks (e.g. 19 next to 2,864) is usually
-- filtered down to nothing. Filter to the matter first, then rank exactly.
-- ponytail: exact scan per query scope; fine to ~100k chunks. Past that, use pgvector
-- iterative index scans (hnsw.iterative_scan) or per-matter partial indexes.

create index if not exists chunks_matter_id_idx on public.chunks (matter_id);

create or replace function public.match_chunks(
  query_embedding extensions.vector(1536),
  query_text text,
  matter_ids text[],
  match_count int default 12
) returns table (
  id bigint, matter_id text, doc_id text, page_start int, page_end int,
  text text, similarity float, fts_rank float
)
language sql stable security invoker set search_path = '' as $$
  with scope as materialized (       -- materialized: keeps the planner off the global HNSW index
    select c.id, c.embedding
    from public.chunks c
    where c.matter_id = any(matter_ids) and c.embedding is not null
  ), v as (
    select s.id, 1 - (s.embedding operator(extensions.<=>) query_embedding) as sim
    from scope s
    order by s.embedding operator(extensions.<=>) query_embedding
    limit match_count * 3
  ), f as (
    select c.id, ts_rank(c.tsv, websearch_to_tsquery('english', query_text)) as rk
    from public.chunks c
    where c.matter_id = any(matter_ids) and c.tsv @@ websearch_to_tsquery('english', query_text)
    order by rk desc
    limit match_count * 3
  ), u as (
    select coalesce(v.id, f.id) as id, coalesce(v.sim, 0)::float as sim, coalesce(f.rk, 0)::float as rk
    from v full join f on f.id = v.id
  )
  select c.id, c.matter_id, c.doc_id, c.page_start, c.page_end, c.text, u.sim, u.rk
  from u join public.chunks c on c.id = u.id
  order by (u.sim + least(u.rk, 0.5)) desc
  limit match_count
$$;
