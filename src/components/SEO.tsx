import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';

interface SEOProps {
  title?: string;
  description?: string;
  path?: string;
}

const BASE_URL = 'https://hermes-ai.trading';
const OG_IMAGE = `${BASE_URL}/og-image.png`;

const LD_ORGANIZATION = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Hermes AI Trading',
  url: BASE_URL,
  logo: `${BASE_URL}/favicon.svg`,
});

const LD_SOFTWARE = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Hermes AI Trading',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  description:
    '量化交易平台，提供 AI 股票分析、多策略回測、自動化交易與即時市場監控。',
  url: BASE_URL,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'TWD',
  },
  inLanguage: ['zh-TW', 'en'],
});

export function SEO({ title, description, path = '/' }: SEOProps) {
  const { t } = useTranslation();

  const siteTitle = t('seo.title', 'Hermes AI Trading | 量化交易平台');
  const pageTitle = title ? `${title} | ${siteTitle}` : siteTitle;
  const pageDescription =
    description ||
    t(
      'seo.desc',
      '專業即時 AI 股票分析、演算法回測與自動化量化交易終端機。支援台股、美股、加密貨幣多策略回測與 AI 訊號決策。',
    );

  const canonicalUrl = `${BASE_URL}${path}`;
  const isRoot = path === '/' || path === '';

  return (
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={pageDescription} />

      {/* Canonical */}
      <link rel="canonical" href={canonicalUrl} />

      {/* Hreflang — zh-TW self-ref + x-default on root only.
          English alternate omitted until /en/ subdirectory routing is implemented;
          broken ?lng= params point to non-canonical URLs and are silently ignored by Google. */}
      {isRoot && <link rel="alternate" hrefLang="zh-TW" href={BASE_URL + '/'} />}
      {isRoot && <link rel="alternate" hrefLang="x-default" href={BASE_URL + '/'} />}

      {/* Open Graph */}
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDescription} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:type" content="website" />
      <meta property="og:image" content={OG_IMAGE} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:locale" content="zh_TW" />
      <meta property="og:locale:alternate" content="en_US" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={pageDescription} />
      <meta name="twitter:image" content={OG_IMAGE} />

      {/* JSON-LD structured data (root page only to avoid duplication) */}
      {isRoot && (
        <script type="application/ld+json">{LD_ORGANIZATION}</script>
      )}
      {isRoot && (
        <script type="application/ld+json">{LD_SOFTWARE}</script>
      )}
    </Helmet>
  );
}
