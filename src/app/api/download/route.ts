import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";
import { reportServerError } from '@/lib/report-error';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get("url");
  const filename = searchParams.get("filename") || "12labs_audio.mp3";

  const isInline = searchParams.get("inline") === "1";

  if (!rawUrl) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  let buffer: Buffer | null = null;
  let contentType = "audio/mpeg";

  let candidateKeys: string[] = [];
  const urlStr = rawUrl.trim();

  // Determine content type by file extension if possible
  if (urlStr.endsWith('.wav')) contentType = 'audio/wav';
  else if (urlStr.endsWith('.ogg')) contentType = 'audio/ogg';
  else if (urlStr.endsWith('.m4a') || urlStr.endsWith('.mp4')) contentType = 'audio/mp4';
  else contentType = 'audio/mpeg';

  if (urlStr.startsWith("pub://")) {
    const raw = urlStr.replace("pub://", "").replace(/^\/+/, "");
    candidateKeys.push(`public/${raw}`, raw, `public/music/public/library/${raw}`, `music/public/library/${raw}`);
    // Legacy script-preview uploads used "store/scripts/previews/..." — some
    // older records reference the folder segments in swapped order.
    const swapped = raw.replace(/^store\/previews\/scripts\//, "store/scripts/previews/");
    if (swapped !== raw) {
      candidateKeys.push(`public/${swapped}`, swapped);
    }
  } else if (urlStr.startsWith("gcs://")) {
    const raw = urlStr.replace("gcs://", "").replace(/^\/+/, "");
    candidateKeys.push(`secure/${raw}`, raw, `secure/music/vault/${raw}`, `music/vault/${raw}`);
  } else {
    try {
      const parsedUrl = new URL(urlStr, "https://dummy.local");
      let pathStr = parsedUrl.pathname.replace(/^\/+/, "");
      pathStr = pathStr.replace(/^api\/public-storage\//, "").replace(/^api\/storage\//, "");
      candidateKeys.push(pathStr, `public/${pathStr}`, `secure/${pathStr}`, `temp/${pathStr}`, pathStr.replace(/^(public|secure|temp)\//, ""));
    } catch (e) {
            reportServerError('src/app/api/download/route.ts:40', e);
      const rawPath = urlStr.replace(/^\/+/, "").replace(/^api\/public-storage\//, "").replace(/^api\/storage\//, "");
      candidateKeys.push(rawPath, `public/${rawPath}`, `secure/${rawPath}`, `temp/${rawPath}`);
    }
  }

  candidateKeys = Array.from(new Set(candidateKeys.map((k) => k.replace(/\/+/g, "/").replace(/^\//, "")))).filter(Boolean);

  if (R2_BUCKET) {
    for (const key of candidateKeys) {
      try {
        const getCommand = new GetObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
        });
        const res = await r2Client.send(getCommand);
        if (res.Body) {
          const chunks: any[] = [];
          for await (const chunk of res.Body as any) {
            chunks.push(chunk);
          }
          buffer = Buffer.concat(chunks);
          if (res.ContentType) contentType = res.ContentType;
          break;
        }
      } catch (err) {
        // Expected: we're probing several candidate key shapes and most
        // will 404 until one hits. Don't report these as server errors —
        // only the caller cares if every candidate ultimately fails
        // (handled below, once, after the loop).
      }
    }
  }

  if (!buffer) {
    try {
      let targetUrl: string;
      if (urlStr.startsWith("gcs://")) {
        targetUrl = `${R2_PUBLIC_URL}/${urlStr.replace("gcs://", "")}`;
      } else if (urlStr.startsWith("pub://")) {
        // Public-bucket references are stored without the "public/" root
        // folder prefix (see gcs-actions.ts), so re-add it for the CDN path.
        targetUrl = `${R2_PUBLIC_URL}/public/${urlStr.replace("pub://", "").replace(/^\/+/, "")}`;
      } else if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) {
        targetUrl = urlStr;
      } else {
        targetUrl = `${R2_PUBLIC_URL}/${urlStr.replace(/^\/+/, "")}`;
      }

      const res = await fetch(targetUrl);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
        const ct = res.headers.get("content-type");
        if (ct) contentType = ct;
      }
    } catch (err) {
      console.error("[Download API Fetch Error]:", err);
    }
  }

  // Last-resort fallback: only for "pub://" references, and only once every
  // R2 candidate key AND the R2 CDN fetch above have already failed. This
  // covers records created before the GCS -> R2 migration, whose file bytes
  // were never copied over — only their URL field got rewritten to "pub://".
  // Runs at most once per request, and only on the already-broken path, so
  // it adds zero latency to every normal (R2-hit) download.
  if (!buffer && urlStr.startsWith("pub://")) {
    try {
      const raw = urlStr.replace("pub://", "").replace(/^\/+/, "");
      const legacyGcsUrl = `https://storage.googleapis.com/12labspublic/${raw}`;
      const res = await fetch(legacyGcsUrl);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
        const ct = res.headers.get("content-type");
        if (ct) contentType = ct;
      }
    } catch (err) {
      console.error("[Download API Legacy GCS Fetch Error]:", err);
    }
  }

  if (!buffer || buffer.length === 0) {
    reportServerError('src/app/api/download/route.ts:GET', new Error('NoSuchKey: file not found under any candidate key'), {
      url: urlStr,
      candidateKeys: candidateKeys.join(', '),
    });
    return new NextResponse("File not found", { status: 404 });
  }

  const disposition = isInline ? "inline" : `attachment; filename="${encodeURIComponent(filename)}"`;

  const responseHeaders = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": disposition,
    "Content-Length": buffer.length.toString(),
    "Cache-Control": "public, max-age=86400",
    "Access-Control-Allow-Origin": "*",
    "Accept-Ranges": "bytes",
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: responseHeaders,
  });
}
