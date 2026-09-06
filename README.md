# ChatBook v6

This build fixes the remaining WhatsApp rendering issues:

- Modern/complex emojis are rasterized from the bundled Noto Color Emoji font and embedded as images in the PDF.
- WEBP/JPEG/PNG/GIF images are converted to JPEG before embedding.
- `<Media omitted>` is matched against same-day WhatsApp media using the media filename sequence.
- Audio attachments such as `.opus` are classified and skipped instead of appearing as raw filenames.
- Video/audio attachments remain excluded from the keepsake pages.
- The compact A4 chat layout is preserved.

Run:

```powershell
npm install
npm run dev
```


### Emoji rendering
ChatBook v6 uses installed Chrome/Edge to rasterize emoji as color images before PDFKit places them. This preserves variation selectors, skin tones, flags, and ZWJ emoji much more faithfully than PDF fonts. Set `CHATBOOK_CHROME_PATH` if Chrome/Edge is installed in a non-standard location.
