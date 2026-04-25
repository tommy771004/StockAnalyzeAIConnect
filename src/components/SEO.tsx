import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';

interface SEOProps {
  title?: string;
  description?: string;
  path?: string;
}

const BASE_URL = 'https://hermes-ai.trading';

export function SEO({ title, description, path = '/' }: SEOProps) {
  const { t, i18n } = useTranslation();
  
  const siteTitle = t('seo.title', 'Hermes AI Trading Terminal');
  const pageTitle = title ? `${title} | ${siteTitle}` : siteTitle;
  const pageDescription = description || t('seo.desc', 'Professional real-time AI stock analysis and algorithmic trading terminal.');
  
  const canonicalUrl = `${BASE_URL}${path}`;

  return (
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={pageDescription} />
      
      {/* Canonical URL - prevents duplicate content issues */}
      <link rel="canonical" href={canonicalUrl} />
      
      {/* International SEO: Hreflang alternates */}
      <link rel="alternate" hrefLang="en" href={`${canonicalUrl}?lng=en`} />
      <link rel="alternate" hrefLang="zh" href={`${canonicalUrl}?lng=zh`} />
      <link rel="alternate" hrefLang="x-default" href={canonicalUrl} />
      
      {/* Open Graph Tags */}
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDescription} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:type" content="website" />
    </Helmet>
  );
}
