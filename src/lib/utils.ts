import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, isValid } from "date-fns"
import { reportServerError } from '@/lib/report-error';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 🗓️ SAFE DATE FORMATTER
 * Safely parses string, number, Date object, or Firestore Timestamp ({ seconds })
 * and formats it using date-fns without throwing RangeError.
 */
export function formatSafeDate(dateVal: any, formatStr = 'do MMM, yyyy', fallback = 'Recently'): string {
  if (!dateVal) return fallback;
  try {
    let d: Date;
    if (typeof dateVal === 'object' && dateVal !== null && typeof dateVal.toDate === 'function') {
      d = dateVal.toDate();
    } else if (typeof dateVal === 'object' && dateVal !== null && typeof dateVal.seconds === 'number') {
      d = new Date(dateVal.seconds * 1000);
    } else if (typeof dateVal === 'number') {
      d = new Date(dateVal);
    } else {
      d = new Date(dateVal);
    }
    return isValid(d) ? format(d, formatStr) : fallback;
  } catch (e) {
            reportServerError('src/lib/utils.ts:28', e);
    return fallback;
  }
}

export function formatDistanceToNowShort(dateInput: any): string {
  if (!dateInput) return 'recently';
  const date = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (!date || isNaN(date.getTime())) return 'recently';
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffInSeconds < 60) return 'just now';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return `${Math.floor(diffInDays / 7)}w ago`;
}

export function generateAvatarColor(email: string | null | undefined): { bg: string, text: string } {
  const colors = [
    { bg: "bg-red-100", text: "text-red-700" },
    { bg: "bg-green-100", text: "text-green-700" },
    { bg: "bg-purple-100", text: "text-purple-700" },
    { bg: "bg-yellow-100", text: "text-yellow-700" },
    { bg: "bg-teal-100", text: "text-teal-700" },
    { bg: "bg-pink-100", text: "text-pink-700" },
    { bg: "bg-orange-100", text: "text-orange-700" },
    { bg: "bg-indigo-100", text: "text-indigo-700" },
  ];
  
  const safeEmail = email || 'guest@12labs.in';
  const charCodeSum = safeEmail.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[charCodeSum % colors.length];
}

export function escapeHtml(text: unknown): string {
  if (text === null || text === undefined) return '';
  const str = typeof text === 'string' ? text : String(text);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * 👑 ZERO-READ PAID USER CHECK
 * Determines if a user profile represents a paid customer without making extra database reads.
 */
export function checkIsPaidUser(user: any): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.isSponsor === true) return true;
  if (user.subscription && user.subscription.status === 'active') return true;
  if (user.hasMadeFirstPurchase === true) return true;
  if (user.totalInvestment && Number(user.totalInvestment) > 0) return true;
  if (user.purchasedPlans && Object.keys(user.purchasedPlans).length > 0) return true;
  if (user.isSeller === true || user.isAffiliate === true) return true;
  return false;
}

/**
 * 🛡️ SAFE JSON STRINGIFY
 * Strips circular references, DOM nodes, React internal Fiber properties, and events to prevent circular structure errors.
 */
export function safeJsonStringify(obj: any, space?: number): string {
  if (obj === undefined) return "undefined";
  if (obj === null) return "null";
  if (typeof obj !== 'object' && typeof obj !== 'function') {
    try {
      return JSON.stringify(obj);
    } catch {
      return "{}";
    }
  }

  const cache = new WeakSet();

  function isUnserializable(val: any, key?: string): boolean {
    if (!val || (typeof val !== 'object' && typeof val !== 'function')) return false;

    if (key && typeof key === 'string') {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.startsWith('__react') ||
        lowerKey.startsWith('$_') ||
        lowerKey.startsWith('_react') ||
        lowerKey === 'statenode' ||
        lowerKey === 'nativeevent' ||
        lowerKey === 'target' ||
        lowerKey === 'currenttarget' ||
        lowerKey === 'srcelement' ||
        lowerKey === 'memoizedprops' ||
        lowerKey === 'memoizedstate' ||
        lowerKey === 'child' ||
        lowerKey === 'sibling' ||
        lowerKey === 'return' ||
        lowerKey === 'alternate'
      ) {
        return true;
      }
    }

    // React FiberNode duck typing
    if ('stateNode' in val || 'memoizedProps' in val || ('tag' in val && typeof val.tag === 'number')) {
      if ('child' in val || 'sibling' in val || 'return' in val || 'alternate' in val) {
        return true;
      }
    }

    // SyntheticEvent / DOM Event duck typing
    if ('nativeEvent' in val || ('preventDefault' in val && 'stopPropagation' in val)) {
      return true;
    }

    // DOM Node / Element duck typing
    if (
      typeof val.nodeType === 'number' ||
      typeof val.addEventListener === 'function' ||
      'ownerDocument' in val ||
      'tagName' in val
    ) {
      return true;
    }

    if (typeof window !== 'undefined') {
      if (val === window || val instanceof Event) return true;
      try {
        if (
          val instanceof HTMLElement ||
          val instanceof Node ||
          val instanceof Element ||
          (typeof SVGElement !== 'undefined' && val instanceof SVGElement)
        ) {
          return true;
        }
      } catch (e) {}
    }

    const cName = val.constructor?.name;
    if (cName && typeof cName === 'string' && cName !== 'Object' && cName !== 'Array') {
      const lowerCName = cName.toLowerCase();
      if (
        lowerCName.includes('element') ||
        lowerCName.includes('node') ||
        lowerCName.includes('window') ||
        lowerCName.includes('document') ||
        lowerCName.includes('event') ||
        lowerCName.includes('fiber') ||
        lowerCName.includes('synthetic')
      ) {
        return true;
      }
    }

    if (val.$typeof || val._reactListening || val.__reactFiber || val._reactRetry) {
      return true;
    }

    return false;
  }

  try {
    return JSON.stringify(
      obj,
      (key, value) => {
        if (typeof value === "object" && value !== null) {
          if (isUnserializable(value, key)) {
            return undefined;
          }
          if (cache.has(value)) {
            return undefined;
          }
          cache.add(value);
        }
        return value;
      },
      space
    ) ?? "{}";
  } catch (e) {
    return "{}";
  }
}

