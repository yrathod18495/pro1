import { getSignedUploadUrlAction, logUploadFailureAction, logUploadSuccessAction, uploadToGCS } from './gcs-actions';
import { reportServerError } from '@/lib/report-error';
import { resolvePublicAudioUrl } from '@/lib/utils';

/**
 * 🔗 Builds the URL used in the Telegram "Storage Asset Uploaded" log —
 * NOT the value returned to callers of uploadFileDirectly (that stays the
 * gcs://pub:// pointer, unchanged, since Firestore/RTDB and every other
 * consumer expect that canonical form).
 *
 * Public uploads: resolvePublicAudioUrl already builds a real, directly
 * fetchable CDN URL (storage.12labs.in/public/...) — same fix as before.
 *
 * Private uploads: there IS no working direct CDN URL for secure/ objects
 * (the bucket doesn't serve that prefix publicly by design) — only the
 * authenticated /api/download proxy can fetch them. So for a private
 * upload this builds a link to THAT proxy instead, which actually opens
 * when clicked, rather than a raw "gcs://..." string that isn't a URL at
 * all and can't go anywhere.
 */
function urlForUploadLog(pointer: string, bucketType: 'public' | 'private'): string {
    if (bucketType === 'public') return resolvePublicAudioUrl(pointer);
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.12labs.in').replace(/\/+$/, '');
    return `${siteUrl}/api/download?url=${encodeURIComponent(pointer)}`;
}

export interface UploadOptions {
    file: File | Blob;
    fileName?: string;
    bucketType: 'public' | 'private';
    folder: string;
    userId: string;
    userEmail?: string;
    onProgress?: (percent: number) => void;
    maxSizeMb?: number; // default: 50MB
}

// Formats that must NOT go through the canvas re-encode: GIF would lose
// animation (canvas only ever captures a single frame), and SVG is already
// vector/tiny and canvas would rasterize it, so both pass through untouched.
const SKIP_COMPRESSION_TYPES = new Set(['image/gif', 'image/svg+xml']);
const MAX_IMAGE_DIMENSION = 2048;
const WEBP_QUALITY = 0.82;

/**
 * 🖼️ CLIENT-SIDE IMAGE COMPRESSOR (Canvas -> WebP)
 * -----------------------------------------------------------
 * Every image uploaded anywhere on the site goes through
 * uploadFileDirectly, so compressing here — instead of at each of the
 * dozen call sites — covers all of them at once (QR codes, product
 * thumbnails, avatars, store assets, etc). Downscales anything larger
 * than MAX_IMAGE_DIMENSION on its longest side, then re-encodes as WebP.
 * Never throws: any failure (unsupported browser, corrupt image, etc.)
 * falls back to uploading the original file untouched.
 */
async function compressImageToWebP(file: File | Blob, fileName: string): Promise<{ blob: Blob; fileName: string; contentType: string } | null> {
    if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return null;
    const type = file.type || '';
    if (!type.startsWith('image/') || SKIP_COMPRESSION_TYPES.has(type)) return null;

    try {
        const bitmap = await createImageBitmap(file);
        let { width, height } = bitmap;
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
            const scale = MAX_IMAGE_DIMENSION / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close?.();

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob((b) => resolve(b), 'image/webp', WEBP_QUALITY);
        });
        // Some browsers silently fall back to PNG from toBlob('image/webp', ...)
        // when WebP encoding isn't supported — only use the result if it's
        // genuinely smaller than the original and actually WebP.
        if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return null;

        const webpName = fileName.replace(/\.[a-zA-Z0-9]+$/, '') + '.webp';
        return { blob, fileName: webpName, contentType: 'image/webp' };
    } catch (e) {
        reportServerError('src/lib/gcs-client.ts:88', e);
        return null;
    }
}

/**
 * 🛰️ UNIVERSAL CLIENT-SIDE DIRECT UPLOADER (v5.0 - HIGH-RELIABILITY NODE)
 * -----------------------------------------------------------
 * Directly uploads files via dedicated /api/upload endpoint with
 * automatic S3 signed URL and Server Action fallback pipelines.
 */
