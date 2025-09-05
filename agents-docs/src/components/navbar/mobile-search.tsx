import { buttonVariants } from '@/components/ui/button';
import clsx from 'clsx';
import { SearchIcon } from 'lucide-react';

export function MobileSearchTrigger() {
  return (
    <button
      type="button"
      id="search-trigger-mobile"
      className={clsx(
        buttonVariants({
          variant: 'ghost',
          size: 'icon-sm',
          className: 'lg:hidden text-fd-muted-foreground hover:text-fd-accent-foreground',
        })
      )}
    >
      <SearchIcon className="size-4" />
    </button>
  );
}
