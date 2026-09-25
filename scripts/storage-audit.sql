-- Read-only: run as an authorized database operator. Sizes are usage, not plan limits.
SELECT current_database() AS database_name, pg_size_pretty(pg_database_size(current_database())) AS database_used;
SELECT schemaname,relname,n_live_tup AS estimated_rows,
 pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
 pg_size_pretty(pg_indexes_size(relid)) AS index_size
FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC;
SELECT extname,nspname AS extension_schema FROM pg_extension JOIN pg_namespace ON extnamespace=pg_namespace.oid WHERE extname='pg_trgm';
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname;
-- Approximate inline photo payload; can scan a large table. Run off-peak if needed.
SELECT count(*) FILTER (WHERE photo_url LIKE 'data:%') AS inline_student_photos,
 coalesce(sum(octet_length(photo_url)) FILTER (WHERE photo_url LIKE 'data:%'),0) AS inline_student_photo_bytes FROM public.students;
SELECT count(*) FILTER (WHERE image_url LIKE 'data:%') AS inline_school_images,
 coalesce(sum(octet_length(image_url)) FILTER (WHERE image_url LIKE 'data:%'),0) AS inline_school_image_bytes FROM public.schools;
