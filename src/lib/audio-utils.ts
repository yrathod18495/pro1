import { reportServerError } from '@/lib/report-error';

/**
 * @fileOverview Utilities for client-side audio conversion and processing.
 * Optimized for High-Fidelity Neural Synthesis with Zero Artifact Merging.
 */

/**
 * 🖼️ COVER ART COMPRESSOR
 * -------------------------
 * Downscales + re-encodes an image file to a small JPEG before upload —
 * used for optional music-track cover art so a user picking a 12MP phone
 * photo doesn't ship 8MB per track. Caps the longest edge at `maxDimension`
 * and re-encodes at `quality`; both are generous enough that a normal
 * cover-art image (a few hundred KB to a couple MB) comes out well under
 * 200KB without visible quality loss at the sizes this actually displays at
 * (a small album-art square).
 */
export async function compressImageFile(
  file: File,
  maxDimension: number = 800,
  quality: number = 0.82
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
    );
    if (!blob) throw new Error('Image compression produced no output.');
    return blob;
  } finally {
    bitmap.close();
  }
}

/**
 * 🎧 MP3 ENCODER (client-side, via lamejs)
 * -----------------------------------------
 * Re-encodes a decoded AudioBuffer back to a compressed MP3 Blob instead of
 * raw WAV. WAV is roughly 10x the size of a decent-bitrate MP3 for the same
 * audio — that's the entire reason a 3MB source track came out as a 32MB
 * "preview" after watermarking (applyWatermarkToBlob used to always return
 * audioBufferToWav's output, no matter what format went in).
 */
