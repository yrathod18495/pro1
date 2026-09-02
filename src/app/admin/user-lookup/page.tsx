
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Search, User, Loader2, Edit, Trash2, CreditCard, Bell, AlertCircle, Calendar } from 'lucide-react';
import { findUserAndDataByEmail, updateUserHistory } from './actions';
import type { UserProfile, CreditHistoryEntry, Notification } from '@/lib/types';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

// Schemas for edit dialog forms
const creditHistoryEditSchema = z.object({
  amount: z.coerce.number(),
  reason: z.string().min(1, 'Reason is required.'),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
});

const notificationEditSchema = z.object({
  message: z.string().min(1, 'Message is required.'),
  timestamp: z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date format" }),
});


export default function UserLookupPage() {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [userData, setUserData] = useState<{ user: UserProfile; creditHistory: CreditHistoryEntry[]; notifications: Notification[] } | null>(null);
    const { toast } = useToast();

    // State for pagination
    const [visibleCreditCount, setVisibleCreditCount] = useState(5);
    const [visibleNotificationCount, setVisibleNotificationCount] = useState(5);

    // State for dialogs
    const [editingItem, setEditingItem] = useState<{ type: 'credit' | 'notification', data: any } | null>(null);
    const [deletingItem, setDeletingItem] = useState<{ type: 'credit' | 'notification', data: any } | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);

    const handleSearch = async () => {
        setIsLoading(true);
        setUserData(null);
        setVisibleCreditCount(5);
        setVisibleNotificationCount(5);
        const result = await findUserAndDataByEmail(email);
        if (result.success && result.data) {
            setUserData(result.data);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setIsLoading(false);
    };

    const handleUpdate = async (type: 'credit' | 'notification', updatedData: any) => {
        if (!userData || !editingItem) return;
        setIsUpdating(true);
        
        let fullHistory;
        if (type === 'credit') {
            fullHistory = [...userData.creditHistory];
        } else {
            fullHistory = [...userData.notifications];
        }

        const originalTimestamp = editingItem.data.timestamp;
        const itemIndex = fullHistory.findIndex(item => item.timestamp === originalTimestamp);

        if (itemIndex > -1) {
            fullHistory[itemIndex] = { ...fullHistory[itemIndex], ...updatedData };
        } else {
            toast({ variant: 'destructive', title: 'Update Failed', description: 'Could not find the original record to update.' });
            setIsUpdating(false);
            return;
        }
        
        const result = await updateUserHistory(userData.user.uid, type, fullHistory);
        if (result.success) {
            setUserData(prev => prev ? { ...prev, [type === 'credit' ? 'creditHistory' : 'notifications']: fullHistory } : null);
            toast({ title: 'Success', description: 'Record updated.' });
            setEditingItem(null);
        } else {
            toast({ variant: 'destructive', title: 'Update Failed', description: result.message });
        }
        setIsUpdating(false);
    };
    
    const handleDelete = async () => {
        if (!userData || !deletingItem) return;
        setIsUpdating(true);

        let fullHistory;
        const itemToRemove = deletingItem.data;
        if (deletingItem.type === 'credit') {
            fullHistory = userData.creditHistory.filter(item => item.timestamp !== itemToRemove.timestamp);
        } else {
            fullHistory = userData.notifications.filter(item => item.timestamp !== itemToRemove.timestamp);
        }
        
        const result = await updateUserHistory(userData.user.uid, deletingItem.type, fullHistory);
        if (result.success) {
            setUserData(prev => prev ? { ...prev, [deletingItem.type === 'credit' ? 'creditHistory' : 'notifications']: fullHistory } : null);
            toast({ title: 'Success', description: 'Record deleted.' });
            setDeletingItem(null);
        } else {
            toast({ variant: 'destructive', title: 'Deletion Failed', description: result.message });
        }
        setIsUpdating(false);
    };

    return (
    <>
        <div className="space-y-8">
            <h1 className="text-3xl font-bold flex items-center gap-3"><Search /> User Lookup</h1>
            <Card>
                <CardHeader>
                    <CardTitle>Find User Data</CardTitle>
                    <CardDescription>Enter a user's email to view and manage their credit history and notifications.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex w-full max-w-sm items-center space-x-2">
                        <Input type="email" placeholder="user@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} />
                        <Button onClick={handleSearch} disabled={isLoading || !email}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Search
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {isLoading && (
                <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-10 w-10 animate-spin" />
                </div>
            )}
            
            {userData && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><User /> {userData.user.name}</CardTitle>
                        <CardDescription>{userData.user.email} - {userData.user.uid}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        <div>
                             <h3 className="text-lg font-semibold flex items-center gap-2 mb-4"><CreditCard /> Credit History</h3>
                             <HistoryTable type="credit" items={userData.creditHistory.slice(0, visibleCreditCount)} onEdit={setEditingItem} onDelete={setDeletingItem} />
                             {visibleCreditCount < userData.creditHistory.length && (
                                <div className="mt-4 flex justify-center">
                                    <Button variant="outline" onClick={() => setVisibleCreditCount(prev => prev + 10)}>Load More</Button>
                                </div>
                             )}
                        </div>
                         <div>
                             <h3 className="text-lg font-semibold flex items-center gap-2 mb-4"><Bell /> Notifications</h3>
                              <HistoryTable type="notification" items={userData.notifications.slice(0, visibleNotificationCount)} onEdit={setEditingItem} onDelete={setDeletingItem} />
                              {visibleNotificationCount < userData.notifications.length && (
                                <div className="mt-4 flex justify-center">
                                    <Button variant="outline" onClick={() => setVisibleNotificationCount(prev => prev + 10)}>Load More</Button>
                                </div>
                              )}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
        {editingItem?.type === 'credit' && <EditCreditDialog item={editingItem} onUpdate={handleUpdate} onOpenChange={() => setEditingItem(null)} isUpdating={isUpdating} />}
        {editingItem?.type === 'notification' && <EditNotificationDialog item={editingItem} onUpdate={handleUpdate} onOpenChange={() => setEditingItem(null)} isUpdating={isUpdating} />}
        <AlertDialog open={!!deletingItem} onOpenChange={() => setDeletingItem(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>This will permanently delete this entry. This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} disabled={isUpdating} className="bg-destructive hover:bg-destructive/90">
                        {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Delete
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </>
    );
}

function HistoryTable({ type, items, onEdit, onDelete }: { type: 'credit' | 'notification', items: any[], onEdit: (item: any) => void, onDelete: (item: any) => void }) {
    if (items.length === 0) {
        return <div className="p-4 border-2 border-dashed rounded-lg text-center text-muted-foreground">No {type === 'credit' ? 'credit history' : 'notifications'} found for this user.</div>;
    }
    
    return (
        <ScrollArea className="w-full rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Details</TableHead>
                        <TableHead className="w-[180px]">Timestamp</TableHead>
                        {type === 'credit' && <TableHead className="w-[100px] text-right">Amount</TableHead>}
                        <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.map((item, index) => (
                        <TableRow key={item.timestamp + index}>
                            <TableCell className="font-medium whitespace-pre-wrap">{type === 'credit' ? item.reason : item.message}</TableCell>
                            <TableCell>{format(new Date(item.timestamp), 'PPpp')}</TableCell>
                            {type === 'credit' && <TableCell className="text-right font-mono">{item.amount.toLocaleString()}</TableCell>}
                            <TableCell className="text-right">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit({ type, data: item })}>
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete({ type, data: item })}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
    );
}

function EditCreditDialog({ item, onUpdate, onOpenChange, isUpdating }: { item: { data: CreditHistoryEntry }, onUpdate: (type: 'credit', data: any) => void, onOpenChange: () => void, isUpdating: boolean }) {
    const form = useForm<z.infer<typeof creditHistoryEditSchema>>({
        resolver: zodResolver(creditHistoryEditSchema),
        defaultValues: {
            amount: item.data.amount,
            reason: item.data.reason,
            timestamp: item.data.timestamp,
        },
    });

    const onSubmit = (values: z.infer<typeof creditHistoryEditSchema>) => {
        onUpdate('credit', values);
    };

    return (
        <Dialog open={true} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Edit Credit History Entry</DialogTitle></DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField control={form.control} name="reason" render={({ field }) => ( <FormItem><FormLabel>Reason</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
                        <FormField control={form.control} name="amount" render={({ field }) => ( <FormItem><FormLabel>Amount</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem> )}/>
                        <FormField control={form.control} name="timestamp" render={({ field }) => ( <FormItem><FormLabel>Timestamp</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={onOpenChange}>Cancel</Button>
                            <Button type="submit" disabled={isUpdating}>{isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} Save</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

function EditNotificationDialog({ item, onUpdate, onOpenChange, isUpdating }: { item: { data: Notification }, onUpdate: (type: 'notification', data: any) => void, onOpenChange: () => void, isUpdating: boolean }) {
    const form = useForm<z.infer<typeof notificationEditSchema>>({
        resolver: zodResolver(notificationEditSchema),
        defaultValues: {
            message: item.data.message,
            timestamp: item.data.timestamp,
        },
    });

    const onSubmit = (values: z.infer<typeof notificationEditSchema>) => {
        onUpdate('notification', values);
    };

    return (
        <Dialog open={true} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader><DialogTitle>Edit Notification</DialogTitle></DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField control={form.control} name="message" render={({ field }) => ( <FormItem><FormLabel>Message</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem> )}/>
                        <FormField control={form.control} name="timestamp" render={({ field }) => ( <FormItem><FormLabel>Timestamp</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem> )}/>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={onOpenChange}>Cancel</Button>
                            <Button type="submit" disabled={isUpdating}>{isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>} Save</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
