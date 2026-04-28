/**
 * Referral / share-link helpers.
 *
 * Every share URL is decorated with `?ref=USER_CODE&utm_source=share` so that
 * when a recipient signs up via that link, the existing referral payout fires.
 * Additionally, anonymous click-throughs are logged via the public
 * /api/referrals/click beacon so the sharer can see "your shares got X clicks".
 */

const BRAND_HOST = "https://marketsamachar.in";

export type SharePlatform =
  | "whatsapp" | "twitter" | "telegram" | "copy" | "other";

/**
 * Build a share-ready URL with referral code + UTM params.
 * If no refCode is provided, returns the bare URL.
 */
export function buildShareUrl(
  pathOrUrl: string,
  refCode: string | null | undefined,
  platform: SharePlatform = "other",
): string {
  // Resolve relative paths against BRAND_HOST so the link works off-site
  let url: URL;
  try {
    url = new URL(pathOrUrl, BRAND_HOST);
  } catch {
    url = new URL("/", BRAND_HOST);
  }

  if (refCode) url.searchParams.set("ref", refCode);
  url.searchParams.set("utm_source", "share");
  url.searchParams.set("utm_medium", platform);

  return url.toString();
}

/**
 * Build a share URL specifically for an article (uses the canonical article path).
 */
export function buildArticleShareUrl(
  articleId: string,
  refCode: string | null | undefined,
  platform: SharePlatform = "other",
): string {
  return buildShareUrl(`/?article=${encodeURIComponent(articleId)}`, refCode, platform);
}

/**
 * Fire-and-forget click-through beacon. Safe to call multiple times — server
 * de-dups by IP within 10 minutes.
 */
export function logReferralClick(
  code: string,
  articleId?: string,
  platform?: SharePlatform,
): void {
  try {
    const body = JSON.stringify({ code, articleId, platform });
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/referrals/click", blob);
    } else {
      void fetch("/api/referrals/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch { /* swallow */ }
}

/**
 * On page load, if the URL has `?ref=CODE`, fire the click beacon and clean
 * the URL. Call once near the top of main.tsx (or inside an early useEffect).
 *
 * Also persists the referral code in localStorage so we can attribute the
 * sign-up if the user creates an account later in the same session.
 */
export function captureIncomingReferral(): string | null {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("ref");
    if (!code || !/^[A-Z0-9_-]{3,32}$/i.test(code)) return null;

    const platform = (url.searchParams.get("utm_medium") ?? undefined) as SharePlatform | undefined;
    const articleId = url.searchParams.get("article") ?? undefined;

    logReferralClick(code, articleId, platform);

    // Stash for later signup attribution
    try { localStorage.setItem("ms_pending_ref", code.toUpperCase()); } catch {}

    // Clean the URL bar (don't remove ?article= if present)
    url.searchParams.delete("ref");
    url.searchParams.delete("utm_source");
    url.searchParams.delete("utm_medium");
    window.history.replaceState({}, "", url.toString());

    return code.toUpperCase();
  } catch {
    return null;
  }
}

/** Native-share text + url builder (for navigator.share). */
export function buildShareText(articleTitle: string, refCode?: string | null): string {
  const head = articleTitle.length > 120 ? articleTitle.slice(0, 117) + "..." : articleTitle;
  const tail = refCode
    ? `\n\nRead on Market Samachar — use my code ${refCode} when you sign up, we both earn 500 coins.`
    : "\n\nRead on Market Samachar.";
  return head + tail;
}
