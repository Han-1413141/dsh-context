import { useState, type ReactElement } from 'react'
import type { ContextHeaders, ContextTimeline } from '../../shared/types'
import type { PartsPart } from '../categories'
import type { Headline } from '../headline'
import type { TreemapContent } from './treemapDetail'
import type { ViewKit } from '../viewkit'
import type { StackedBarProps } from './stackedBar'
import { makeContextTreemap } from './contextTreemap'

type LegendFn = (props: {
  parts: PartsPart[]
  hoverKey?: string | null
  onHoverKey?: (key: string | null) => void
}) => ReactElement

export interface CurrentCompositionProps {
  head: Headline
  subtitle?: string
  hoverKey?: string | null
  onHoverKey?: (key: string | null) => void
  data?: ContextTimeline
  headers?: ContextHeaders | null
  content?: TreemapContent
  onDetailOpenChange?: (open: boolean) => void
}

export function makeCurrentComposition(
  kit: ViewKit,
  StackedBar: (props: StackedBarProps) => ReactElement,
  Legend: LegendFn,
): (props: CurrentCompositionProps) => ReactElement {
  const { t, fmt } = kit
  const ContextTreemap = makeContextTreemap(kit)
  return function CurrentComposition(props: CurrentCompositionProps): ReactElement {
    const head = props.head
    const [treemap, setTreemap] = useState(true)
    return (
      <div className="lc-card" data-lc-current>
        <div className="lc-card-title">
          <span className="lc-card-title-text">{t('overview.title')}</span>
          {props.subtitle !== undefined && props.subtitle !== ''
            ? <span className="lc-card-sub">{props.subtitle}</span>
            : null}
          <span className="lc-gran" role="group" aria-label={t('treemap.view')}>
            <button type="button" className={'lc-gran-btn' + (treemap ? ' lc-gran-on' : '')} aria-pressed={treemap} onClick={() => { setTreemap(true) }}>{t('treemap.title')}</button>
            <button type="button" className={'lc-gran-btn' + (!treemap ? ' lc-gran-on' : '')} aria-pressed={!treemap} onClick={() => { setTreemap(false) }}>{t('treemap.bar')}</button>
          </span>
        </div>
        <div className="lc-overview-num">
          <b>{fmt(head.tokens)}</b>
          <span>
            {head.window
              ? ' / ' + fmt(head.window) + ' tokens'
              : ' ' + t('overview.estimate')}
          </span>
          {head.pct !== null ? (
            <span className="lc-overview-pct">
              {/* One decimal: the card's reading of the kernel's occupancy percent (headline.ts). */}
              <b>{`${head.pct.toFixed(1)}%`}</b>
              {t('overview.used')}
            </span>
          ) : null}
        </div>
        <StackedBar
          parts={head.parts}
          height={16}
          max={head.window}
          hoverKey={props.hoverKey}
          onHoverKey={props.onHoverKey}
          reserve={head.reserve}
        />
        {treemap
          ? <ContextTreemap parts={head.parts} data={props.data} headers={props.headers}
            hoverKey={props.hoverKey} onHoverKey={props.onHoverKey}
            content={props.content} onDetailOpenChange={props.onDetailOpenChange} />
          : <Legend parts={head.parts} hoverKey={props.hoverKey} onHoverKey={props.onHoverKey} />}
      </div>
    )
  }
}
