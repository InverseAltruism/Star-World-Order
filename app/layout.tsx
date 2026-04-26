import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Star World Order | Skrumpey DAO',
  description: 'Star World Order (SWO) - A Sub-DAO of Skrumpeys on Monad. Hold a Star Skrumpey to enter the DAO.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/*
          SNES-mood bitmap font for the Forgotten Memories palette (SWO_V3_FONT_SWAP).
          Pixelify Sans is a true bitmap pixel font with 4 weights for hierarchy.
          The CSS provides Courier New as fallback.
        */}
        <link
          href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
