import { GET as getVoiceCatalog, OPTIONS as options } from '@/app/api/voices/route';

// Canonical public catalog alias. Keep /api/voices working for older clients.
export const GET = getVoiceCatalog;
export const OPTIONS = options;
