// Version: 0.1.0-beta

import { get } from 'svelte/store';
import { env } from '$env/dynamic/public';
import { locale } from '$lib/i18n';

export interface ReportContext {
  url: string;
  route: string;
  buildSha: string;
  environment: string;
  userAgent: string;
  viewport: string;
  locale: string;
  language: string;
  timestamp: string;
}

/** Collects the environment context at the time of the report. */
export function captureContext(): ReportContext {
  const w = typeof window !== 'undefined' ? window : undefined;
  return {
    url: w?.location.href ?? '',
    route: w?.location.pathname ?? '',
    buildSha: env.PUBLIC_BUILD_SHA || 'dev',
    environment: import.meta.env.MODE ?? 'unknown',
    userAgent: w?.navigator.userAgent ?? '',
    viewport: w ? `${w.innerWidth}×${w.innerHeight}` : '',
    locale: get(locale),
    language: w?.navigator.language ?? '',
    timestamp: new Date().toISOString(),
  };
}