import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { MapPinned } from 'lucide-react';
import './globals.css';
import { NavLinks } from '@/components/NavLinks';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Gujarat Land Deals',
  description: 'Mutation notices from AnyRoR e-Chavdi, by village, with survey numbers you can pin on a map.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background text-foreground antialiased`}>
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-[1100] w-full border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
            <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                <MapPinned className="h-4 w-4 text-accent" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-zinc-100">Gujarat Land Deals</h1>
                <p className="hidden text-xs text-zinc-500 sm:block">e-Chavdi notices, read together</p>
              </div>
              <NavLinks />
            </div>
          </header>
          <main className="flex w-full flex-1 justify-center">{children}</main>
          <footer className="border-t border-zinc-800 py-6">
            <p className="text-center text-xs text-zinc-600">
              Built on public AnyRoR records for information only. Not legal advice, a valuation or a recommendation to buy or sell.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
