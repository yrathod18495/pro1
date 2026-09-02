import { reportServerError } from '@/lib/report-error';

/**
 * @fileOverview Utilities for client-side audio conversion and processing.
 * Optimized for High-Fidelity Neural Synthesis with Zero Artifact Merging.
 */

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
        const wmGap = 12; // Injection every 12 seconds
        for (let time = 2; time < duration; time += wmGap) {
            const wmSource = offlineCtx.createBufferSource();
            wmSource.buffer = wmBuffer;
            
            const gain = offlineCtx.createGain();
            gain.gain.value = 0.35; // Increased for better protection
            
            wmSource.connect(gain);
            gain.connect(offlineCtx.destination);
            wmSource.start(time);
        }
        
        const renderedBuffer = await offlineCtx.startRendering();
        return audioBufferToWav(renderedBuffer);
    } catch (error) {
        console.error("[Watermark Engine] Mixing failure:", error);
        return audioBlob; // Fallback to original if mixing fails
    } finally {
        await ctx.close().catch(() => null);
    }
}
