-- Exercise images now live on S3-compatible storage (infrastructure/storage).
-- image_url is the public URL shown in the apps; image_key is the object's
-- key in the bucket, kept so a replaced or removed image can be deleted.
ALTER TABLE exercises
    ADD COLUMN IF NOT EXISTS image_key TEXT;
