-- Perspective-Lead-Import: alle 5 Minuten das Postfach abholen.
--
-- Bereits in Produktion eingerichtet (jobid 1). Diese Datei dokumentiert den
-- Job; das Secret in der URL steht NICHT im Repo — beim Neuanlegen den Wert aus
-- dem Supabase-Secret PERSPECTIVE_IMAP_SECRET einsetzen.
--
-- timeout_milliseconds ist Pflicht: pg_net bricht standardmaessig nach 5 s ab,
-- die Function braucht ~6 s (IMAP-Login, SEARCH, FETCH). Ohne den Wert wurde
-- jeder Lauf als Timeout geloggt und tauchte im API-Gateway als Fehler auf.
select cron.schedule(
  'perspective-imap',
  '*/5 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://emrjxrtxlvyrwplglkzk.supabase.co/functions/v1/perspective-imap?tage=3&limit=40&secret=<PERSPECTIVE_IMAP_SECRET>',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cmd$
);
