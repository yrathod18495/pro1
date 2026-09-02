'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { FileUp, FileText, Loader2, Trash2, Copy, FileDown, Check, Layers, Printer, Sparkles, Cpu, X } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Script from 'next/script';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import { reportClientError } from '@/lib/report-client-error';
import { useAuth } from '@/context/auth-provider';
import { useRouter } from 'next/navigation';

// Global types for external libs
declare const Tesseract: any;
declare const pdfjsLib: any;

export default function PdfOcrPage() {
    const [file, setFile] = useState<File | null>(null);
    const [status, setStatus] = useState<'idle' | 'processing' | 'completed' | 'error'>('idle');
    const [extractedText, setExtractedText] = useState<string>('');
    const [errorMessage, setErrorMessage] = useState('');
    const [isCopied, setIsCopied] = useState(false);
    const [processingStatus, setProcessingStatus] = useState('');
    const [progress, setProgress] = useState(0);
    const { toast } = useToast();
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    // 🔒 AUTH GUARD: redirect unauthenticated visitors to /login instead of
    // silently rendering the full PDF tools while logged out.
    useEffect(() => {
        if (!authLoading && !user) {
            toast({ variant: 'destructive', title: 'Sign In Required', description: 'Please log in to use PDF Tools.' });
            router.push('/login');
        }
    }, [authLoading, user, router, toast]);

    // Loading states for actions
    const [isDownloadingTxt, setIsDownloadingTxt] = useState(false);
    const [isDownloadingDocx, setIsDownloadingDocx] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);

    // Password handling
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
    const [password, setPassword] = useState('');
    const [fileWaitingForPassword, setFileWaitingForPassword] = useState<File | null>(null);

    const handleClear = () => {
        setFile(null);
        setStatus('idle');
        setExtractedText('');
        setErrorMessage('');
        setProgress(0);
        setProcessingStatus('');
        setIsPasswordDialogOpen(false);
        setPassword('');
        setFileWaitingForPassword(null);
    };

    const handleProcess = useCallback(async (fileToProcess: File, providedPassword?: string) => {
        setStatus('processing');
        setExtractedText('');
        setErrorMessage('');
        setProgress(0);
        setProcessingStatus('Initializing OCR Engine...');

        try {
            if (typeof Tesseract === 'undefined' || typeof pdfjsLib === 'undefined') {
                throw new Error('Libraries loading... please wait a few seconds.');
            }
            
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.9.179/pdf.worker.min.js`;

            const arrayBuffer = await fileToProcess.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({
                data: arrayBuffer,
                ...(providedPassword && { password: providedPassword }),
            });
            
            const pdf = await loadingTask.promise;
            const numPages = pdf.numPages;
            let fullTextArray: string[] = new Array(numPages).fill('');

            // Parallel Batch Processing (5 pages at a time)
            const BATCH_SIZE = 5;
            
            for (let i = 1; i <= numPages; i += BATCH_SIZE) {
                const batchPromises = [];
                const endPage = Math.min(i + BATCH_SIZE - 1, numPages);
                
                setProcessingStatus(`Scanning pages ${i}-${endPage}...`);

                for (let j = i; j <= endPage; j++) {
                    const processPage = async (pageIndex: number) => {
                        const page = await pdf.getPage(pageIndex);
                        const viewport = page.getViewport({ scale: 2.0 });
                        const canvas = document.createElement('canvas');
                        const context = canvas.getContext('2d');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;

                        if (!context) throw new Error('Canvas context failure.');

                        await page.render({ canvasContext: context, viewport }).promise;
                        const result = await Tesseract.recognize(canvas, 'eng+hin');
                        return result.data.text;
                    };
                    batchPromises.push(processPage(j));
                }

                const batchResults = await Promise.all(batchPromises);
                
                batchResults.forEach((text, index) => {
                    fullTextArray[i + index - 1] = text;
                });

                setProgress((endPage / numPages) * 100);
            }

            setExtractedText(fullTextArray.join('\n\n').trim());
            setStatus('completed');
            toast({ title: 'Extraction Complete' });
        } catch (error: any) {
            reportClientError('src/app/pdf-tools/page.tsx:121', error);
            if (error.name === 'PasswordException' || error.name === 'InvalidPasswordException') {
                setFileWaitingForPassword(fileToProcess);
                setIsPasswordDialogOpen(true);
                return;
            }
            setErrorMessage(error.message || 'Failed to read PDF.');
            setStatus('error');
            toast({ variant: 'destructive', title: 'OCR Failed', description: error.message });
        } finally {
            setProcessingStatus('');
        }
    }, [toast]);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;
        const firstFile = acceptedFiles[0];
        handleClear();
        setFile(firstFile);
        handleProcess(firstFile);
    }, [handleProcess]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'] },
        multiple: false,
    });

    const handlePasswordSubmit = () => {
        if (fileWaitingForPassword && password) {
            setIsPasswordDialogOpen(false);
            handleProcess(fileWaitingForPassword, password);
            setPassword('');
        }
    };
    
    const handleCopy = () => {
        if (!extractedText) return;
        navigator.clipboard.writeText(extractedText);
        setIsCopied(true);
        toast({ title: 'Copied!' });
        setTimeout(() => setIsCopied(false), 2000);
    }

    const handleDownloadTxt = () => {
        setIsDownloadingTxt(true);
        try {
            const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `12labs_script_${Date.now()}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast({ title: 'Downloading TXT...' });
        } catch (e) {
            reportClientError('src/app/pdf-tools/page.tsx:178', e);
            toast({ variant: 'destructive', title: 'Download failed' });
        } finally {
            setTimeout(() => setIsDownloadingTxt(false), 1000);
        }
    };

    const handleDownloadDocx = async () => {
        if (!extractedText) return;
        setIsDownloadingDocx(true);
        
        try {
            const doc = new Document({
                sections: [{
                    properties: {},
                    children: extractedText.split('\n').map(line => 
                        new Paragraph({
                            children: [new TextRun({ text: line, size: 24 })],
                        })
                    ),
                }],
            });

            const blob = await Packer.toBlob(doc);
            saveAs(blob, `12labs_script_${Date.now()}.docx`);
            toast({ title: 'Downloading DOCX...' });
        } catch (error) {
            console.error("Docx generation failed:", error);
            toast({ variant: 'destructive', title: 'DOCX generation failed' });
        } finally {
            setTimeout(() => setIsDownloadingDocx(false), 1000);
        }
    };

    const handlePrintPdf = () => {
        if (!extractedText) return;
        setIsPrinting(true);
        
        // Use the robust inline print method
        const printContainer = document.createElement('div');
        printContainer.id = 'print-mount-container';
        printContainer.innerHTML = `
            <div style="font-family: sans-serif; padding: 40px; line-height: 1.6; color: black; background: white;">
                <div style="white-space: pre-wrap; font-size: 14px;">${extractedText}</div>
            </div>
        `;

        const style = document.createElement('style');
        style.innerHTML = `
            @media print {
                body > *:not(#print-mount-container) { display: none !important; }
                #print-mount-container { display: block !important; position: absolute; left: 0; top: 0; width: 100%; }
                @page { margin: 1cm; }
            }
            #print-mount-container { display: none; }
        `;

        document.body.appendChild(printContainer);
        document.head.appendChild(style);

        window.print();

        setTimeout(() => {
            if (document.body.contains(printContainer)) document.body.removeChild(printContainer);
            if (document.head.contains(style)) document.head.removeChild(style);
            setIsPrinting(false);
        }, 1000);
    };

    if (authLoading || !user) {
        return (
            <div className="relative w-full min-h-screen bg-background/50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-muted/30">
            <Script src="https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/4.1.1/tesseract.min.js" strategy="afterInteractive" />
            <Script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.9.179/pdf.min.js" strategy="afterInteractive" />
            
            <div className="container mx-auto max-w-4xl py-12 px-4 space-y-10 no-print">
                <div className="flex flex-col items-center text-center gap-2">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <FileText className="h-8 w-8 text-primary" />
                        </div>
                        <h1 className="text-4xl font-black tracking-tight">PDF Script Studio</h1>
                    </div>
                    <p className="text-muted-foreground text-lg font-medium">
                        Convert PDFs to editable text using AI Vision.
                    </p>
                    <Badge variant="secondary" className="mt-2 w-fit h-9 px-4 text-sm font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 border-none">
                        <Cpu className="mr-2 h-4 w-4" /> PARALLEL ENGINE
                    </Badge>
                </div>

                <Card className="border-primary/10 shadow-xl overflow-hidden mx-auto max-w-2xl">
                    <CardHeader className="bg-muted/50 pb-6 text-center border-b">
                        <CardTitle className="text-xl flex items-center justify-center gap-2">
                            <FileUp className="h-5 w-5 text-primary" />Source Document
                        </CardTitle>
                        <CardDescription>Secure client-side extraction.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-8">
                        <div
                            {...getRootProps()}
                            className={cn(
                                'group relative flex flex-col items-center justify-center w-full p-12 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300',
                                isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/50',
                                status === 'processing' && 'cursor-not-allowed opacity-50'
                            )}
                        >
                            <input {...getInputProps()} disabled={status === 'processing'} />
                            <div className="p-4 bg-muted rounded-full group-hover:scale-110 transition-transform duration-500">
                                <Layers className="h-10 w-10 text-muted-foreground group-hover:text-primary" />
                            </div>
                            <p className="mt-4 text-lg font-bold text-center">
                                {isDragActive ? 'Drop PDF here' : 'Select PDF to scan'}
                            </p>
                        </div>

                        {file && status === 'processing' && (
                            <div className="mt-8 space-y-3 max-w-sm mx-auto">
                                <div className="flex justify-between items-center text-xs font-black uppercase tracking-widest px-1">
                                    <span className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> {processingStatus}</span>
                                    <span className="text-primary">{Math.round(progress)}%</span>
                                </div>
                                <Progress value={progress} className="h-2" />
                            </div>
                        )}
                    </CardContent>
                </Card>

                {(status === 'completed' || extractedText) && (
                    <Card className="border-primary/10 shadow-xl flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 mx-auto">
                        <CardHeader className="bg-muted/30 border-b flex flex-row items-center justify-between py-4">
                            <CardTitle className="text-xl">Extracted Content</CardTitle>
                            <Button onClick={handleCopy} size="sm" variant="outline" className="h-9 font-bold bg-background">
                                {isCopied ? <Check className="h-4 w-4 mr-2 text-green-500"/> : <Copy className="h-4 w-4 mr-2"/>}
                                {isCopied ? 'Copied!' : 'Copy All'}
                            </Button>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Textarea
                                readOnly
                                value={extractedText}
                                placeholder="Processing..."
                                className="min-h-[450px] text-sm font-mono bg-transparent border-none focus-visible:ring-0 resize-none p-6 leading-relaxed"
                            />
                        </CardContent>
                        <CardFooter className="bg-muted/30 border-t p-4 flex flex-col gap-4">
                            <div className="flex items-center gap-2 w-full justify-between">
                                <Button 
                                    onClick={handleDownloadTxt} 
                                    variant="secondary" 
                                    className="font-bold flex-1 h-10"
                                    disabled={isDownloadingTxt}
                                >
                                    {isDownloadingTxt ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileDown className="mr-2 h-4 w-4" />}
                                    {isDownloadingTxt ? 'Wait...' : '.txt'}
                                </Button>
                                <Button 
                                    onClick={handleDownloadDocx} 
                                    variant="secondary" 
                                    className="font-bold flex-1 h-10"
                                    disabled={isDownloadingDocx}
                                >
                                    {isDownloadingDocx ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileDown className="mr-2 h-4 w-4" />}
                                    {isDownloadingDocx ? 'Wait...' : '.docx'}
                                </Button>
                                <Button 
                                    onClick={handlePrintPdf} 
                                    variant="secondary" 
                                    className="font-bold flex-1 h-10"
                                    disabled={isPrinting}
                                >
                                    {isPrinting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="mr-2 h-4 w-4" />}
                                    {isPrinting ? 'Saving...' : 'Save as PDF'}
                                </Button>
                            </div>
                            <Button asChild className="font-black w-full shadow-lg shadow-primary/20 h-12 px-8 rounded-xl">
                                <Link href="/studio">
                                    <Sparkles className="mr-2 h-4 w-4" /> Open in Studio
                                </Link>
                            </Button>
                        </CardFooter>
                    </Card>
                )}
            </div>

            <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
                <DialogContent className="sm:max-w-md rounded-2xl no-print">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-black">Protected Document</DialogTitle>
                        <DialogDescription>Please enter the password to scan this PDF.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                            autoFocus
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setIsPasswordDialogOpen(false); handleClear(); }}>Cancel</Button>
                        <Button onClick={handlePasswordSubmit} className="px-8 font-bold">Unlock & Scan</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
