import type { PartsPart } from './categories'
import type { DnaItem } from './dna'

export interface Tile<T> {
  item: T
  x: number
  y: number
  width: number
  height: number
}

/** Binary treemap: positive weights tile the rectangle without minimum-area distortion. */
export function layoutTreemap<T extends { value: number }>(items: readonly T[], width: number, height: number): Tile<T>[] {
  if (!(width > 0 && height > 0)) return []
  const sorted = items.filter(item => Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => b.value - a.value)
  const tiles: Tile<T>[] = []
  function split(list: T[], x: number, y: number, w: number, h: number): void {
    if (list.length === 0) return
    if (list.length === 1) {
      tiles.push({ item: list[0], x, y, width: w, height: h })
      return
    }
    const total = list.reduce((sum, item) => sum + item.value, 0)
    let sum = list[0].value
    let cut = 1
    while (cut < list.length - 1 && Math.abs(sum + list[cut].value - total / 2) < Math.abs(sum - total / 2)) {
      sum += list[cut].value
      cut++
    }
    const ratio = sum / total
    if (w >= h) {
      split(list.slice(0, cut), x, y, w * ratio, h)
      split(list.slice(cut), x + w * ratio, y, w * (1 - ratio), h)
    } else {
      split(list.slice(0, cut), x, y, w, h * ratio)
      split(list.slice(cut), x, y + h * ratio, w, h * (1 - ratio))
    }
  }
  split(sorted, 0, 0, width, height)
  return tiles
}

export interface TreemapLeaf {
  key: string
  value: number
  item?: DnaItem
}

export interface TreemapGroup {
  key: string
  value: number
  color: string
  children: TreemapLeaf[]
}

/** Subdivide each official estimate by the fold's item ratios; retain unserved content as a visible remainder. */
export function treemapGroups(parts: PartsPart[], items: DnaItem[], totals: Record<string, number>): TreemapGroup[] {
  const byCategory = new Map<string, DnaItem[]>()
  for (const item of items) {
    if (!Number.isFinite(item.tokens) || item.tokens <= 0) continue
    const group = byCategory.get(item.cat) ?? []
    group.push(item)
    byCategory.set(item.cat, group)
  }
  return parts.filter(p => Number.isFinite(p.raw ?? p.value) && (p.raw ?? p.value) > 0).map((p) => {
    const value = p.raw ?? p.value
    const known = byCategory.get(p.key) ?? []
    const knownTotal = known.reduce((sum, item) => sum + item.tokens, 0)
    const total = Math.max(knownTotal, totals[p.key] ?? value) || value
    const children: TreemapLeaf[] = known.map(item => ({ key: item.key, value: value * item.tokens / total, item }))
    if (total > knownTotal) children.push({ key: 'remainder:' + p.key, value: value * (total - knownTotal) / total })
    return { key: p.key, value, color: p.color, children }
  })
}
