'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ListsPlugin = require('../src/plugin')

const DC_TITLE = 'http://purl.org/dc/elements/1.1/title'

function mockContext(metadata = {}) {
  return {
    sharp: {
      open: async () => ({
        metadata: async () => metadata
      })
    }
  }
}

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tropy-plugin-lists-'))
}

async function importDir(dir, metadata) {
  const context = mockContext(metadata)
  context.dialog = { open: async () => [dir] }
  const plugin = new ListsPlugin({}, context)
  const payload = {}

  await plugin.import(payload)

  return payload.data ? payload.data[0]['@graph'] : undefined
}

describe('ListsPlugin', () => {
  it('exists', () => {
    assert.equal(typeof ListsPlugin, 'function')
  })

  it('responds to the import hook', () => {
    assert.equal(typeof (new ListsPlugin({}, {})).import, 'function')
  })

  it('does nothing when no directory is selected', async () => {
    const context = mockContext()
    context.dialog = { open: async () => undefined }
    const plugin = new ListsPlugin({}, context)
    const payload = {}

    await plugin.import(payload)

    assert.equal(payload.data, undefined)
  })

  describe('with a directory tree', () => {
    let dir

    before(() => {
      dir = mkTmpDir()
      fs.writeFileSync(path.join(dir, 'root.jpg'), '')
      fs.mkdirSync(path.join(dir, 'Nested'))
      fs.writeFileSync(path.join(dir, 'Nested', 'photo.jpg'), '')
      fs.writeFileSync(path.join(dir, 'Nested', 'notes.txt'), '')
    })

    after(() => {
      fs.rmSync(dir, { recursive: true, force: true })
    })

    it('lists files at the root under the directory name', async () => {
      const graph = await importDir(dir)
      const item = graph.find((i) => i[DC_TITLE] === 'root')

      assert.deepEqual(item.list, [path.basename(dir)])
    })

    it('lists nested files under their relative directory path', async () => {
      const graph = await importDir(dir)
      const item = graph.find((i) => i[DC_TITLE] === 'photo')

      assert.deepEqual(item.list, ['Nested'])
    })

    it('ignores unsupported file extensions', async () => {
      const graph = await importDir(dir)

      assert.ok(!graph.some((i) => i[DC_TITLE] === 'notes'))
    })
  })

  it('expands a multi-page pdf into one photo entry per page', async () => {
    const dir = mkTmpDir()
    fs.writeFileSync(path.join(dir, 'document.pdf'), '')

    const graph = await importDir(dir, { pages: 3 })
    const [item] = graph

    assert.equal(item.photo.length, 3)
    assert.deepEqual(item.photo.map((p) => p.page), [0, 1, 2])
    assert.ok(item.photo.every((p) => p.mimetype === 'application/pdf'))

    fs.rmSync(dir, { recursive: true, force: true })
  })

  describe('paths containing colons', () => {
    let dir

    before(() => {
      dir = mkTmpDir()
      fs.mkdirSync(path.join(dir, 'Folder: With Colon'))
      fs.writeFileSync(path.join(dir, 'Folder: With Colon', 'scan.jpg'), '')
    })

    after(() => {
      fs.rmSync(dir, { recursive: true, force: true })
    })

    it('escapes colons in the list path on macOS, keeps them elsewhere', async () => {
      const graph = await importDir(dir)
      const [item] = graph
      const expected = process.platform === 'darwin'
        ? 'Folder\\/ With Colon'
        : 'Folder: With Colon'

      assert.deepEqual(item.list, [expected])
    })
  })
})
