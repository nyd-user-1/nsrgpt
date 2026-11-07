import { useEffect, useState } from "react";

export interface PaperData {
  title: string | null;
  abstract: string | null;
  authors: string[];
  year: number | null;
  citationCount: number | null;
  venue: string | null;
  openAccessPdfUrl: string | null;
  doi: string;
}

/** Extract a DOI from a `https://doi.org/...` URL. Returns null for non-DOI URLs. */
export function extractDoi(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "doi.org" && parsed.pathname.length > 1) {
      // pathname starts with "/", strip it
      return decodeURIComponent(parsed.pathname.slice(1));
    }
  } catch {
    // not a valid URL
  }
  return null;
}

// One lookup per DOI per page load (the old app cached for an hour through react-query).
const cache = new Map<string, Promise<PaperData>>();

export function usePaperLookup(pdfUrl: string | undefined) {
  const doi = extractDoi(pdfUrl);
  const [data, setData] = useState<PaperData | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(doi != null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!doi) return;
    let live = true;
    setIsLoading(true);
    if (!cache.has(doi)) {
      cache.set(doi, fetch(`/api/paper?doi=${encodeURIComponent(doi)}`).then((r) => {
        if (!r.ok) throw new Error(`paper ${r.status}`);
        return r.json() as Promise<PaperData>;
      }));
    }
    cache.get(doi)!
      .then((d) => { if (live) { setData(d); setIsError(false); } })
      .catch(() => { if (live) setIsError(true); })
      .finally(() => { if (live) setIsLoading(false); });
    return () => { live = false; };
  }, [doi]);

  return { data, isLoading, isError };
}
