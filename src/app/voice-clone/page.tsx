
import { redirect } from 'next/navigation';

/**
 * STUDIO SYNC - /voice-clone redirects to /new-ai-studio
 * A server component so this issues a real HTTP redirect (better for SEO
 * and for anything, like curl or a crawler, that doesn't run client JS).
 */
export default function VoiceClonePage() {
    redirect('/new-ai-studio');
}
