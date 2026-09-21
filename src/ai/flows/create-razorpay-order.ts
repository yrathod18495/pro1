
'use server';
/**
 * @fileOverview A flow for creating a Razorpay order.
 *
 * - createRazorpayOrder - A function that creates a Razorpay order.
 * - CreateRazorpayOrderInput - The input type for the createRazorpayOrder function.
 * - CreateRazorpayOrderOutput - The return type for the createRazorpayOrder function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import Razorpay from 'razorpay';
import { sendToTelegram } from '@/lib/telegram-logger';
import { reportServerError } from '@/lib/report-error';

const CreateRazorpayOrderInputSchema = z.object({
  amount: z.number().describe('The amount for the order in the smallest currency unit (e.g., paise for INR).'),
  currency: z.string().default('INR').describe('The currency of the order.'),
});
export type CreateRazorpayOrderInput = z.infer<typeof CreateRazorpayOrderInputSchema>;

const CreateRazorpayOrderOutputSchema = z.object({
  id: z.string(),
  amount: z.number(),
  currency: z.string(),
  key_id: z.string(),
});
export type CreateRazorpayOrderOutput = z.infer<typeof CreateRazorpayOrderOutputSchema>;


export async function createRazorpayOrder(input: CreateRazorpayOrderInput): Promise<CreateRazorpayOrderOutput> {
    try {
        return await createRazorpayOrderFlow(input);
    } catch (error: any) {
    reportServerError('src/ai/flows/create-razorpay-order.ts#1', error);
        const mainErrorMessage = (error.message || 'Unknown error').split('\n')[0];
        const errorMessage = `🚨 **Flow Error: createRazorpayOrder**

**Input:** \`\`\`json
${JSON.stringify(input, null, 2)}
\`\`\`
**Error:**
<pre>${mainErrorMessage}</pre>`;
        await sendToTelegram(errorMessage);
        throw error;
    }
}

const createRazorpayOrderFlow = ai.defineFlow(
  {
    name: 'createRazorpayOrderFlow',
    inputSchema: CreateRazorpayOrderInputSchema,
    outputSchema: CreateRazorpayOrderOutputSchema,
  },
  async (input) => {
    
    const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!razorpayKeyId || !razorpayKeySecret) {
        // This log will appear in your server/function logs on your hosting provider (e.g., Netlify, Vercel).
        console.error('FATAL: Razorpay keys are not configured in the production environment. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your hosting provider\'s settings.');
        throw new Error('The payment system is not configured correctly on the server. Please contact support.');
    }

    const razorpay = new Razorpay({
        key_id: razorpayKeyId,
        key_secret: razorpayKeySecret,
    });

    const options = {
        amount: input.amount,
        currency: input.currency,
        receipt: `receipt_order_${new Date().getTime()}`,
    };

    try {
        const order = await razorpay.orders.create(options);
        if (!order) {
            throw new Error('Razorpay order creation returned a null or empty response.');
        }
        return {
            id: order.id,
            amount: order.amount,
            currency: order.currency,
            key_id: razorpayKeyId,
        };
    } catch (error: any) {
    reportServerError('src/ai/flows/create-razorpay-order.ts#2', error);
        console.error('Razorpay API order creation failed:', {
            message: error.message,
            statusCode: error.statusCode,
            error: error.error,
        });
        const errorMessage = error?.error?.description || error.message || 'An unknown error occurred while communicating with the payment provider.';
        throw new Error(`Failed to create payment order. Reason: ${errorMessage}`);
    }
  }
);
