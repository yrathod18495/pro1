
'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/context/auth-provider';
import { initializeFirebase } from '@/firebase';
import { ref, onValue, push, update, remove, query, orderByChild, equalTo } from 'firebase/database';
import { onRtdbValue } from '@/lib/rtdb-listener';
import type { LiveChatSession, LiveChatMessage, UserProfile } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageCircle, Send, Bot, Loader2, ArrowLeft, Trash2, Edit, X, ImagePlus, MoreHorizontal, Gem, Check, CheckCheck, SquareCheck, Square, Maximize2 } from 'lucide-react';
import { cn, generateAvatarColor, getDisplayUrl, compressImage } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { deleteChatSession, bulkDeleteChats, deleteSingleChatMessage, uploadChatImageToGCS, sendAdminChatReply } from './actions';
import { useUsersMap } from '@/hooks/use-users-map';
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
import { Dialog, DialogClose } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import Image from 'next/image';
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';

// Helper function to escape HTML characters for safe inclusion in Telegram messages
function escapeHtml(text: string) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function ChatList({ 
    sessions, 
    selectedSessionId, 
    onSelectSession, 
    isLoading, 
    usersMap,
    selectedIds,
    onToggleSelect
}: { 
    sessions: LiveChatSession[], 
    selectedSessionId: string | null, 
    onSelectSession: (session: LiveChatSession) => void, 
    isLoading: boolean, 
    usersMap: Record<string, UserProfile>,
    selectedIds: string[],
    onToggleSelect: (id: string) => void
}) {
    if (isLoading) {
        return (
            <div className="space-y-2 p-2">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-2">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-3 w-32" />
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    if (sessions.length === 0) {
        return <div className="p-4 text-center text-sm text-muted-foreground">No active chats.</div>
    }

    return (
        <ScrollArea className="h-full">
            <div className="p-2 space-y-1">
                {sessions.map(session => {
                    const isPremium = usersMap[session.userId]?.hasMadeFirstPurchase;
                    const isSelected = selectedIds.includes(session.userId);

                    return (
                    <div 
                        key={session.id}
                        className={cn(
                            "group w-full flex items-center gap-2 rounded-lg transition-colors",
                            selectedSessionId === session.id ? 'bg-primary/10' : 'hover:bg-muted'
                        )}
                    >
                        <div className="pl-3 shrink-0">
                            <Checkbox 
                                checked={isSelected}
                                onCheckedChange={() => onToggleSelect(session.userId)}
                                className="h-5 w-5 bg-background"
                            />
                        </div>
                        <button
                            className="flex-grow text-left p-3 pl-1 flex items-center gap-3 overflow-hidden"
                            onClick={() => onSelectSession(session)}
                        >
                            <div className="relative flex-shrink-0">
                                <Avatar className="h-10 w-10 border">
                                    <AvatarFallback className={cn("font-bold", generateAvatarColor(session.userEmail).bg, generateAvatarColor(session.userEmail).text)}>
                                        {session.userName.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                {!session.isReadByAdmin && (
                                    <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                                    </span>
                                )}
                            </div>
                            <div className="flex-grow overflow-hidden">
                                <p className="font-semibold truncate flex items-center gap-1.5">
                                    {session.userName}
                                    {isPremium && (
                                        <Gem className="h-3 w-3 text-primary flex-shrink-0" />
                                    )}
                                </p>
                                <p className={cn(
                                    "text-sm truncate",
                                    !session.isReadByAdmin ? "text-primary font-semibold" : "text-muted-foreground"
                                )}>{session.lastMessage}</p>
                            </div>
                        </button>
                    </div>
                )})}
            </div>
        </ScrollArea>
    )
}

function ChatView({ session, onBack, onSessionDeleted }: { session: LiveChatSession | null, onBack: () => void, onSessionDeleted: () => void }) {
    const { database } = initializeFirebase();
    const { user: adminUser } = useAuth();
    const { toast } = useToast();
    const [messages, setMessages] = useState<LiveChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [messageError, setMessageError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [editingMessage, setEditingMessage] = useState<{id: string, text: string} | null>(null);
    const [imageToSend, setImageToSend] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [viewingImage, setViewingImage] = useState<string | null>(null);

    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (session && database) {
            setIsLoading(true);
            setEditingMessage(null); // Reset editing state when session changes
            const messagesRef = ref(database, `chats/${session.userId}/messages`);
            const q = query(messagesRef, orderByChild('timestamp'));
            const unsubscribe = onRtdbValue(q, (snapshot) => {
                const data = snapshot.val();
                let messageList: LiveChatMessage[] = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
                
                // 🛑 EXPLICIT CHRONOLOGICAL SORT (WhatsApp Style)
                messageList.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                
                setMessages(messageList);
                setIsLoading(false);
            });
            return () => unsubscribe();
        } else {
            setMessages([]);
        }
    }, [session, database]);

    // HARDENED AUTO-SCROLL LOGIC
    useEffect(() => {
        if (!scrollAreaRef.current || messages.length === 0) return;
        const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
            setTimeout(() => {
                viewport.scrollTo({
                    top: viewport.scrollHeight,
                    behavior: 'smooth'
                });
            }, 100);
        }
    }, [messages]);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            const scrollHeight = textarea.scrollHeight;
            const maxHeight = 128; // max-h-32 in pixels for default text size
            textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
            textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
        }
    }, [newMessage]);
    
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
          setIsUploading(true);
          try {
            // 🚀 NEURAL COMPRESSION NODE
            const compressed = await compressImage(file);
            setImageToSend(compressed);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(compressed);
            toast({ title: 'Image Optimized' });
          } catch (err) {
            console.error("Compression failed:", err);
            toast({ variant: 'destructive', title: 'Processing Failed', description: 'Could not prepare image for upload.' });
          } finally {
            setIsUploading(false);
          }
        }
    };
    
    const resetInput = () => {
        setNewMessage('');
        setImageToSend(null);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    const handleSendMessage = async () => {
        if ((!newMessage.trim() && !imageToSend) || !session || !adminUser?.email || isSending) return;
        if (newMessage.length > 1000) {
            setMessageError('Message cannot exceed 1000 characters.');
            return;
        }

        setIsSending(true);
        const adminReplyText = newMessage;
        let imageUrl: string | undefined;

        try {
            if (imageToSend && imagePreview) {
                setIsUploading(true);
                // Use Private GCS Node for Admin uploads too
                const uploadRes = await uploadChatImageToGCS(session.userId, imagePreview);
                if (uploadRes.success && uploadRes.url) {
                    imageUrl = uploadRes.url;
                } else throw new Error(uploadRes.error || "GCS node rejection.");
                setIsUploading(false);
            }

            resetInput();
            setMessageError('');
            
            // Server Action: writes the reply to RTDB and sends an optional push.
            const result = await sendAdminChatReply(session.userId, session.userEmail, {
                text: adminReplyText.trim() || undefined,
                imageUrl
            });

            if (!result.success) {
                throw new Error(result.message || 'Failed to send message.');
            }

            if (result.pushSent) {
                toast({ title: 'Reply Sent', description: 'Push notification delivered to user device.' });
            } else {
                toast({ title: 'Reply Sent' });
            }

        } catch (error: any) {
            console.error("Failed to send message", error);
            setNewMessage(adminReplyText); 
            toast({
                variant: 'destructive',
                title: 'Message Not Sent',
                description: error.message || 'Could not send your message. Please try again.'
            });
        } finally {
            setIsSending(false);
            setIsUploading(false);
        }
    };
    
    const handleSaveEdit = async () => {
        if (!editingMessage || !session || !database) return;
        
        setIsSending(true);
        try {
            const messageRef = ref(database, `chats/${session.userId}/messages/${editingMessage.id}`);
            await update(messageRef, { text: editingMessage.text, isEdited: true });
            setEditingMessage(null);
        } catch (error) {
            console.error("Failed to edit message:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not save message changes.' });
        } finally {
            setIsSending(false);
        }
    };

    const handleDeleteMessage = async (messageId: string) => {
        if (!session || !database) return;
        try {
            const messageRef = ref(database, `chats/${session.userId}/messages/${messageId}`);
            await remove(messageRef);
            toast({ title: 'Message Deleted' });
        } catch (error) {
            console.error("Failed to delete message:", error);
            const result = await deleteSingleChatMessage(session.userId, messageId);
            if (result.success) {
                toast({ title: 'Message Deleted' });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        }
    };

    const handleDeleteSession = async () => {
        if (!session) return;
        setIsDeleting(true);
        const result = await deleteChatSession(session.userId, session.userEmail);
        if (result.success) {
            toast({ title: 'Chat Deleted', description: result.message });
            onSessionDeleted();
        } else {
            toast({ variant: 'destructive', title: 'Deletion Failed', description: result.message });
        }
        setIsDeleting(false);
    };

    if (!session) {
        return (
            <div className="hidden md:flex flex-col h-full items-center justify-center bg-muted/30 rounded-lg">
                <MessageCircle className="h-16 w-16 text-muted-foreground/50" />
                <p className="mt-4 text-muted-foreground">Select a chat to view messages</p>
            </div>
        )
    }

    return (
        <>
        <div className="flex flex-col h-full bg-background/50">
            <div className="p-4 border-b flex items-center gap-3 justify-between bg-white dark:bg-card z-10 shadow-sm">
                 <div className="flex items-center gap-3 flex-grow min-w-0">
                    <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <Avatar className="h-10 w-10 border flex-shrink-0">
                        <AvatarFallback className={cn("font-bold", generateAvatarColor(session.userEmail).bg, generateAvatarColor(session.userEmail).text)}>
                            {session.userName.charAt(0).toUpperCase()}
                            </AvatarFallback>
                    </Avatar>
                    <div className="flex-grow min-w-0">
                        <p className="font-semibold truncate">{session.userName}</p>
                        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest truncate">{session.userEmail}</p>
                    </div>
                </div>
                <div className="flex-shrink-0">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" className="rounded-xl h-10 w-10">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-[2rem]">
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will permanently delete the entire chat history for <span className="font-bold">{session.userName}</span>. This action cannot be undone.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel className="rounded-xl font-bold">Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteSession} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90 rounded-xl font-black">
                                    {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Confirm Delete
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>
            <ScrollArea className="flex-grow" ref={scrollAreaRef}>
                 <div className="p-6 space-y-6">
                     {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-30">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Syncing Nodes...</p>
                        </div>
                     ) : (
                        messages?.map(message => {
                            const isEditingThis = editingMessage?.id === message.id;
                            const avatarColor = generateAvatarColor(session.userEmail);
                            return (
                            <div key={message.id} className={cn("flex items-end gap-3 group/message animate-in fade-in slide-in-from-bottom-1 duration-300", message.sender === 'admin' ? 'justify-end' : 'justify-start')}>
                                {message.sender === 'user' && (
                                    <Avatar className="h-8 w-8 border shadow-sm flex-shrink-0">
                                        <AvatarFallback className={cn("font-black text-xs", avatarColor.bg, avatarColor.text)}>{session.userName.charAt(0).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                )}
                                
                                {!isEditingThis && (
                                     <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover/message:opacity-100 transition-opacity flex-shrink-0">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align={message.sender === 'admin' ? 'end' : 'start'} className="rounded-xl shadow-xl p-1.5 border border-border bg-popover z-50">
                                            {message.sender === 'admin' && message.text && (
                                                <DropdownMenuItem className="h-9 rounded-lg cursor-pointer font-bold text-xs" onClick={() => setEditingMessage({id: message.id, text: message.text || ''})}>
                                                    <Edit className="mr-2 h-3.5 w-3.5 text-primary" /> Edit Message
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuItem className="h-9 rounded-lg cursor-pointer font-bold text-xs text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => handleDeleteMessage(message.id)}>
                                                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Message
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}

                                <div className={cn('rounded-2xl px-4 py-2.5 max-w-[80%] shadow-sm', message.sender === 'admin' ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-white dark:bg-card border-primary/5 rounded-bl-none' )}>
                                    {isEditingThis ? (
                                        <div className="space-y-4 w-64">
                                            <Textarea value={editingMessage.text} onChange={(e) => setEditingMessage({...editingMessage, text: e.target.value})} className="bg-background text-foreground text-sm rounded-xl" />
                                            <div className="flex justify-end gap-2">
                                                <Button size="sm" variant="ghost" onClick={() => setEditingMessage(null)}>Cancel</Button>
                                                <Button size="sm" onClick={handleSaveEdit} disabled={isSending}>{isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save</Button>
                                            </div>
                                        </div>
                                    ) : (
                                    <>
                                        {message.imageUrl && (
                                            <div 
                                                onClick={() => setViewingImage(getDisplayUrl(message.imageUrl!))} 
                                                className="block w-full mb-2 rounded-xl overflow-hidden cursor-zoom-in relative group"
                                            >
                                                <img 
                                                    src={getDisplayUrl(message.imageUrl)} 
                                                    alt="Chat node" 
                                                    className="w-full h-auto object-cover max-h-60 transition-transform duration-500 group-hover:scale-105" 
                                                />
                                                <div className="absolute top-2 right-2 p-1.5 bg-black/20 backdrop-blur-md rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Maximize2 className="h-3 w-3 text-white" />
                                                </div>
                                            </div>
                                        )}
                                        {message.text && (
                                            <p className="text-sm font-medium whitespace-pre-wrap break-words leading-relaxed">{message.text}</p>
                                        )}
                                        <div className={cn("text-right text-[9px] font-black uppercase tracking-widest mt-1.5 flex items-center justify-end gap-2", message.sender === 'admin' ? 'text-primary-foreground/70' : 'text-muted-foreground/60' )}>
                                            {message.isEdited && <span>(SYNCED) </span>}
                                            {format(new Date(message.timestamp), 'p')}
                                            {message.sender === 'admin' && (
                                                <span className="inline-flex align-middle">
                                                    {message.seen ? (
                                                        <CheckCheck className="h-3.5 w-3.5 text-white" />
                                                    ) : (
                                                        <Check className="h-3.5 w-3.5" />
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                    </>
                                    )}
                                </div>
                                 {message.sender === 'admin' && (
                                    <Avatar className="h-8 w-8 border-2 border-primary shadow-md">
                                        <AvatarImage src="https://res.cloudinary.com/dptryoeis/image/upload/v1771298434/xbejozbxaqwgweq0ym6w.png" alt="12Labs Admin" />
                                        <AvatarFallback><Bot className="h-5 w-5"/></AvatarFallback>
                                    </Avatar>
                                )}
                            </div>
                        )})
                     )}
                </div>
            </ScrollArea>
            <div className="px-6 pt-4 pb-8 border-t bg-white dark:bg-card shadow-2xl z-10">
                 {imagePreview && (
                    <div className="relative mb-3 w-28 h-28 p-1 border-2 border-primary/20 rounded-2xl overflow-hidden animate-in zoom-in-95">
                        <img src={imagePreview} alt="Admin preview" className="object-cover w-full h-full rounded-xl" />
                        <Button variant="destructive" size="icon" className="absolute -top-1 -right-1 h-7 w-7 rounded-full shadow-lg" onClick={() => {setImageToSend(null); setImagePreview(null)}}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                 )}
                 <div className="flex w-full items-end space-x-2">
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                     <Button variant="ghost" size="icon" className="h-12 w-12 rounded-xl hover:bg-primary/10 shrink-0" onClick={() => fileInputRef.current?.click()} disabled={isSending}>
                        {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5 text-primary" />}
                    </Button>
                    <Textarea
                        ref={textareaRef}
                        placeholder="Type encrypted reply..."
                        value={newMessage}
                         onChange={(e) => {
                            const value = e.target.value;
                            setNewMessage(value);
                            setMessageError(value.length > 1000 ? 'Message cannot exceed 1000 characters.' : '');
                         }}
                        onKeyPress={(e) => {
                           if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                           }
                        }}
                        disabled={isSending}
                         className={cn("min-h-[48px] max-h-32 rounded-xl bg-muted/20 border-primary/5 focus-visible:ring-primary shadow-inner transition-[height] duration-150 ease-out", messageError && "border-destructive focus-visible:ring-destructive")}
                        rows={1}
                    />
                    <Button onClick={handleSendMessage} disabled={(!newMessage.trim() && !imageToSend) || isSending || isUploading} className="h-12 px-6 rounded-xl shadow-xl shadow-primary/20 btn-shine shrink-0">
                        {isSending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                    </Button>
                </div>
                 {messageError && <p className="mt-2 px-1 text-xs font-semibold text-destructive">{messageError}</p>}
            </div>
        </div>

        {/* Fullscreen Image Preview */}
        <Dialog open={!!viewingImage} onOpenChange={() => setViewingImage(null)}>
            <DialogContent className="max-w-5xl w-full h-[85vh] p-0 overflow-hidden border-none shadow-3xl bg-black/95">
                <DialogHeader className="sr-only">
                    <DialogTitle>Image Preview</DialogTitle>
                </DialogHeader>
                <div className="relative w-full h-full flex items-center justify-center p-4">
                    {viewingImage && (
                        <img 
                            src={viewingImage} 
                            alt="Node details" 
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

export default function AdminChatPage() {
    const { database } = initializeFirebase();
    const { toast } = useToast();
    const [selectedSession, setSelectedSession] = useState<LiveChatSession | null>(null);
    const [sessions, setSessions] = useState<LiveChatSession[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [view, setView] = useState<'unread' | 'premium' | 'all'>('unread');
    
    // Selection state
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);

    const userIds = useMemo(() => sessions.map(s => s.userId), [sessions]);
    const { usersMap, isLoading: usersLoading } = useUsersMap(userIds);

    useEffect(() => {
        if (database) {
            setIsLoading(true);
            const sessionsRef = ref(database, 'chats');
            let sessionsQuery;

            if (view === 'unread') {
                sessionsQuery = query(sessionsRef, orderByChild('isReadByAdmin'), equalTo(false));
            } else {
                // For 'all' and 'premium', we fetch all and filter client-side for now
                sessionsQuery = query(sessionsRef, orderByChild('lastMessageTimestamp'));
            }

            const unsubscribe = onRtdbValue(sessionsQuery, (snapshot) => {
                const sessionList: LiveChatSession[] = [];
                snapshot.forEach((childSnapshot) => {
                    sessionList.push({ id: childSnapshot.key!, userId: childSnapshot.key!, ...childSnapshot.val() });
                });

                // Client-side sort to ensure descending order by timestamp for all views
                sessionList.sort((a, b) => new Date(b.lastMessageTimestamp).getTime() - new Date(a.lastMessageTimestamp).getTime());
                
                setSessions(sessionList);
                setIsLoading(false);
            });

            return () => unsubscribe();
        }
    }, [database, view]);

    const filteredSessions = useMemo(() => {
        if (view === 'premium') {
            return sessions.filter(session => usersMap[session.userId]?.hasMadeFirstPurchase);
        }
        return sessions;
    }, [sessions, view, usersMap]);


    const handleSelectSession = (session: LiveChatSession) => {
        setSelectedSession(session);
        if (!session.isReadByAdmin && database) {
            const sessionRef = ref(database, `chats/${session.userId}`);
            update(sessionRef, { isReadByAdmin: true });
        }
    };

    const handleToggleSelect = (userId: string) => {
        setSelectedUserIds(prev => 
            prev.includes(userId) 
                ? prev.filter(id => id !== userId) 
                : [...prev, userId]
        );
    };

    const handleSelectAll = () => {
        if (selectedUserIds.length === filteredSessions.length) {
            setSelectedUserIds([]);
        } else {
            setSelectedUserIds(filteredSessions.map(s => s.userId));
        }
    };

    const handleBulkDelete = async () => {
        if (selectedUserIds.length === 0) return;
        setIsBulkDeleting(true);
        const result = await bulkDeleteChats(selectedUserIds);
        if (result.success) {
            toast({ title: 'Success', description: result.message });
            setSelectedUserIds([]);
            if (selectedSession && selectedUserIds.includes(selectedSession.userId)) {
                setSelectedSession(null);
            }
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setIsBulkDeleting(false);
    };

    const handleBack = () => {
        setSelectedSession(null);
    };

    const handleSessionDeleted = () => {
        setSelectedSession(null);
    };
  
  return (
    <div className="h-[calc(100vh-10rem)] md:h-[calc(100vh-8rem)]">
      <Card className="h-full w-full flex overflow-hidden rounded-[2.5rem] border-none shadow-3xl bg-background/30 backdrop-blur-sm">
        <div className={cn(
          "h-full flex flex-col border-r md:flex md:w-1/3 bg-white dark:bg-card/50",
          selectedSession ? 'hidden' : 'w-full flex'
        )}>
            <div className="p-6 border-b space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-black uppercase tracking-tight">Conversations</h2>
                    {selectedUserIds.length > 0 && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm" className="h-8 font-black uppercase text-[10px] tracking-widest gap-2 rounded-xl">
                                    <Trash2 className="h-3.5 w-3.5" /> Delete ({selectedUserIds.length})
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="rounded-[2.5rem]">
                                <AlertDialogHeader>
                                    <AlertDialogTitle className="text-xl font-black uppercase">Bulk Delete Chats?</AlertDialogTitle>
                                    <AlertDialogDescription className="text-sm font-medium">
                                        Are you sure you want to delete <b>{selectedUserIds.length}</b> chat conversations? This action cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel className="rounded-xl font-bold">Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleBulkDelete} disabled={isBulkDeleting} className="bg-destructive hover:bg-destructive/90 rounded-xl font-black px-8">
                                        {isBulkDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Confirm Bulk Delete
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>
                
                <div className="flex items-center gap-2">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 text-[9px] font-black uppercase tracking-widest rounded-lg border-primary/10"
                        onClick={handleSelectAll}
                    >
                        {selectedUserIds.length === filteredSessions.length && filteredSessions.length > 0 ? (
                            <><SquareCheck className="mr-1.5 h-3.5 w-3.5 text-primary" /> Deselect All</>
                        ) : (
                            <><Square className="mr-1.5 h-3.5 w-3.5" /> Select All</>
                        )}
                    </Button>
                </div>

                <Tabs value={view} onValueChange={(v) => setView(v as 'unread' | 'premium' | 'all')} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 bg-muted/50 rounded-xl h-10 p-1">
                        <TabsTrigger value="unread" className="text-[9px] font-black uppercase rounded-lg">Unread</TabsTrigger>
                        <TabsTrigger value="premium" className="text-[9px] font-black uppercase rounded-lg">Premium</TabsTrigger>
                        <TabsTrigger value="all" className="text-[9px] font-black uppercase rounded-lg">All</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>
            <ChatList 
                sessions={filteredSessions} 
                selectedSessionId={selectedSession?.id || null} 
                onSelectSession={handleSelectSession} 
                isLoading={isLoading || usersLoading}
                usersMap={usersMap}
                selectedIds={selectedUserIds}
                onToggleSelect={handleToggleSelect}
            />
        </div>
        <div className={cn(
          'h-full',
          selectedSession ? 'w-full flex flex-col md:w-2/3' : 'hidden md:flex md:w-2/3'
        )}>
            <ChatView session={selectedSession} onBack={handleBack} onSessionDeleted={handleSessionDeleted} />
        </div>
      </Card>
    </div>
  );
}
