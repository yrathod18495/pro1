import { reportServerError } from '@/lib/report-error';
// Multi-tier, hardware-backed device fingerprinting engine for anti-abuse protection

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getWebGLFingerprint(): string {
  try {
    if (typeof document === 'undefined') return 'no-doc';
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl || !(gl instanceof WebGLRenderingContext)) return 'no-webgl';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : '';
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    return `${vendor}~${renderer}~${maxTexture}`;
  } catch (e) {
            reportServerError('src/lib/device-fingerprint.ts:24', e);
    return 'webgl-error';
  }
}

function getCanvasFingerprint(): string {
  try {
    if (typeof document === 'undefined') return 'no-doc';
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.font = "15px 'Arial', 'Helvetica', sans-serif";
    ctx.fillText('12Labs-Voice-Dub-Studio-V4🔥', 2, 18);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('12Labs-Voice-Dub-Studio-V4🔥', 4, 19);
    return canvas.toDataURL();
  } catch (e) {
            reportServerError('src/lib/device-fingerprint.ts:46', e);
    return 'canvas-error';
  }
}

async function getAudioFingerprint(): Promise<string> {
  try {
    if (typeof window === 'undefined') return 'no-win';
    const AudioContextClass = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!AudioContextClass) return 'no-audio';
    const context = new AudioContextClass(1, 44100, 44100);
    const oscillator = context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(10000, context.currentTime);

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-50, context.currentTime);
    compressor.knee.setValueAtTime(40, context.currentTime);
    compressor.ratio.setValueAtTime(12, context.currentTime);
    compressor.attack.setValueAtTime(0, context.currentTime);
    compressor.release.setValueAtTime(0.25, context.currentTime);

    oscillator.connect(compressor);
    compressor.connect(context.destination);
    oscillator.start(0);

    const audioBuffer = await context.startRendering();
    const channelData = audioBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 4500; i < 5000; i++) {
      sum += Math.abs(channelData[i] || 0);
    }
    return sum.toFixed(6);
  } catch (e) {
            reportServerError('src/lib/device-fingerprint.ts:79', e);
    return 'audio-error';
  }
}

function getHardwareFingerprint(): string {
  try {
    const webgl = getWebGLFingerprint();
    const screenRes = typeof window !== 'undefined' && window.screen 
      ? `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}x${window.devicePixelRatio || 1}`
      : '0x0';
    const hardware = typeof navigator !== 'undefined'
      ? `${navigator.hardwareConcurrency || 0}~${(navigator as any).deviceMemory || 0}~${navigator.maxTouchPoints || 0}`
      : '0~0~0';
    const timezone = typeof Intl !== 'undefined'
      ? `${Intl.DateTimeFormat().resolvedOptions().timeZone || ''}~${new Date().getTimezoneOffset()}`
      : '';
    const platform = typeof navigator !== 'undefined'
      ? `${navigator.platform || ''}~${navigator.language || ''}`
      : '';

    const raw = `HW:${webgl}|${screenRes}|${hardware}|${timezone}|${platform}`;
    return hashString(raw);
  } catch (e) {
            reportServerError('src/lib/device-fingerprint.ts:102', e);
    return 'hw_fallback';
  }
}

function getStoredToken(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const local = localStorage.getItem(key);
    if (local) return local;

    const session = sessionStorage.getItem(key);
    if (session) return session;

    const match = document.cookie.match(new RegExp('(^| )' + key + '=([^;]+)'));
    if (match) return decodeURIComponent(match[2]);
  } catch (e) {
            reportServerError('src/lib/device-fingerprint.ts:118', e);}
  return null;
}

function persistToken(key: string, val: string) {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, val);
    sessionStorage.setItem(key, val);
    document.cookie = `${key}=${encodeURIComponent(val)}; max-age=315360000; path=/; SameSite=Lax`;
  } catch (e) {
            reportServerError('src/lib/device-fingerprint.ts:128', e);}
}

export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === 'undefined') return 'server-side';

  const hwHash = getHardwareFingerprint();
  const existingToken = getStoredToken('12labs_device_id');

  // Compute full deterministic browser & audio signature
  const canvasHash = getCanvasFingerprint();
  let audioHash = 'no-audio';
  try {
    audioHash = await getAudioFingerprint();
  } catch (e) {
            reportServerError('src/lib/device-fingerprint.ts:142', e);}

  const compositeRaw = [
    hwHash,
    canvasHash,
    audioHash,
    navigator.userAgent || '',
    navigator.language || '',
    typeof window.screen !== 'undefined' ? `${window.screen.availWidth}x${window.screen.availHeight}` : ''
  ].join(':::');

  const deterministicId = 'dev_' + hashString(compositeRaw);
  const finalDeviceId = existingToken || deterministicId;

  persistToken('12labs_device_id', finalDeviceId);
  persistToken('12labs_hw_sig', hwHash);

  // Return combined payload with device ID and hardware signature
  return `DEV_${finalDeviceId}_HW_${hwHash}`;
}

