import AdmZip from 'adm-zip';
import path from 'node:path';
import type { ChatMessage } from './types';

const START = /^\[?(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?:\s*([APMapm]{2}))?\]?\s[-–]\s([^:]+):\s?(.*)$/;
const START_ALT = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?:\s*([APMapm]{2}))?\s[-–]\s([^:]+):\s?(.*)$/;

function parseDate(d: string, m: string, y: string, h: string, min: string, ampm?: string) {
  let year = Number(y); if (year < 100) year += 2000;
  let hour = Number(h);
  if (ampm) { const ap = ampm.toLowerCase(); if (ap === 'pm' && hour < 12) hour += 12; if (ap === 'am' && hour === 12) hour = 0; }
  const date = new Date(year, Number(m) - 1, Number(d), hour, Number(min));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseLine(line: string) {
  const m = line.match(START) ?? line.match(START_ALT);
  if (!m) return null;
  const [, d, mo, y, h, min, ampm, author, text] = m;
  const date = parseDate(d, mo, y, h, min, ampm);
  return date ? { date, author: author.trim(), text: text ?? '' } : null;
}

export function parseWhatsApp(text: string): Omit<ChatMessage, 'mediaBuffer' | 'mediaName'>[] {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n');
  const out: Omit<ChatMessage, 'mediaBuffer' | 'mediaName'>[] = [];
  let current: Omit<ChatMessage, 'mediaBuffer' | 'mediaName'> | null = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const parsed = parseLine(line);
    if (parsed) {
      current = { ...parsed, mediaType: null };
      out.push(current);
    } else if (current && line) {
      current.text += `\n${line}`;
    }
  }
  return out;
}

type MediaEntry = { name: string; buffer: Buffer; ext: string; dateKey: string | null };

function mediaDateKey(name: string): string | null {
  // Handles common WhatsApp names such as IMG-20250518-WA0001.jpg and STK-20250518-WA0004.webp.
  const m = name.match(/(?:^|[-_])(20\d{2})(\d{2})(\d{2})(?:[-_]|\.)/i);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function messageDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isImage(ext: string) { return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext); }
function isVideo(ext: string) { return ['.mp4', '.3gp', '.mov', '.avi', '.mkv'].includes(ext); }
function isAudio(ext: string) { return ['.opus', '.ogg', '.mp3', '.m4a', '.aac', '.wav', '.amr'].includes(ext); }
function isMediaOmitted(text: string) { return /<media omitted>|media omitted|image omitted|photo omitted|sticker omitted|GIF omitted/i.test(text); }

export function buildExport(buffer: Buffer, fileName: string) {
  const files = new Map<string, Buffer>();
  const media: MediaEntry[] = [];
  let chatText = '';

  if (fileName.toLowerCase().endsWith('.txt')) {
    chatText = buffer.toString('utf8');
  } else if (fileName.toLowerCase().endsWith('.zip')) {
    const zip = new AdmZip(buffer);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || entry.entryName.includes('__MACOSX/')) continue;
      const data = entry.getData();
      const base = path.basename(entry.entryName).toLowerCase();
      if (base.endsWith('.txt') && !chatText && (base.includes('_chat') || base.includes('chat'))) chatText = data.toString('utf8');
      files.set(base, data);

      const ext = path.extname(base);
      if (isImage(ext) || isVideo(ext) || isAudio(ext)) media.push({ name: base, buffer: data, ext, dateKey: mediaDateKey(base) });
    }
    if (!chatText) {
      const txt = zip.getEntries().find(e => !e.isDirectory && e.entryName.toLowerCase().endsWith('.txt') && !e.entryName.includes('__macosx'));
      if (txt) chatText = txt.getData().toString('utf8');
    }
  }

  if (!chatText) throw new Error('No WhatsApp chat .txt export was found in the uploaded file.');

  const parsed = parseWhatsApp(chatText);
  const used = new Set<string>();

  // Sort by the WA sequence number embedded in common WhatsApp filenames so
  // generic <Media omitted> messages can be matched in chronological order.
  media.sort((a, b) => {
    const seq = (name: string) => {
      const m = name.match(/WA(\d+)(?:\.[^.]+)?$/i);
      return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
    };
    return (a.dateKey || '').localeCompare(b.dateKey || '') || seq(a.name) - seq(b.name) || a.name.localeCompare(b.name);
  });

  // Pass 1: exact filenames explicitly written in the chat export.
  for (const msg of parsed) {
    const candidates = msg.text.match(/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif|mp4|3gp|mov|avi|mkv|opus|ogg|mp3|m4a|aac|wav|amr)/ig) ?? [];
    const found = candidates.map(x => path.basename(x).toLowerCase()).find(x => files.has(x));
    if (!found) continue;
    used.add(found);
    const ext = path.extname(found);
    if (isImage(ext)) {
      msg.mediaType = 'image';
      msg.mediaName = found;
      msg.mediaBuffer = files.get(found);
    } else if (isVideo(ext)) {
      msg.mediaType = 'video';
    } else if (isAudio(ext)) {
      msg.mediaType = 'audio';
    }
  }

  // Pass 2: for omitted media, use the same-day media queue.
  // Explicit image/photo/sticker markers prefer images; generic markers use
  // the next unused media file regardless of type.
  const byDate = new Map<string, MediaEntry[]>();
  for (const item of media) {
    if (!item.dateKey || used.has(item.name)) continue;
    const arr = byDate.get(item.dateKey) ?? [];
    arr.push(item);
    byDate.set(item.dateKey, arr);
  }
  const cursor = new Map<string, number>();

  for (const msg of parsed) {
    if (msg.mediaType || !isMediaOmitted(msg.text)) continue;
    const key = messageDateKey(msg.date);
    const pool = byDate.get(key) ?? [];
    let i = cursor.get(key) ?? 0;
    const wantsImage = /image omitted|photo omitted|sticker omitted/i.test(msg.text);
    let item: MediaEntry | undefined;

    if (wantsImage) {
      const idx = pool.findIndex((candidate, n) => n >= i && isImage(candidate.ext) && !used.has(candidate.name));
      if (idx >= 0) { item = pool[idx]; i = idx; }
    } else {
      while (i < pool.length && used.has(pool[i].name)) i += 1;
      item = pool[i];
    }

    if (item) {
      used.add(item.name);
      cursor.set(key, i + 1);
      if (isImage(item.ext)) {
        msg.mediaType = 'image';
        msg.mediaName = item.name;
        msg.mediaBuffer = item.buffer;
      } else if (isVideo(item.ext)) {
        msg.mediaType = 'video';
      } else if (isAudio(item.ext)) {
        msg.mediaType = 'audio';
      }
    } else {
      msg.mediaType = wantsImage ? 'image' : null;
    }
  }

  // Remaining explicit media markers are classified so videos can be skipped cleanly.
  for (const msg of parsed) {
    if (msg.mediaType) continue;
    if (/video|\.mp4|\.3gp|\.mov/i.test(msg.text)) msg.mediaType = 'video';
    else if (/\.(?:opus|ogg|mp3|m4a|aac|wav|amr)\b/i.test(msg.text)) msg.mediaType = 'audio';
    else if (isMediaOmitted(msg.text)) msg.mediaType = 'image';
  }

  return parsed;
}
