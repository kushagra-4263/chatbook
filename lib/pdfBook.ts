import PDFDocument from 'pdfkit';
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ChatMessage, BookOptions, Theme } from './types';

const W = 595.28;
const H = 841.89;
const M = 54;
const TOP = 64;
const BOTTOM = 56;
const CONTENT = W - M * 2;
const BUBBLE_MAX = CONTENT * 0.72;

const colors: Record<Theme, { bg: string; ink: string; muted: string; accent: string; bubble: string; bubble2: string; line: string }> = {
  sunset: { bg: '#fbf7f3', ink: '#28242a', muted: '#887a79', accent: '#9d625a', bubble: '#f1e3dd', bubble2: '#eee9e6', line: '#dfd2cd' },
  cream: { bg: '#fcfaf4', ink: '#30291f', muted: '#8c806d', accent: '#9b7740', bubble: '#efe6d3', bubble2: '#e9ece7', line: '#ded7c9' },
  midnight: { bg: '#171721', ink: '#f5f0e9', muted: '#aaa3a2', accent: '#d89a7e', bubble: '#292938', bubble2: '#22222e', line: '#393846' },
  rose: { bg: '#fff8f8', ink: '#30252b', muted: '#8f777d', accent: '#ad6377', bubble: '#f3e0e6', bubble2: '#eee9eb', line: '#e6d5db' },
};

type Palette = (typeof colors)[Theme];

function safe(value: string, max = 2000) {
  return (value || '').replace(/\u0000/g, '').slice(0, max);
}