export async function uploadFileDirectly(options: UploadOptions): Promise<string> {
    const {
        fileName,
        bucketType,
        folder,
        userId,
        userEmail = 'N/A',
        onProgress,
        maxSizeMb = 100
    } = options;

    let file: File | Blob = options.file;
    let actualFileName = fileName || (file as File).name || `file_${Date.now()}`;
    let contentType = file.type || 'audio/mpeg';

    // Compress + convert images to WebP before anything else touches
    // `file`/`contentType`/size — every route below (presigned R2, the
    // server-action fallback, and the /api/upload fallback) reads these
    // same three variables, so this one pass covers all of them.
    const compressed = await compressImageToWebP(file, actualFileName);
    if (compressed) {
        file = compressed.blob;
        actualFileName = compressed.fileName;
        contentType = compressed.contentType;
    }

    const fileSize = file.size;

    // 1. Client-side Size Validation
    const maxSizeBytes = maxSizeMb * 1024 * 1024;
    if (fileSize > maxSizeBytes) {
        const errorMsg = `File size (${(fileSize / (1024 * 1024)).toFixed(2)}MB) exceeds the maximum allowed limit of ${maxSizeMb}MB.`;
        await logUploadFailureAction({ userEmail, fileName: actualFileName, errorMessage: errorMsg });
        throw new Error(errorMsg);
    }

    const effectiveUserId = userId || 'authenticated_user';

    // 2. Primary Route: Direct Cloudflare R2 Presigned Upload (Bypasses Next.js 413 Payload Limit)
    try {
        const signRes = await getSignedUploadUrlAction({
            fileName: actualFileName,
            contentType,
            bucketType,
            folder,
            userId: effectiveUserId,
            fileSize
        });

        if (signRes.success && signRes.signedUrl && signRes.gcsPath) {
            const resultPath = await new Promise<string>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('PUT', signRes.signedUrl!);
                if (contentType) {
                    xhr.setRequestHeader('Content-Type', contentType);
                }
                xhr.timeout = 10 * 60 * 1000; // 10 minutes timeout

                if (xhr.upload && onProgress) {
                    xhr.upload.onprogress = (event) => {
                        if (event.lengthComputable) {
                            const percentComplete = (event.loaded / event.total) * 100;
                            onProgress(Math.min(99.9, percentComplete));
                        }
                    };
                }

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        if (onProgress) onProgress(100);
                        resolve(signRes.gcsPath!);
                    } else {
                        reject(new Error(`Direct R2 node returned HTTP ${xhr.status}`));
                    }
                };

                xhr.onerror = () => {
                    reject(new Error('Network error during direct R2 storage sync.'));
                };

                xhr.ontimeout = () => {
                    reject(new Error('Upload connection timed out on direct R2 storage node.'));
                };

                xhr.send(file);
            });

            logUploadSuccessAction({
                userEmail,
                fileName: actualFileName,
                // 🔴 FIX: this used to log `resultPath` as-is — the internal
                // `pub://...`/`gcs://...` pointer, not a real URL. Telegram
                // then showed it as a "Direct Asset Link" that isn't
                // clickable/fetchable, and read as if the app were still
                // using Google Cloud Storage (it isn't — this whole file
                // talks to R2 only; "gcs"/"pub" are just legacy pointer
                // prefix names). Resolving public uploads to the real R2/
                // CDN https URL here fixes both. Private/secure uploads
                // keep the pointer — there's no public https URL for those
                // by design, only signed access. The RETURN VALUE below is
                // unchanged (still the pointer, since callers/Firestore
                // expect that canonical form) — only the log line differs.
                publicUrl: urlForUploadLog(resultPath, bucketType),
            }).catch((e: any) => { reportServerError('src/lib/gcs-client.ts:203', e); return null; });
            return resultPath;
        }
    } catch (presignedErr: any) {
        reportServerError('src/lib/gcs-client.ts:205', presignedErr);
        console.warn("[Primary Direct R2 Upload failed, attempting /api/upload Fallback]:", presignedErr.message);
    }

    let lastError = "Direct upload failed.";

    // 3. Fallback Route 1: Server Action (50MB Limit)
    try {
        const formData = new FormData();
        const uploadFile = file instanceof File ? file : new File([file], actualFileName, { type: contentType });
        formData.append('file', uploadFile);
        formData.append('bucketType', bucketType);
        formData.append('folder', folder);
        formData.append('userId', effectiveUserId);
        formData.append('fileName', actualFileName);

        const serverActionRes = await uploadToGCS(formData);
        if (serverActionRes.success && serverActionRes.url) {
            if (onProgress) onProgress(100);
            logUploadSuccessAction({
                userEmail,
                fileName: actualFileName,
                publicUrl: urlForUploadLog(serverActionRes.url, bucketType),
            }).catch((e: any) => { reportServerError('src/lib/gcs-client.ts:230', e); return null; });
            return serverActionRes.url;
        } else if (serverActionRes.error) {
            lastError = serverActionRes.error;
        }
    } catch (serverActionErr: any) {
        reportServerError('src/lib/gcs-client.ts:233', serverActionErr);
        console.warn("[Server Action Fallback failed, attempting /api/upload]:", serverActionErr.message);
        lastError = serverActionErr.message;
    }

    // 4. Fallback Route 2: /api/upload endpoint (Raw binary stream to bypass multipart 413 limits)
    try {
        const queryParams = new URLSearchParams({
            bucketType,
            folder,
            userId: effectiveUserId,
            fileName: actualFileName
        });

        const resultUrl = await new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `/api/upload?${queryParams.toString()}`);
            if (contentType) {
                xhr.setRequestHeader('Content-Type', contentType);
            }
            xhr.timeout = 10 * 60 * 1000; // 10 minutes timeout

            if (xhr.upload && onProgress) {
                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const percentComplete = (event.loaded / event.total) * 100;
                        onProgress(Math.min(99.9, percentComplete));
                    }
                };
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        if (data.success && data.url) {
                            if (onProgress) onProgress(100);
                            resolve(data.url);
                        } else {
                            reject(new Error(data.error || 'Server upload failed.'));
                        }
                    } catch (parseErr) {
            reportServerError('src/lib/gcs-client.ts:163', parseErr);
                        reject(new Error('Invalid response format from upload node.'));
                    }
                } else {
                    reject(new Error(`Server upload returned HTTP ${xhr.status}`));
                }
            };

            xhr.onerror = () => {
                reject(new Error('Network error during secondary server sync.'));
            };

            xhr.ontimeout = () => {
                reject(new Error('Upload connection timed out on secondary server.'));
            };

            xhr.send(file);
        });

        logUploadSuccessAction({
            userEmail,
            fileName: actualFileName,
            publicUrl: urlForUploadLog(resultUrl, bucketType),
        }).catch((e: any) => { reportServerError('src/lib/gcs-client.ts:301', e); return null; });
        return resultUrl;
    } catch (apiErr: any) {
            reportServerError('src/lib/gcs-client.ts:184', apiErr);
        lastError = apiErr.message || 'Storage Sync Failed';
    }

    await logUploadFailureAction({ 
        userEmail, 
        fileName: actualFileName, 
        errorMessage: `Storage Sync Failed: ${lastError}` 
    });
    throw new Error(`Upload failed: ${lastError || 'Unable to store file across storage nodes.'}`);
}
