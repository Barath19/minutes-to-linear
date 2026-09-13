import type { Metadata } from 'next';
import { Geist_Mono, Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono-geist' });

export const metadata: Metadata = {
  title: 'Neuva — meeting notes that file themselves',
  description: 'Turn raw meeting notes into reviewed, assigned Linear tickets.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
