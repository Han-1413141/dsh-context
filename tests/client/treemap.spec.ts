import assert from 'node:assert/strict'
import { describe, test } from 'vitest'
import { layoutTreemap, treemapGroups } from '../../src/client/treemap'
import type { DnaItem } from '../../src/client/dna'

describe('treemap accounting', () => {
  test('area is proportional at wide and narrow sizes, without overlaps or mutation', () => {
    const items = [6, 24, 2, 15, 9, 1, 3, 40].map((value, key) => ({ value, key }))
    for (const [width, height] of [[900, 300], [300, 900]]) {
      const tiles = layoutTreemap(items, width, height)
      assert.equal(tiles.length, items.length)
      for (const [i, tile] of tiles.entries()) {
        assert.ok(Math.abs(tile.width * tile.height / (width * height) - tile.item.value / 100) < 1e-12)
        assert.ok(tile.x >= 0 && tile.y >= 0 && tile.x + tile.width <= width + 1e-9 && tile.y + tile.height <= height + 1e-9)
        for (const other of tiles.slice(i + 1)) {
          const overlapX = Math.min(tile.x + tile.width, other.x + other.width) - Math.max(tile.x, other.x)
          const overlapY = Math.min(tile.y + tile.height, other.y + other.height) - Math.max(tile.y, other.y)
          assert.ok(overlapX < 1e-9 || overlapY < 1e-9)
        }
      }
    }
    assert.deepEqual(items.map(x => x.value), [6, 24, 2, 15, 9, 1, 3, 40])
  })

  test('empty, invalid and zero weights do not occupy space; tiny weights retain their actual area', () => {
    assert.deepEqual(layoutTreemap([], 100, 100), [])
    assert.deepEqual(layoutTreemap([{ value: 1 }], 0, 100), [])
    assert.deepEqual(layoutTreemap([{ value: 1 }], 100, 0), [])
    const tiles = layoutTreemap([0, -1, NaN, Infinity, 10000, 1].map(value => ({ value })), 100, 100)
    assert.equal(tiles.length, 2)
    assert.ok(Math.abs(tiles[1].width * tiles[1].height - 10000 / 10001) < 1e-9)
    assert.deepEqual(layoutTreemap([1, 1, 1, 1].map(value => ({ value })), 100, 100)
      .map(({ x, y, width, height }) => [x, y, width, height]),
    [[0, 0, 50, 50], [0, 50, 50, 50], [50, 0, 50, 50], [50, 50, 50, 50]])
  })

  test('official estimates retain unserved content instead of inflating loaded messages', () => {
    const items: DnaItem[] = [{ key: 'n1', cat: 'user', tokens: 20, node: { seq: 1, cat: 'user', tokens: 20 } },
      { key: 'n2', cat: 'user', tokens: 30, node: { seq: 2, cat: 'user', tokens: 30 } },
      { key: 'zero', cat: 'tools', tokens: 0 }]
    const [group] = treemapGroups([{ key: 'user', value: 150, raw: 100, color: 'green' }], items, { user: 80 })
    assert.equal(group.value, 100)
    assert.deepEqual(group.children.map(x => x.value), [25, 37.5, 37.5])
    assert.equal(group.children[2].item, undefined)
    assert.deepEqual(treemapGroups([{ key: 'tools', value: 0, color: 'gold' }], [], {}), [])
    const [missing] = treemapGroups([{ key: 'tools', value: 40, color: 'gold' }], [], {})
    assert.deepEqual(missing.children, [{ key: 'remainder:tools', value: 40 }])
    assert.deepEqual(treemapGroups([{ key: 'tools', value: 40, color: 'gold' }], [], { tools: 0 })[0], missing)
    const [scaled] = treemapGroups([{ key: 'user', value: 100, color: 'green' }], items, { user: 10 })
    assert.deepEqual(scaled.children.map(x => x.value), [40, 60])
  })
})
