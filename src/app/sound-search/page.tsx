'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/auth-provider';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search, Music, Play, Pause, Download, Wand2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { searchSoundEffects, type SearchSoundEffectsOutput } from '@/ai/flows/search-sound-effects';
import { cn } from '@/lib/utils';

const suggestions = ["wind", "walk", "rain", "explosion", "magic", "door creak"];

// Extracting the sound type from the new output schema
type SoundEffect = SearchSoundEffectsOutput['sounds'][0];


function SoundSearchContent() {
    const { toast } = useToast();
    const { user } = useAuth();
    const [query, setQuery] = useState('');
    
    // UI State
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    
    // Data State
    const [searchResults, setSearchResults] = useState<SoundEffect[]>([]);
    const [lastQuery, setLastQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    
    // Player State
    const [playingSoundId, setPlayingSoundId] = useState<number | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [downloadingId, setDownloadingId] = useState<number | null>(null);

    const MAX_QUERY_LENGTH = 20;

    useEffect(() => {
        // Ensure audio element is created on the client side
        if (!audioRef.current) {
            audioRef.current = new Audio();
        }

        const audio = audioRef.current;
        const handleEnded = () => setPlayingSoundId(null);
        audio.addEventListener('ended', handleEnded);

        // Cleanup on unmount
        return () => {
            audio.pause();
            audio.removeEventListener('ended', handleEnded);
        };
    }, []);

    const handleSearch = async (searchQuery: string, page = 1) => {
        if (!searchQuery.trim()) {
            toast({ variant: 'destructive', title: 'Search query is required.' });
            return;
        }
        
        if (searchQuery.length > MAX_QUERY_LENGTH) {
            toast({ variant: 'destructive', title: 'Invalid words', description: `Search must be ${MAX_QUERY_LENGTH} characters or less.` });
            return;
        }

        if (!user || !user.email) {
            toast({ variant: 'destructive', title: 'Please log in to search for sounds.'});
            return;
        }
        
        const isNewSearch = page === 1;
        if (isNewSearch) {
            setIsSearching(true);
            setSearchResults([]);
        } else {
            setIsLoadingMore(true);
        }

        try {
            const results = await searchSoundEffects({ query: searchQuery, userEmail: user.email, page });
            
            if (isNewSearch) {
                setSearchResults(results.sounds);
                if (results.sounds.length === 0) {
                     toast({ title: 'No Results', description: `No copyright-free sounds found for "${searchQuery}".` });
                }
            } else {
                setSearchResults(prev => [...prev, ...results.sounds]);
            }
            
            setHasMore(results.hasMore);
            setCurrentPage(page);
            setLastQuery(searchQuery);

        } catch (error: any) {
            console.error("Sound search failed:", error);
            toast({ variant: 'destructive', title: 'Search Failed', description: error.message || 'Could not fetch sounds.' });
        } finally {
            setIsSearching(false);
            setIsLoadingMore(false);
        }
    };

    const handleLoadMore = () => {
        if (hasMore && !isLoadingMore) {
            handleSearch(lastQuery, currentPage + 1);
        }
    }

    const handleSuggestionClick = (suggestion: string) => {
        setQuery(suggestion);
        handleSearch(suggestion, 1);
    };
    
    const togglePlay = (soundId: number, previewUrl: string) => {
        const audio = audioRef.current;
        if (!audio) return;

        if (playingSoundId === soundId) {
            audio.pause();
            setPlayingSoundId(null);
        } else {
            // Pause before swapping src: assigning a new src while a previous
            // play() promise is still pending is exactly what triggers
            // "The play() request was interrupted by a new load request."
            audio.pause();
            audio.src = previewUrl;
            // play() returns a promise that rejects if interrupted by a
            // subsequent pause()/src change (e.g. rapid clicking between
            // sounds). That's expected here, not an error — catch it so it
            // doesn't surface as an unhandled promise rejection.
            audio.play().catch((err) => {
                if (err?.name !== 'AbortError') {
                    console.error('Sound preview playback failed:', err);
                }
            });
            setPlayingSoundId(soundId);
        }
    };
    
    const handleDownload = async (sound: SoundEffect) => {
        if (!sound.previews['preview-hq-mp3']) {
            toast({ variant: 'destructive', title: 'Download failed', description: 'No download URL available for this sound.'});
            return;
        }
        setDownloadingId(sound.id);
        try {
            // Using a fetch request to get the file as a blob
            const response = await fetch(sound.previews['preview-hq-mp3']);
            if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
            const blob = await response.blob();
            
            // Create a temporary link to trigger the download
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `${sound.name.replace(/[^a-z0-9]/gi, '_') || `sound_${sound.id}`}.mp3`;
            document.body.appendChild(a);
            a.click();
            
            // Clean up the temporary URL and link
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error: any) {
            console.error('Download failed:', error);
            toast({
                variant: 'destructive',
                title: 'Download Failed',
                description: error.message || 'Could not download the sound file.',
            });
        } finally {
            setDownloadingId(null);
        }
    };
    
    const isQueryTooLong = query.length > MAX_QUERY_LENGTH;

    return (
        <div className="container mx-auto max-w-4xl py-10 space-y-8">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <Music className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle className="text-3xl font-bold">Sound Effect Search</CardTitle>
                            <CardDescription>Find copyright-free sound effects for your project (3 to 60 seconds).</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex w-full items-center space-x-2">
                        <Input
                            type="text"
                            placeholder="e.g., wind, door creak, explosion..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && !isSearching && !isQueryTooLong && handleSearch(query, 1)}
                            disabled={isSearching}
                        />
                        <Button onClick={() => handleSearch(query, 1)} disabled={isSearching || !query.trim() || isQueryTooLong}>
                            {isSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                            {isSearching ? 'Searching...' : 'Search'}
                        </Button>
                    </div>
                     <div className="mt-4 flex flex-wrap gap-2">
                        {suggestions.map((suggestion) => (
                            <Badge 
                                key={suggestion}
                                variant="secondary"
                                className="cursor-pointer hover:bg-primary/20"
                                onClick={() => handleSuggestionClick(suggestion)}
                            >
                                {suggestion}
                            </Badge>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {isSearching && (
                 <Card className="animate-in fade-in-50">
                    <CardHeader className="text-center">
                        <CardTitle>Searching for Sounds...</CardTitle>
                        <CardDescription>The AI is listening to the universe for your perfect sound...</CardDescription>
                    </CardHeader>
                    <CardContent className="flex items-center justify-center p-10">
                        <Wand2 className="h-16 w-16 animate-spin-slow text-primary" />
                    </CardContent>
                </Card>
            )}

            {searchResults.length > 0 && (
                 <Card className="animate-in fade-in-50">
                    <CardHeader>
                        <CardTitle>Search Results for &quot;{lastQuery}&quot;</CardTitle>
                        <CardDescription>Showing shortest results first. All sounds are copyright-free (CC0).</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {searchResults.map((sound) => {
                            const minutes = Math.floor(sound.duration / 60);
                            const seconds = Math.floor(sound.duration % 60);
                            const formattedDuration = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

                            return (
                                <Card key={sound.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <Button size="icon" variant="outline" onClick={() => togglePlay(sound.id, sound.previews['preview-hq-mp3'])} disabled={downloadingId !== null}>
                                            {playingSoundId === sound.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                                        </Button>
                                        <div className='min-w-0'>
                                            <p className="font-medium truncate">{sound.name}</p>
                                            <p className="text-xs text-muted-foreground">by {sound.username} • {formattedDuration}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                                        <Button variant="ghost" size="sm" onClick={() => handleDownload(sound)} disabled={downloadingId !== null}>
                                            {downloadingId === sound.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                            <span className="ml-2">Download</span>
                                        </Button>
                                    </div>
                                </Card>
                            )
                        })}
                        {hasMore && (
                            <div className="pt-4 flex justify-center">
                                <Button onClick={handleLoadMore} disabled={isLoadingMore}>
                                    {isLoadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Load More
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

export default function SoundSearchPage() {
    // 🔒 AUTH GUARD: redirect unauthenticated visitors to /login instead of
    // silently rendering the full sound search tool while logged out.
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();

    useEffect(() => {
        if (!authLoading && !user) {
            toast({ variant: 'destructive', title: 'Sign In Required', description: 'Please log in to use Sound Search.' });
            router.push('/login');
        }
    }, [authLoading, user, router, toast]);

    if (authLoading || !user) {
        return (
            <div className="relative w-full min-h-screen bg-background/50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
      <div className="flex flex-col min-h-screen">
        <main className="flex-1 flex flex-col">
            <SoundSearchContent />
        </main>
      </div>
    );
}
