'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, MessageCircle, Bot, ImagePlus, X, Clock, ShieldCheck, Maximize2, Bell } from 'lucide-react';
import { cn, generateAvatarColor, getDisplayUrl, compressImage } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { initializeFirebase } from '@/firebase';
import { ref, onValue, query, orderByChild, update } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import type { LiveChatMessage } from '@/lib/types';
import { sendUserChatMessage, uploadChatImageToGCS } from '@/app/admin/chat/actions';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { GetNotifiedButton } from '@/components/push-subscription-handler';
import { reportClientError } from '@/lib/report-client-error';

function ChatMessageItem({ 
    message, 
    localPreview, 
    isUser, 
    avatarColor, 
    userInitial,
    onImageClick
}: { 
    message: LiveChatMessage & { status?: string }, 
    localPreview?: string, 
    isUser: boolean, 
    avatarColor: { bg: string, text: string },
    userInitial: string,
    onImageClick: (url: string) => void
}) {
    const isSending = message.status === 'sending';
    const displayUrl = getDisplayUrl(message.imageUrl);
    
    return (
        <div className={cn("flex items-end gap-3 animate-in fade-in slide-in-from-bottom-1 duration-300", isUser ? 'justify-end' : 'justify-start')}>
            {!isUser && (
                <Avatar className="h-8 w-8 border-2 border-primary">
                    <AvatarImage src="https://res.cloudinary.com/dptryoeis/image/upload/v1771298434/xbejozbxaqwgweq0ym6w.png" alt="12Labs Admin" />
                    <AvatarFallback><Bot className="h-5 w-5"/></AvatarFallback>
                </Avatar>
            )}
            <div className={cn('rounded-2xl px-3 py-2 max-w-[80%] shadow-sm relative group', isUser ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-muted rounded-bl-none')}>
                {displayUrl && (
                    <div 
                        className="mb-2 max-w-[240px] rounded-xl overflow-hidden relative bg-black/5 cursor-zoom-in"
                        onClick={() => !isSending && onImageClick(displayUrl)}
                    >
                        <img 
                            src={isSending ? localPreview : displayUrl} 
                            alt="Chat asset" 
                            className={cn(
                                "w-full h-auto object-cover max-h-60 transition-all group-hover:scale-105",
                                isSending && "opacity-50 blur-sm"
                            )}
                        />
                        {isSending ? (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-white" />
                            </div>
                        ) : (
                            <div className="absolute top-2 right-2 p-1 bg-black/20 backdrop-blur-md rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                                <Maximize2 className="h-3 w-3 text-white" />
                            </div>
                        )}
                    </div>
                )}
                {message.text && (
                    <div className="text-sm whitespace-pre-wrap break-words font-medium">{message.text}</div>
                )}
                <div className={cn(
                    "flex items-center gap-1.5 text-[10px] mt-1", 
                    isUser ? "justify-end text-primary-foreground/70" : "justify-start text-muted-foreground"
                )}>
                    {isSending ? (
                        <span className="flex items-center gap-1 font-black animate-pulse">SYNCING</span>
                    ) : (
                        <span>{format(new Date(message.timestamp), 'p')}</span>
                    )}
                </div>
            </div>
            {isUser && (
                <Avatar className="h-8 w-8 border shadow-sm">
                    <AvatarFallback className={cn("font-bold text-xs", avatarColor.bg, avatarColor.text)}>
                        {userInitial}
                    </AvatarFallback>
                </Avatar>
            )}
        </div>
    );
}

export function LiveChatWidget() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { database } = initializeFirebase();

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [inputError, setInputError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hasUnread, setHasUnread] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  
  const [isClient, setIsClient] = useState(false);
  const [imageToSend, setImageToSend] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [showDismiss, setShowDismiss] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const lastPos = useRef({ x: 0, y: 0 });
  const holdTimer = useRef<NodeJS.Timeout | null>(null);
  const moveDetected = useRef(false);

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    setIsClient(true);
    if (typeof window !== 'undefined') {
      setShowNotificationPrompt(
        'Notification' in window && Notification.permission !== 'granted'
      );
      const params = new URLSearchParams(window.location.search);
      if (params.get('open_chat') === 'true' || params.get('chat') === 'open') {
        setIsOpen(true);
      }
      const handleGlobalOpen = () => setIsOpen(true);
      window.addEventListener('open-live-chat', handleGlobalOpen);
      return () => window.removeEventListener('open-live-chat', handleGlobalOpen);
    }
  }, []);

  const isMobile = isClient && typeof window !== 'undefined' && window.innerWidth < 768;
  const avatarColor = user ? generateAvatarColor(user.email || '') : { bg: '', text: ''};

  useEffect(() => {
    if (typeof window !== 'undefined') {
        const eventName = isOpen ? 'live-chat-open' : 'live-chat-close';
        window.dispatchEvent(new CustomEvent(eventName));
    }
  }, [isOpen]);

  useEffect(() => {
    if (user && database) {
        const messagesRef = ref(database, `chats/${user.uid}/messages`);
        const q = query(messagesRef, orderByChild('timestamp'));
        const unsubscribeMessages = onRtdbValue(q, (snapshot) => {
            const data = snapshot.val();
            let dbMessages: LiveChatMessage[] = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];

            // 🛑 EXPLICIT CHRONOLOGICAL SORT
            dbMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            setMessages(currentMessages => {
                const clientIdsFromDb = new Set(dbMessages.map(m => m.clientMessageId));
                const stillSending = currentMessages.filter(
                    m => (m as any).status === 'sending' && !clientIdsFromDb.has(m.clientMessageId)
                );
                
                const combined = [...dbMessages, ...stillSending];
                // Ensure overall array remains sorted during state updates
                return combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            });

            if (dbMessages.length > 0) {
                const lastMessage = dbMessages[dbMessages.length - 1];
                if (lastMessage.sender === 'admin' && !isOpen) {
                    setHasUnread(true);
                }
            }
        });

        return () => unsubscribeMessages();
    }
  }, [user, database, isOpen]);

  useEffect(() => {
    if (isOpen && user && database && messages.length > 0) {
        const unseenAdminMessages = messages.filter(m => m.sender === 'admin' && !m.seen);
        if (unseenAdminMessages.length > 0) {
            const updates: any = {};
            unseenAdminMessages.forEach(m => {
                updates[`chats/${user.uid}/messages/${m.id}/seen`] = true;
            });
            update(ref(database), updates);
        }
    }
  }, [isOpen, messages, user, database]);

  // HARDENED AUTO-SCROLL LOGIC
  useEffect(() => {
    if (!scrollAreaRef.current || messages.length === 0) return;
    const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
        // Use a micro-task to ensure DOM is updated before scrolling
        setTimeout(() => {
            viewport.scrollTo({
                top: viewport.scrollHeight,
                behavior: 'smooth'
            });
        }, 100);
    }
  }, [messages, isOpen]);

  // Native chat-style composer: grow with the message, then scroll internally.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const maxHeight = 128;
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 48), maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [input]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isOpen) return;
    setIsDragging(true);
    moveDetected.current = false;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    lastPos.current = { ...position };

    holdTimer.current = setTimeout(() => {
        if (!moveDetected.current) setShowDismiss(true);
    }, 500);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        moveDetected.current = true;
        if (holdTimer.current) clearTimeout(holdTimer.current);
    }
    setPosition({ x: lastPos.current.x - dx, y: lastPos.current.y - dy });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (!moveDetected.current && !showDismiss) {
        if (!user) toast({ variant: 'destructive', title: 'Session Required' });
        else { setIsOpen(true); setHasUnread(false); }
    }
  };

  const handleSendMessage = async () => {
    if ((!input.trim() && !imageToSend) || !user || !database) return;
    if (input.length > 1000) {
      setInputError('Message cannot exceed 1000 characters.');
      return;
    }

    setIsSending(true);
    const messageText = input;
    const clientMessageId = crypto.randomUUID();
    const currentPreview = imagePreview;

    const tempMessage: any = {
        id: clientMessageId,
        sender: 'user',
        text: messageText.trim() ? messageText : undefined,
        imageUrl: currentPreview || undefined,
        timestamp: new Date().toISOString(),
        clientMessageId: clientMessageId,
        status: 'sending',
    };
    
    setMessages(prev => [...prev, tempMessage]);
    setInput('');
    setImageToSend(null);
    setImagePreview(null);

    try {
        let finalImageUrl: string | undefined;
        if (imageToSend && currentPreview) {
            const uploadRes = await uploadChatImageToGCS(user.uid, currentPreview);
            if (!uploadRes.success || !uploadRes.url) throw new Error(uploadRes.error);
            finalImageUrl = uploadRes.url;
        }
        
        const result = await sendUserChatMessage(
            user.uid, user.name || user.email || 'N/A', user.email || 'N/A',
            { text: messageText.trim() ? messageText : undefined, imageUrl: finalImageUrl },
            clientMessageId
        );
        if (!result.success) throw new Error(result.message);
    } catch (error: any) {
            reportClientError('src/components/live-chat-widget.tsx:302', error);
        toast({ variant: 'destructive', title: 'Security Node Error', description: error.message });
        setMessages(prev => prev.filter(m => m.clientMessageId !== clientMessageId));
    } finally {
        setIsSending(false);
    }
  };

  if (!user || isHidden) return null;

  return (
    <>
      <div 
        className="fixed z-50 touch-none select-none live-chat-floating-root"
        style={{ 
            bottom: `calc(5rem + ${position.y}px)`, 
            right: `calc(1.5rem + ${position.x}px)`,
            transition: isDragging ? 'none' : 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="relative">
            {showDismiss && (
                <button onClick={(e) => { e.stopPropagation(); setIsHidden(true); }} className="absolute -top-2 -left-2 z-10 h-6 w-6 bg-destructive text-white rounded-full shadow-lg flex items-center justify-center animate-in zoom-in duration-300"><X className="h-3 w-3" /></button>
            )}
            <Button size="icon" className={cn("h-14 w-14 rounded-full shadow-2xl transition-transform bg-primary text-white border-2 border-white/20 active:scale-90", isDragging && "scale-110 opacity-90 cursor-grabbing", hasUnread && "animate-flip")}>
                <MessageCircle className={cn("h-7 w-7", hasUnread && "animate-pulse")} />
                {hasUnread && <span className="absolute top-2 right-2 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span></span>}
            </Button>
        </div>
      </div>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side={isMobile ? "bottom" : "right"} className={cn("flex w-full flex-col p-0 sm:max-w-lg border-none shadow-3xl overflow-hidden", isMobile ? "h-[85vh] rounded-t-[2.5rem]" : "h-screen")}>
          <SheetHeader className="p-6 border-b text-left bg-muted/20 relative">
            <div className="flex items-center gap-2 absolute top-2 right-12 opacity-30 text-[8px] font-black uppercase tracking-widest"><ShieldCheck className="h-2.5 w-2.5" /> Encrypted Identity Node</div>
            <SheetTitle className="text-2xl font-black uppercase tracking-tight">Private Support</SheetTitle>
            <SheetDescription className="font-bold text-xs opacity-70">Secured line for {user.name || 'Account ID'}</SheetDescription>
          </SheetHeader>

          {showNotificationPrompt && (
            <div className="mx-4 mt-4 flex items-center gap-3 rounded-2xl border border-primary/10 bg-primary/[0.04] p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Bell className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold">Reply notifications</p>
                <p className="text-[10px] text-muted-foreground">Enable alerts when an admin replies.</p>
              </div>
              <GetNotifiedButton
                size="sm"
                variant="outline"
                label="Enable"
                onEnabled={() => setShowNotificationPrompt(false)}
                className="h-8 shrink-0 rounded-lg px-2.5 text-[10px] font-bold"
              />
            </div>
          )}
          
          <ScrollArea className="flex-grow bg-background/50" ref={scrollAreaRef}>
            <div className="p-6 space-y-6">
              {messages?.map((message) => (
                <ChatMessageItem 
                    key={message.id} 
                    message={message} 
                    localPreview={message.clientMessageId === (message as any).clientMessageId ? (message as any).imageUrl : undefined}
                    isUser={message.sender === 'user'}
                    avatarColor={avatarColor}
                    userInitial={(user.name || user.email || 'U').charAt(0).toUpperCase()}
                    onImageClick={setPreviewImage}
                />
              ))}
            </div>
          </ScrollArea>
          
          <div className="p-4 pt-4 pb-8 border-t bg-background shadow-lg">
             {imagePreview && (
                <div className="relative mb-4 w-28 h-28 p-1 border-2 border-primary/20 rounded-2xl overflow-hidden animate-in zoom-in-95">
                    <img src={imagePreview} alt="Preview" className="object-cover w-full h-full rounded-xl" />
                    <Button variant="destructive" size="icon" className="absolute -top-1 -right-1 h-7 w-7 rounded-full" onClick={() => {setImageToSend(null); setImagePreview(null)}}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
             )}
             <div className="flex w-full items-end space-x-2">
                <input type="file" ref={fileInputRef} onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                        setIsProcessingImage(true);
                        try {
                            const compressed = await compressImage(file);
                            setImageToSend(compressed);
                            const reader = new FileReader();
                            reader.onloadend = () => setImagePreview(reader.result as string);
                            reader.readAsDataURL(compressed);
                        } catch (err) {
            reportClientError('src/components/live-chat-widget.tsx:399', err);
                            toast({ variant: 'destructive', title: 'Processing Failed' });
                        } finally {
                            setIsProcessingImage(false);
                        }
                    }
                }} accept="image/*" className="hidden" />
                <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isProcessingImage} className="h-12 w-12 rounded-xl bg-muted/50 hover:bg-primary/10 shrink-0">
                    {isProcessingImage ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                </Button>
                <Textarea
                    ref={textareaRef}
                    placeholder="Encrypted message..."
                    value={input}
                     onChange={(e) => {
                       const value = e.target.value;
                       setInput(value);
                       setInputError(value.length > 1000 ? 'Message cannot exceed 1000 characters.' : '');
                     }}
                    onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                     className={cn("min-h-[48px] max-h-32 rounded-xl bg-muted/20 border-primary/5 transition-[height] duration-150 ease-out", inputError && "border-destructive focus-visible:ring-destructive")}
                    rows={1}
                />
                <Button onClick={handleSendMessage} disabled={(!input.trim() && !imageToSend) || isSending || isProcessingImage} size="icon" className="h-12 w-12 rounded-xl shadow-xl shrink-0">
                    {isSending ? <Loader2 className="h-5 w-5 animate-spin"/> : <Send className="h-5 w-5" />}
                </Button>
             </div>
              {inputError && <p className="mt-2 px-1 text-xs font-semibold text-destructive">{inputError}</p>}
          </div>
        </SheetContent>
      </Sheet>

      {/* Image Preview Modal */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
          <DialogContent className="max-w-4xl w-full h-[85vh] p-0 overflow-hidden border-none shadow-3xl bg-black/95">
              <DialogHeader className="sr-only">
                  <DialogTitle>Image Preview</DialogTitle>
              </DialogHeader>
              <div className="relative w-full h-full flex items-center justify-center p-4">
                  {previewImage && (
                    <img 
                        src={previewImage} 
                        alt="Preview" 
                        className="max-w-full max-h-full object-contain rounded-lg animate-in zoom-in-95 duration-300" 
                    />
                  )}
                  <DialogClose asChild>
                    <Button variant="ghost" size="icon" className="absolute top-4 right-4 h-12 w-12 rounded-full bg-white/10 text-white hover:bg-white/20">
                        <X className="h-6 w-6" />
                    </Button>
                  </DialogClose>
              </div>
          </DialogContent>
      </Dialog>
    </>
  );
}
