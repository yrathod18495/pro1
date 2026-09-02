
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-provider';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag, Calendar, User, Gift, Percent, Copy, Check, MoreHorizontal, Edit, Trash2, Loader2, IndianRupee, PartyPopper, Users2, Power, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { generatePromoCodes, getAvailablePromoCodes, searchPromoCode, deletePromoCode, updatePromoCode, createAffiliateCode, getAffiliateData, toggleAffiliateCodeStatus, updateAffiliateCode } from './actions';
import type { PromoCode, AffiliateCode } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';

// --- Edit Dialog Component ---
const editPromoCodeSchema = z.object({
  value: z.coerce.number().min(1, "Value must be at least 1."),
  expiresAt: z.date().nullable(),
});

function EditPromoCodeDialog({ code, onUpdate, open, onOpenChange }: { code: PromoCode, onUpdate: () => void, open: boolean, onOpenChange: (open: boolean) => void }) {
    const { toast } = useToast();
    const { user } = useAuth();
    const [isSaving, setIsSaving] = useState(false);

    const form = useForm<z.infer<typeof editPromoCodeSchema>>({
        resolver: zodResolver(editPromoCodeSchema),
    });

    useEffect(() => {
        if (code) {
            form.reset({
                value: code.type === 'credit' ? code.creditAmount : code.discountValue,
                expiresAt: code.expiresAt ? new Date(code.expiresAt) : null,
            });
        }
    }, [code, form]);

    async function onSubmit(values: z.infer<typeof editPromoCodeSchema>) {
        if (!user) return;
        setIsSaving(true);
        const idToken = await user.getIdToken();
        const result = await updatePromoCode(idToken, code.id, values);
        if (result.success) {
            toast({ title: "Success", description: result.message });
            onUpdate();
        } else {
            toast({ variant: 'destructive', title: "Update Failed", description: result.message });
        }
        setIsSaving(false);
        onOpenChange(false);
    }
    
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Promo Code: {code.code}</DialogTitle>
                    <DialogDescription>
                        You can update the value and expiration date.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                        <FormField control={form.control} name="value" render={({ field }) => ( <FormItem><FormLabel>{code.type === 'credit' ? 'Credit Amount' : 'Discount (%)'}</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )}/>
                        <FormField control={form.control} name="expiresAt" render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel>Expiration Date</FormLabel>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                        <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                            {field.value ? (format(field.value, "PPP")) : (<span>No Expiration</span>)}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <CalendarComponent mode="single" selected={field.value || undefined} onSelect={field.onChange} />
                                        <div className="p-2 border-t">
                                            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => field.onChange(null)}>No Expiration</Button>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                                <FormMessage />
                            </FormItem>
                         )}/>
                         <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}

// --- Generator Component ---
const formSchema = z.object({
  codeType: z.enum(['credit', 'discount_percentage', 'discount_fixed'], { required_error: "You must select a code type." }),
  value: z.coerce.number().min(1, "Value must be at least 1."),
  quantity: z.coerce.number().min(1, "Generate at least 1 code.").max(100, "Cannot generate more than 100 codes at once."),
  expiresInDays: z.coerce.number().optional(),
  eventName: z.string().min(3, 'Must be 3-12 characters').max(12, 'Must be 12 characters or less').regex(/^[a-zA-Z0-9]+$/, 'Only letters and numbers, no spaces.').optional().or(z.literal('')),
});

