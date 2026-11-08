// Chart data lives in the lake, s3://nsr-lake-613473203863/site/viz-data/<version>/, and CloudFront serves it
// (2026-11-08). This is the only place its URLs are built. Publish a new version folder with
// scripts/viz-data-publish.sh <version>, then change VIZ_DATA_VERSION. Files never change inside a version, so
// browsers and the CDN keep them for a year.
export const VIZ_DATA_VERSION = 'v20261108'

/** One chart data file's URL: dataUrl('levels.json'), dataUrl(`radiation/${z}.json`). */
export function dataUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_DATA_BASE}/viz-data/${VIZ_DATA_VERSION}/${path}`
}
