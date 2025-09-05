import '@/app/global.css';
import { RootProvider } from 'fumadocs-ui/provider';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';
import { AppSidebar } from '@/components/sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Navbar } from '@/components/navbar';

const inter = Inter({
  subsets: ['latin'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.className} antialiased`} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <RootProvider theme={{ enabled: false }}>
            <SidebarProvider>
              <DocsLayout
                tree={source.pageTree}
                sidebar={{
                  component: <AppSidebar />,
                }}
                nav={{
                  component: <Navbar />,
                }}
                containerProps={{
                  className:
                    'flex flex-1 flex-row pe-(--fd-layout-offset) max-w-fd-container relative top-[calc(var(--fd-nav-height)+1rem)] px-4 ms-auto! me-auto!',
                }}
              >
                {children}
              </DocsLayout>
            </SidebarProvider>
          </RootProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
