'use client';

import { useCart } from '@/context/cart-provider';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Trash2, ShoppingCart, History } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getDisplayUrl } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function CartSheet({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { cartItems, removeFromCart, cartTotal, itemCount } = useCart();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col p-0 sm:max-w-lg">
        <SheetHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              Shopping Cart <span className="text-sm font-normal text-muted-foreground">({itemCount} items)</span>
            </SheetTitle>
            <Button asChild variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                <Link href="/history?tab=purchases">
                    <History className="mr-2 h-4 w-4" />
                    History
                </Link>
            </Button>
          </div>
          <SheetDescription>
            Review your items before checking out.
          </SheetDescription>
        </SheetHeader>
        <Separator />
        {cartItems.length > 0 ? (
          <>
            <ScrollArea className="flex-1 px-6">
              <div className="flex flex-col gap-6 py-6">
                {cartItems.map((item) => (
                  <div key={item.id} className="flex items-start gap-4">
                    <div className="relative h-20 w-32 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                        <Image
                            src={getDisplayUrl(item.previewImage) || 'https://picsum.photos/seed/placeholder/200/200'}
                            alt={item.title}
                            fill
                            className="object-cover"
                        />
                    </div>
                    <div className="flex-1 space-y-1">
                      <h4 className="font-semibold line-clamp-2">{item.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        ₹{item.price}
                      </p>
                    </div>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 flex-shrink-0"
                            >
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Remove Item?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Are you sure you want to remove &quot;{item.title}&quot; from your cart?
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => removeFromCart(item.id)}>
                                    Remove
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <SheetFooter className="px-6 pt-4 pb-20 md:pb-6 mt-auto border-t space-y-4">
               <div className="flex justify-between text-base font-semibold">
                <p>Subtotal</p>
                <p>₹{cartTotal.toFixed(2)}</p>
              </div>
              <Button asChild className="w-full" size="lg" onClick={() => onOpenChange(false)}>
                <Link href="/store/checkout">
                    Proceed to Checkout
                </Link>
              </Button>
            </SheetFooter>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center p-6">
             <ShoppingCart className="h-16 w-16 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Your cart is empty</h3>
            <p className="text-sm text-muted-foreground">Add some products to get started.</p>
            <Button onClick={() => onOpenChange(false)} variant="link">
                Continue Shopping
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
