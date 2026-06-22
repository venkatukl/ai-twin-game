import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'AI Twin Challenge',
  description: 'Professional hackathon game for risk, growth, compliance and AI decision making.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}