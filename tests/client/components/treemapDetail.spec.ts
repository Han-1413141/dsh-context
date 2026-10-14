import assert from 'node:assert/strict'
import { act, createElement as h } from 'react'
import { afterEach, describe, test, vi } from 'vitest'
import { makeTreemapDetail } from '../../../src/client/components/treemapDetail'
import type { ContextTimeline, SurfaceNode } from '../../../src/shared/types'
import { click, makeKit, mount, query, text } from '../helpers/kit'

const kit = makeKit()
const Detail = makeTreemapDetail(kit)
const data: ContextTimeline = {
  ok: true, current: { system: 10, tools: 30, user: 60, inject: 0, skill: 0, assistant: 0, tool: 0, total: 100 },
  systems: [{ seq: 1, time: 0, tokens: 10 }], nodes: [], requests: [], events: [], archive: [], droppedNodes: 0,
}
const base = { data, headers: null, label: 'Selected content', figure: '10 tokens', onClose: () => {} }

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('treemap detail', () => {
  test('reuses loaded messages and displays successful and failed tool results', async () => {
    const fetchContent = vi.fn(async () => null)
    const anchor = document.createElement('button')
    for (const [failed, exit, expected] of [[false, 0, 'OK'], [true, 2, kit.t('call.exit', { n: 2 })], [true, undefined, 'Failed']] as const) {
      const node: SurfaceNode = { seq: 3, cat: 'tool', tokens: 10, err: failed }
      const m = await mount(h(Detail, { ...base, anchor, item: { key: 'n3', cat: 'tool', tokens: 10, node },
        fetchContent, convNodes: [{ seq: 2, kind: 'user' }, {
          seq: 3, kind: 'tool-result', call: { name: 'bash', argsRaw: '{}' },
          content: [{ type: 'text', text: 'First line\n' + (exit ? `[exit code: ${exit}]` : 'Second line') }],
        }],
      }))
      const popup = query(document, '.lc-treemap-popover')
      assert.ok(text(popup).includes(expected), text(popup))
      assert.ok(text(popup).includes('2 lines'))
      assert.equal(fetchContent.mock.calls.length, 0)
      await m.unmount()
    }
  })

  test('missing header epochs and missing system or tool content show a useful explanation', async () => {
    const anchor = document.createElement('button')
    for (const cat of ['system', 'tools'] as const) {
      const item = { key: cat === 'system' ? 'sys' : 'tool:missing', cat, tokens: 10 }
      const m = await mount(h(Detail, { ...base, anchor, item, data: { ...data, systems: [] }, convNodes: [{ seq: 5, kind: 'user' }] }))
      assert.ok(text(query(document, '.lc-treemap-popover')).includes(kit.t('browser.headerMetaOnly')))
      await m.unmount()
      const loaded = await mount(h(Detail, { ...base, anchor, item,
        headers: { headers: [{ seq: 2, time: 0, tools: [] }] },
        fetchHeader: async () => ({ tools: [{ name: 'other', schema: {} }] }),
      }))
      assert.ok(text(query(document, '.lc-treemap-popover')).includes(kit.t(cat === 'system' ? 'browser.noSystem' : 'browser.notInLog')))
      await loaded.unmount()
    }
  })

  test('positions beside the tile when space permits, otherwise stays inside a narrow viewport', async () => {
    const anchor = document.createElement('button')
    document.body.appendChild(anchor)
    let box = { left: 20, top: 20, right: 120, bottom: 70 }
    vi.spyOn(anchor, 'getBoundingClientRect').mockImplementation(() => box as DOMRect)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200)
    vi.stubGlobal('innerWidth', 1000)
    vi.stubGlobal('innerHeight', 700)
    let resize = () => {}
    let disconnected = false
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: () => void) { resize = cb }
      observe(): void {}
      disconnect(): void { disconnected = true }
    })
    let closed = 0
    const m = await mount(h(Detail, { ...base, anchor, item: { key: 'sys', cat: 'system', tokens: 10 },
      onClose: () => { closed++ },
    }))
    const popup = query(document, '.lc-treemap-popover')
    assert.equal(popup.style.left, '128px')
    assert.equal(popup.style.top, '20px')
    box = { left: 800, top: 600, right: 900, bottom: 650 }
    await act(async () => { resize() })
    assert.equal(popup.style.left, '492px')
    assert.equal(popup.style.top, '488px')
    vi.stubGlobal('innerWidth', 390)
    box = { left: 100, top: 20, right: 200, bottom: 70 }
    await act(async () => { window.dispatchEvent(new Event('resize')) })
    assert.equal(popup.style.left, '78px')
    assert.equal(popup.style.top, '78px')
    await act(async () => {
      popup.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      popup.dispatchEvent(new Event('scroll'))
      anchor.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    })
    await click(popup)
    assert.equal(closed, 0)
    await act(async () => { window.dispatchEvent(new Event('scroll')) })
    assert.equal(closed, 1)
    await m.unmount()
    assert.equal(disconnected, true)
    anchor.remove()
  })
})