function monthLabel(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function dateLabel(date: Date) {
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

function timeLabel(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fontPath(name: string) {
  return path.join(process.cwd(), 'public', 'fonts', name);
}

function registerFonts(doc: PDFKit.PDFDocument) {
  doc.registerFont('BookSans', fontPath('DejaVuSans.ttf'));
  doc.registerFont('BookSansBold', fontPath('DejaVuSans-Bold.ttf'));
  doc.registerFont('BookSansItalic', fontPath('DejaVuSans-Oblique.ttf'));
  doc.registerFont('BookSerif', fontPath('DejaVuSerif.ttf'));
  doc.registerFont('BookSerifBold', fontPath('DejaVuSerif-Bold.ttf'));
  doc.registerFont('BookSerifItalic', fontPath('DejaVuSerif-Italic.ttf'));
  // Keep the legacy emoji font registered for fallback text glyphs. Modern/complex
  // emoji are rasterized from the bundled Noto Color Emoji font below.
  doc.registerFont('BookEmoji', fontPath('NotoEmoji-Regular.ttf'));
}

let pageNo = 0;

function paintPage(doc: PDFKit.PDFDocument, c: Palette, section?: string) {
  doc.addPage({ size: 'A4', margin: 0 });
  pageNo += 1;
  doc.rect(0, 0, W, H).fill(c.bg);

  if (section) {
    doc.font('BookSansBold').fontSize(7.5).fillColor(c.accent)
      .text(section.toUpperCase(), M, 27, { characterSpacing: 1.6, lineBreak: false });
  }

  doc.font('BookSans').fontSize(7.5).fillColor(c.muted)
    .text('CHATBOOK', M, H - 31, { lineBreak: false, characterSpacing: 1.1 });
  doc.text(String(pageNo).padStart(2, '0'), W - M - 30, H - 31, { width: 30, align: 'right', lineBreak: false });
  doc.y = TOP;
}

function cover(doc: PDFKit.PDFDocument, o: BookOptions, c: Palette) {
  paintPage(doc, c);
  doc.rect(0, 0, W, H).fill(c.accent);

  doc.font('BookSansBold').fontSize(8.5).fillColor('#ffffff')
    .text('A CONVERSATION PRESERVED', M, 67, { characterSpacing: 2.2 });

  doc.font('BookSerif').fontSize(41).fillColor('#ffffff')
    .text(safe(o.title, 150), M, 210, { width: CONTENT, lineGap: 6 });

  doc.font('BookSerifItalic').fontSize(15.5).fillColor('#ffffff')
    .text(safe(o.subtitle, 350), M, 350, { width: CONTENT, lineGap: 5 });

  doc.moveTo(M, 470).lineTo(M + 70, 470).strokeColor('#ffffff').lineWidth(0.8).stroke();

  doc.font('BookSerif').fontSize(14).fillColor('#ffffff')
    .text(`${safe(o.firstName, 80)}   ×   ${safe(o.secondName, 80)}`, M, 492);

  doc.font('BookSans').fontSize(8).fillColor('#ffffff')
    .text('A keepsake edition', M, H - 70, { characterSpacing: 1.2 });

  doc.font('BookSerif').fontSize(22).fillColor('#ffffff')
    .text('♡', W - M - 25, H - 106);
}

function dedication(doc: PDFKit.PDFDocument, o: BookOptions, c: Palette) {
  paintPage(doc, c, '02 / Dedication');
  doc.font('BookSerif').fontSize(34).fillColor(c.ink).text('For us.', M, 235);
  doc.font('BookSerifItalic').fontSize(18).fillColor(c.muted)
    .text(safe(o.quote, 900), M, 305, { width: CONTENT, lineGap: 7 });
  doc.moveTo(M, 455).lineTo(M + 78, 455).strokeColor(c.accent).lineWidth(1).stroke();
  doc.font('BookSans').fontSize(9).fillColor(c.muted)
    .text(`${safe(o.firstName, 80)} & ${safe(o.secondName, 80)}`, M, 476);
}

function isFutureOutlier(date: Date) {
  // Device clocks occasionally create accidental future-dated WhatsApp lines.
  // Keep those messages in the book, but don't let a bogus 2027/2028 timestamp
  // create fake months in the contents page when the export itself is from the
  // current timeline. A small tolerance avoids timezone-edge surprises.
  const now = new Date();
  now.setDate(now.getDate() + 1);
  return date.getTime() > now.getTime();
}

function indexPage(doc: PDFKit.PDFDocument, msgs: ChatMessage[], c: Palette) {
  paintPage(doc, c, '03 / Contents');
  doc.font('BookSerif').fontSize(30).fillColor(c.ink).text('The months we kept.', M, 91);
  doc.font('BookSans').fontSize(8.5).fillColor(c.muted)
    .text('A quiet map of the conversations inside.', M, 132);

  const monthMap = new Map<string, { messages: number; images: number }>();
  for (const msg of msgs) {
    if (isFutureOutlier(msg.date)) continue;
    const month = monthLabel(msg.date);
    const item = monthMap.get(month) || { messages: 0, images: 0 };
    item.messages += 1;
    if (msg.mediaType === 'image') item.images += 1;
    monthMap.set(month, item);
  }

  let y = 188;
  let number = 1;
  for (const [month, data] of monthMap) {
    if (y > H - 100) {
      paintPage(doc, c, '03 / Contents');
      y = TOP + 10;
    }

    doc.font('BookSans').fontSize(8.5).fillColor(c.muted)
      .text(String(number).padStart(2, '0'), M, y + 3);
    doc.font('BookSerif').fontSize(17).fillColor(c.ink)
      .text(month, M + 34, y);

    const detail = `${data.messages.toLocaleString()} messages${data.images ? `  ·  ${data.images.toLocaleString()} images` : ''}`;
    doc.font('BookSans').fontSize(8).fillColor(c.muted)
      .text(detail, M + 290, y + 4, { width: CONTENT - 290, align: 'right' });

    doc.moveTo(M, y + 31).lineTo(W - M, y + 31).strokeColor(c.line).lineWidth(0.55).stroke();
    y += 52;
    number += 1;
  }
}

function cleanMessage(text: string) {
  return safe(text, 2400)
    .replace(/<attached:[^>]*>/gi, '')
    .replace(/\(file attached\)/gi, '')
    .replace(/\[media omitted\]/gi, '')
    .trim();
}

function isEmojiCluster(s: string) {
  return /\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}|\u20e3/u.test(s);
}

function graphemes(text: string): string[] {
  const Segmenter = (Intl as any).Segmenter;
  if (Segmenter) return [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((x: any) => x.segment);
  return Array.from(text);
}

const EMOJI_SIZE = 64;
const EMOJI_CELL = 72;
const EMOJI_COLS = 24;

const execFileAsync = promisify(execFile);

let emojiFontBase64 = '';
function emojiFontData() {
  if (!emojiFontBase64) {
    emojiFontBase64 = fs.readFileSync(fontPath('NotoColorEmoji.ttf')).toString('base64');
  }
  return emojiFontBase64;
}

function collectEmojiClusters(messages: ChatMessage[]) {
  const set = new Set<string>();
  for (const msg of messages) {
    for (const cluster of graphemes(cleanMessage(msg.text))) {
      if (isEmojiCluster(cluster)) set.add(cluster);
    }
  }
  return [...set];
}

function browserCandidates() {
  const env = [process.env.CHATBOOK_CHROME_PATH, process.env.GOOGLE_CHROME_BIN].filter(Boolean) as string[];
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || '';
    const program = process.env.PROGRAMFILES || '';
    const program86 = process.env['PROGRAMFILES(X86)'] || '';
    return [
      ...env,
      path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(program, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(program86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(program, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(program86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];
  }
  if (process.platform === 'darwin') {
    return [...env, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'];
  }
  return [...env, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];
}

function findBrowser() {
  return browserCandidates().find((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  }) || null;
}

async function buildColorEmojiAtlas(clusters: string[]) {
  const browser = findBrowser();
  if (!browser || !clusters.length) return null;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatbook-emoji-'));
  const htmlPath = path.join(dir, 'emoji.html');
  const pngPath = path.join(dir, 'emoji.png');
  const esc = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const cells = clusters.map((cluster, i) => `<div class="cell" data-i="${i}">${esc(cluster)}</div>`).join('');
  const width = EMOJI_COLS * EMOJI_CELL;
  const rows = Math.ceil(clusters.length / EMOJI_COLS);
  const height = rows * EMOJI_CELL;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;padding:0;background:transparent;overflow:hidden}
    .grid{display:grid;grid-template-columns:repeat(${EMOJI_COLS},${EMOJI_CELL}px);width:${width}px;height:${height}px}
    .cell{width:${EMOJI_CELL}px;height:${EMOJI_CELL}px;display:flex;align-items:center;justify-content:center;
      font-family:"Noto Color Emoji","Segoe UI Emoji","Apple Color Emoji",sans-serif;font-size:48px;line-height:1}
  </style></head><body><div class="grid">${cells}</div></body></html>`;
  fs.writeFileSync(htmlPath, html, 'utf8');

  try {
    await execFileAsync(browser, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--default-background-color=00000000',
      `--window-size=${width},${height}`,
      `--screenshot=${pngPath}`,
      `file://${htmlPath.replace(/\\/g, '/')}`,
    ], { windowsHide: true, timeout: 30000 });

    if (!fs.existsSync(pngPath)) return null;
    const rendered = await sharp(pngPath).png().toBuffer();
    const images = new Map<string, Buffer>();
    for (let i = 0; i < clusters.length; i++) {
      const col = i % EMOJI_COLS;
      const row = Math.floor(i / EMOJI_COLS);
      const crop = await sharp(rendered)
        .extract({ left: col * EMOJI_CELL, top: row * EMOJI_CELL, width: EMOJI_CELL, height: EMOJI_CELL })
        .png()
        .toBuffer();
      images.set(clusters[i], crop);
    }
    return images;
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function buildEmojiAtlas(messages: ChatMessage[]) {
  const clusters = collectEmojiClusters(messages);
  const images = new Map<string, Buffer>();
  if (!clusters.length) return images;

  // Use a real browser first. Browser emoji rendering is color-aware and handles
  // variation selectors, skin tones, flags, and ZWJ sequences correctly.
  const browserAtlas = await buildColorEmojiAtlas(clusters);
  if (browserAtlas) return browserAtlas;

  // Fallback for environments without Chrome/Edge. This still renders the glyphs,
  // but some platforms may provide monochrome output for Noto Color Emoji.
  const rows = Math.ceil(clusters.length / EMOJI_COLS);
  const width = EMOJI_COLS * EMOJI_CELL;
  const height = rows * EMOJI_CELL;
  const font = emojiFontData();
  const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const texts = clusters.map((cluster, i) => {
    const col = i % EMOJI_COLS;
    const row = Math.floor(i / EMOJI_COLS);
    const x = col * EMOJI_CELL + EMOJI_CELL / 2;
    const y = row * EMOJI_CELL + EMOJI_SIZE * 0.78;
    return `<text x="${x}" y="${y}" text-anchor="middle" font-family="EmojiAtlas" font-size="${EMOJI_SIZE}px">${esc(cluster)}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <style>@font-face{font-family:EmojiAtlas;src:url(data:font/ttf;base64,${font})} text{font-family:EmojiAtlas}</style>${texts}</svg>`;
  const rendered = await sharp(Buffer.from(svg)).png().toBuffer();
  for (let i = 0; i < clusters.length; i++) {
    const col = i % EMOJI_COLS;
    const row = Math.floor(i / EMOJI_COLS);
    const crop = await sharp(rendered)
      .extract({ left: col * EMOJI_CELL, top: row * EMOJI_CELL, width: EMOJI_CELL, height: EMOJI_CELL })
      .png()
      .toBuffer();
    images.set(clusters[i], crop);
  }
  return images;
}

type RichToken = { text: string; emoji: boolean };
function richLines(doc: PDFKit.PDFDocument, text: string, width: number): RichToken[][] {
  const lines: RichToken[][] = [];
  let line: RichToken[] = [];
  let lineWidth = 0;
  const addLine = () => { lines.push(line); line = []; lineWidth = 0; };
  for (const cluster of graphemes(text)) {
    if (cluster === '\n') { addLine(); continue; }
    const emoji = isEmojiCluster(cluster);
    const w = emoji ? 10.5 : doc.font('BookSans').fontSize(9.15).widthOfString(cluster);
    if (line.length && lineWidth + w > width) addLine();
    line.push({ text: cluster, emoji });
    lineWidth += w;
  }
  if (line.length || !lines.length) addLine();
  return lines;
}

function drawRichText(doc: PDFKit.PDFDocument, text: string, x: number, y: number, width: number, color: string, emojiImages: Map<string, Buffer>) {
  const lines = richLines(doc, text, width);
  for (const line of lines) {
    let cx = x;
    for (const token of line) {
      if (token.emoji) {
        const image = emojiImages.get(token.text);
        if (image) {
          doc.image(image, cx, y - 1.2, { width: 10.5, height: 10.5 });
        } else {
          // Fallback to the legacy monochrome font if an atlas glyph failed.
          doc.font('BookEmoji').fontSize(9.15).fillColor(color).text(token.text, cx, y, { lineBreak: false });
        }
        cx += 10.5;
      } else {
        doc.font('BookSans').fontSize(9.15).fillColor(color).text(token.text, cx, y, { lineBreak: false });
        cx += doc.font('BookSans').fontSize(9.15).widthOfString(token.text);
      }
    }
    y += 12.4;
  }
  return lines.length * 12.4;
}

function richTextHeight(doc: PDFKit.PDFDocument, text: string, width: number) {
  return richLines(doc, text, width).length * 12.4;
}

async function convertImage(buffer: Buffer) {
  try {
    const image = sharp(buffer).rotate();
    const meta = await image.metadata();

    // WhatsApp stickers and some WebP/PNG exports use transparency.
    // Converting those to JPEG paints the transparent pixels black, which is
    // exactly the ugly black rectangle seen around large sticker emojis.
    if (meta.hasAlpha || meta.format === 'webp' && meta.channels === 4) {
      return await image.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    }

    return await image.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  } catch {
    return buffer;
  }
}

async function messageBlock(doc: PDFKit.PDFDocument, msg: ChatMessage, side: 'left' | 'right', c: Palette, emojiImages: Map<string, Buffer>) {
  const raw = cleanMessage(msg.text);
  const withoutMediaNames = raw.replace(/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|gif|mp4|3gp|mov|avi|mkv|opus|ogg|mp3|m4a|aac|wav|amr)\b/ig, '');
  const text = msg.mediaType === 'image'
    ? withoutMediaNames.replace(/<media omitted>|image omitted|photo omitted|sticker omitted/ig, msg.mediaBuffer ? '' : 'Photo').trim()
    : withoutMediaNames.trim();
  const maxW = BUBBLE_MAX;
  const x = side === 'left' ? M : W - M - maxW;
  const textH = text ? Math.min(155, richTextHeight(doc, text, maxW - 26)) : 0;
  const imageH = msg.mediaType === 'image' && msg.mediaBuffer ? 154 : 0;
  const h = Math.max(50, Math.min(350, 39 + textH + (text ? 6 : 0) + imageH));

  if (doc.y + h > H - BOTTOM) paintPage(doc, c, monthLabel(msg.date));

  const y = doc.y;
  doc.roundedRect(x, y, maxW, h, 12).fill(side === 'left' ? c.bubble : c.bubble2);
  doc.font('BookSansBold').fontSize(7.3).fillColor(c.accent)
    .text(safe(msg.author, 70), x + 13, y + 10, { width: maxW - 82, lineBreak: false });
  doc.font('BookSans').fontSize(7.2).fillColor(c.muted)
    .text(timeLabel(msg.date), x + maxW - 68, y + 10, { width: 55, align: 'right', lineBreak: false });

  let ty = y + 25;
  if (text) ty += Math.min(155, drawRichText(doc, text, x + 13, ty, maxW - 26, c.ink, emojiImages)) + 5;

  if (msg.mediaType === 'image' && msg.mediaBuffer) {
    const converted = await convertImage(msg.mediaBuffer);
    try {
      doc.image(converted, x + 13, ty, { fit: [maxW - 26, 140], align: 'center', valign: 'center' });
    } catch {
      // Keep the message even if one corrupt/unsupported image cannot be embedded.
    }
  }
  doc.y = y + h + 7;
}

function monthDivider(doc: PDFKit.PDFDocument, month: string, c: Palette) {
  paintPage(doc, c, month);
  doc.font('BookSansBold').fontSize(7.5).fillColor(c.accent)
    .text('CONVERSATION', M, 78, { characterSpacing: 1.5 });
  doc.font('BookSerif').fontSize(28).fillColor(c.ink).text(month, M, 100);
  doc.moveTo(M, 146).lineTo(M + 80, 146).strokeColor(c.accent).lineWidth(1).stroke();
  doc.y = 178;
}

export async function makeBook(messages: ChatMessage[], options: BookOptions): Promise<Buffer> {
  pageNo = 0;
  const c = colors[options.theme] || colors.sunset;
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false, compress: true, bufferPages: false });
  const chunks: Buffer[] = [];
  registerFonts(doc);
  const emojiImages = await buildEmojiAtlas(messages);

  const ended = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  cover(doc, options, c);
  dedication(doc, options, c);
  if (options.includeIndex) indexPage(doc, messages, c);

  const authors = [...new Set(messages.map((m) => m.author))];
  const primaryAuthor = authors[0] || options.firstName;
  let currentMonth = '';
  let currentDay = '';

  for (const msg of messages) {
    if (msg.mediaType === 'video' || msg.mediaType === 'audio') continue;

    const month = monthLabel(msg.date);
    const day = dateLabel(msg.date);

    if (month !== currentMonth) {
      monthDivider(doc, month, c);
      currentMonth = month;
      currentDay = '';
    }

    if (day !== currentDay) {
      if (doc.y > H - 120) monthDivider(doc, month, c);
      doc.font('BookSerifBold').fontSize(12.5).fillColor(c.ink).text(day, M, doc.y);
      doc.moveTo(M, doc.y + 20).lineTo(M + 36, doc.y + 20).strokeColor(c.accent).lineWidth(0.7).stroke();
      doc.y += 30;
      currentDay = day;
    }

    const side: 'left' | 'right' = msg.author === primaryAuthor ? 'left' : 'right';
    await messageBlock(doc, msg, side, c, emojiImages);
  }

  doc.end();
  return ended;
}
