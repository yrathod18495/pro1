import React from "react";
import { Header } from "@/components/header";
import { MainBottomNav } from "@/components/main-bottom-nav";
import AdminClientLayout from "./admin-client-layout";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin Dashboard | 12Labs',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminClientLayout>
        {children}
    </AdminClientLayout>
  );
}
