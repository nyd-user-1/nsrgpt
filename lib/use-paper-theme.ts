'use client'

import * as React from 'react'

/** The theme for a canvas the CSS doesn't reach (2026-11-06): html.dark, and the paper and ink tokens as the element
 *  resolves them, read again whenever <html>'s class or style changes. /viz/decay's reading, shared. */
export function usePaperTheme(el: React.RefObject<HTMLElement | null>) {
  const [theme, setTheme] = React.useState({ dark: true, paper: '#15120d', ink: '#f0e9d8' })
  React.useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(el.current ?? document.body)
      setTheme({
        dark: document.documentElement.classList.contains('dark'),
        paper: cs.getPropertyValue('--paper').trim() || '#ffffff',
        ink: cs.getPropertyValue('--paper-text').trim() || '#16181d',
      })
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
    return () => mo.disconnect()
  }, [el])
  return theme
}