export async function audioBufferToMp3(buffer: AudioBuffer, kbps: number = 128): Promise<Blob> {
  // 🔴 FIX: the original 'lamejs' npm package is old CJS-only code with
  // internal cross-file references (MPEGMode, BitStream, Lame, etc.) that
  // rely on being require()'d in a specific order — something dynamic
  // import() through webpack doesn't preserve the same way, so it threw
  // "MPEGMode is not defined" in production even though it worked when
  // testing the encoder logic in isolation. `@breezystack/lamejs` is a
  // maintained fork published specifically to fix this exact webpack/
  // bundler incompatibility, with proper named exports — no more guessing
  // between mod.Mp3Encoder and mod.default.Mp3Encoder either.
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const numChannels = Math.min(buffer.numberOfChannels, 2); // lamejs only does mono/stereo
  const sampleRate = buffer.sampleRate;
  const mp3encoder = new Mp3Encoder(numChannels, sampleRate, kbps);

  const floatToInt16 = (channelData: Float32Array): Int16Array => {
    const out = new Int16Array(channelData.length);
    for (let i = 0; i < channelData.length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  };

  const left = floatToInt16(buffer.getChannelData(0));
  const right = numChannels > 1 ? floatToInt16(buffer.getChannelData(1)) : null;

  const sampleBlockSize = 1152; // required by lamejs
  const mp3Chunks: Uint8Array[] = [];

  for (let i = 0; i < left.length; i += sampleBlockSize) {
    const leftChunk = left.subarray(i, i + sampleBlockSize);
    const mp3buf = right
      ? mp3encoder.encodeBuffer(leftChunk, right.subarray(i, i + sampleBlockSize))
      : mp3encoder.encodeBuffer(leftChunk);
    if (mp3buf.length > 0) mp3Chunks.push(new Uint8Array(mp3buf));
  }
  const finalBuf = mp3encoder.flush();
  if (finalBuf.length > 0) mp3Chunks.push(new Uint8Array(finalBuf));

  return new Blob(mp3Chunks as BlobPart[], { type: 'audio/mpeg' });
}

/**
 * Converts an audio buffer to a WAV Blob (16-bit PCM).
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const numSamples = buffer.length * numChannels;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const bufferLength = 44 + numSamples * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  /* RIFF identifier */
  view.setUint32(0, 0x52494646, false);
  /* file length */
  view.setUint32(4, 36 + numSamples * bytesPerSample, true);
  /* RIFF type */
  view.setUint32(8, 0x57415645, false);
  /* format chunk identifier */
  view.setUint32(12, 0x666d7420, false);
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * blockAlign, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, blockAlign, true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  view.setUint32(36, 0x64617461, false);
  /* data chunk length */
  view.setUint32(40, numSamples * bytesPerSample, true);

  const channelData = [];
  for (let i = 0; i < numChannels; i++) {
    channelData.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      let sample = Math.max(-1, Math.min(1, channelData[channel][i]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Decodes an MP3 Blob and returns a WAV Blob.
 * 🎙️ Uses requested AudioContext pattern.
 */
export async function convertMp3ToWav(mp3Blob: Blob): Promise<Blob> {
  const arrayBuffer = await mp3Blob.arrayBuffer();
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  
  return audioBufferToWav(audioBuffer);
}

/**
 * 🎙️ HIGH-FIDELITY NEURAL MERGER (v6.0 - STRICT SEQUENTIAL)
 * Preserves exact array index order to prevent dialogue shuffling.
 */
export async function mergeWavBlobs(blobs: Blob[], silenceDurationMs: number): Promise<Blob> {
    if (blobs.length === 0) return new Blob();
    if (blobs.length === 1) return blobs[0];

    const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
    const tempCtx = new AudioContextClass();

    try {
        // --- 🔒 ORDER PROTECTION NODE ---
        // Decodes all blobs using standardized pattern
        const buffers = await Promise.all(blobs.map(async (blob) => {
            const arrayBuffer = await blob.arrayBuffer();
            return await tempCtx.decodeAudioData(arrayBuffer);
        }));

        const silenceSec = silenceDurationMs / 1000;
        let totalDuration = 0;
        
        for (let i = 0; i < buffers.length; i++) {
            totalDuration += buffers[i].duration;
            if (i < buffers.length - 1) totalDuration += silenceSec;
        }

        // Standard 12Labs Synthesis Rate
        const sampleRate = 24000;
        const offlineCtx = new OfflineAudioContext(
            buffers[0].numberOfChannels || 1,
            Math.ceil(totalDuration * sampleRate),
            sampleRate
        );

        let startTime = 0;
        const FADE_TIME = 0.02; // Anti-clipping fade

        for (const buffer of buffers) {
            const source = offlineCtx.createBufferSource();
            const gainNode = offlineCtx.createGain();
            
            source.buffer = buffer;
            const endTime = startTime + buffer.duration;
            
            // Apply subtle crossfade to ensure smooth dialogue transitions
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(1, startTime + FADE_TIME);
            gainNode.gain.setValueAtTime(1, Math.max(startTime + FADE_TIME, endTime - FADE_TIME));
            gainNode.gain.linearRampToValueAtTime(0, endTime);

            source.connect(gainNode);
            gainNode.connect(offlineCtx.destination);
            
            source.start(startTime);
            startTime = endTime + silenceSec;
        }

        const renderedBuffer = await offlineCtx.startRendering();
        return audioBufferToWav(renderedBuffer);

    } catch (error: any) {
        console.error("[Neural Merger] Mastering Error:", error);
        throw new Error("Mastering Engine Failure.");
    } finally {
        await tempCtx.close().catch(() => null);
    }
}

/**
 * Trims leading/trailing silence from an audio Blob with safety margin.
 */
export async function trimAudioBlob(blob: Blob, silenceThreshold = 0.01): Promise<{ blob: Blob; duration: number }> {
    try {
        const arrayBuffer = await blob.arrayBuffer();
        const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
        const ctx = new AudioContextClass();
        const buffer = await ctx.decodeAudioData(arrayBuffer);

        const channelData = buffer.getChannelData(0);
        let startSample = 0;
        let endSample = channelData.length - 1;

        while (startSample < channelData.length && Math.abs(channelData[startSample]) < silenceThreshold) {
            startSample++;
        }

        while (endSample > startSample && Math.abs(channelData[endSample]) < silenceThreshold) {
            endSample--;
        }

        const margin = Math.floor(buffer.sampleRate * 0.02);
        startSample = Math.max(0, startSample - margin);
        endSample = Math.min(channelData.length - 1, endSample + margin);

        const trimmedLength = Math.max(1, endSample - startSample + 1);
        const sampleRate = buffer.sampleRate;
        const offlineCtx = new OfflineAudioContext(buffer.numberOfChannels, trimmedLength, sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineCtx.destination);
        source.start(0, startSample / sampleRate, trimmedLength / sampleRate);

        const renderedBuffer = await offlineCtx.startRendering();
        await ctx.close().catch(() => null);

        const trimmedBlob = audioBufferToWav(renderedBuffer);
        return { blob: trimmedBlob, duration: renderedBuffer.duration };
    } catch (e) {
            reportServerError('src/lib/audio-utils.ts:189', e);
        return { blob, duration: 0 };
    }
}

/**
 * 🌊 NEURAL WATERMARK MIXER
 * Locally mixes a watermark track over the main audio every few seconds.
 */
export async function applyWatermarkToBlob(audioBlob: File | Blob, watermarkUrl: string): Promise<Blob> {
    const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
    const ctx = new AudioContextClass();
    
    try {
        // Load main audio using standardized pattern
        const arrayBuffer = await audioBlob.arrayBuffer();
        const mainBuffer = await ctx.decodeAudioData(arrayBuffer);
        
        // Load watermark using standardized pattern
        const wmRes = await fetch(watermarkUrl);
        if (!wmRes.ok) throw new Error("Watermark source unavailable.");
        const wmArrayBuffer = await wmRes.arrayBuffer();
        const wmBuffer = await ctx.decodeAudioData(wmArrayBuffer);
        
        const sampleRate = mainBuffer.sampleRate;
        const duration = mainBuffer.duration;
        const offlineCtx = new OfflineAudioContext(mainBuffer.numberOfChannels, Math.ceil(duration * sampleRate), sampleRate);
        
        // 1. Main source
        const mainSource = offlineCtx.createBufferSource();
        mainSource.buffer = mainBuffer;
        mainSource.connect(offlineCtx.destination);
        mainSource.start(0);
        
        // 2. Watermark source - Periodic Injection
        // 🔴 FIX: was `wmGap = 12` — 12 clean seconds between watermark
        // hits was enough for someone to lift a usable clip in between.
        // Down to 3s so there's never more than a couple of clean
        // seconds before the next watermark stamp lands.
        const wmGap = 3; // Injection every 3 seconds
        for (let time = 2; time < duration; time += wmGap) {
            const wmSource = offlineCtx.createBufferSource();
            wmSource.buffer = wmBuffer;
            
            const gain = offlineCtx.createGain();
            // 🔴 Bumped slightly — 0.35 was easy to mix out/ignore.
            gain.gain.value = 0.45;
            
            wmSource.connect(gain);
            gain.connect(offlineCtx.destination);
            wmSource.start(time);
        }
        
        const renderedBuffer = await offlineCtx.startRendering();
        // 🔴 FIX: this used to return audioBufferToWav(renderedBuffer) —
        // always uncompressed WAV, no matter what format the source file
        // was. A 3MB MP3 in => a ~30MB+ WAV out is exactly what uncompressed
        // 16-bit PCM looks like for a few minutes of audio. Re-encoding to
        // MP3 keeps the preview close to its original size.
        return await audioBufferToMp3(renderedBuffer, 128);
    } catch (error) {
        console.error("[Watermark Engine] Mixing failure:", error);
        // 🔴 FIX: this used to `return audioBlob` here — silently handing
        // back the ORIGINAL, unwatermarked audio as if watermarking had
        // succeeded. Every caller of this function already has its own
        // try/catch around it (to fall back to the original audio
        // deliberately, with a visible warning) — but that fallback logic
        // never ran, because this function never actually failed from the
        // caller's point of view. That's exactly how a paid track's
        // "preview" ended up with zero copyright protection with nothing
        // in the UI ever indicating it. Re-throwing lets the caller's own
        // handling (and, more importantly, the toast it shows the admin)
        // actually fire.
        throw error instanceof Error ? error : new Error(String(error));
    } finally {
        await ctx.close().catch(() => null);
    }
}
