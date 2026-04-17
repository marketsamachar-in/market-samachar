/**
 * Client-side runtime config.
 *
 * APP_URL     — canonical URL used for share links, deep links, `navigator.share`.
 * BRAND_HOST  — the hostname rendered in UI/canvas/brand text. Derived from APP_URL.
 */

const fallbackUrl = 'https://marketsamachar.in';

const envUrl = (import.meta.env.VITE_APP_URL as string | undefined)?.trim();
const raw = envUrl && envUrl !== 'MY_APP_URL' ? envUrl : fallbackUrl;

export const APP_URL: string = raw.replace(/\/+$/, '');

export const BRAND_HOST: string = (() => {
  try { return new URL(APP_URL).host.replace(/^www\./, ''); }
  catch { return 'marketsamachar.in'; }
})();
