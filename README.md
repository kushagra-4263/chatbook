ChatBook 📖

Turn your WhatsApp conversations into a beautiful, personal PDF keepsake.

ChatBook is a Next.js application that converts an exported WhatsApp chat (.txt or .zip) into a polished A4 PDF book. It preserves the conversation, organizes messages by month, embeds supported images, handles emojis, and skips audio/video media from the visual book.

✨ Features

WhatsApp export support

.txt chat exports

.zip exports containing chat text and media

Premium A4 PDF generation

Book-style layout

Rounded chat bubbles

Sender names and timestamps

Monthly section dividers

Optional month-wise index

Media handling

JPG / JPEG

PNG

WebP

GIF

Transparent stickers preserve their transparency

Audio and video are skipped instead of appearing as raw filenames

Emoji support

Colored emoji rendering

Complex emoji sequences

Skin-tone modifiers

Variation selectors

ZWJ emoji combinations

Themes

Sunset

Cream

Midnight

Rose

Personalization

Names

Book title

Subtitle

Dedication / quote

Server-side processing

The original uploaded export is processed on the server

Large chats are not sent as one huge JSON payload from the browser

🛠️ Tech Stack

Next.js

React

TypeScript

PDFKit

Sharp

Node.js

DejaVu fonts

Noto Color Emoji

📁 Project Structure

chatbook/
├── app/
│   ├── api/
│   │   ├── generate/
│   │   │   └── route.ts
│   │   ├── parse/
│   │   │   └── route.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
├── lib/
│   ├── pdfBook.ts
│   ├── types.ts
│   └── whatsapp.ts
│
├── public/
│   └── fonts/
│
├── next.config.ts
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md

🚀 Getting Started

1. Clone the repository

git clone https://github.com/kushagra-4263/chatbook.git
cd chatbook

2. Install dependencies

npm install

3. Start the development server

npm run dev

Open http://localhost:3000.

4. Create a production build

npm run build

5. Start the production server

npm start

📦 WhatsApp Export

For the best result:

Export the WhatsApp conversation.

Include media when exporting.

Prefer the .zip export when you want images included.

Upload the original export to ChatBook.

Enter the book details.

Generate the PDF.

ChatBook uses the exported chat text to reconstruct the conversation and matches supported media from the accompanying ZIP.

🖼️ Media & Emoji Rendering

Images

Images are processed with Sharp before being embedded into the PDF. Transparent images and stickers retain their alpha channel so they do not acquire unwanted black backgrounds.

Emojis

Regular text uses bundled fonts, while color emojis are rendered separately so modern Unicode emoji sequences can retain their visual appearance.

This approach is designed to handle emoji combinations that ordinary PDF fonts often cannot render correctly.

🎨 Themes

Theme

Style

Sunset

Warm, romantic pastel

Cream

Soft, minimal and elegant

Midnight

Dark and modern

Rose

Romantic pink aesthetic

🔒 Privacy

ChatBook is designed around processing the uploaded WhatsApp export for PDF generation.

The application does not require connecting a WhatsApp account.

Important: If you deploy ChatBook publicly, review and configure your hosting, storage, logging, and retention policies before processing private conversations.

⚠️ Notes

Audio and video files are intentionally skipped from the generated book.

The project does not upload media to a third-party WhatsApp service.

Large WhatsApp exports can take time to process because PDF generation and image processing happen server-side.

Keep node_modules/ and .next/ out of Git. The included .gitignore handles these generated directories.

📜 Available Scripts

npm run dev
npm run build
npm start

🧑‍💻 Author

Kushagra

GitHub: https://github.com/kushagra-4263

📄 License

This project is currently provided as a personal/project repository. Add a formal open-source license before distributing the code for reuse.