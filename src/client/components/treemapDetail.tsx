import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { ContextHeaders, ContextTimeline } from '../../shared/types'
import { assemble } from '../assemble'
import type { DnaItem } from '../dna'
import type { ViewKit } from '../viewkit'
import type { ContextBrowserProps } from './browser'
import { makeAttachmentSection } from './attachments'
import { NodeContent } from './browserNodes'
import { TextSection, ToolSchema } from './browserToolCard'
import { useEscapeClose } from './escapeClose'
import { fetchMissNote, useFetchOnMiss } from './fetchOnMiss'
import { makeRichText } from './richText'

export type TreemapContent = Pick<ContextBrowserProps, 'convNodes' | 'fetchContent' | 'fetchHeader' | 'loadImage' | 'openAttachment'>

interface TreemapDetailProps extends TreemapContent {
  item: DnaItem
  data: ContextTimeline
  headers: ContextHeaders | null
  anchor: HTMLElement
  label: string
  figure: string
  onClose: () => void
}

export function makeTreemapDetail(kit: ViewKit): (props: TreemapDetailProps) => ReactElement {
  const { t, catLabel } = kit
  const rich = makeRichText(kit)
  const AttachmentSection = makeAttachmentSection(kit)
  const lines = (n: number): string => t(n === 1 ? 'block.line' : 'block.lines', { n })

  function Content(props: TreemapDetailProps): ReactElement {
    const node = 'node' in props.item ? props.item.node : undefined
    const joined = props.convNodes?.find(n => n.seq === node?.seq)
    const miss = useFetchOnMiss(node !== undefined && joined === undefined ? node.seq : null,
      props.fetchContent, 'dsh-context: treemap content read failed')
    const view = assemble(props.data, props.headers, null)
    const headerSeq = props.item.cat === 'system' ? view.system?.seq : props.item.cat === 'tools' ? view.header?.seq : undefined
    const epoch = useFetchOnMiss(headerSeq ?? null, props.fetchHeader, 'dsh-context: treemap header read failed')
    const header = headerSeq === undefined ? undefined : epoch.values.get(headerSeq)
    const headerNote = fetchMissNote(t, props.fetchHeader, epoch.state, epoch.retry, 'browser.headerMetaOnly')
    if (node !== undefined) {
      return <NodeContent node={node} conv={joined ?? miss.values.get(node.seq)} rich={rich}
        att={{ Section: AttachmentSection, load: props.loadImage, open: props.openAttachment }}
        hint={fetchMissNote(t, props.fetchContent, miss.state, miss.retry, 'browser.noContent')}
        labels={{
          thinking: t('block.thinking'),
          answer: t('block.answer'),
          content: t('block.content'),
          result: t('block.result'),
          summary: t('block.summary'),
          other: t('attach.other'),
          lines,
          callState: (err, exit) => err
            ? t('call.fail') + (exit !== null ? ' · ' + t('call.exit', { n: exit }) : '')
            : t('call.ok'),
        }} />
    }
    if (header === undefined) return <div className="lc-br-note">{headerNote}</div>
    if (props.item.cat === 'system') {
      return header.system === undefined
        ? <div className="lc-br-note">{t('browser.noSystem')}</div>
        : <TextSection label={catLabel('system')} text={header.system} rich={rich} lines={lines} />
    }
    const tool = header.tools.find(tool => 'tool:' + tool.name === props.item.key)
    return tool === undefined ? <div className="lc-br-note">{t('browser.notInLog')}</div>
      : <ToolSchema description={tool.description} schema={tool.schema} rich={rich} lines={lines}
        labels={{ desc: t('tool.desc'),
          title: t('tool.params'),
          empty: t('tool.paramsEmpty'),
          show: t('tool.jsonToggle'),
          hide: t('tool.jsonHide') }} />
  }

  return function TreemapDetail(props: TreemapDetailProps): ReactElement {
    const ref = useRef<HTMLDivElement | null>(null)
    const [position, setPosition] = useState({ left: 12, top: 12 })
    useEscapeClose(true, props.onClose)
    useLayoutEffect(() => {
      const panel = ref.current
      /* v8 ignore next 1 -- the dialog always renders, and React attaches its ref before layout effects. */
      if (panel === null) return undefined
      const place = (): void => {
        const rect = props.anchor.getBoundingClientRect()
        const width = panel.offsetWidth
        const height = panel.offsetHeight
        const right = rect.right + 8
        const left = right + width <= window.innerWidth - 12 ? right
          : rect.left - width - 8 >= 12 ? rect.left - width - 8
            : Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))
        const side = right + width <= window.innerWidth - 12 || rect.left - width - 8 >= 12
        const top = side ? rect.top : rect.bottom + 8
        setPosition({ left, top: Math.max(12, Math.min(top, window.innerHeight - height - 12)) })
      }
      place()
      panel.focus()
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
      observer?.observe(panel)
      window.addEventListener('resize', place)
      return () => { observer?.disconnect(); window.removeEventListener('resize', place) }
    }, [props.anchor])
    useEffect(() => {
      const outside = (ev: Event): void => {
        if (ev.target instanceof Node && (ref.current?.contains(ev.target) || props.anchor.contains(ev.target))) return
        props.onClose()
      }
      document.addEventListener('pointerdown', outside, true)
      window.addEventListener('scroll', outside, true)
      return () => {
        document.removeEventListener('pointerdown', outside, true)
        window.removeEventListener('scroll', outside, true)
      }
    }, [props.anchor, props.onClose])
    return createPortal(
      <div ref={ref} className="lc-treemap-popover" role="dialog" aria-label={props.label} tabIndex={-1}
        style={position} onClick={(ev) => { ev.stopPropagation() }}>
        <div className="lc-treemap-popover-head">
          <div><b>{props.label}</b><span>{props.figure}</span></div>
          <button type="button" className="lc-modal-close" onClick={props.onClose} aria-label={t('cmd.close')}>×</button>
        </div>
        <div className="lc-treemap-popover-body"><Content {...props} /></div>
      </div>, document.body,
    )
  }
}
