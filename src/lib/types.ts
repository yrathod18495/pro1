import type { User as FirebaseUser } from 'firebase/auth';
import { DocumentReference } from 'firebase/firestore';

export interface CreditHistoryEntry {
  amount: number;
  reason: string;
  timestamp: string;
  paymentId?: string;
  orderId?: string;
  amountPaid?: number;
  currency?: string;
  projectId?: string;
  isPaid?: boolean;
}

export interface UserSubscription {
    planId: string;
    status: 'active' | 'past_due' | 'cancelled';
    subscriptionId?: string;
    startDate: string;
    nextWeeklyGrantDate: string;
    weeklyGrantCount: number; // 1 to 4
    currentCycleMonth: string; // YYYY-MM
    manuallyGranted?: boolean; // true if activated by an admin via the admin panel, not via a real Razorpay subscription
}

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  isSeller?: boolean;
  isAffiliate?: boolean;
  isSponsor?: boolean;
  credits: number;
  status: 'active' | 'banned' | 'suspended' | 'deleted';
  suspensionEndDate?: string;
  createdAt?: string;
  termsAcceptedAt?: string; 
  age?: string; 
  followingCount?: number;
  hasMadeFirstPurchase?: boolean;
  totalInvestment?: number;
  purchasedPlans?: Record<string, number>; 
  photoURL?: string | null;
  subscription?: UserSubscription;
  isAltAccount?: boolean;
  primaryAccountEmail?: string;
  deviceRestricted?: boolean;
  deviceRestrictedReason?: string;
  registeredDeviceId?: string;
}

export type User = FirebaseUser & UserProfile;

export interface Character {
  id: string;
  name:string;
  gender: string;
  emotion: string;
  voice: string;
  // Display name for `voice`, kept alongside the id so the frontend can
  // always show a name instead of the raw id (set for 11Labs voices,
  // which aren't looked up from a static list the way Gemini voices are).
  voiceName?: string;
  // Preview/demo audio url for `voice`, so the voice stays playable even
  // after the picker that fetched it has closed or the page reloaded.
  voicePreviewUrl?: string | null;
  dialogueCount?: number;
  age: 'Kid' | 'Adult' | 'Old';
}

export interface GeneratedLine {
  id: string;
  characterName: string;
  dialogue: string;
  status: 'pending' | 'generating' | 'done' | 'error';
  audioDataUri?: string;
  error?: string;
  emotion: string;
  voiceOverride?: string;
}

export interface ScriptAnalysis {
  characterCount: number;
  dialogueCount: number;
  cost: number;
  originalCost?: number;
}

export interface Project {
  id: string;
  userId: string;
  projectName: string;
  script: string;
  audioUrl: string;
  createdAt: string;
  generationParams?: any;
  characters?: any[];
  referenceAudioUrl?: string;
  projectType?: 'fast-gen' | 'hq-submission' | 'voice-clone' | 'script' | 'music-gen' | 'pro-studio' | 'hq-gen' | 'music-studio' | 'music-library' | 'script-ai' | 'seo-kit' | 'pdf-tools' | 'voice-cloning';
  status?: 'completed' | 'processing' | 'in_queue' | 'rejected';
  cost?: number;
  userDeleted?: boolean;
  syncData?: any;
  scriptUrl?: string;
  editedAudioUrl?: string;
  edited_audio_url?: string;
  // Stamped at creation time by src/app/studio/actions.ts. Decides which
  // voice picker / voice-replacement RTDB queue a project uses in
  // src/components/history/voice-editor-dialog.tsx — 'gemini' (or
  // undefined, for older projects) uses the Gemini prebuilt voice list
  // and the `voice_replacement` node; 'elevenlabs' uses the ElevenLabs
  // library picker and the `elevenlabs_replacement` node.
  voiceEngine?: 'gemini' | 'elevenlabs';
}

export interface ProductPreview {
  type: 'image' | 'video' | 'audio';
  url: string;
}

export interface DownloadableFile {
  fileName: string;
  url: string;
}

export interface Product {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  productType: "PC Character" | "Green Screen Character" | "Premium Background" | "Hand Written Script" | "Real Voice" | "AutoDraft Character" | "YouTube Thumbnail" | "YouTube Story";
  previews?: ProductPreview[];
  downloadableFiles?: DownloadableFile[];
  price: number;
  originalPrice?: number;
  status: 'pending' | 'approved' | 'rejected' | 'pending_update' | 'sold';
  isOneTimePurchase?: boolean;
  createdAt: string;
  sellerName?: string;
  sellerIsVerified?: boolean;
  likes?: number;
  views?: number;
  rejectionReason?: string;
  originalData?: Partial<Product>;
  previewImage?: string; 
  scriptPreview?: string[];
  characterCount?: number;
  duration?: string;
  isAiGenerated?: boolean;
  fullScriptContent?: string;
  licenseType?: 'commercial_only' | 'standard';
  requiresYoutubeLink?: boolean;
  tieredPricing?: {
    singleChannel: number;
    multipleWorks: number;
    fullOwnership: number;
  };
  language?: string;
  quality?: string;
  videoSize?: string;
  resolution?: string;
  frameCount?: string;
  targetAudience?: string;
  emotionalTone?: string;
  soundFx?: string;
  bgm?: string;
  scriptPreviewUrl?: string | null;
  migrationLog?: string;
}

