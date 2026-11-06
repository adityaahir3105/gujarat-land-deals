'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

const LINKS = [
  { href: '/', en: 'Dashboard', gu: 'ડેશબોર્ડ' },
  { href: '/summary', en: 'Summary', gu: 'સારાંશ' },
];

export function NavLinks() {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav className="ml-auto flex items-center gap-1" aria-label="Main">
      {LINKS.map(({ href, en, gu }) => {
        const active = pathname === href || (href !== '/' && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn('rounded-md px-2.5 py-1.5 text-sm', active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200')}
          >
            {t(en, gu)}
          </Link>
        );
      })}
    </nav>
  );
}
