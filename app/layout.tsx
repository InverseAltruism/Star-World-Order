import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { fontVariables } from './fonts';
import SiteChrome from '@/components/SiteChrome';

export const metadata: Metadata = {
  title: 'Star World Order | Skrumpey DAO',
  description: 'Star World Order (SWO) - A Sub-DAO of Skrumpeys on Monad. Hold a Star Skrumpey to enter the DAO.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // suppressHydrationWarning on <html>: the inline boot script below sets
  // documentElement.dataset.crt from localStorage before React hydrates, so the
  // <html> attributes legitimately differ between server and client. This only
  // suppresses the warning one level deep (the <html> element's own attributes).
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        {/* Apply persisted CRT preference before paint (no flash). See A5 / CrtToggle. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var v=localStorage.getItem('swo-crt');if(v){document.documentElement.dataset.crt=v;}}catch(e){}})();",
          }}
        />
      </head>
      <body>
        <Providers>
          <SiteChrome>{children}</SiteChrome>
        </Providers>
      </body>
    </html>
  );
}
