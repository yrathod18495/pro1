import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, R2_BUCKET } from '@/lib/r2';
import crypto from 'crypto';

export const maxDuration = 120; // 120 seconds timeout for large audio files
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    
    let buffer: Buffer;
    let bucketType = 'public';
    let folder = 'uploads';
    let userId = 'anonymous';
    let customFileName: string | null = null;
    let mimeType = 'application/octet-stream';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      bucketType = (formData.get('bucketType') as string) || 'public';
      folder = (formData.get('folder') as string) || 'uploads';
      userId = (formData.get('userId') as string) || 'anonymous';
      customFileName = formData.get('fileName') as string | null;

      if (!file) {
        return NextResponse.json({ success: false, error: 'No file provided.' }, { status: 400 });
      }
      buffer = Buffer.from(await file.arrayBuffer());
      mimeType = file.type || mimeType;
    } else {
      // Raw binary payload via searchParams (Bypasses multipart body-parser size limits)
      const { searchParams } = request.nextUrl;
      bucketType = searchParams.get('bucketType') || 'public';
      folder = searchParams.get('folder') || 'uploads';
      userId = searchParams.get('userId') || 'anonymous';
      customFileName = searchParams.get('fileName');
      mimeType = contentType || 'application/octet-stream';

      const arrayBuffer = await request.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        return NextResponse.json({ success: false, error: 'Empty file payload received.' }, { status: 400 });
      }
      buffer = Buffer.from(arrayBuffer);
    }

    const rootFolder = bucketType === 'public' ? 'public' : 'secure';
    const nodeUuid = crypto.randomUUID().split('-')[0].toUpperCase();
    const rawName = customFileName || `file_${Date.now()}`;
    const safeName = rawName.replace(/[^a-zA-Z0-9.]/g, '_').replace(/_+/g, '_').trim();
    const cleanFolder = folder.replace(/^\/|\/$/g, '');
    const objectKey = `${rootFolder}/${cleanFolder}/${userId}/${Date.now()}_${nodeUuid}_${safeName}`;

    // Direct Upload to Cloudflare R2
    await r2Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: objectKey,
      Body: buffer,
      ContentType: mimeType,
    }));

    const protocol = bucketType === 'public' ? 'pub://' : 'gcs://';
    const storedPath = objectKey.replace(`${rootFolder}/`, '');
    return NextResponse.json({ 
      success: true, 
      url: `${protocol}${storedPath}` 
    });

  } catch (error: any) {
    console.error("[API Upload Server Error]:", error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Internal upload error.' 
    }, { status: 500 });
  }
}
