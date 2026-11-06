'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/summary', label: 'Summary' },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="ml-auto flex items-center gap-1" aria-label="Main">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href || (href !== '/' && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn('rounded-md px-2.5 py-1.5 text-sm', active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200')}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
