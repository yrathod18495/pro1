
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Tag, Gift, Percent, Copy, Check, IndianRupee } from 'lucide-react';
import { generatePromoCodes } from '@/app/admin/promo-codes/actions';
import { ScrollArea } from '../ui/scroll-area';
import { Label } from '@/components/ui/label';

const formSchema = z.object({
  codeType: z.enum(['credit', 'discount_percentage', 'discount_fixed'], { required_error: "You must select a code type." }),
  value: z.coerce.number().min(1, "Value must be at least 1."),
  quantity: z.coerce.number().min(1, "Generate at least 1 code.").max(100, "Cannot generate more than 100 codes at once."),
  expiresInDays: z.coerce.number().optional(),
});

export function PromoCodeGenerator() {
  const { toast } = useToast();
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      codeType: 'credit',
      quantity: 1,
    },
  });

  const codeType = form.watch('codeType');

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsGenerating(true);
    setGeneratedCodes([]);
    const result = await generatePromoCodes(values);
    if (result.success && result.codes) {
      toast({ title: "Success!", description: result.message });
      setGeneratedCodes(result.codes);
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
            <CardDescription>Create new promo codes in bulk for credits or discounts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="codeType"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Code Type</FormLabel>
                  <FormControl>
                    <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-wrap gap-x-4 gap-y-2">
                        <FormItem className="flex items-center space-x-2">
                            <FormControl><RadioGroupItem value="credit" id="r1-old" /></FormControl>
                            <FormLabel htmlFor="r1-old" className="font-normal flex items-center gap-1.5"><Gift className="h-4 w-4" /> Credit Grant</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-2">
                            <FormControl><RadioGroupItem value="discount_percentage" id="r2-old" /></FormControl>
                            <FormLabel htmlFor="r2-old" className="font-normal flex items-center gap-1.5"><Percent className="h-4 w-4" /> Percentage</FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-2">
                            <FormControl><RadioGroupItem value="discount_fixed" id="r3-old" /></FormControl>
                            <FormLabel htmlFor="r3-old" className="font-normal flex items-center gap-1.5"><IndianRupee className="h-4 w-4" /> Fixed Amount</FormLabel>
                        </FormItem>
                    </RadioGroup>
                  </FormControl>
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="value" render={({ field }) => ( <FormItem><FormLabel>{valueLabel}</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem> )}/>
                <FormField control={form.control} name="quantity" render={({ field }) => ( <FormItem><FormLabel>Quantity</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )}/>
            </div>

            <div className="space-y-2">
                <FormField control={form.control} name="expiresInDays" render={({ field }) => ( <FormItem><FormLabel>Expires in (Days)</FormLabel><FormControl><Input type="number" placeholder="e.g., 30" {...field} value={field.value ?? ''} /></FormControl></FormItem> )}/>
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
