import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ChatBook — Turn conversations into keepsakes',
  description: 'Create a premium book from a WhatsApp chat export.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
