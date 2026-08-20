'use strict'

const fs = require('fs')
const path = require('path')

const DC = 'http://purl.org/dc/elements/1.1/'
const EXIF = 'http://ns.adobe.com/exif/1.0/'

const SUPPORTED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.svg', '.tiff', '.tif',
  '.gif', '.pdf', '.jp2', '.webp', '.heic', '.avif'
])

const normalizePath = process.platform === 'darwin'
  ? (p) => p.replace(/:/g, '\\/')
  : (p) => p

function walk(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walk(fullPath))
    } else if (entry.isFile()) {
      if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        results.push(fullPath)
      }
    }
  }
  return results
}

class ListsPlugin {

  constructor(options, context) {
    this.options = Object.assign({}, ListsPlugin.defaults, options)
    this.context = context
  }

  async import(payload) {
    const result = await this.context.dialog.open({
      properties: ['openDirectory']
    })

    if (!result || !result.length) return

    const dir = result[0]
    const files = walk(dir)

    const graph = await Promise.all(files.map(async (filePath) => {
      const relDir = path.relative(dir, path.dirname(filePath))
      const list = relDir ? [normalizePath(relDir)] : [normalizePath(path.basename(dir))]
      const title = path.basename(filePath, path.extname(filePath))

      const sharp = await this.context.sharp.open(filePath)
      const metadata = await sharp.metadata()

      let date
      try {
        const xif = metadata?.exif
        date = xif?.[`${EXIF}DateTimeOriginal`]?.text ||
          xif?.[`${EXIF}DateTime`]?.text ||
          fs.statSync(filePath).mtime.toISOString()
      } catch (e) {
        date = new Date().toISOString()
      }

      if (path.extname(filePath).toLowerCase() === '.pdf') {
        const { pages = 1 } = metadata
        const photo = Array.from({ length: pages }, (_, page) => ({
          [`${DC}date`]: date,
          [`${DC}title`]: title,
          path: filePath,
          mimetype: 'application/pdf',
          // density: this.options.density || 72,
          page
        }))
        return { photo, list, [`${DC}title`]: title }
      }

      return {
        photo: [{ path: filePath, [`${DC}date`]: date, [`${DC}title`]: title }],
        list,
        [`${DC}title`]: title
      }
    }))
    payload.data = [{ '@graph': graph }]
  }
}

ListsPlugin.defaults = {}

module.exports = ListsPlugin
