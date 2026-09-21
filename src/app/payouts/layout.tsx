import React from "react";
import PayoutsClientLayout from "./payouts-client-layout";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Affiliate Payouts | 12Labs',
  robots: {
    index: false,
    follow: false,
  },
};

export default function PayoutsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PayoutsClientLayout>
        {children}
    </PayoutsClientLayout>
  );
}
