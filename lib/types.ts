export type Theme = 'sunset' | 'cream' | 'midnight' | 'rose';
export type MediaType = 'image' | 'video' | 'audio' | null;
export type ChatMessage = { date: Date; author: string; text: string; mediaType: MediaType; mediaBuffer?: Buffer; mediaName?: string };
export type BookOptions = { firstName: string; secondName: string; title: string; subtitle: string; quote: string; theme: Theme; includeIndex: boolean };
