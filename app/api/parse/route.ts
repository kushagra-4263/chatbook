import { NextResponse } from 'next/server';
import { buildExport } from '../../../lib/whatsapp';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const messages = buildExport(buffer, file.name);
    const authors = [...new Set(messages.map((m) => m.author))];
    const months = [...new Set(messages.map((m) => m.date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })))];
    const imageCount = messages.filter((m) => m.mediaType === 'image' && !!m.mediaBuffer).length;
    const videoCount = messages.filter((m) => m.mediaType === 'video').length;

    return NextResponse.json({
      count: messages.length,
      authors,
      months,
      imageCount,
      videoCount,
    });
  } catch (error) {
    console.error('Chat parsing error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to parse WhatsApp file.' },
      { status: 500 }
    );
  }
}
