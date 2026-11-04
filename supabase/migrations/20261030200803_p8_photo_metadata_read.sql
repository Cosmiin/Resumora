-- Hosted Storage checks metadata before serving authenticated object bytes.
-- Permit that exact preflight under the existing ownership/lifecycle predicate.
-- Keep listing, signing, HEAD, anonymous access and every write guard unchanged.
ALTER POLICY cv_photo_read ON storage.objects USING (
  bucket_id = 'cv-photos' AND (
    ((storage.allow_only_operation('storage.object.get_authenticated')
      OR storage.allow_only_operation('object.get_authenticated_info'))
      AND app.photo_storage_access(name, 'read'))
    OR (storage.allow_only_operation('storage.object.delete_many')
      AND app.photo_storage_access(name, 'delete'))
  )
);

ALTER POLICY cv_photo_read_guard ON storage.objects USING (
  bucket_id <> 'cv-photos' OR (auth.uid() IS NOT NULL AND (
    ((storage.allow_only_operation('storage.object.get_authenticated')
      OR storage.allow_only_operation('object.get_authenticated_info'))
      AND app.photo_storage_access(name, 'read'))
    OR (storage.allow_only_operation('storage.object.delete_many')
      AND app.photo_storage_access(name, 'delete'))
  ))
);