export function safeClone<T>(obj: T): T {
  if (!obj) return obj;
  if (typeof obj !== 'object') return obj;
  try {
    const jsonStr = safeJsonStringify(obj);
    return JSON.parse(jsonStr);
  } catch (e) {
    return obj;
  }
}

/**
 * 🖼️ NEURAL IMAGE COMPRESSOR
 */
export async function compressImage(file: File, maxSize = 1280, quality = 0.80): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height *= maxSize / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width *= maxSize / height;
            height = maxSize;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context failure'));

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Blob conversion failure'));
          const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
            type: 'image/webp',
            lastModified: Date.now()
          });
          resolve(compressedFile);
        }, 'image/webp', quality);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

/**
 * 🔗 RESOLVE STORAGE PROTOCOLS TO HTTP(S) URLs
 * Converts pub:// and gcs:// protocol pointers into standard, playable HTTP(S) URLs.
 */
export function resolvePublicAudioUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('pub://')) {
    const rawPath = trimmed.replace('pub://', '').replace(/^\/+/, '');
    return `https://storage.12labs.in/public/${rawPath}`;
  }
  if (trimmed.startsWith('gcs://')) {
    const rawPath = trimmed.replace('gcs://', '').replace(/^\/+/, '');
    return `https://storage.12labs.in/${rawPath}`;
  }
  return trimmed;
}

/**
 * 🛰️ NEURAL RESOLVER (v12.0 - PASS-THROUGH SYNC)
 * -----------------------------------------------------------
 * Fix: Returning full URLs as is from the database.
 * No more forced /api/storage/ prefixing which was causing 404s.
 */
export function getDisplayUrl(url: string | null | undefined, forceProxy = false): string {
  if (!url) return '';

  const trimmed = url.trim();

  // 1. Pass-through for Data URIs, Blobs, and established APIs
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('/api/')) return trimmed;

  // 2. Telegram CDN protocol
  if (trimmed.startsWith('tg://')) return `/api/cdn/${trimmed.replace('tg://', '')}`;

  if (forceProxy) {
    return `/api/download?url=${encodeURIComponent(trimmed)}&inline=1`;
  }

  // 3. Resolve pub:// and gcs:// protocol pointers to proxy download endpoint for reliable HTML5 audio playback & streaming
  if (trimmed.startsWith('pub://') || trimmed.startsWith('gcs://')) {
    return `/api/download?url=${encodeURIComponent(trimmed)}&inline=1`;
  }

  // 4. Handle direct storage domain usage without protocol (e.g. storage.12labs.in/...)
  if (trimmed.startsWith('storage.12labs.in')) {
    return `https://${trimmed}`;
  }

  // 5. Handle relative storage paths that might have been entered "directly" (e.g. /public/..., public/...)
  if (trimmed.startsWith('/public/') || trimmed.startsWith('public/')) {
    const rawPath = trimmed.startsWith('/') ? trimmed.substring(1) : trimmed;
    return `https://storage.12labs.in/${rawPath}`;
  }

  // 6. Aggressive fallback for specific storage-like paths (e.g. store/scripts/...)
  if (trimmed.startsWith('store/') || trimmed.startsWith('scripts/')) {
    return `https://storage.12labs.in/public/${trimmed}`;
  }

  // 7. All HTTP/HTTPS URLs pass through directly
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  // Fallback for relative paths or unknown external URLs
  if (trimmed.startsWith('/') || trimmed.includes('.')) {
    // If it looks like an absolute path or a domain, try to proxy it if it's not a known local route
    return trimmed;
  }

  return `/api/download?url=${encodeURIComponent(trimmed)}&inline=1`;
}

/**
 * 📥 UNIVERSAL LOCAL SAVE NODE (v10.0 - DIRECT SYNC)
 */
export async function localSaveFile(url: string, fileName: string) {
    const { saveAs } = await import('file-saver');
    
    const downloadApiUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(fileName)}`;
    
    try {
        const response = await fetch(downloadApiUrl, { 
            method: 'GET', 
            cache: 'no-cache' 
        });
        
        if (response.ok) {
            const blob = await response.blob();
            saveAs(blob, fileName);
            return;
        }
    } catch (error) {
        console.warn("[LocalSave] Direct download API fetch failed:", error);
    }

    // Fallback: Trigger browser native attachment download via window.location.href
    window.location.href = downloadApiUrl;
}

export function getISTDateString(dateObj: Date = new Date()) {
  const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' } as const;
  const parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(dateObj);
  const day = parts.find(p => p.type === 'day')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const year = parts.find(p => p.type === 'year')?.value;
  return `${year}-${month}-${day}`;
}

export function setCookie(name: string, value: string, days: number) {
  if (typeof document === 'undefined') return;
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax";
}

export function getCookie(name: string) {
  if (typeof document === 'undefined') return null;
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, i);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}
