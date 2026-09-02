import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Database, Target, Share2, Lock, Fingerprint, Cookie, RefreshCw, Mail, Server } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="container mx-auto max-w-3xl py-12">
        <div className="mb-8">
            <Button asChild variant="outline">
                <Link href="/" prefetch={false}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                </Link>
            </Button>
        </div>
        <Card>
            <CardHeader>
                <CardTitle className="text-3xl">Privacy Policy</CardTitle>
                <CardDescription>Last updated: <strong className="text-foreground">July 30, 2026</strong></CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 text-muted-foreground prose dark:prose-invert max-w-none">
                <p>
                    12Labs ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our application (the "Service").
                </p>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><Database className="h-5 w-5 text-primary" />1. Information We Collect</h2>
                    <p>We collect information to provide and improve our services. The types of information include:</p>
                    <ul className="list-disc pl-5 space-y-2">
                        <li><strong>Personal Data:</strong> Name and email address you provide when registering with Google or another sign-in method.</li>
                        <li><strong>Content Data:</strong> This includes scripts you paste for voice generation, text prompts for our AI generators (scripts, YouTube SEO, thumbnails), audio files you upload, and PDFs you upload for parsing. This data may be sent to our third-party AI service providers for processing.</li>
                        <li><strong>Payment & Payout Data:</strong> To process credit purchases, we use Razorpay. We do not directly collect or store your full payment card information. For sellers and affiliates receiving payouts, we may collect your UPI ID and account holder name.</li>
                        <li><strong>Device & Technical Identifiers:</strong> We may collect a device identifier (such as browser/device fingerprints via FingerprintJS) to prevent abuse of promotional/free credits and detect multiple accounts created to obtain promotional benefits. To protect your privacy and comply with the Digital Personal Data Protection (DPDP) Act, these identifiers are instantly pseudonymized on our servers using secure cryptographic hashes (HMAC-SHA256) before storage, meaning no raw hardware or device IDs are ever saved to our database.</li>
                    </ul>
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><Target className="h-5 w-5 text-primary" />2. How We Use Your Information</h2>
                    <p>
                        We use the information we collect for various purposes, including to:
                    </p>
                     <ul className="list-disc pl-5 space-y-1">
                        <li>Create, maintain, and secure your account.</li>
                        <li>Provide and operate the Service, including processing your scripts and prompts to generate AI content.</li>
                        <li>Process transactions, credit purchases, and seller/affiliate payouts.</li>
                        <li>Monitor and maintain the Service's stability and security.</li>
                        <li>Communicate with you, including sending service-related notifications and responding to support requests.</li>
                        <li>Prevent fraud and ensure the security of our platform.</li>
                    </ul>
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><Share2 className="h-5 w-5 text-primary" />3. Sharing of Information</h2>
                    <p>
                        We do not sell your personal information. We may share information with the following third parties to provide our Service:
                    </p>
                    <ul className="list-disc pl-5 space-y-2">
                        <li><strong>AI Service Providers (Google GenAI, Hugging Face, DeepSeek, OpenRouter, Vertex AI):</strong> Your Content Data is sent to these services to generate AI outputs. We do not link this content to your personal identity in our requests.</li>
                        <li><strong>Cloud Storage (Google Cloud Storage / Cloudflare R2):</strong> Generated audio, image files, and digital store assets are securely stored on our cloud buckets to deliver them to you efficiently.</li>
                        <li><strong>Payment Processor (Razorpay):</strong> When you purchase credits, your payment details are handled directly by Razorpay.</li>
                        <li><strong>Legal Obligations:</strong> We may disclose your information if required to do so by law or in response to valid requests by public authorities.</li>
                    </ul>
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><Server className="h-5 w-5 text-primary" />4. Data Retention</h2>
                    <p>
                       We retain your data for as long as your account is active or as needed to provide you with our services.
                    </p>
                     <ul className="list-disc pl-5 space-y-1">
                        <li><strong>Project Data:</strong> Projects you save (including scripts and links to generated audio) are stored in your account's history. You can delete these projects at any time.</li>
                        <li><strong>Content Data:</strong> Input scripts and prompts are processed by AI models and are not permanently stored on our primary servers after the generation is complete.</li>
                        <li><strong>Account Data:</strong> We retain your account information as long as your account exists. If you delete your account, we will remove your personal data subject to our legal obligations.</li>
                        <li><strong>Device Identifier Hashes Retention:</strong> To comply with data minimization and storage limitation principles under the DPDP Act, pseudonymized device fingerprint hashes used for anti-abuse verification are subject to a strict 180-day retention policy. If no logins or registrations occur from a hashed device for 180 consecutive days, the record is flagged for purging or automated deletion.</li>
                    </ul>
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><Lock className="h-5 w-5 text-primary" />5. Promotional Credits & Anti-Abuse Terms</h2>
                    <p>
                        We offer a discretionary amount of promotional/free credits to new users upon registration. These promotional credits are governed by the following strict anti-abuse rules:
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li><strong>One-Time Trial Limit:</strong> Promotional credits are strictly limited to one (1) single grant per individual user and device identifier.</li>
                        <li><strong>Abuse Detection:</strong> Creating secondary, automated, or alternative accounts ("alt accounts") on the same physical device/browser to obtain duplicate benefits is strictly prohibited.</li>
                        <li><strong>Revocation Right:</strong> If multiple registrations are detected on the same device fingerprint hash, all promotional credit balances on the secondary accounts are automatically set to zero (0).</li>
                    </ul>
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><RefreshCw className="h-5 w-5 text-primary" />6. Cancellation, Refund & Plan Policy</h2>
                    <p>
                        All credit packs and automatic weekly subscriptions are subject to the following purchase rules:
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li><strong>Subscription Cancellation:</strong> Recurring weekly plans can be cancelled at any time. Cancellation takes place instantly and prevents any future automated billing cycles from initiating.</li>
                        <li><strong>Refund Policy:</strong> All credit purchases are final and non-refundable, in accordance with our Terms of Service. If a generation fails due to a technical error on our side, the credits used for that specific task are automatically refunded to your account balance.</li>
                    </ul>
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><Lock className="h-5 w-5 text-primary" />7. Data Security</h2>
                    <p>
                        We implement a variety of security measures to maintain the safety of your personal information. All communication with our Service is encrypted using SSL technology. While we take reasonable measures to protect your information, no security system is impenetrable.
                    </p>
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><Cookie className="h-5 w-5 text-primary" />8. Local Storage</h2>
                    <p>We use `localStorage` in your browser to save drafts of your work and your login session. This allows you to pick up where you left off. This data remains on your device and is not used for tracking or advertising purposes.</p>
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><Fingerprint className="h-5 w-5 text-primary" />9. Your Rights</h2>
                    <p>You have the right to access, correct, or delete your personal data. You can manage your projects and some personal information directly from your account. For other requests, please contact us.</p>
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><RefreshCw className="h-5 w-5 text-primary" />10. Changes to this Privacy Policy</h2>
                    <p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.</p>
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><Mail className="h-5 w-5 text-primary" />11. Contact Us</h2>
                    <p>
                        If you have any questions about this Privacy Policy, please contact us via our <Link href="/contact" className="text-primary underline" prefetch={false}>Contact Page</Link> or email us at <strong>12labofficial@gmail.com</strong>.
                    </p>
                </div>
            </CardContent>
        </Card>
    </div>
  );
}