export interface StoreProduct {
    id: string;
    title: string;
    description: string;
    price: number;
    originalPrice?: number;
    sellerId: string;
    sellerName?: string;
    sellerIsVerified?: boolean;
    previewImage?: string;
    previews?: ProductPreview[];
    productType: string;
    createdAt: string;
    likes?: number;
    views?: number;
    isOneTimePurchase?: boolean;
    scriptPreview?: string[] | null;
    characterCount?: number | null;
    duration?: string | null;
    isAiGenerated?: boolean | null;
    status?: string;
    licenseType?: 'commercial_only' | 'standard';
    requiresYoutubeLink?: boolean;
    tieredPricing?: {
        singleChannel: number;
        multipleWorks: number;
        fullOwnership: number;
    };
    language?: string;
    quality?: string;
    videoSize?: string;
    resolution?: string;
    frameCount?: string;
    targetAudience?: string;
    emotionalTone?: string;
    soundFx?: string;
    bgm?: string;
    scriptPreviewUrl?: string | null;
}

export interface CartItem extends StoreProduct {
  quantity: number;
  selectedTier?: 'singleChannel' | 'multipleWorks' | 'fullOwnership';
  youtubeChannelLink?: string;
  productSnapshot?: any;
}

export interface Thumbnail {
  id: string;
  userId: string;
  prompt: string;
  imageUrl: string;
  seed: number;
  width: number;
  height: number;
  num_inference_steps: number;
  createdAt: string;
  ref?: DocumentReference;
}

export interface Notification {
    id: string;
    message: string;
    timestamp: string;
    read: boolean;
    type: 'credits' | 'system' | 'message';
}

export interface LiveChatSession {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  lastMessage: string;
  lastMessageTimestamp: string;
  isReadByAdmin: boolean;
  ref?: DocumentReference;
}

export interface LiveChatMessage {
  id: string;
  sender: 'user' | 'admin';
  text?: string;
  imageUrl?: string;
  timestamp: string;
  isEdited?: boolean;
  seen?: boolean;
  ref?: DocumentReference;
  clientMessageId?: string;
}

export interface SellerProfile {
  id: string;
  storeName: string;
  description: string;
  profileImageUrl: string;
  onboarded: boolean;
  createdAt: string;
  mobileNumber?: string;
  secondaryEmail?: string;
  isVerified?: boolean;
  followerCount?: number;
  status: 'pending' | 'approved' | 'rejected' | 'pending_update';
  rejectionReason?: string;
  payoutDetails?: {
    upiId?: string;
    accountHolderName?: string;
    paymentQrUrl?: string;
  };
}

export interface Order {
  id: string;
  userId: string; 
  userEmail: string;
  productId: string;
  sellerId: string;
  amount: number; 
  currency: string;
  status: 'pending' | 'paid' | 'failed';
  paymentMethod: 'cash' | 'credits' | 'free';
  paymentId?: string;
  createdAt: string;
  productTitle?: string; 
  selectedTier?: string;
  youtubeChannelLink?: string;
  productSnapshot?: any;
}

export interface PromoCode {
  id: string; 
  code: string;
  status: 'available' | 'redeemed' | 'expired';
  type: 'credit' | 'discount';
  creditAmount?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  createdAt: string;
  expiresAt?: string | null;
  redeemedBy?: string; 
  redeemedByEmail?: string;
  redeemedAt?: string;
  eventName?: string;
}

export interface AffiliateCode {
  id: string;
  code: string;
  youtuberTelegramId: string;
  affiliateEmail: string;
  rewardType: 'discount' | 'extra_credits';
  rewardValue: number;
  commissionRate: number;
  isEnabled: boolean;
}

export interface AffiliateTransaction {
  id: string;
  buyerEmail: string;
  purchaseAmount: number;
  commissionEarned: number;
  timestamp: string;
}

export interface AffiliateWithdrawal {
  id: string;
  amount: number;
  timestamp: string;
  adminEmail: string;
}

export interface ToolSetting {
  id: string;
  locked: boolean;
  premium?: boolean;
}

export interface DeviceSubscription {
    subscription: PushSubscriptionJSON;
    platform: string;
    deviceId: string;
    isActive: boolean;
    lastSeenAt: string;
    userAgent?: string;
    appVersion?: string;
}



export interface PendingPayment {
    id: string;
    userId: string;
    email: string;
    amount: number;
    currency: string;
    credits: number;
    status: 'pending' | 'approved' | 'rejected';
    timestamp: string;
    paymentId: string;
    planName?: string;
    orderId?: string;
    userEmail?: string;
    createdAt?: string;
}

export interface PendingProject {
    id: string;
    userId: string;
    projectName: string;
    script: string;
    status: string;
    createdAt: string;
    cost?: number;
    processed_dialogues?: number;
    rejected_nodes?: number;
}

export interface MusicEntry {
    id: string;
    url: string;
    prompt: string;
    userId?: string;
    createdAt?: string;
    category?: string;
    price?: number;
    privateUrl?: string;
    isOff?: boolean;
    isPrivate?: boolean;
    // Optional cover art — client-compressed before upload (see
    // compressImageFile in src/lib/audio-utils.ts). Falls back to the
    // gradient+Music icon in the player/list when not set.
    imageUrl?: string;
    // Non-sensitive flag mirroring whether musicMasters/{id} has a private
    // master URL set — the URL itself never lives on this client-readable
    // record (see src/app/admin/music-manager/actions.ts).
    hasMaster?: boolean;
}
