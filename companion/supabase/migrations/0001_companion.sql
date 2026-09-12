-- Case Companion: private, per-matter study layer over paper-archive corpora.
-- Lives in the archive project (mnsmfobozohejvnmnalw) next to the public `archive`
-- bucket, which it reads but never writes. The public reader uses no tables.
--
-- Source tables (documents/document_pages/chunks) are written only by the service
-- role (worker/load_archive.py, worker/worker.py). App users get SELECT only on
-- them, so the verbatim transcript can never be edited in place from the app.
-- Everything the advocate adds lives in separate tables.

create extension if not exists vector with schema extensions;

-- ── Workspace & matters ──────────────────────────────────────────────────────

-- Who may use the workspace at all (create matters, upload). Managed by the owner
-- with the service role; a stray sign-up sees and can create nothing.
create table public.app_users (
  email text primary key,
  role  text not null default 'advocate' check (role in ('advocate','staff'))
);

create table public.matters (
  id           text primary key,             -- slug, e.g. shah-v-trindade
  title        text not null,
  short        text,
  kind         text not null default 'arbitration',  -- arbitration / civil / consumer / other
  forum        text,
  venue        text,
  cause        text,
  posture      text,
  parties      jsonb not null default '{}',  -- as printed / as entered
  disclaimer   text not null,
  stages       jsonb not null default '[]',  -- act-stage taxonomy [{id,title,note}]
  storage_base text,                         -- public bucket base (archive matter); null => private `companion` bucket
  created_by   uuid default auth.uid() references auth.users,
  created_at   timestamptz not null default now()
);

create table public.matter_members (
  matter_id text not null references public.matters on delete cascade,
  email     text not null,
  role      text not null default 'advocate' check (role in ('advocate','staff')),
  primary key (matter_id, email)
);

-- ── Source corpus (service-role writes only) ─────────────────────────────────

create table public.documents (
  id              text primary key,          -- registry doc id, verbatim
  matter_id       text not null references public.matters on delete cascade,
  stage           text not null,
  kind            text,
  title           text not null,
  filename        text not null,
  source_path     text,
  page_count      int not null,
  bytes           bigint,
  sha256          text not null,
  pdf_path        text,                      -- relative to matter storage
  transcript_path text,
  ocr_source      text,                      -- firecrawl / google-vision / pdftotext / mixed
  sections        jsonb not null default '[]',
  transcript      text,                      -- verbatim FULL-TRANSCRIPT.md
  sort            int not null default 0,
  ingested_at     timestamptz not null default now()
);
create index on public.documents (matter_id, stage, sort);

create table public.document_pages (
  doc_id      text not null references public.documents on delete cascade,
  page_no     int  not null,
  jpeg_path   text not null,                 -- relative to matter storage
  text        text,                          -- verbatim page text; null when only the scan exists
  text_source text,
  primary key (doc_id, page_no)
);

-- Retrieval units: paragraph-level, pinned to a page (or a section's page range
-- when the OCR carried no page boundaries).
create table public.chunks (
  id         bigint generated always as identity primary key,
  matter_id  text not null references public.matters on delete cascade,
  doc_id     text not null references public.documents on delete cascade,
  page_start int  not null,
  page_end   int  not null,
  ord        int  not null,
  text       text not null,
  tsv        tsvector generated always as (to_tsvector('english', text)) stored,
  embedding  extensions.vector(1536)
);
create index on public.chunks using gin (tsv);
create index on public.chunks using hnsw (embedding extensions.vector_cosine_ops);
create index on public.chunks (doc_id, ord);

