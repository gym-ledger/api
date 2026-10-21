import { randomUUID } from "crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../shared/errors/AppError.js";

/**
 * Exercise images on S3-compatible object storage (AWS S3, Cloudflare R2,
 * MinIO, ...), configured by the S3_* env vars. null when S3_BUCKET is unset:
 * image uploads are then refused with a 400.
 */
const client = env.S3_BUCKET
    ? new S3Client({
        region: env.S3_REGION,
        endpoint: env.S3_ENDPOINT,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
        credentials: {
            accessKeyId: env.S3_ACCESS_KEY_ID!,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
        },
    })
    : null;

export const isImageStorageConfigured = () => client !== null;

/** Longest side of a stored image, in pixels. */
const MAX_IMAGE_SIDE = 1200;

/**
 * Decodes the upload and re-encodes it as WebP (security audit S-22): the
 * client's file name and MIME type are never trusted, anything that doesn't
 * decode as an image is refused, and metadata such as EXIF location is
 * dropped. Very large pixel counts are refused before decoding.
 */
const reencodeImage = async (buffer: Buffer) => {
    try {
        return await sharp(buffer, { limitInputPixels: 40_000_000 })
            .rotate()
            .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer();
    } catch {
        throw new AppError("That file isn't an image that can be read. Use JPG, PNG or WebP", 400);
    }
};

/** Stores an exercise image and returns its object key and public URL. */
export const storeExerciseImage = async (buffer: Buffer) => {
    if (!client) {
        throw new AppError("Image uploads aren't set up on this server (no S3 storage configured)", 400);
    }
    const body = await reencodeImage(buffer);
    // A new key per upload, so caches never serve an old image under it.
    const key = `exercises/${randomUUID()}.webp`;
    await client.send(new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable",
    }));
    return { key, url: `${env.S3_PUBLIC_URL}/${key}` };
};

/** Best effort: a leftover object costs a little storage, never a failed request. */
export const deleteStoredImage = async (key: string | null | undefined) => {
    if (!client || !key) {
        return;
    }
    try {
        await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    } catch (error) {
        logger.warn({ error, key }, "Failed to delete a stored image");
    }
};
