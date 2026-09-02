'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { initializeFirebase } from '@/firebase';
import { ref, onValue, update } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Coins, 
  Save, 
  Loader2, 
  MicVocal, 
  Sparkles, 
  Zap, 
  Tags, 
  FileText, 
  Percent,
  CheckCircle2,
  Clock,
  Store,
  Image as ImageIcon
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { reportClientError } from '@/lib/report-client-error';

interface PricingConfig {
  studioNormal: number;
  studioDiscounted: number;
  chatterboxNormal: number;
  chatterboxDiscounted: number;
  proStudioNormal: number;
  proStudioDiscounted: number;
  seoNormal: number;
  seoDiscounted: number;
  script10Normal: number;
  script10Discounted: number;
  script20Normal: number;
  script20Discounted: number;
  script30Normal: number;
  script30Discounted: number;
  charsPerMinute: number;
  verifiedSellerGlobalDiscount: number;
  thumbnailNormal: number;
  thumbnailDiscounted: number;
}

const DEFAULT_PRICING: PricingConfig = {
  studioNormal: 1.2,
  studioDiscounted: 1.2,
  chatterboxNormal: 0.5,
  chatterboxDiscounted: 0.5,
  proStudioNormal: 0.5,
  proStudioDiscounted: 0.5,
  seoNormal: 200,
  seoDiscounted: 200,
  script10Normal: 1000,
  script10Discounted: 500,
  script20Normal: 2000,
  script20Discounted: 700,
  script30Normal: 3000,
  script30Discounted: 1000,
  charsPerMinute: 800,
  verifiedSellerGlobalDiscount: 0,
  thumbnailNormal: 1500,
  thumbnailDiscounted: 1200
};

