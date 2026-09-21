
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PDF Script Studio - Extract Text from PDF with AI Vision',
  description: 'Quickly convert script PDFs into editable text using the 12Labs PDF Script Studio. High accuracy OCR for English and Hindi text extraction.',
  alternates: {
    canonical: '/pdf-tools',
  },
  openGraph: {
    title: 'PDF Tools – Extract Text, OCR & Convert PDFs Online | 12Labs AI',
    description: 'Extract text from PDFs, run OCR on scanned documents, and convert files online with free PDF tools built into 12Labs.',
    type: 'website',
    url: 'https://www.12labs.in/pdf-tools',
  },
};

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
