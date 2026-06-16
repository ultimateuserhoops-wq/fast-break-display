
CREATE POLICY "public read media" ON storage.objects FOR SELECT
  USING (bucket_id IN ('team-logos','team-photos','player-photos'));
CREATE POLICY "auth write media" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('team-logos','team-photos','player-photos'));
CREATE POLICY "auth update media" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('team-logos','team-photos','player-photos'));
CREATE POLICY "auth delete media" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('team-logos','team-photos','player-photos'));
