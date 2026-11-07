"use client"

import Link from "next/link"
import { ChevronLeft, ChevronRight, PlayCircle } from "lucide-react"

import { AnimateIcon } from "@/components/animate-ui/icons/icon"
import { DocImage } from "@/components/docs/DocImage"
import { BRANCH, type SideBarIcon } from "@/components/sidebar/SideBarMenuItem"

// The help center's cards (2026-11-07): pax-trinity's /docs front page cards and its articles' Previous and Next,
// in the paper's dress. Every card lifts 3 px on hover and its shadow deepens; the title turns --paper-strong.

const SERIF = { fontFamily: "var(--font-display), Georgia, serif" } as const

/** The card every help-center card is: the paper, its rule, the first elevation, and pax-trinity's lift (app/globals.css). */
export const CARD = "lift group block overflow-hidden rounded-2xl border border-[var(--paper-rule)] bg-[var(--paper)] shadow-e1"

const PICTURE = "block aspect-[16/10] w-full border-b border-[var(--paper-rule)] object-cover object-left-top"

/** A Start here card (Brendan, 2026-11-07): no ink rule; a thick outline in the colour at the edges of its captures.
 *  The capture is cropped to its app shell (DocImage crop), so the shell and the description below it share one width
 *  with nothing between them, and the outline is the whole frame. Sampled from the captures: #e3e9f1, PAX Light's
 *  frame, in light mode; #0f0f13, the dark shell's ground, in dark. */
const PICTURE_CARD = "lift group block overflow-hidden rounded-2xl border-[7px] border-[#e3e9f1] dark:border-[#0f0f13] bg-[var(--paper)] shadow-e1"
const CAPTURE = ""

/** Start here: an article with its picture; with `lightImage`, the light-mode capture shows when the app is light
 *  and the dark one when it's dark (only the one on show loads). */
export function DocCard({ href, image, lightImage, title, summary }: { href: string; image: string; lightImage?: string; title: string; summary: string }) {
  return (
    <Link href={href} className={PICTURE_CARD}>
      {lightImage ? (
        <>
          <span className="block dark:hidden">
            <DocImage src={lightImage} alt={title} className={CAPTURE} crop />
          </span>
          <span className="hidden dark:block">
            <DocImage src={image} alt={title} className={CAPTURE} crop />
          </span>
        </>
      ) : (
        <DocImage src={image} alt={title} className={CAPTURE} crop />
      )}
      <span className="block p-5">
        <span className="block text-[20px] leading-[1.15] text-[var(--paper-text)] transition-colors group-hover:text-[var(--paper-strong)]" style={SERIF}>
          {title}
        </span>
        <span className="mt-1.5 block text-[14px] leading-relaxed text-[var(--paper-muted)]">{summary}</span>
      </span>
    </Link>
  )
}

/** Browse by topic: a category, its icon in the two tones, its blurb and its count. The icon plays on hover. */
export function TopicCard({ id, href, icon: Icon, title, blurb, count }: { id: string; href: string; icon: SideBarIcon; title: string; blurb: string; count: number }) {
  return (
    <AnimateIcon asChild animateOnHover>
      <Link id={id} href={href} className={`${CARD} flex gap-4 p-5`}>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_oklab,var(--paper-strong)_16%,var(--paper))] text-[var(--paper-strong)]">
          <Icon size={20} className="fill-[color-mix(in_oklab,var(--paper-strong)_18%,var(--paper))]" />
        </span>
        <span className="min-w-0">
          <span className="block text-[18px] leading-[1.15] text-[var(--paper-text)] transition-colors group-hover:text-[var(--paper-strong)]" style={SERIF}>
            {title}
          </span>
          <span className="mt-1 block text-[14px] leading-relaxed text-[var(--paper-muted)]">{blurb}</span>
          <span className="mt-2 block text-[13px] text-[var(--paper-faint)]">{count === 1 ? "1 article" : `${count} articles`}</span>
        </span>
      </Link>
    </AnimateIcon>
  )
}

/** Video guides: a guide's poster with the play mark, its title and line. */
export function VideoCard({ href, poster, title, summary }: { href: string; poster: string; title: string; summary: string }) {
  return (
    <Link href={href} className={CARD}>
      <span className="relative block">
        <DocImage src={poster} alt={title} className={PICTURE} />
        <PlayCircle aria-hidden className="absolute right-3 bottom-3 size-8 fill-[var(--paper)] text-[var(--paper-strong)]" />
      </span>
      <span className="block p-5">
        <span className="block text-[18px] leading-[1.15] text-[var(--paper-text)] transition-colors group-hover:text-[var(--paper-strong)]" style={SERIF}>
          {title}
        </span>
        <span className="mt-1 block text-[14px] text-[var(--paper-muted)]">{summary}</span>
      </span>
    </Link>
  )
}

/** An article's foot: the articles either side. */
export function PrevNext({ prev, next }: { prev?: { slug: string; title: string }; next?: { slug: string; title: string } }) {
  if (!prev && !next) return null
  const box = "group rounded-xl border border-[color-mix(in_oklab,var(--paper-text)_18%,var(--paper))] px-5 py-4 transition-colors hover:border-[var(--paper-strong)]"
  return (
    <div className="mt-16 grid gap-4 border-t pt-8 sm:grid-cols-2" style={{ borderColor: BRANCH }}>
      {prev ? (
        <Link href={`/docs/${prev.slug}`} className={box}>
          <span className="flex items-center gap-1 text-[13px] text-[var(--paper-faint)]">
            <ChevronLeft aria-hidden className="size-4" />
            Previous
          </span>
          <span className="mt-1 block font-medium text-[var(--paper-text)] group-hover:text-[var(--paper-strong)]">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={`/docs/${next.slug}`} className={`${box} text-right`}>
          <span className="flex items-center justify-end gap-1 text-[13px] text-[var(--paper-faint)]">
            Next
            <ChevronRight aria-hidden className="size-4" />
          </span>
          <span className="mt-1 block font-medium text-[var(--paper-text)] group-hover:text-[var(--paper-strong)]">{next.title}</span>
        </Link>
      )}
    </div>
  )
}
