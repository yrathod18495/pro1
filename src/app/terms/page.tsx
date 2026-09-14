
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, User, FileText, CreditCard, Ban, Gavel, ShieldOff, ServerCrash, RefreshCw, Mail, Store, Clock, RotateCcw } from 'lucide-react';

export default function TermsPage() {
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
                <CardTitle className="text-3xl">Terms of Service</CardTitle>
                <CardDescription>Last updated: <strong className="text-foreground">July 30, 2026</strong></CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 text-muted-foreground prose dark:prose-invert max-w-none">
                <p>
                    Welcome to 12Labs! These Terms of Service ("Terms") govern your use of our application and services (the "Service") provided by 12Labs ("we," "us," or "our"). By accessing or using our Service, you agree to be bound by these Terms.
                </p>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><User className="h-5 w-5 text-primary" />1. User Accounts & Responsibilities</h2>
                    <p>
                        To access most features of the Service, you must register for an account. You agree to provide accurate, current, and complete information during registration. You are responsible for safeguarding your password and for all activities that occur under your account. You must be at least 13 years old to use the Service.
                    </p>
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" />2. Credits and Payments</h2>
                    <p>
                        The Service operates on a credit-based system. Some features require credits to use. We grant you free credits upon signup. Additional credits can be purchased. All purchases are final and non-refundable. We use Razorpay, a third-party payment processor, for all transactions. We do not store your payment card details.
                    </p>
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><Clock className="h-5 w-5 text-primary" />2.1 Credit Validity & Expiry</h2>
                    <p>
                        To ensure platform stability and maintain active user engagement, the following credit policies apply:
                    </p>
                    <ul className="list-disc pl-5 space-y-2">
                        <li><strong>Standard Credit Packs:</strong> Credits purchased through standard one-time packs are valid for <strong>1 year (365 days)</strong> from the date of purchase. Unused credits will expire after this period.</li>
                        <li><strong>Creator Consistency Plan:</strong> This is a weekly installment plan. Any remaining credits will <strong>expire exactly 30 days</strong> after the purchase date to ensure the consistency model is maintained.</li>
                    </ul>
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><RotateCcw className="h-5 w-5 text-primary" />2.2 Refund & Cancellation Policy</h2>
                    <p>
                        At 12Labs, we aim to provide high-quality AI services. Since the Service involves significant computational costs triggered instantly, the following policy applies:
                    </p>
                    <ul className="list-disc pl-5 space-y-2">
                        <li><strong>Digital Credits:</strong> Credit purchases are non-refundable. We provide 2,000 free credits for testing before purchase.</li>
                        <li><strong>Marketplace Assets:</strong> Once a digital asset (Character, Script, Background, Voice Pack) is purchased and the download link is accessed, no refunds will be issued.</li>
                        <li><strong>Failed Generations:</strong> If a 'Pro Studio' or 'High-Quality' generation fails due to a technical error on our side, the credits used for that specific task are automatically refunded to your account balance.</li>
                    </ul>
                </div>
                
                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />3. User Content & Intellectual Property</h2>
                    <p>
                        "User Content" means any material, including scripts, text prompts, PDFs, and audio files, that you upload or input into the Service.
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li><strong>Your Content, Your Rights:</strong> You retain all ownership rights to your User Content. We do not claim any ownership over your scripts, prompts, or source audio.</li>
                        <li><strong>AI-Generated Content:</strong> You own the output you generate using our AI tools (e.g., voiceovers, images, scripts, SEO tags), and you are free to use it for personal or commercial purposes, subject to our Prohibited Conduct rules.</li>
                        <li><strong>Our License to Your Content:</strong> By using the Service, you grant us a limited, worldwide, non-exclusive, royalty-free license to use, reproduce, modify, and process your User Content solely for the purpose of operating, providing, and improving the Service.</li>
                    </ul>
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><Store className="h-5 w-5 text-primary" />4. Digital Store & Affiliates</h2>
                    <p>
                        The 12Labs Digital Store is a marketplace for digital assets, and we also offer an Affiliate Program.
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li><strong>For Buyers:</strong> When you purchase a product, you are granted a license to use it. For items marked "One-Time Purchase" or "Exclusive," you receive a perpetual, exclusive license. For all other items, you receive a perpetual, non-exclusive license.</li>
                        <li><strong>For Sellers & Affiliates:</strong> By uploading a product or joining the affiliate program, you confirm your rights and agree to our commission structures. Payouts are processed via UPI subject to minimum balance requirements. 12Labs reserves the right to withhold payouts for suspicious or fraudulent activity.</li>
                    </ul>
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><Ban className="h-5 w-5 text-primary" />5. Prohibited Conduct</h2>
                    <p>You agree not to use the Service for any purpose that is illegal or prohibited by these Terms. Prohibited activities include, but are not limited to:</p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li>Using the Service to create content that is hateful, defamatory, harassing, or discriminatory.</li>
                        <li>Uploading copyrighted audio for voice cloning without explicit permission from the rights holder.</li>
                        <li>Attempting to reverse engineer, decompile, or otherwise discover the source code of the Service.</li>
                        <li>Using automated systems ("bots") to abuse the Service or create accounts.</li>
                        <li>Distributing or selling content generated with a stolen or unauthorized account.</li>
                    </ul>
                </div>
                
                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><Gavel className="h-5 w-5 text-primary" />6. Termination and Suspension</h2>
                    <p>
                        We may terminate or suspend your account immediately, without prior notice, for any breach of these Terms. We may also suspend accounts for suspected fraudulent activity. If your account is terminated, you will lose all remaining credits and access to the Service.
                    </p>
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><ShieldOff className="h-5 w-5 text-primary" />7. Disclaimer of Warranties</h2>
                    <p>
                        Your use of the Service is at your sole risk. The Service is provided on an "AS IS" and "AS AVAILABLE" basis. The Service is provided without warranties of any kind, whether express or implied. AI-generated content can sometimes be unexpected or inaccurate, and we do not guarantee its fitness for any particular purpose.
                    </p>
                </div>
                
                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><ServerCrash className="h-5 w-5 text-primary" />8. Limitation of Liability</h2>
                    <p>
                        In no event shall 12Labs be liable for any indirect, incidental, special, consequential or punitive damages, including loss of profits, data, or goodwill, resulting from your access to or use of, or inability to access or use, the Service.
                    </p>
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><RefreshCw className="h-5 w-5 text-primary" />9. Changes to Terms</h2>
                    <p>
                       We reserve the right, at our sole discretion, to modify or replace these Terms at any time. We will provide notice of any changes by posting the new Terms on this page and, if the changes are significant, by notifying you via email.
                    </p>
                </div>

                <div className="space-y-2">
                    <h2 className="text-xl font-semibold text-foreground flex items-center gap-2"><Mail className="h-5 w-5 text-primary" />10. Contact Us</h2>
                    <p>
                        If you have any questions about these Terms, please contact us via our <Link href="/contact" className="text-primary underline" prefetch={false}>Contact Page</Link> or email us at <strong>12labofficial@gmail.com</strong>.
                    </p>
                </div>
            </CardContent>
        </Card>
    </div>
  );
}