create table public.ingest_jobs (
  id           uuid primary key default gen_random_uuid(),
  matter_id    text not null references public.matters on delete cascade,
  stage        text not null,
  title        text not null,
  filename     text not null,
  storage_path text not null,                -- {matter}/uploads/{file} in `companion`
  status       text not null default 'queued' check (status in ('queued','processing','done','failed')),
  error        text,
  doc_id       text references public.documents on delete set null,
  page_count   int,
  pages_done   int not null default 0,
  created_by   uuid not null default auth.uid() references auth.users,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.ingest_jobs (status, created_at);

-- ── Advocate's private layer (editable, never touches source rows) ───────────

create table public.annotations (
  id         uuid primary key default gen_random_uuid(),
  matter_id  text not null references public.matters on delete cascade,
  doc_id     text not null references public.documents on delete cascade,
  page_no    int,
  char_start int,                             -- offsets into documents.transcript
  char_end   int,
  quote      text,                            -- the selected source span, copied for display
  body       text not null default '',
  tags       text[] not null default '{}',
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now(),
  check (char_start is null or char_end >= char_start)
);
create index on public.annotations (doc_id);
create index on public.annotations using gin (tags);

create table public.hearings (
  id             uuid primary key default gen_random_uuid(),
  matter_id      text not null references public.matters on delete cascade,
  date           date not null,
  forum          text,
  purpose        text,
  status         text not null default 'upcoming' check (status in ('upcoming','held')),
  minutes_doc_id text references public.documents on delete set null,
  created_at     timestamptz not null default now()
);
create index on public.hearings (matter_id, date);

create table public.collections (
  id         uuid primary key default gen_random_uuid(),
  matter_id  text not null references public.matters on delete cascade,
  title      text not null,
  note       text,
  hearing_id uuid references public.hearings on delete set null,
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now()
);

create table public.collection_items (
  collection_id uuid not null references public.collections on delete cascade,
  doc_id        text not null references public.documents on delete cascade,
  page_no       int,
  note          text,
  added_at      timestamptz not null default now(),
  primary key (collection_id, doc_id)
);

create table public.chronology_entries (
  id         uuid primary key default gen_random_uuid(),
  matter_id  text not null references public.matters on delete cascade,
  date       date,
  date_text  text,                             -- "Mar 2013", "c. 1998" when no exact date
  title      text not null,
  body       text,
  doc_id     text references public.documents on delete set null,  -- null => advocate's own note
  page_no    int,
  hearing_id uuid references public.hearings on delete cascade,     -- set when fed by confirmed minutes
  sort       int not null default 0,
  created_by uuid default auth.uid() references auth.users,
  created_at timestamptz not null default now()
);
create index on public.chronology_entries (matter_id, date, sort);

create table public.hearing_notes (
  id                   uuid primary key default gen_random_uuid(),
  hearing_id           uuid not null unique references public.hearings on delete cascade,
  matter_id            text not null references public.matters on delete cascade,
  raw                  text not null default '',
  draft                jsonb,                  -- {attendees[],orders[],next_date,action_items[]}, each item with source_quote
  drafted_by           text check (drafted_by in ('ai','advocate')),
  reviewed_by_advocate boolean not null default false,
  reviewed_at          timestamptz,
  created_by           uuid not null default auth.uid() references auth.users,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.qa_threads (
  id         uuid primary key default gen_random_uuid(),
  matter_id  text references public.matters on delete cascade,   -- null => across all my matters
  title      text not null,
  created_by uuid not null default auth.uid() references auth.users,
  created_at timestamptz not null default now()
);

create table public.qa_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.qa_threads on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  citations  jsonb not null default '[]',      -- verified claims [{text,citations:[{doc_id,page_start,page_end,quote,chunk_id}]}]
  retrieved  jsonb not null default '{}',      -- what the model was shown + what was rejected (audit)
  status     text check (status in ('answered','not_in_corpus')),
  model      text,
  created_at timestamptz not null default now()
);
create index on public.qa_messages (thread_id, created_at);

create table public.people (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  norm       text not null unique,             -- lowercased, honorifics stripped
  created_at timestamptz not null default now()
);

create table public.matter_people (
  matter_id  text not null references public.matters on delete cascade,
  person_id  uuid not null references public.people on delete cascade,
  role       text not null,                    -- claimant / respondent / arbitrator / counsel / ...
  as_printed text,
  primary key (matter_id, person_id, role)
);

-- ── Access helpers ───────────────────────────────────────────────────────────

create or replace function public.jwt_email() returns text
language sql stable set search_path = '' as $$ select lower(auth.jwt() ->> 'email') $$;

create or replace function public.is_member(m text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.matter_members mm
                 where mm.matter_id = m and lower(mm.email) = public.jwt_email())
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_users u where lower(u.email) = public.jwt_email())
$$;

create or replace function public.people_norm(n text) returns text
language sql immutable set search_path = '' as $$
  select trim(regexp_replace(regexp_replace(lower(n),
    '\m(mr|mrs|ms|miss|dr|adv|advocate|shri|smt|sri|kum|late|sr|senior|hon''ble)\M\.?', '', 'g'),
    '[^a-z0-9]+', ' ', 'g'))
$$;