function PromoCodeGenerator({ onGenerateSuccess }: { onGenerateSuccess: () => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState('standard');

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      codeType: 'credit',
      quantity: 1,
      value: undefined,
      expiresInDays: undefined,
      eventName: '',
    },
  });

  const codeType = form.watch('codeType');

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user) return;
    setIsGenerating(true);
    setGeneratedCodes([]);
    
    const payload = {...values};
    if (activeTab === 'event' && !payload.eventName) {
        form.setError('eventName', { type: 'manual', message: 'Event name is required for this type of generation.' });
        setIsGenerating(false);
        return;
    }
    
    if (activeTab === 'standard') {
        payload.eventName = '';
    }
    
    const idToken = await user.getIdToken();
    const result = await generatePromoCodes(idToken, payload);
    if (result.success && result.codes) {
      toast({ title: "Success!", description: result.message });
      setGeneratedCodes(result.codes);
      onGenerateSuccess(); // Trigger refetch
    } else {
      toast({ variant: 'destructive', title: "Error", description: result.message });
    }
    setIsGenerating(false);
  }

  const copyCodesToClipboard = () => {
    navigator.clipboard.writeText(generatedCodes.join('\n'));
    toast({ title: 'Copied!', description: 'All generated codes copied to clipboard.' });
  };
  
    const valueLabel = {
        'credit': 'Credit Amount',
        'discount_percentage': 'Discount (%)',
        'discount_fixed': 'Discount (₹)',
    }[codeType];

    return (
    <Card>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Tag /> Promo Code Generator</CardTitle>
            <CardDescription>Create new promo codes in bulk for your users.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="standard">Standard</TabsTrigger>
                    <TabsTrigger value="event"><PartyPopper className="mr-2 h-4 w-4"/>Special Event</TabsTrigger>
                </TabsList>
                <TabsContent value="standard" className="pt-4 text-sm text-muted-foreground">
                    Generate standard codes with the prefix <span className="font-mono font-bold text-foreground">12LABS-</span>.
                </TabsContent>
                <TabsContent value="event" className="pt-4">
                    <FormField
                        control={form.control}
                        name="eventName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Custom Code Prefix</FormLabel>
                                <FormControl>
                                    <Input placeholder="e.g., DIWALI24" {...field} />
                                </FormControl>
                                <FormDescription>Example: 'SALE' will generate codes like 12labs_SALE-XXXX.</FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </TabsContent>
            </Tabs>
            <FormField control={form.control} name="codeType" render={({ field }) => ( <FormItem className="space-y-3"><FormLabel>Code Type</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-wrap gap-x-4 gap-y-2"><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="credit" id="r1-old" /></FormControl><FormLabel htmlFor="r1-old" className="font-normal flex items-center gap-1.5"><Gift className="h-4 w-4" /> Credit Grant</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="discount_percentage" id="r2-old" /></FormControl><FormLabel htmlFor="r2-old" className="font-normal flex items-center gap-1.5"><Percent className="h-4 w-4" /> Percentage</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="discount_fixed" id="r3-old" /></FormControl><FormLabel htmlFor="r3-old" className="font-normal flex items-center gap-1.5"><IndianRupee className="h-4 w-4" /> Fixed Amount</FormLabel></FormItem></RadioGroup></FormControl></FormItem> )}/>
            
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="value" render={({ field }) => ( <FormItem><FormLabel>{valueLabel}</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="quantity" render={({ field }) => ( <FormItem><FormLabel>Quantity</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''}/></FormControl><FormMessage /></FormItem> )}/>
            </div>

            <div className="space-y-2">
                <FormField control={form.control} name="expiresInDays" render={({ field }) => ( <FormItem><FormLabel>Expires in (Days)</FormLabel><FormControl><Input type="number" placeholder="e.g., 30 (optional)" {...field} value={field.value ?? ''} /></FormControl></FormItem> )}/>
            </div>
            
            {generatedCodes.length > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <Label>Generated Codes</Label>
                    <Button type="button" variant="ghost" size="sm" onClick={copyCodesToClipboard}><Copy className="mr-2 h-4 w-4"/> Copy All</Button>
                </div>
                <ScrollArea className="h-32 border rounded-md p-2 bg-muted/50">
                    <pre className="text-sm">{generatedCodes.join('\n')}</pre>
                </ScrollArea>
              </div>
            )}
          </CardContent>
          <CardFooter>
             <Button type="submit" className="w-full" disabled={isGenerating}>
                {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isGenerating ? 'Generating...' : `Generate ${form.getValues('quantity') || 0} Code(s)`}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

// --- AFFILIATE COMPONENTS ---
const affiliateCodeSchema = z.object({
    code: z.string().min(3, "Code must be at least 3 characters").regex(/^[A-Z0-9_]+$/, 'Only uppercase letters, numbers, and underscores allowed.'),
    youtuberTelegramId: z.string().min(1, "Telegram ID is required."),
    affiliateEmail: z.string().email("Please enter a valid email for the affiliate."),
    rewardType: z.enum(['discount', 'extra_credits']),
    rewardValue: z.coerce.number().min(0, "Value must be non-negative.").max(100, "Value must be 100 or less."),
    commissionRate: z.coerce.number().min(0).max(100, "Commission must be between 0-100."),
});

function AffiliateCodeGenerator({ onGenerateSuccess }: { onGenerateSuccess: () => void }) {
    const { toast } = useToast();
    const { user } = useAuth();
    const [isGenerating, setIsGenerating] = useState(false);

    const form = useForm<z.infer<typeof affiliateCodeSchema>>({
        resolver: zodResolver(affiliateCodeSchema),
        defaultValues: {
            code: "",
            youtuberTelegramId: "",
            affiliateEmail: "",
            rewardType: 'discount',
            rewardValue: 0,
            commissionRate: 0,
        },
    });
    
    const rewardType = form.watch('rewardType');

    async function onSubmit(values: z.infer<typeof affiliateCodeSchema>) {
        if (!user) return;
        setIsGenerating(true);
        const idToken = await user.getIdToken();
        const result = await createAffiliateCode(idToken, values);
        if (result.success) {
            toast({ title: 'Success!', description: result.message });
            form.reset();
            onGenerateSuccess();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setIsGenerating(false);
    }

    return (
        <Card>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    <CardHeader>
                        <CardTitle>Create Affiliate Code</CardTitle>
                        <CardDescription>Generate a new code for a creator/youtuber.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <FormField control={form.control} name="code" render={({ field }) => ( <FormItem><FormLabel>Creator Code</FormLabel><FormControl><Input placeholder="e.g., CREATOR10" {...field} onChange={e => field.onChange(e.target.value.toUpperCase())} /></FormControl><FormDescription>Unique code for the creator.</FormDescription><FormMessage /></FormItem> )}/>
                        <FormField control={form.control} name="youtuberTelegramId" render={({ field }) => ( <FormItem><FormLabel>Creator's Telegram ID</FormLabel><FormControl><Input placeholder="e.g., 123456789" {...field} /></FormControl><FormDescription>ID to send commission notifications.</FormDescription><FormMessage /></FormItem> )}/>
                        <FormField control={form.control} name="affiliateEmail" render={({ field }) => ( <FormItem><FormLabel>Creator's Login Email</FormLabel><FormControl><Input placeholder="creator@example.com" {...field} /></FormControl><FormDescription>This user will get a 'Payouts' tab.</FormDescription><FormMessage /></FormItem> )}/>
                        
                        <FormField
                            control={form.control}
                            name="rewardType"
                            render={({ field }) => (
                                <FormItem className="space-y-3">
                                <FormLabel>Reward Type</FormLabel>
                                <FormControl>
                                    <RadioGroup
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                    className="flex space-x-4"
                                    >
                                    <FormItem className="flex items-center space-x-2">
                                        <FormControl><RadioGroupItem value="discount" /></FormControl>
                                        <FormLabel className="font-normal">Discount</FormLabel>
                                    </FormItem>
                                    <FormItem className="flex items-center space-x-2">
                                        <FormControl><RadioGroupItem value="extra_credits" /></FormControl>
                                        <FormLabel className="font-normal">Extra Credits</FormLabel>
                                    </FormItem>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                             <FormField control={form.control} name="rewardValue" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{rewardType === 'discount' ? 'Discount Rate (%)' : 'Bonus Credits (%)'}</FormLabel>
                                    <FormControl><Input type="number" {...field} value={field.value || ''} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                             )}/>
                             <FormField control={form.control} name="commissionRate" render={({ field }) => ( <FormItem><FormLabel>Commission Rate (%)</FormLabel><FormControl><Input type="number" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem> )}/>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" className="w-full" disabled={isGenerating}>
                            {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create Affiliate Code
                        </Button>
                    </CardFooter>
                </form>
            </Form>
        </Card>
    )
}

const editAffiliateCodeSchema = z.object({
    youtuberTelegramId: z.string().min(1, "Telegram ID is required."),
    affiliateEmail: z.string().email("Please enter a valid email for the affiliate."),
    rewardType: z.enum(['discount', 'extra_credits']),
    rewardValue: z.coerce.number().min(0, "Value must be non-negative.").max(100, "Value must be 100 or less."),
    commissionRate: z.coerce.number().min(0).max(100, "Commission must be between 0-100."),
});

function EditAffiliateCodeDialog({ code, onUpdate, open, onOpenChange }: { code: AffiliateCode, onUpdate: () => void, open: boolean, onOpenChange: (open: boolean) => void }) {
    const { toast } = useToast();
    const { user } = useAuth();
    const [isSaving, setIsSaving] = useState(false);

    const form = useForm<z.infer<typeof editAffiliateCodeSchema>>({
        resolver: zodResolver(editAffiliateCodeSchema),
        defaultValues: {
            youtuberTelegramId: code.youtuberTelegramId,
            affiliateEmail: code.affiliateEmail,
            rewardType: code.rewardType,
            rewardValue: code.rewardValue,
            commissionRate: code.commissionRate,
        }
    });

    const rewardType = form.watch('rewardType');

    async function onSubmit(values: z.infer<typeof editAffiliateCodeSchema>) {
        if (!user) return;
        setIsSaving(true);
        const idToken = await user.getIdToken();
        const result = await updateAffiliateCode(idToken, code.id, values);
        if (result.success) {
            toast({ title: "Success", description: result.message });
            onUpdate();
        } else {
            toast({ variant: 'destructive', title: "Update Failed", description: result.message });
        }
        setIsSaving(false);
        onOpenChange(false);
    }
    
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit Affiliate Code: {code.code}</DialogTitle>
                </DialogHeader>
                 <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                        <FormField control={form.control} name="youtuberTelegramId" render={({ field }) => ( <FormItem><FormLabel>Creator's Telegram ID</FormLabel><FormControl><Input {...field} /></FormControl><FormDescription>ID to send commission notifications.</FormDescription><FormMessage /></FormItem> )}/>
                        <FormField control={form.control} name="affiliateEmail" render={({ field }) => ( <FormItem><FormLabel>Creator's Login Email</FormLabel><FormControl><Input {...field} /></FormControl><FormDescription>This user will get a 'Payouts' tab.</FormDescription><FormMessage /></FormItem> )}/>
                        <FormField control={form.control} name="rewardType" render={({ field }) => ( <FormItem className="space-y-3"><FormLabel>Reward Type</FormLabel><FormControl><RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex space-x-4"><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="discount" /></FormControl><FormLabel className="font-normal">Discount</FormLabel></FormItem><FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="extra_credits" /></FormControl><FormLabel className="font-normal">Extra Credits</FormLabel></FormItem></RadioGroup></FormControl><FormMessage /></FormItem> )}/>
                        <div className="grid grid-cols-2 gap-4">
                             <FormField control={form.control} name="rewardValue" render={({ field }) => ( <FormItem><FormLabel>{rewardType === 'discount' ? 'Discount Rate (%)' : 'Bonus Credits (%)'}</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )}/>
                             <FormField control={form.control} name="commissionRate" render={({ field }) => ( <FormItem><FormLabel>Commission Rate (%)</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )}/>
                        </div>
                         <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}

function AffiliateCodeTable({ codes, isLoading, onAdminAction }: { codes: AffiliateCode[], isLoading: boolean, onAdminAction: () => void }) {
    const [isToggling, setIsToggling] = useState<string | null>(null);
    const [editingCode, setEditingCode] = useState<AffiliateCode | null>(null);
    const { toast } = useToast();
    const { user } = useAuth();

    const handleToggle = async (code: string, currentStatus: boolean) => {
        if (!user) return;
        setIsToggling(code);
        const idToken = await user.getIdToken();
        const result = await toggleAffiliateCodeStatus(idToken, code, currentStatus);
        if (result.success) {
            toast({ title: 'Status Updated' });
            onAdminAction();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setIsToggling(null);
    }
    
    return (
        <>
        <Card>
            <CardHeader>
                <CardTitle>Affiliate Codes</CardTitle>
                <CardDescription>Manage codes for your creator partnerships.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Code</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Commission</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                         <TableBody>
                            {isLoading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell>
                                    </TableRow>
                                ))
                            ) : codes.length > 0 ? (
                                codes.map((code) => {
                                    return (
                                    <TableRow key={code.id}>
                                        <TableCell className="font-mono font-medium">{code.code}</TableCell>
                                        <TableCell>{code.affiliateEmail}</TableCell>
                                        <TableCell>{code.commissionRate}%</TableCell>
                                        <TableCell>
                                            <Switch
                                                checked={code.isEnabled}
                                                onCheckedChange={() => handleToggle(code.id, code.isEnabled)}
                                                disabled={isToggling === code.id}
                                            />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                     <DropdownMenuItem onSelect={() => setEditingCode(code)}>
                                                        <Edit className="mr-2 h-4 w-4" /> Edit Details
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                )})
                            ) : (
                                 <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">No affiliate codes created yet.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
        {editingCode && (
            <EditAffiliateCodeDialog 
                code={editingCode} 
                open={!!editingCode}
                onOpenChange={(isOpen) => !isOpen && setEditingCode(null)}
                onUpdate={() => {
                    onAdminAction();
                    setEditingCode(null);
                }}
            />
        )}
        </>
    )
}

// --- Main Page Component ---
export default function AdminPromoCodesPage() {
    const { toast } = useToast();
    const { user } = useAuth();
    const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
    const [isPromoLoading, setIsPromoLoading] = useState(true);
    const [searchResults, setSearchResults] = useState<PromoCode[] | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    const [affiliateData, setAffiliateData] = useState<{ codes: AffiliateCode[] } | null>(null);
    const [isAffiliateLoading, setIsAffiliateLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('standard');
    
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [dialogState, setDialogState] = useState<{ type: 'delete'; code: PromoCode } | null>(null);
    const [editingCode, setEditingCode] = useState<PromoCode | null>(null);

    const fetchAvailablePromoCodes = async () => {
        if (!user) return;
        setIsPromoLoading(true);
        const idToken = await user.getIdToken();
        const result = await getAvailablePromoCodes(idToken);
        if (result.success && result.codes) {
            setPromoCodes(result.codes);
        }
        setIsPromoLoading(false);
    };

    const fetchAffiliateData = async () => {
        if (!user) return;
        setIsAffiliateLoading(true);
        const idToken = await user.getIdToken();
        const result = await getAffiliateData(idToken);
        if (result.success && result.data) {
            setAffiliateData(result.data);
        }
        setIsAffiliateLoading(false);
    };
    
    const handleAdminAction = () => {
        if (activeTab === 'standard') {
            fetchAvailablePromoCodes();
            setSearchResults(null);
            setSearchQuery('');
        } else {
            fetchAffiliateData();
        }
    };

    const handleSearch = async () => {
        if (!searchQuery.trim() || !user) return;
        setIsSearching(true);
        const idToken = await user.getIdToken();
        const result = await searchPromoCode(idToken, searchQuery);
        if (result.success && result.code) {
            setSearchResults([result.code]);
        } else {
            setSearchResults([]); // Explicitly set to empty array for "not found"
            toast({ title: 'Not Found', description: result.message });
        }
        setIsSearching(false);
    }
    
    const clearSearch = () => {
        setSearchQuery('');
        setSearchResults(null);
    }

    const codesToDisplay = searchResults !== null ? searchResults : promoCodes;

    useEffect(() => {
        if (activeTab === 'standard') {
            fetchAvailablePromoCodes();
        } else if (activeTab === 'affiliate') {
            fetchAffiliateData();
        }
    }, [activeTab]);

    const handleCopy = (code: string, id: string) => {
        navigator.clipboard.writeText(code);
        setCopiedId(id);
        toast({ title: 'Code Copied!', description: `Code "${code}" copied to clipboard.` });
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleDelete = async (codeId: string) => {
        if (!user) return;
        setIsDeleting(codeId);
        const idToken = await user.getIdToken();
        const result = await deletePromoCode(idToken, codeId);
        if (result.success) {
            toast({ title: 'Success', description: result.message });
            handleAdminAction();
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setIsDeleting(null);
        setDialogState(null);
    };
    
    const getStatusBadge = (code: PromoCode) => {
        const now = new Date();
        const expiresAt = code.expiresAt ? new Date(code.expiresAt) : null;
        
        if (code.status === 'redeemed') {
            return <Badge variant="secondary">Redeemed</Badge>;
        }
        if (expiresAt && expiresAt < now) {
            return <Badge variant="destructive">Expired</Badge>;
        }
        return <Badge className="bg-primary/10 text-primary border-primary/20 dark:bg-primary/20 dark:text-primary-foreground dark:border-primary/30">Available</Badge>;
    };

  return (
    <>
    <div className="space-y-8">
      <h1 className="text-3xl font-bold flex items-center gap-3"><Tag /> Codes & Affiliates</h1>
      
      <Tabs defaultValue="standard" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="standard">Standard Promo Codes</TabsTrigger>
            <TabsTrigger value="affiliate"><Users2 className="mr-2 h-4 w-4" />Affiliate Codes</TabsTrigger>
        </TabsList>
        <TabsContent value="standard" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                <div className="lg:col-span-1">
                    <PromoCodeGenerator onGenerateSuccess={handleAdminAction} />
                </div>
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Existing Promo Codes</CardTitle>
                            <CardDescription>
                                {searchResults !== null
                                    ? `Showing ${searchResults.length} search result(s).`
                                    : `Showing ${codesToDisplay.length} available codes.`
                                }
                            </CardDescription>
                            <div className="flex w-full items-center space-x-2 pt-2">
                                <Input 
                                    placeholder="Enter exact promo code to search..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                    disabled={isSearching}
                                />
                                <Button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}>
                                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                </Button>
                                {searchResults !== null && (
                                    <Button variant="ghost" size="icon" onClick={clearSearch}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Code</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Type</TableHead>
                                            <TableHead>Value</TableHead>
                                            <TableHead>Redeemed By</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {(isPromoLoading || isSearching) ? (
                                            Array.from({ length: 5 }).map((_, i) => (
                                                <TableRow key={i}>
                                                    <TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell>
                                                </TableRow>
                                            ))
                                        ) : codesToDisplay.length > 0 ? (
                                            codesToDisplay.map((code) => (
                                                <TableRow key={code.id}>
                                                    <TableCell className="font-mono font-medium">{code.code}</TableCell>
                                                    <TableCell>{getStatusBadge(code)}</TableCell>
                                                    <TableCell className="capitalize">{code.type}</TableCell>
                                                    <TableCell>
                                                        {code.type === 'credit' ? (
                                                            <span className="flex items-center gap-1.5"><Gift className="h-4 w-4 text-primary" /> {code.creditAmount?.toLocaleString()}</span>
                                                        ) : code.discountType === 'percentage' ? (
                                                            <span className="flex items-center gap-1.5"><Percent className="h-4 w-4 text-blue-500" /> {code.discountValue}%</span>
                                                        ) : (
                                                            <span className="flex items-center gap-1.5"><IndianRupee className="h-4 w-4 text-blue-500" /> {code.discountValue} Off</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">{code.redeemedByEmail || 'N/A'}</TableCell>
                                                    <TableCell className="text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                 <DropdownMenuItem onSelect={() => handleCopy(code.code, code.id)}>
                                                                    {copiedId === code.id ? <Check className="mr-2 h-4 w-4 text-primary" /> : <Copy className="mr-2 h-4 w-4"/>}
                                                                    Copy Code
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onSelect={() => setEditingCode(code)} disabled={code.status === 'redeemed'}>
                                                                    <Edit className="mr-2 h-4 w-4" />
                                                                    Edit
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDialogState({ type: 'delete', code })}>
                                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                                    Delete
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={6} className="h-24 text-center">
                                                    {searchResults !== null ? 'No codes found for your search.' : 'No available promo codes.'}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </TabsContent>
         <TabsContent value="affiliate" className="mt-6">
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                <div className="lg:col-span-1">
                    <AffiliateCodeGenerator onGenerateSuccess={handleAdminAction} />
                </div>
                <div className="lg:col-span-2">
                    <AffiliateCodeTable codes={affiliateData?.codes || []} isLoading={isAffiliateLoading} onAdminAction={handleAdminAction}/>
                </div>
            </div>
        </TabsContent>
      </Tabs>
    </div>
    
    {editingCode && (
        <EditPromoCodeDialog 
            code={editingCode} 
            open={!!editingCode}
            onOpenChange={(isOpen) => !isOpen && setEditingCode(null)}
            onUpdate={() => {
                handleAdminAction();
                setEditingCode(null);
            }}
        />
    )}

    <AlertDialog open={dialogState?.type === 'delete'} onOpenChange={() => setDialogState(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                    This will permanently delete the promo code <span className="font-bold font-mono">{dialogState?.code.code}</span>. This action cannot be undone.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDelete(dialogState!.code.id)} disabled={isDeleting === dialogState?.code.id} className="bg-destructive hover:bg-destructive/90">
                    {isDeleting === dialogState?.code.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm Delete
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
