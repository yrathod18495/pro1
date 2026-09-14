
'use server';

import { z } from 'zod';
import { initializeFirebase } from '@/firebase/server';
import type { Product, ProductPreview } from '@/lib/types';
import { sendToTelegram } from '@/lib/telegram-logger';
import { escapeHtml } from '@/lib/utils';
import { reportServerError } from '@/lib/report-error';

const AddStorySchema = z.object({
  title: z.string().min(5),
  description: z.string().min(20),
  price: z.coerce.number().min(1),
  driveLink: z.string().url("A valid Google Drive link is required."),
  duration: z.string().min(1, "Story length is required."),
  isAiGenerated: z.boolean(),
  language: z.string().min(1),
  quality: z.string().min(1),
  videoSize: z.string().min(1),
  resolution: z.string().min(1),
  frameCount: z.string().optional(),
  targetAudience: z.string().optional(),
  emotionalTone: z.string().optional(),
  soundFx: z.string().min(1),
  bgm: z.string().min(1),
  previews: z.array(z.object({
    type: z.literal('image'),
    url: z.string()
  })).min(1, "At least one preview image is required."),
});

export async function addStoryAction(
    input: z.infer<typeof AddStorySchema>,
    userId: string,
    sellerName: string,
): Promise<{ success: boolean; message: string; }> {
  
  const validation = AddStorySchema.safeParse(input);
  if (!validation.success) {
      return { success: false, message: "Required fields are missing or invalid." };
  }
  
  const { database, firestore } = initializeFirebase();
  const data = validation.data;

  try {
    const productId = firestore.collection('products').doc().id;

    const firestoreProductData: Omit<Product, 'id'> = {
        title: data.title,
        description: data.description,
        price: data.price,
        productType: "YouTube Story",
        isOneTimePurchase: true, 
        sellerId: userId,
        status: 'pending',
        createdAt: new Date().toISOString(),
        previews: data.previews,
        downloadableFiles: [{
            fileName: "Source Drive Link",
            url: data.driveLink
        }],
        likes: 0,
        sellerName: sellerName,
        duration: data.duration,
        isAiGenerated: data.isAiGenerated,
        language: data.language,
        quality: data.quality,
        videoSize: data.videoSize,
        resolution: data.resolution,
        frameCount: data.frameCount,
        targetAudience: data.targetAudience,
        emotionalTone: data.emotionalTone,
        soundFx: data.soundFx,
        bgm: data.bgm,
    };
    
    await database.ref(`pendingProducts/${productId}`).set({ ...firestoreProductData, id: productId });
    
    await sendToTelegram(`🎬 <b>New YouTube Story for Approval</b>\n<b>Seller:</b> ${sellerName}\n<b>Product:</b> ${data.title}`);

    return { success: true, message: "Story submitted for approval!" };

  } catch (error: any) {
    reportServerError('src/app/seller/add-story/actions.ts#1', error);
    console.error("Error submitting story:", error);
    await sendToTelegram(`🚨 <b>Story Submission FAILED</b>\n<b>Seller:</b> ${sellerName}\n<b>Error:</b> <pre>${escapeHtml(error.message)}</pre>`);
    return { success: false, message: error.message || "Server node error." };
  }
}
