'use client'

import type * as React from 'react'
import { Box, ChartArea, ChartBar, ChartCandlestick, ChartColumn, ChartLine, ChartScatter, CircleDot, Grid2x2, Grid3x3, Image as ImageIcon, Radar, Table, Waypoints } from 'lucide-react'
import { Atom } from '@/components/animate-ui/icons/atom'
import { PAGE_ICONS } from '@/components/sidebar/page-icons'
import { ICON_REST } from '@/components/sidebar/SideBarMenuItem'
import { cn } from '@/lib/utils'

// A box's icon in its foot, where its number was (brief 46): a chart's by its chart type, a page's the one its sidebar row
// has. Muted at rest; on the box's hover, the sidebar icon's two tones, and a page's icon plays as its row's does
// (plate-arrange.tsx's AnimateIcon). A chart's icon is lucide's and plays too (Brendan, 2026-11-11 03:10): its strokes draw
// in on the box's hover (app/globals.css .plate-icon-draw). The particle simulation's atom is the pages' animated atom,
// the one /nsrcpt has, not lucide's older drawing.
const CHART_ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  'Line Chart': ChartLine,
  'Bar Chart': ChartBar,
  'Scatter Plot': ChartScatter,
  'Strip Plot': ChartScatter,
  'Bubble Chart': ChartScatter,
  Heatmap: Grid3x3,
  'Correlation Matrix': Grid3x3,
  'Tile Map': Grid3x3,
  '3D Scatter Plot': Box,
  '3D Surface Plot': Box,
  '3D Simulation': Box,
  'Punch Card': CircleDot,
  'Stick Spectrum': ChartColumn,
  'Network Graph': Waypoints,
  'Flow Map': Waypoints,
  'Radar Chart': Radar,
  'Stacked Area Chart': ChartArea,
  'Nuclide Chart': Grid2x2,
  Table,
  'OHLC Chart': ChartCandlestick,
  'Candlestick Chart': ChartCandlestick,
  'Particle Simulation': Atom,
  Placeholder: ImageIcon,
}

export function BoxIcon({ href, type }: { href: string; type?: string }) {
  const chart = type ? CHART_ICONS[type] : undefined
  const Icon = chart ?? PAGE_ICONS[href]
  const draws = !!chart && chart !== Atom
  return Icon ? <Icon size={16} strokeWidth={1.75} className={cn('shrink-0 text-[var(--paper-muted)] transition-colors', ICON_REST, draws && 'plate-icon-draw')} /> : null
}
