'use client';

import { useMemo, useState } from 'react';

type Theme = 'sunset' | 'cream' | 'midnight' | 'rose';

type ParseInfo = { count: number; authors: string[]; months: string[]; imageCount: number };

const themes: { id: Theme; label: string }[] = [
  { id: 'sunset', label: 'Sunset' },
  { id: 'cream', label: 'Cream' },
  { id: 'midnight', label: 'Midnight' },
  { id: 'rose', label: 'Rose' }
];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<ParseInfo | null>(null);
  const [firstName, setFirstName] = useState('Kushagra');
  const [secondName, setSecondName] = useState('Simran');
  const [title, setTitle] = useState('Our Conversations in Pages');
  const [subtitle, setSubtitle] = useState('Same people. Same chaos. A different format.');
  const [quote, setQuote] = useState('Some conversations make you laugh. Some make you think. Some stay with you forever.');
  const [theme, setTheme] = useState<Theme>('sunset');
  const [includeIndex, setIncludeIndex] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fileLabel = useMemo(() => file?.name ?? 'Choose a WhatsApp .txt or .zip export', [file]);

  async function inspectFile(nextFile: File) {
    setFile(nextFile);
    setError('');
    setInfo(null);
    const form = new FormData();
    form.append('file', nextFile);
    try {
      const res = await fetch('/api/parse', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not read the export.');
      setInfo(data);
      if (data.authors?.length === 2) {
        setFirstName((v) => v || data.authors[0]);
        setSecondName((v) => v || data.authors[1]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the export.');
    }
  }

  async function generate() {
    if (!file) return setError('Please upload a WhatsApp export first.');
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('firstName', firstName);
      form.append('secondName', secondName);
      form.append('title', title);
      form.append('subtitle', subtitle);
      form.append('quote', quote);
      form.append('theme', theme);
      form.append('includeIndex', String(includeIndex));

      const res = await fetch('/api/generate', { method: 'POST', body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'PDF generation failed.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'chatbook.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF generation failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <div className="eyebrow">CHATBOOK</div>
          <h1>Turn conversations into something worth keeping.</h1>
          <p>Upload an exported WhatsApp chat, add two names, and create a beautifully typeset keepsake with a cover, month-wise index, conversations and embedded images.</p>
        </div>
        <div className={`mini-cover ${theme}`}>
          <span>{firstName} &amp; {secondName}</span>
          <b>{title}</b>
          <i>♥</i>
        </div>
      </header>

      <section className="grid">
        <div className="card upload-card">
          <h2>1. Upload chat</h2>
          <label className="dropzone">
            <input type="file" accept=".txt,.zip" onChange={(e) => e.target.files?.[0] && inspectFile(e.target.files[0])} />
            <div className="upload-icon">↑</div>
            <strong>{fileLabel}</strong>
            <span>WhatsApp .txt or ZIP with media</span>
          </label>
          {info && <div className="stats"><span><b>{info.count.toLocaleString()}</b> messages</span><span><b>{info.authors.length}</b> participants</span></div>}
          {info && <div className="media-note">{info.imageCount.toLocaleString()} images found · videos will be skipped</div>}
        </div>

        <div className="card personalize">
          <h2>2. Personalize</h2>
          <div className="two"><Field label="First name" value={firstName} setValue={setFirstName} /><Field label="Second name" value={secondName} setValue={setSecondName} /></div>
          <Field label="Book title" value={title} setValue={setTitle} />
          <Field label="Subtitle" value={subtitle} setValue={setSubtitle} />
          <label className="field"><span>Opening quote</span><textarea value={quote} onChange={(e) => setQuote(e.target.value)} /></label>
          <div className="theme-row"><span>Theme</span><div>{themes.map((t) => <button key={t.id} className={theme === t.id ? 'theme active' : 'theme'} onClick={() => setTheme(t.id)}>{t.label}</button>)}</div></div>
        </div>

        <div className="card preview">
          <h2>3. Preview structure</h2>
          <ol>
            <li><em>01</em><span>Front cover</span></li>
            <li><em>02</em><span>Title / dedication</span></li>
            {includeIndex && <li><em>03</em><span>Month-wise index</span></li>}
            <li><em>04</em><span>Conversation pages</span></li>
            <li><em>05</em><span>Images &amp; memories</span></li>
          </ol>
          <label className="check"><input type="checkbox" checked={includeIndex} onChange={(e) => setIncludeIndex(e.target.checked)} /> Include index page</label>
          <button className="generate" disabled={!file || busy} onClick={generate}>{busy ? 'Creating your book…' : '↓  Generate PDF'}</button>
          <p className="small">The PDF is generated directly from the upload. Your browser does not send 198k messages as one giant JSON payload.</p>
        </div>
      </section>

      {error && <div className="error">{error}</div>}
      <footer>♡ Built for conversations worth keeping.</footer>
    </main>
  );
}

function Field({ label, value, setValue }: { label: string; value: string; setValue: (v: string) => void }) {
  return <label className="field"><span>{label}</span><input value={value} onChange={(e) => setValue(e.target.value)} maxLength={180} /></label>;
}
