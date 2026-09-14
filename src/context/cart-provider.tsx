'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { Product, CartItem } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from './auth-provider';
import { initializeFirebase } from '@/firebase';
import { ref, onValue, set, remove } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  itemCount: number;
  cartTotal: number;
  isInCart: (productId: string) => boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();
  const { database } = initializeFirebase();

  useEffect(() => {
    if (!user || !database) {
      setCartItems([]);
      return;
    }

    const cartRef = ref(database, `carts/${user.uid}`);
    const unsubscribe = onRtdbValue(cartRef, (snapshot) => {
      const data = snapshot.val();
      const itemsArray: CartItem[] = data ? Object.values(data) : [];
      setCartItems(itemsArray);
    }, (error) => {
      console.error("Error fetching cart from RTDB:", error);
      toast({ variant: 'destructive', title: 'Could not load cart', description: 'Please try refreshing the page.' });
    });

    return () => unsubscribe();
  }, [user, database, toast]);

  const addToCart = useCallback(async (product: Product) => {
    if (!user || !database) {
        toast({ variant: 'destructive', title: 'Please log in to add items to your cart.' });
        return;
    }

    const isAlreadyInCart = cartItems.some((item) => item.id === product.id);
    if (isAlreadyInCart) {
        toast({
          title: 'Already in Cart',
          description: `"${product.title}" is already in your cart.`,
        });
        return;
    }
    
    const imageUrl = product.previewImage || product.previews?.find(p => p.type === 'image')?.url;
    const newCartItem: CartItem = {
      ...product,
      quantity: 1,
    };
    if (imageUrl) newCartItem.previewImage = imageUrl;

    try {
        const itemRef = ref(database, `carts/${user.uid}/${product.id}`);
        await set(itemRef, newCartItem);
        toast({
            title: 'Added to Cart',
            description: `"${product.title}" has been added.`,
        });
    } catch (error) {
        console.error("Failed to add item to cart:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not add item to cart.' });
    }
  }, [user, database, cartItems, toast]);
  
  const removeFromCart = useCallback(async (productId: string) => {
    if (!user || !database) return;

    const itemToRemove = cartItems.find((item) => item.id === productId);
    try {
        const itemRef = ref(database, `carts/${user.uid}/${productId}`);
        await remove(itemRef);
        if (itemToRemove) {
            toast({
              title: 'Item Removed',
              description: `"${itemToRemove.title}" has been removed from your cart.`,
            });
        }
    } catch(error) {
        console.error("Failed to remove item from cart:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not remove item from cart.' });
    }
  }, [user, database, cartItems, toast]);

  const clearCart = useCallback(async () => {
    if (!user || !database) return;
    try {
        const cartRef = ref(database, `carts/${user.uid}`);
        await remove(cartRef);
    } catch(error) {
        console.error("Failed to clear cart:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not clear the cart.' });
    }
  }, [user, database, toast]);

  const isInCart = useCallback((productId: string) => {
    return cartItems.some((item) => item.id === productId);
  }, [cartItems]);

  const itemCount = cartItems.length;
  const cartTotal = cartItems.reduce((total, item) => total + item.price, 0);

  const value = {
    cartItems,
    addToCart,
    removeFromCart,
    clearCart,
    itemCount,
    cartTotal,
    isInCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
