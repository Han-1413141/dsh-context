import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import type { ContextHeaders, ContextTimeline } from '../../shared/types'
import { assemble } from '../assemble'
import type { PartsPart } from '../categories'
import { dnaBaseLabel, dnaOf } from '../dna'
import { layoutTreemap, treemapGroups, type Tile, type TreemapLeaf } from '../treemap'
import type { ViewKit } from '../viewkit'
import { makeTreemapDetail, type TreemapContent } from './treemapDetail'
import { useHoverTip } from './hoverTip'

export interface ContextTreemapProps {
  parts: PartsPart[]
  data?: ContextTimeline
  headers?: ContextHeaders | null
  hoverKey?: string | null
  onHoverKey?: (key: string | null) => void
  content?: TreemapContent
  onDetailOpenChange?: (open: boolean) => void
}

function position<T>(tile: Tile<T>): CSSProperties {
  return { left: tile.x, top: tile.y, width: tile.width, height: tile.height }
}

export function makeContextTreemap(kit: ViewKit): (props: ContextTreemapProps) => ReactElement {
  const { t, fmt, fmtShare, catLabel } = kit
  const TreemapDetail = makeTreemapDetail(kit)
  function leafLabel(leaf: TreemapLeaf): string {
    if (leaf.item === undefined) return t('treemap.unavailable')
    const label = dnaBaseLabel(leaf.item, t, catLabel)
    return 'node' in leaf.item ? `${label} · #${leaf.item.node.seq}` : label
  }
  return function ContextTreemap(props: ContextTreemapProps): ReactElement {
    const [zoom, setZoom] = useState<string | null>(null)
    const [picked, setPicked] = useState<string | null>(null)
    const anchor = useRef<HTMLElement | null>(null)
    const closeDetail = useCallback(() => { setPicked(null) }, [])
    const { zoneProps, bubble } = useHoverTip()
    const [size, setSize] = useState({ width: 800, height: 300 })
    const mapRef = useRef<HTMLDivElement | null>(null)
    const groups = useMemo(() => {
      const items = props.data === undefined ? [] : dnaOf(assemble(props.data, props.headers ?? null, null))
      return treemapGroups(props.parts, items, props.data?.current ?? {})
    }, [props.parts, props.data, props.headers])
    const active = groups.find(g => g.key === zoom)
    const total = groups.reduce((sum, g) => sum + g.value, 0)
    const tiles = useMemo(() => layoutTreemap(active === undefined ? groups : [active], size.width, size.height)
      .map(tile => ({ ...tile, leaves: layoutTreemap(tile.item.children, Math.max(0, tile.width - 4), Math.max(0, tile.height - 30)) })),
    [groups, active, size])
    const selected = picked === null ? undefined
      : groups.flatMap(g => g.children.map(leaf => ({ group: g, leaf }))).find(entry => entry.leaf.key === picked)
    const detailOpen = selected?.leaf.item !== undefined && props.data !== undefined && anchor.current !== null
    const onDetailOpenChange = props.onDetailOpenChange
    useEffect(() => {
      onDetailOpenChange?.(detailOpen)
      return () => { onDetailOpenChange?.(false) }
    }, [detailOpen, onDetailOpenChange])

    useLayoutEffect(() => {
      const node = mapRef.current
      if (node === null || typeof ResizeObserver === 'undefined') return undefined
      const observer = new ResizeObserver((entries) => {
        const { width, height } = entries[0].contentRect
        if (width > 0 && height > 0) setSize({ width, height })
      })
      observer.observe(node)
      return () => { observer.disconnect() }
    }, [])

    function highlight(key: string | null): void {
      props.onHoverKey?.(key)
    }
    function zoomTo(key: string | null): void {
      setZoom(current => current === key ? null : key)
      setPicked(null)
      highlight(null)
    }
    const dim = groups.some(g => g.key === props.hoverKey)
    return (
      <section className="lc-treemap" aria-label={t('treemap.title')} {...zoneProps}>
        <div className="lc-treemap-toolbar">
          <button type="button" className="lc-treemap-back" disabled={active === undefined} onClick={() => { zoomTo(null) }}>
            {active === undefined ? t('treemap.title') : '← ' + t('treemap.all')}
          </button>
          {active !== undefined ? <b>{catLabel(active.key)}</b> : null}
          <span>{t('treemap.hint')}</span>
        </div>
        <div ref={mapRef} className={'lc-treemap-map' + (dim ? ' lc-treemap-dim' : '')} onMouseLeave={() => { highlight(null) }}>
          {tiles.length === 0 ? <div className="lc-empty">{t('treemap.empty')}</div> : null}
          {tiles.map((tile) => {
            const group = tile.item
            const label = catLabel(group.key)
            const figure = `≈${fmt(group.value)} tokens · ${fmtShare(group.value, total)} ${t('overview.ofUsed')}`
            return (
              <div key={group.key} className={'lc-treemap-group' + (props.hoverKey === group.key ? ' lc-treemap-on' : '')}
                style={{ ...position(tile), '--lc-tile-color': group.color } as CSSProperties}>
                <button type="button" className="lc-treemap-group-title" title={`${label}\n${figure}\n${t('treemap.zoom')}`}
                  aria-label={`${label}: ${figure}. ${t('treemap.zoom')}`}
                  onMouseEnter={() => { highlight(group.key) }} onFocus={() => { highlight(group.key) }}
                  onBlur={() => { highlight(null) }} onClick={() => { zoomTo(group.key) }}>
                  <b>{label}</b><span>{fmtShare(group.value, total)}</span>
                </button>
                <div className="lc-treemap-children">
                  {tile.leaves.map((leafTile, index) => {
                    const leaf = leafTile.item
                    const name = leafLabel(leaf)
                    const detail = `${name}\n≈${fmt(leaf.value)} tokens · ${fmtShare(leaf.value, group.value)} ${t('treemap.ofCategory')}`
                    return (
                      <button key={leaf.key} type="button" className={'lc-treemap-leaf' + (picked === leaf.key ? ' lc-treemap-picked' : '') + (leaf.item === undefined ? ' lc-treemap-missing' : '')}
                        style={{ ...position(leafTile), '--lc-tile-tone': `${46 + index % 5 * 7}%` } as CSSProperties}
                        data-lc-tip={detail} aria-label={detail} aria-pressed={picked === leaf.key}
                        onMouseEnter={() => { highlight(group.key) }} onFocus={() => { highlight(group.key) }}
                        onBlur={() => { highlight(null) }} onClick={(ev) => {
                          anchor.current = ev.currentTarget
                          setPicked(leaf.key)
                          highlight(null)
                        }}>
                        <span className="lc-treemap-leaf-label">{name}</span>
                        <span className="lc-treemap-leaf-value">≈{fmt(leaf.value)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <div className="lc-treemap-categories" aria-label={t('treemap.zoom')}>
          {groups.map(group => (
            <button type="button" key={group.key} aria-pressed={active?.key === group.key}
              onClick={() => { zoomTo(group.key) }} onMouseEnter={() => { highlight(group.key) }} onMouseLeave={() => { highlight(null) }}>
              <i style={{ background: group.color }} />{catLabel(group.key)}<span>≈{fmt(group.value)}</span>
            </button>
          ))}
        </div>
        <div className="lc-treemap-detail" aria-live="polite">
          {selected === undefined ? t('treemap.note') : (
            <><b>{catLabel(selected.group.key)} / {leafLabel(selected.leaf)}</b><span>≈{fmt(selected.leaf.value)} tokens · {fmtShare(selected.leaf.value, selected.group.value)} {t('treemap.ofCategory')}</span></>
          )}
        </div>
        {detailOpen && selected.leaf.item !== undefined && props.data !== undefined && anchor.current !== null
          ? <TreemapDetail key={selected.leaf.key} item={selected.leaf.item} data={props.data} headers={props.headers ?? null}
            anchor={anchor.current} label={catLabel(selected.group.key) + ' / ' + leafLabel(selected.leaf)}
            figure={`≈${fmt(selected.leaf.value)} tokens · ${fmtShare(selected.leaf.value, selected.group.value)} ${t('treemap.ofCategory')}`}
            onClose={closeDetail} {...props.content} />
          : bubble}
      </section>
    )
  }
}
