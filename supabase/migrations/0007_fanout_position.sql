-- Position: 1-indexed order a sub-search query appeared in the engine's own
-- webSearchQueries array — i.e. the sequence Gemini actually fired them in
-- before answering. Mirrors citations.position (0004_citation_position.sql)
-- for the same reason: the order the engine itself produced things in is a
-- real signal (its first sub-query is usually the primary read of intent,
-- later ones are refinements/follow-ups), and it was being silently
-- discarded at insert time. Null for fanout rows captured before this
-- column existed.
alter table query_fanouts add column if not exists position integer;
