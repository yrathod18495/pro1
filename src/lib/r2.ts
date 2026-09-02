
/**
 * ☁️ CLOUDFLARE R2 NODE CONFIGURATION
 * -------------------------------------------
 * Standard S3-compatible client initialized for R2 with robust fallbacks.
 */
import { S3Client } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "f63a441167900ff0fc156118cd9b62b8";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET_VAL = process.env.R2_BUCKET || "12labs";

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

export const R2_BUCKET = R2_BUCKET_VAL;
export const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "https://storage.12labs.in").replace(/\/$/, "");

