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
  return (
    <html lang="en" className={fontVariables}>
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