export function PricingSettingsManager() {
  const { database } = initializeFirebase();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pricing, setPricing] = useState<PricingConfig>(DEFAULT_PRICING);

  useEffect(() => {
    const { database: db } = initializeFirebase();
    if (!db) {
      setIsLoading(false);
      return;
    }
    const pricingRef = ref(db, 'settings/pricing');
    const unsubscribe = onRtdbValue(pricingRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setPricing({
          studioNormal: Number(data.studioNormal ?? DEFAULT_PRICING.studioNormal),
          studioDiscounted: Number(data.studioDiscounted ?? DEFAULT_PRICING.studioDiscounted),
          chatterboxNormal: Number(data.chatterboxNormal ?? DEFAULT_PRICING.chatterboxNormal),
          chatterboxDiscounted: Number(data.chatterboxDiscounted ?? DEFAULT_PRICING.chatterboxDiscounted),
          proStudioNormal: Number(data.proStudioNormal ?? DEFAULT_PRICING.proStudioNormal),
          proStudioDiscounted: Number(data.proStudioDiscounted ?? DEFAULT_PRICING.proStudioDiscounted),
          seoNormal: Number(data.seoNormal ?? DEFAULT_PRICING.seoNormal),
          seoDiscounted: Number(data.seoDiscounted ?? DEFAULT_PRICING.seoDiscounted),
          script10Normal: Number(data.script10Normal ?? DEFAULT_PRICING.script10Normal),
          script10Discounted: Number(data.script10Discounted ?? DEFAULT_PRICING.script10Discounted),
          script20Normal: Number(data.script20Normal ?? DEFAULT_PRICING.script20Normal),
          script20Discounted: Number(data.script20Discounted ?? DEFAULT_PRICING.script20Discounted),
          script30Normal: Number(data.script30Normal ?? DEFAULT_PRICING.script30Normal),
          script30Discounted: Number(data.script30Discounted ?? DEFAULT_PRICING.script30Discounted),
          charsPerMinute: Number(data.charsPerMinute ?? DEFAULT_PRICING.charsPerMinute),
          verifiedSellerGlobalDiscount: Number(data.verifiedSellerGlobalDiscount ?? DEFAULT_PRICING.verifiedSellerGlobalDiscount),
          thumbnailNormal: Number(data.thumbnailNormal ?? DEFAULT_PRICING.thumbnailNormal),
          thumbnailDiscounted: Number(data.thumbnailDiscounted ?? DEFAULT_PRICING.thumbnailDiscounted),
        });
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleInputChange = (key: keyof PricingConfig, value: string) => {
    const numVal = value === '' ? 0 : Number(value);
    setPricing(prev => {
      const next = {
        ...prev,
        [key]: numVal
      };

      // Auto-compute 20% discount when Normal pricing is modified
      if (key === 'studioNormal') {
        next.studioDiscounted = numVal > 0 ? parseFloat((numVal * 0.8).toFixed(2)) : 0;
      } else if (key === 'chatterboxNormal') {
        next.chatterboxDiscounted = numVal > 0 ? parseFloat((numVal * 0.8).toFixed(2)) : 0;
      } else if (key === 'proStudioNormal') {
        next.proStudioDiscounted = numVal > 0 ? parseFloat((numVal * 0.8).toFixed(2)) : 0;
      } else if (key === 'seoNormal') {
        next.seoDiscounted = numVal > 0 ? Math.round(numVal * 0.8) : 0;
      } else if (key === 'script10Normal') {
        next.script10Discounted = numVal > 0 ? Math.round(numVal * 0.8) : 0;
      } else if (key === 'script20Normal') {
        next.script20Discounted = numVal > 0 ? Math.round(numVal * 0.8) : 0;
      } else if (key === 'script30Normal') {
        next.script30Discounted = numVal > 0 ? Math.round(numVal * 0.8) : 0;
      } else if (key === 'thumbnailNormal') {
        next.thumbnailDiscounted = numVal > 0 ? Math.round(numVal * 0.8) : 0;
      }

      return next;
    });
  };

  const handleSave = async () => {
    if (!database) return;
    setIsSaving(true);
    try {
      const pricingRef = ref(database, 'settings/pricing');
      await update(pricingRef, pricing);
      toast({
        title: 'Pricing Matrix Synchronized',
        description: 'All cards and credit deduction systems updated globally.',
        className: 'bg-green-50 border-green-200 text-green-800 font-bold'
      });
    } catch (error: any) {
            reportClientError('src/components/admin/pricing-settings-manager.tsx:159', error);
      toast({
        variant: 'destructive',
        title: 'Sync Failed',
        description: error.message
      });
    } finally {
      setIsSaving(false);
    }
  };

  const calculateDiscount = (normal: number, discounted: number) => {
    if (!normal || normal <= 0) return 0;
    if (discounted >= normal) return 0;
    return Math.round((1 - discounted / normal) * 100);
  };

  const renderDiscountBadge = (normal: number, discounted: number) => {
    const discount = calculateDiscount(normal, discounted);
    if (discount <= 0) return null;
    return (
      <Badge className="bg-emerald-500/10 text-emerald-600 border-none hover:bg-emerald-500/10 font-black text-[9px] uppercase tracking-wider h-5 rounded-full">
        {discount}% OFF
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-48 w-full rounded-3xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Core Voice Studio */}
        <Card className="rounded-3xl border-none shadow-xl bg-card overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-primary/10 p-5 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <MicVocal className="h-5 w-5 text-primary" />
              Studio Core (Fast/HQ)
            </CardTitle>
            {renderDiscountBadge(pricing.studioNormal, pricing.studioDiscounted)}
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Cost per character multiplier</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-1">Normal (multiplier)</Label>
                <Input 
                  type="number" 
                  step="0.1"
                  min="0"
                  value={pricing.studioNormal || ''} 
                  onChange={(e) => handleInputChange('studioNormal', e.target.value)}
                  className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm px-4"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-1">Discounted (multiplier)</Label>
                <Input 
                  type="number" 
                  step="0.1"
                  min="0"
                  value={pricing.studioDiscounted || ''} 
                  onChange={(e) => handleInputChange('studioDiscounted', e.target.value)}
                  className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm px-4"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chars Per Minute Estimation Setting */}
        <Card className="rounded-3xl border-none shadow-xl bg-card overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-primary/10 p-5 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              1 Min Runtime (Chars)
            </CardTitle>
            <Badge variant="outline" className="border-primary/20 text-primary font-black text-[9px] uppercase">ESTIMATION</Badge>
          </CardHeader>
          <CardContent className="p-6 space-y-3">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">How many characters = 1 Minute Audio</p>
            <div className="space-y-2">
              <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-1">Chars / Min (e.g. 700)</Label>
              <Input 
                type="number" 
                step="10"
                min="100"
                value={pricing.charsPerMinute || ''} 
                onChange={(e) => handleInputChange('charsPerMinute', e.target.value)}
                className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm px-4"
                placeholder="700"
              />
              <p className="text-[10px] text-muted-foreground font-medium">
                Ex: Setting <strong>700</strong> means 700 characters will show as <strong>01:00 (1 Min)</strong> runtime.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* New AI Studio */}
        <Card className="rounded-3xl border-none shadow-xl bg-card overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-primary/10 p-5 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              New AI Studio
            </CardTitle>
            {renderDiscountBadge(pricing.chatterboxNormal, pricing.chatterboxDiscounted)}
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Cost per character multiplier</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-1">Normal (multiplier)</Label>
                <Input 
                  type="number" 
                  step="0.1"
                  min="0"
                  value={pricing.chatterboxNormal || ''} 
                  onChange={(e) => handleInputChange('chatterboxNormal', e.target.value)}
                  className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm px-4"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-1">Discounted (multiplier)</Label>
                <Input 
                  type="number" 
                  step="0.1"
                  min="0"
                  value={pricing.chatterboxDiscounted || ''} 
                  onChange={(e) => handleInputChange('chatterboxDiscounted', e.target.value)}
                  className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm px-4"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pro Studio */}
        <Card className="rounded-3xl border-none shadow-xl bg-card overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-primary/10 p-5 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Pro Studio
            </CardTitle>
            {renderDiscountBadge(pricing.proStudioNormal, pricing.proStudioDiscounted)}
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Cost per character multiplier</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-1">Normal (multiplier)</Label>
                <Input 
                  type="number" 
                  step="0.1"
                  min="0"
                  value={pricing.proStudioNormal || ''} 
                  onChange={(e) => handleInputChange('proStudioNormal', e.target.value)}
                  className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm px-4"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-1">Discounted (multiplier)</Label>
                <Input 
                  type="number" 
                  step="0.1"
                  min="0"
                  value={pricing.proStudioDiscounted || ''} 
                  onChange={(e) => handleInputChange('proStudioDiscounted', e.target.value)}
                  className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm px-4"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SEO Kit */}
        <Card className="rounded-3xl border-none shadow-xl bg-card overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-primary/10 p-5 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <Tags className="h-5 w-5 text-primary" />
              YouTube SEO Kit
            </CardTitle>
            {renderDiscountBadge(pricing.seoNormal, pricing.seoDiscounted)}
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Flat Cost (Credits)</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-1">Normal (Credits)</Label>
                <Input 
                  type="number" 
                  min="0"
                  value={pricing.seoNormal || ''} 
                  onChange={(e) => handleInputChange('seoNormal', e.target.value)}
                  className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm px-4"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-1">Discounted (Credits)</Label>
                <Input 
                  type="number" 
                  min="0"
                  value={pricing.seoDiscounted || ''} 
                  onChange={(e) => handleInputChange('seoDiscounted', e.target.value)}
                  className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm px-4"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Script Generator - 10 Min */}
        <Card className="rounded-3xl border-none shadow-xl bg-card overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-primary/10 p-5 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Script Studio: 10 Mins
            </CardTitle>
            {renderDiscountBadge(pricing.script10Normal, pricing.script10Discounted)}
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Flat Cost (Credits)</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-1">Normal (Credits)</Label>
                <Input 
                  type="number" 
                  min="0"
                  value={pricing.script10Normal || ''} 
                  onChange={(e) => handleInputChange('script10Normal', e.target.value)}
                  className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm px-4"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-1">Discounted (Credits)</Label>
                <Input 
                  type="number" 
                  min="0"
                  value={pricing.script10Discounted || ''} 
                  onChange={(e) => handleInputChange('script10Discounted', e.target.value)}
                  className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm px-4"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Script Generator - 20 Min */}
        <Card className="rounded-3xl border-none shadow-xl bg-card overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-primary/10 p-5 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Script Studio: 20 Mins
            </CardTitle>
            {renderDiscountBadge(pricing.script20Normal, pricing.script20Discounted)}
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Flat Cost (Credits)</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-1">Normal (Credits)</Label>
                <Input 
                  type="number" 
                  min="0"
                  value={pricing.script20Normal || ''} 
                  onChange={(e) => handleInputChange('script20Normal', e.target.value)}
                  className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm px-4"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-1">Discounted (Credits)</Label>
                <Input 
                  type="number" 
                  min="0"
                  value={pricing.script20Discounted || ''} 
                  onChange={(e) => handleInputChange('script20Discounted', e.target.value)}
                  className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm px-4"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Script Generator - 30 Min */}
        <Card className="rounded-3xl border-none shadow-xl bg-card overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-primary/10 p-5 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Script Studio: 30 Mins
            </CardTitle>
            {renderDiscountBadge(pricing.script30Normal, pricing.script30Discounted)}
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Flat Cost (Credits)</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-1">Normal (Credits)</Label>
                <Input 
                  type="number" 
                  min="0"
                  value={pricing.script30Normal || ''} 
                  onChange={(e) => handleInputChange('script30Normal', e.target.value)}
                  className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm px-4"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-1">Discounted (Credits)</Label>
                <Input 
                  type="number" 
                  min="0"
                  value={pricing.script30Discounted || ''} 
                  onChange={(e) => handleInputChange('script30Discounted', e.target.value)}
                  className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm px-4"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Thumbnail Studio */}
        <Card className="rounded-3xl border-none shadow-xl bg-card overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-primary/10 p-5 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              Thumbnail Studio
            </CardTitle>
            {renderDiscountBadge(pricing.thumbnailNormal, pricing.thumbnailDiscounted)}
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Flat Cost (Credits)</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-1">Normal (Credits)</Label>
                <Input 
                  type="number" 
                  min="0"
                  value={pricing.thumbnailNormal || ''} 
                  onChange={(e) => handleInputChange('thumbnailNormal', e.target.value)}
                  className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm px-4"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-1">Discounted (Credits)</Label>
                <Input 
                  type="number" 
                  min="0"
                  value={pricing.thumbnailDiscounted || ''} 
                  onChange={(e) => handleInputChange('thumbnailDiscounted', e.target.value)}
                  className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm px-4"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Verified Seller Global Discount */}
        <Card className="rounded-3xl border-none shadow-xl bg-card overflow-hidden">
          <CardHeader className="bg-primary/5 border-b border-primary/10 p-5 flex flex-row items-center justify-between">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <Store className="h-5 w-5 text-primary" />
              Verified Seller Discount
            </CardTitle>
            <Badge variant="outline" className="border-primary/20 text-primary font-black text-[9px] uppercase">STOREWIDE</Badge>
          </CardHeader>
          <CardContent className="p-6 space-y-3">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Global Discount for Partner/Verified Sellers</p>
            <div className="space-y-2">
              <Label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground px-1">Discount Percentage (%)</Label>
              <div className="relative">
                <Input 
                  type="number" 
                  min="0"
                  max="100"
                  value={pricing.verifiedSellerGlobalDiscount || ''} 
                  onChange={(e) => handleInputChange('verifiedSellerGlobalDiscount', e.target.value)}
                  className="h-11 rounded-2xl bg-muted/10 border-primary/5 font-mono text-sm pl-4 pr-10"
                  placeholder="0"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black opacity-40">%</div>
              </div>
              <p className="text-[10px] text-muted-foreground font-medium">
                Example: Setting <strong>15</strong> will apply 15% OFF to all products from verified/partner sellers.
              </p>
            </div>
          </CardContent>
        </Card>

      </div>

      <div className="max-w-md mx-auto">
        <Button 
          onClick={handleSave} 
          disabled={isSaving} 
          className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 gap-2 btn-shine"
        >
          {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          SYNC PRICING MATRIX
        </Button>
      </div>
    </div>
  );
}
