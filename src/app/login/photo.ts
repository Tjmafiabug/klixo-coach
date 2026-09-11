// Server-only by construction: the key is read from process.env and this module
// is imported solely by the login page's server component.
export interface Photo {
  url: string;
  photographer: string;
  /** Pexels requires attribution back to the photo page. */
  link: string;
}

/**
 * One classroom photo for the login backdrop — a teacher with students, which
 * is what the product is about.
 *
 * Cached for a day: the picture is decoration, and putting a third-party fetch
 * on the critical path of the auth screen would mean Pexels being slow makes
 * signing in slow. Any failure — no key, rate limit, network — returns
 * undefined and the page falls back to its gradient, so login never depends on
 * this succeeding.
 */
export async function loginPhoto(): Promise<Photo | undefined> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return undefined;
  try {
    const res = await fetch(
      "https://api.pexels.com/v1/search?query=teacher%20helping%20students%20classroom&orientation=landscape&per_page=15",
      { headers: { Authorization: key }, next: { revalidate: 86400 } },
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as {
      photos?: { src?: { large2x?: string }; photographer?: string; url?: string }[];
    };
    const pick = data.photos?.find((p) => p.src?.large2x);
    if (!pick?.src?.large2x) return undefined;
    return {
      url: pick.src.large2x,
      photographer: pick.photographer ?? "Pexels",
      link: pick.url ?? "https://www.pexels.com",
    };
  } catch {
    return undefined;
  }
}
