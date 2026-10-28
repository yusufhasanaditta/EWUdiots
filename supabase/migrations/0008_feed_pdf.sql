-- EWUdiots 0008: notices keep their PDF link in the automatic feed.
alter table public.feed_items add column if not exists pdf text not null default '' check (pdf = '' or pdf ~ '^https://');
