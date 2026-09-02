'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileText, Youtube, Sparkles, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';

export default function AddProductTypePage() {
    return (
        <div className="space-y-8 pb-20">
            <div className="space-y-1">
                <h1 className="text-3xl font-black uppercase tracking-tight">Create Listing</h1>
                <p className="text-muted-foreground font-medium">Choose the type of asset you want to publish to the 12Labs Marketplace.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Link href="/seller/add-product" prefetch={false} className="group">
                    <Card className="h-full transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-2xl rounded-[2rem] overflow-hidden">
                        <CardHeader className="bg-primary/5 p-8 pb-4">
                            <div className="p-4 bg-primary/10 rounded-2xl w-fit mb-4 group-hover:bg-primary/20 transition-colors">
                                <Upload className="h-8 w-8 text-primary" />
                            </div>
                            <CardTitle className="text-xl font-black uppercase tracking-tight">Graphic Assets</CardTitle>
                        </CardHeader>
                        <CardContent className="p-8 pt-4">
                            <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                                Sell PC Characters or Green Screen effects. Requires master file upload.
                            </p>
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/seller/add-background" prefetch={false} className="group">
                    <Card className="h-full transition-all duration-300 group-hover:border-blue-500/50 group-hover:shadow-2xl rounded-[2rem] border-blue-500/10 overflow-hidden">
                        <CardHeader className="bg-blue-500/5 p-8 pb-4">
                            <div className="p-4 bg-blue-500/10 rounded-2xl w-fit mb-4 group-hover:bg-blue-500/20 transition-colors">
                                <ImageIcon className="h-8 w-8 text-blue-600" />
                            </div>
                            <CardTitle className="text-xl font-black uppercase tracking-tight">HD Background</CardTitle>
                        </CardHeader>
                        <CardContent className="p-8 pt-4">
                            <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                                Sell high-quality video or image backgrounds. 1 Thumbnail + 1 Master Asset.
                            </p>
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/seller/add-story" prefetch={false} className="group">
                    <Card className="h-full transition-all duration-300 group-hover:border-red-500/50 group-hover:shadow-2xl rounded-[2rem] border-red-500/10 overflow-hidden">
                        <CardHeader className="bg-red-500/5 p-8 pb-4">
                            <div className="p-4 bg-red-500/10 rounded-2xl w-fit mb-4 group-hover:bg-red-500/20 transition-colors">
                                <Youtube className="h-8 w-8 text-red-600" />
                            </div>
                            <CardTitle className="text-xl font-black uppercase tracking-tight">Readymade Video</CardTitle>
                        </CardHeader>
                        <CardContent className="p-8 pt-4">
                            <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                                Sell complete ready-made video stories. Delivered via Google Drive link with multiple previews.
                            </p>
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/seller/add-script" prefetch={false} className="group">
                    <Card className="h-full transition-all duration-300 group-hover:border-amber-500/50 group-hover:shadow-2xl rounded-[2rem] border-amber-500/10 overflow-hidden">
                        <CardHeader className="bg-amber-500/5 p-8 pb-4">
                            <div className="p-4 bg-amber-500/10 rounded-2xl w-fit mb-4 group-hover:bg-amber-500/20 transition-colors">
                                <FileText className="h-8 w-8 text-amber-600" />
                            </div>
                            <CardTitle className="text-xl font-black uppercase tracking-tight">Written Script</CardTitle>
                        </CardHeader>
                        <CardContent className="p-8 pt-4">
                            <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                                Sell scripts for short films, stories, or videos. Buyers can read a 30% preview before buying.
                            </p>
                        </CardContent>
                    </Card>
                </Link>
            </div>
            
            <div className="p-6 bg-primary/5 rounded-[2rem] border border-dashed border-primary/20 flex items-center gap-4">
                <Sparkles className="h-8 w-8 text-primary shrink-0" />
                <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed text-primary/70">
                    All submissions undergo a 2-4 hour human verification process to ensure asset quality and ownership.
                </p>
            </div>
        </div>
    );
}
