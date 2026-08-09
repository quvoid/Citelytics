-- Position: 1-indexed order a citation appeared in the engine's own
-- response (e.g. Gemini's groundingChunks array order), which reflects the
-- engine's citation/relevance ordering. Null for citations fetched before
-- this column existed, or for engines that don't expose ordering.
alter table citations add column if not exists position integer;
