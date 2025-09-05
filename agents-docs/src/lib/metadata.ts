import { createMetadataImage } from 'fumadocs-core/server';
import { source } from './source';
import { Metadata } from 'next';

export const metadataImage = createMetadataImage({
  imageRoute: '/docs-og',
  source,
});

export function createMetadata(override: Metadata): Metadata {
  return {
    ...override,
    icons: '/icon.svg',
    metadataBase: new URL('https://docs.companyname.com/'),
    openGraph: {
      title: override.title ?? undefined,
      description: override.description ?? undefined,
      url: 'https://docs.companyname.com/',
      //   images: "/banner.png",
      siteName: 'CompanyName',
      ...override.openGraph,
    },
    twitter: {
      card: 'summary_large_image',
      creator: '@companyname',
      title: override.title ?? undefined,
      description: override.description ?? undefined,
      //   images: "/banner.png",
      ...override.twitter,
    },
  };
}

export const baseUrl =
  process.env.NODE_ENV === 'development' || !process.env.VERCEL_URL
    ? new URL('http://localhost:3000')
    : new URL(`https://${process.env.VERCEL_URL}`);
