import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'AI Twin Challenge',
  description: 'What Would Your Twin Decide?',
  icons: {
    icon: '/ai-twin-icon.png',
    shortcut: '/ai-twin-icon.png',
    apple: '/ai-twin-icon.png',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}