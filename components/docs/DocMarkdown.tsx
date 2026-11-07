import * as React from "react"
import Link from "next/link"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { Lightbulb } from "lucide-react"

import { DocImage } from "@/components/docs/DocImage"
import { NarratedVideo } from "@/components/docs/NarratedVideo"
import { headingId } from "@/lib/docs"

// DocMarkdown (2026-11-07): pax-trinity's doc markdown (components/docs/doc-markdown.tsx), rendered on the server, in
// the paper's dress: Fraunces headings with anchors for the contents, every picture a framed figure with its caption,
// a .mp4 drawn as a narrated player with its poster, and a quote as a callout.

const SERIF = { fontFamily: "var(--font-display), Georgia, serif" } as const
const RULE = "border-[color-mix(in_oklab,var(--paper-text)_18%,var(--paper))]"

const text = (children: React.ReactNode): string =>
  React.Children.toArray(children)
    .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : React.isValidElement<{ children?: React.ReactNode }>(c) ? text(c.props.children) : ""))
    .join("")

function Figure({ src, alt }: { src: string; alt: string }) {
  if (/\.mp4$/i.test(src)) return <NarratedVideo src={src} alt={alt} />
  return (
    <figure className="my-8">
      <div className="overflow-hidden rounded-xl border border-[var(--paper-rule)] bg-[var(--paper)] shadow-e2">
        <DocImage src={src} alt={alt} className="block aspect-[16/10] w-full object-cover object-left-top" />
      </div>
      {alt && <figcaption className="mt-2.5 text-center text-[13px] text-[var(--paper-faint)]">{alt}</figcaption>}
    </figure>
  )
}

const components: Components = {
  // A paragraph holding only a picture is the figure itself: a figure can't sit inside a paragraph.
  p: ({ node, children }) => {
    const only = node?.children.length === 1 ? node.children[0] : null
    if (only && only.type === "element" && only.tagName === "img") return <>{children}</>
    return <p className="mb-5 text-[16px] leading-[1.7] text-[var(--paper-text)] last:mb-0">{children}</p>
  },
  img: ({ src, alt }) => (typeof src === "string" ? <Figure src={src} alt={alt ?? ""} /> : null),
  h2: ({ children }) => (
    <h2 id={headingId(text(children))} className="mt-14 mb-4 scroll-mt-8 text-[28px] leading-tight font-normal text-[var(--paper-text)] first:mt-0" style={SERIF}>
      {children}
    </h2>
  ),
  h3: ({ children }) => <h3 className="mt-8 mb-3 text-[18px] font-semibold text-[var(--paper-text)]">{children}</h3>,
  strong: ({ children }) => <strong className="font-semibold text-[var(--paper-text)]">{children}</strong>,
  ul: ({ children }) => <ul className="mb-5 list-disc space-y-2 pl-6 marker:text-[var(--paper-faint)]">{children}</ul>,
  ol: ({ children }) => <ol className="mb-5 list-decimal space-y-2.5 pl-6 marker:font-medium marker:text-[var(--paper-muted)]">{children}</ol>,
  li: ({ children }) => <li className="pl-1.5 text-[16px] leading-[1.7] text-[var(--paper-text)]">{children}</li>,
  a: ({ href, children }) =>
    href?.startsWith("/") ? (
      <Link href={href} className="font-medium text-[var(--paper-strong)] underline-offset-2 hover:underline">
        {children}
      </Link>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--paper-strong)] underline-offset-2 hover:underline">
        {children}
      </a>
    ),
  code: ({ children }) => <code className={`rounded-md border ${RULE} bg-[var(--paper-quiet)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--paper-text)]`}>{children}</code>,
  blockquote: ({ children }) => (
    <aside className="my-7 flex gap-3.5 rounded-xl bg-[color-mix(in_oklab,var(--paper-strong)_10%,var(--paper))] px-5 py-4 [&_p]:mb-0 [&_p]:text-[15px]">
      <Lightbulb aria-hidden className="mt-1 size-[18px] shrink-0 text-[var(--paper-strong)]" />
      <div className="min-w-0">{children}</div>
    </aside>
  ),
  hr: () => <hr className={`my-10 ${RULE}`} />,
  table: ({ children }) => (
    <div className={`mb-6 overflow-x-auto rounded-xl border ${RULE}`}>
      <table className="w-full text-left text-[15px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className={`border-b ${RULE} bg-[var(--paper-quiet)]`}>{children}</thead>,
  th: ({ children }) => <th className="px-4 py-3 text-[12px] font-medium uppercase tracking-[0.05em] text-[var(--paper-faint)]">{children}</th>,
  tr: ({ children }) => <tr className={`border-b ${RULE} last:border-0`}>{children}</tr>,
  td: ({ children }) => <td className="px-4 py-3 align-top leading-relaxed text-[var(--paper-text)]">{children}</td>,
}

export function DocMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  )
}
