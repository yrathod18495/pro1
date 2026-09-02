
'use server';
import { redirect } from 'next/navigation';

/**
 * Redirect node to ensure users use the correct endpoint.
 */
export async function generateChatterboxLineAction() {
    redirect('/new-ai-studio');
}