-- Adds (or links) a person to a matter, deduped across matters by normalised name.
create or replace function public.add_matter_person(m text, person text, person_role text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pid uuid; nn text := public.people_norm(person);
begin
  if not public.is_member(m) and auth.role() <> 'service_role' then raise exception 'not a member of %', m; end if;
  if nn = '' then return null; end if;
  insert into public.people (name, norm) values (trim(person), nn)
    on conflict (norm) do update set norm = excluded.norm returning id into pid;
  insert into public.matter_people (matter_id, person_id, role, as_printed)
    values (m, pid, person_role, trim(person)) on conflict do nothing;
  return pid;
end $$;

-- New workspace matter: staff only; creator becomes a member.
create or replace function public.create_matter(
  m_id text, m_title text, m_kind text, m_forum text, m_cause text,
  m_stages jsonb, m_disclaimer text, m_people jsonb default '[]'
) returns text language plpgsql security definer set search_path = '' as $$
declare p jsonb;
begin
  if not public.is_staff() then raise exception 'not a workspace user'; end if;
  insert into public.matters (id, title, short, kind, forum, cause, stages, disclaimer, created_by)
    values (m_id, m_title, m_title, m_kind, m_forum, m_cause, m_stages, m_disclaimer, auth.uid());
  insert into public.matter_members (matter_id, email) values (m_id, public.jwt_email());
  for p in select * from jsonb_array_elements(m_people) loop
    perform public.add_matter_person(m_id, p ->> 'name', p ->> 'role');
  end loop;
  return m_id;
end $$;

revoke execute on function public.create_matter from anon;
revoke execute on function public.add_matter_person from anon;

-- ── RLS ──────────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['app_users','matters','matter_members','documents','document_pages','chunks',
    'ingest_jobs','annotations','hearings','collections','collection_items','chronology_entries',
    'hearing_notes','qa_threads','qa_messages','people','matter_people']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy self_read on public.app_users for select to authenticated using (lower(email) = public.jwt_email());

create policy read   on public.matters for select to authenticated using (public.is_member(id));
create policy edit   on public.matters for update to authenticated using (public.is_member(id)) with check (public.is_member(id));
create policy read   on public.matter_members for select to authenticated using (public.is_member(matter_id));

-- Source corpus: read-only for members. No write policies => only the service role writes.
create policy read on public.documents      for select to authenticated using (public.is_member(matter_id));
create policy read on public.document_pages for select to authenticated
  using (exists (select 1 from public.documents d where d.id = doc_id and public.is_member(d.matter_id)));
create policy read on public.chunks         for select to authenticated using (public.is_member(matter_id));
create policy read on public.matter_people  for select to authenticated using (public.is_member(matter_id));
create policy read on public.people         for select to authenticated
  using (exists (select 1 from public.matter_people mp where mp.person_id = id and public.is_member(mp.matter_id)));

-- Uploads: members queue jobs and watch them; only the worker updates them.
create policy read  on public.ingest_jobs for select to authenticated using (public.is_member(matter_id));
create policy queue on public.ingest_jobs for insert to authenticated
  with check (public.is_member(matter_id) and status = 'queued' and created_by = auth.uid());

-- Advocate layer: full CRUD for members of the matter.
do $$
declare t text;
begin
  foreach t in array array['annotations','hearings','collections','chronology_entries','hearing_notes']
  loop
    execute format('create policy member_all on public.%I for all to authenticated
      using (public.is_member(matter_id)) with check (public.is_member(matter_id))', t);
  end loop;
end $$;

create policy member_all on public.collection_items for all to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and public.is_member(c.matter_id)))
  with check (exists (select 1 from public.collections c where c.id = collection_id and public.is_member(c.matter_id)));

-- Q&A: threads are private to their author; matter-scoped threads also need membership.
create policy own on public.qa_threads for all to authenticated
  using (created_by = auth.uid() and (matter_id is null or public.is_member(matter_id)))
  with check (created_by = auth.uid() and (matter_id is null or public.is_member(matter_id)));
create policy own on public.qa_messages for all to authenticated
  using (exists (select 1 from public.qa_threads t where t.id = thread_id and t.created_by = auth.uid()))
  with check (exists (select 1 from public.qa_threads t where t.id = thread_id and t.created_by = auth.uid()));

-- ── Private bucket for uploaded matters: {matter}/uploads|pages|pdfs/... ─────

insert into storage.buckets (id, name, public, file_size_limit)
values ('companion', 'companion', false, 52428800)
on conflict (id) do nothing;

create policy "companion member read" on storage.objects for select to authenticated
  using (bucket_id = 'companion' and public.is_member((storage.foldername(name))[1]));
create policy "companion member upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'companion' and (storage.foldername(name))[2] = 'uploads'
              and public.is_member((storage.foldername(name))[1]));

-- ── Retrieval: hybrid vector + full-text; security invoker so RLS applies ────

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
  with v as (
    select c.id, 1 - (c.embedding operator(extensions.<=>) query_embedding) as sim
    from public.chunks c
    where c.matter_id = any(matter_ids) and c.embedding is not null
    order by c.embedding operator(extensions.<=>) query_embedding
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
