import React from "react";
import SellerClientLayout from "./seller-client-layout";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Seller Dashboard | 12Labs',
  robots: {
    index: false,
    follow: false,
  },
};

export default function SellerLayout({ children }: { children: React.ReactNode; }) {
  return (
    <SellerClientLayout>
        {children}
    </SellerClientLayout>
  );
}
