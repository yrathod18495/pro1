import { getSignedUploadUrlAction, logUploadFailureAction, logUploadSuccessAction, uploadToGCS } from './gcs-actions';
import { reportServerError } from '@/lib/report-error';

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

/**
 * 🛰️ UNIVERSAL CLIENT-SIDE DIRECT UPLOADER (v5.0 - HIGH-RELIABILITY NODE)
 * -----------------------------------------------------------
 * Directly uploads files via dedicated /api/upload endpoint with 
 * automatic S3 signed URL and Server Action fallback pipelines.
 */
export async function uploadFileDirectly(options: UploadOptions): Promise<string> {
    const {
        file,
        fileName,
        bucketType,
        folder,
        userId,
        userEmail = 'N/A',
        onProgress,
        maxSizeMb = 100
    } = options;

    const actualFileName = fileName || (file as File).name || `file_${Date.now()}`;
    const contentType = file.type || 'audio/mpeg';
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

            logUploadSuccessAction({ userEmail, fileName: actualFileName, publicUrl: resultPath }).catch(() => null);
            return resultPath;
        }
    } catch (presignedErr: any) {
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
            logUploadSuccessAction({ userEmail, fileName: actualFileName, publicUrl: serverActionRes.url }).catch(() => null);
            return serverActionRes.url;
        } else if (serverActionRes.error) {
            lastError = serverActionRes.error;
        }
    } catch (serverActionErr: any) {
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

        logUploadSuccessAction({ userEmail, fileName: actualFileName, publicUrl: resultUrl }).catch(() => null);
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
