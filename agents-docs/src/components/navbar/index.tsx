// import { MobileSearchTrigger } from '@/components/navbar/mobile-search';
import { SidebarTrigger } from '@/components/navbar/sidebar-trigger';
// import { SearchToggle } from '@/components/search-trigger';
import { ThemeToggle } from '@/components/theme-toggle';
import { Fade } from '@/components/fade';
import { Logo } from '@/components/logo';

import Link from 'next/link';
// import { ChatToggle } from './chat-trigger';

export const Navbar = () => {
  return (
    <div className="fixed top-(--fd-banner-height) z-40 isolate h-(--fd-nav-height) w-full bg-background">
      <div className="flex flex-row items-center h-full max-w-fd-container mx-auto">
        <div className="flex-none lg:w-[var(--sidebar-width)] relative isolate flex items-center gap-x-3 lg:border-r lg:border-gray-100 lg:dark:border-gray-800 border-fd-foreground/10 pr-4">
          <Fade className="border-r border-gray-100 dark:border-gray-800  hidden lg:block" />
          <Link href="/" className="flex-1">
            <Logo className="!w-[110px] !h-[32px] mx-2 my-4" />
          </Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-row h-full items-center flex-1 w-full space-x-4 px-4 transition-colors">
          <Fade className="hidden lg:block" />
          {/* Temporarily disabled search and ask AI until implementation
          <div className="max-lg:hidden flex-2 space-x-4 flex w-full justify-center">
            <SearchToggle className="rounded-md w-full max-w-md" />
            <ChatToggle />
          </div>
          */}

          <div className="flex-1 flex items-center gap-0.5 md:gap-4 ml-auto justify-end">
            {/* <MobileSearchTrigger /> */}
            <SidebarTrigger />
          </div>
        </div>
      </div>
    </div>
  );
};
