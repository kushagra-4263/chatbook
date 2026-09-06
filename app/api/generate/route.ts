import { NextResponse } from 'next/server';
import { buildExport } from '../../../lib/whatsapp';
import { makeBook } from '../../../lib/pdfBook';
import type { BookOptions, Theme } from '../../../lib/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

function text(value: FormDataEntryValue | null, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function parseOptions(form: FormData): BookOptions {
  const themeValue = text(form.get('theme'), 'sunset');
  const theme: Theme = ['sunset', 'cream', 'midnight', 'rose'].includes(themeValue)
    ? (themeValue as Theme)
    : 'sunset';

  return {
    firstName: text(form.get('firstName'), 'Person 1').slice(0, 180),
    secondName: text(form.get('secondName'), 'Person 2').slice(0, 180),
    title: text(form.get('title'), 'Our Conversations in Pages').slice(0, 180),
    subtitle: text(form.get('subtitle'), 'Same people. Same chaos. A different format.').slice(0, 500),
    quote: text(form.get('quote'), 'Some conversations make you laugh. Some make you think. Some stay with you forever.').slice(0, 1000),
    theme,
    includeIndex: text(form.get('includeIndex'), 'true') === 'true',
  };
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No WhatsApp .txt or .zip file was uploaded.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const messages = buildExport(buffer, file.name);
    if (!messages.length) {
      return NextResponse.json({ error: 'No messages were found in the WhatsApp export.' }, { status: 400 });
    }

    const options = parseOptions(form);
    const pdf = await makeBook(messages, options);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="chatbook.pdf"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'PDF generation failed.' },
      { status: 500 }
    );
  }
}
