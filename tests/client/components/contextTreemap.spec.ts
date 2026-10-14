import { act, createElement as h } from 'react'
import assert from 'node:assert/strict'
import { afterEach, describe, test, vi } from 'vitest'
import { makeContextTreemap } from '../../../src/client/components/contextTreemap'
import { makeCurrentComposition } from '../../../src/client/components/currentComposition'
import { makeLegend, makeStackedBar } from '../../../src/client/components/stackedBar'
import type { ContextHeaders, ContextTimeline } from '../../../src/shared/types'
import { blur, click, focus, hover, keydown, makeKit, mount, query, queryAll, text, unhover, until } from '../helpers/kit'

const kit = makeKit()
const Treemap = makeContextTreemap(kit)
const parts = [{ key: 'user', value: 60, color: 'green' }, { key: 'tools', value: 30, color: 'gold' },
  { key: 'system', value: 10, color: 'purple' }]
const data: ContextTimeline = {
  ok: true, current: { user: 60, tools: 30, system: 10, inject: 0, assistant: 0, skill: 0, tool: 0, total: 100 },
  systems: [{ seq: 1, time: 0, tokens: 10 }], nodes: [{ seq: 3, cat: 'user', tokens: 60 }],
  requests: [], events: [], archive: [], droppedNodes: 0,
}
const headers: ContextHeaders = { headers: [{ seq: 2, time: 0, tools: [{ name: 'read_file', tokens: 30 }] }] }

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('context treemap', () => {
  test('empty and metadata-only contexts retain their accessible fallback', async () => {
    const m = await mount(h(Treemap, { parts: [] }))
    assert.ok(text(m.container).includes('No context content yet'))
    await m.update(h(Treemap, { parts }))
    await click(query(m.container, '.lc-treemap-leaf'))
    assert.ok(text(query(m.container, '.lc-treemap-detail')).includes('Unexpanded content'))
    assert.equal(queryAll(document, '.lc-treemap-popover').length, 0)
    await m.update(h(Treemap, { parts, data }))
    await click(query(m.container, '.lc-treemap-leaf:not(.lc-treemap-missing)'))
    assert.ok(text(query(document, '.lc-treemap-popover')).includes(kit.t('browser.noContent')))
    await m.unmount()
  })

  test('container resizing preserves area, and mouse and keyboard focus highlight categories', async () => {
    let resize: (entries: { contentRect: { width: number; height: number } }[]) => void = () => {}
    let disconnected = false
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: typeof resize) { resize = cb }
      observe(): void {}
      disconnect(): void { disconnected = true }
    })
    const highlights: (string | null)[] = []
    const m = await mount(h(Treemap, { parts, data, headers, hoverKey: 'user', onHoverKey: k => highlights.push(k) }))
    const group = query(m.container, '.lc-treemap-group')
    assert.ok(group.classList.contains('lc-treemap-on'))
    await act(async () => { resize([{ contentRect: { width: 390, height: 360 } }]) })
    const width = group.style.width
    assert.ok(parseFloat(width) <= 390)
    for (const size of [{ width: 0, height: 360 }, { width: 390, height: 0 }]) {
      await act(async () => { resize([{ contentRect: size }]) })
      assert.equal(group.style.width, width)
    }
    for (const selector of ['.lc-treemap-group-title', '.lc-treemap-leaf']) {
      const target = query(m.container, selector)
      await hover(target)
      await focus(target)
      assert.equal(highlights.at(-1), 'user')
      await blur(target)
      assert.equal(highlights.at(-1), null)
    }
    await unhover(query(m.container, '.lc-treemap-map'))
    const category = query(m.container, '.lc-treemap-categories button')
    await hover(category)
    assert.equal(highlights.at(-1), 'user')
    await unhover(category)
    assert.equal(highlights.at(-1), null)
    await m.unmount()
    assert.equal(disconnected, true)
  })
  test('clicking a category twice restores all groups, from both the tile title and legend', async () => {
    const m = await mount(h(Treemap, { parts, data, headers }))
    assert.equal(queryAll(m.container, '.lc-treemap-group').length, 3)
    await click(query(m.container, '.lc-treemap-group-title'))
    assert.equal(queryAll(m.container, '.lc-treemap-group').length, 1)
    await click(query(m.container, '.lc-treemap-group-title'))
    assert.equal(queryAll(m.container, '.lc-treemap-group').length, 3)
    const category = query(m.container, '.lc-treemap-categories button')
    await click(category)
    assert.equal(queryAll(m.container, '.lc-treemap-group').length, 1)
    await click(category)
    assert.equal(queryAll(m.container, '.lc-treemap-group').length, 3)
    await click(category)
    await click(query(m.container, '.lc-treemap-back'))
    assert.equal(queryAll(m.container, '.lc-treemap-group').length, 3)
    await m.unmount()
  })

  test('hover and focus show usage; click fetches text on demand beside the tile, Escape closes it', async () => {
    const reads: number[] = []
    const open: boolean[] = []
    const m = await mount(h(Treemap, { parts, data, headers, onDetailOpenChange: value => open.push(value), content: {
      fetchContent: async (seq) => { reads.push(seq); return { seq, kind: 'user', content: [{ type: 'text', text: 'Full context text' }] } },
    } }))
    const tile = query(m.container, '.lc-treemap-leaf')
    await hover(tile)
    await focus(tile)
    assert.deepEqual(reads, [])
    assert.ok(text(query(document, '[role="tooltip"]')).includes('60 tokens'))
    await click(tile)
    await until(() => text(document.body).includes('Full context text'), 'full text arrives')
    assert.deepEqual(reads, [3])
    const popup = query(document, '.lc-treemap-popover')
    assert.equal(popup.parentElement, document.body)
    assert.ok(text(popup).includes('Full context text'))
    assert.equal(open.at(-1), true)
    await keydown('Escape')
    assert.equal(queryAll(document, '.lc-treemap-popover').length, 0)
    assert.equal(open.at(-1), false)
    await m.unmount()
  })

  test('tool schemas and system prompts open their own header content and outside click closes', async () => {
    const reads: number[] = []
    const m = await mount(h(Treemap, { parts, data, headers, content: {
      fetchHeader: async (seq) => {
        reads.push(seq)
        return seq === 1 ? { system: 'System instructions', tools: [] }
          : { tools: [{ name: 'read_file', description: 'Read the entire file', schema: { type: 'object', properties: { path: { type: 'string' } } } }] }
      },
    } }))
    const schema = queryAll(m.container, '.lc-treemap-leaf').find(el => el.getAttribute('aria-label')?.startsWith('read_file'))
    assert.ok(schema)
    await click(schema)
    await until(() => text(document.body).includes('Read the entire file'), 'tool schema arrives')
    assert.ok(text(query(document, '.lc-treemap-popover')).includes('path'))
    await click(query(document, '.lc-treemap-popover .lc-modal-close'))
    const system = queryAll(m.container, '.lc-treemap-leaf').find(el => el.getAttribute('aria-label')?.startsWith('System Prompt'))
    assert.ok(system)
    await click(system)
    await until(() => text(document.body).includes('System instructions'), 'system text arrives')
    assert.deepEqual(reads, [2, 1])
    await act(async () => { document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })) })
    assert.equal(queryAll(document, '.lc-treemap-popover').length, 0)
    await m.unmount()
  })

  test('the bar toggle keeps the original legend and reserve surface', async () => {
    const Current = makeCurrentComposition(kit, makeStackedBar(kit), makeLegend(kit))
    const m = await mount(h(Current, { head: { parts, tokens: 100, window: 200, pct: 50 } }))
    const buttons = queryAll(m.container, '.lc-gran-btn')
    await click(buttons[1])
    assert.equal(queryAll(m.container, '.lc-treemap').length, 0)
    assert.equal(queryAll(m.container, '.lc-chip').length, 3)
    assert.equal(queryAll(m.container, '.lc-stacked-free').length, 1)
    await click(buttons[0])
    assert.equal(queryAll(m.container, '.lc-treemap').length, 1)
    await m.unmount()
  })
})
