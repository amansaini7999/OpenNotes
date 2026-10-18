import { cpSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const target = join(root, 'public', 'pdfjs')
mkdirSync(target, { recursive: true })
for (const folder of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(join(root, 'node_modules', 'pdfjs-dist', folder), join(target, folder), { recursive: true })
}
cpSync(join(root, 'node_modules', 'pdfjs-dist', 'LICENSE'), join(target, 'LICENSE'))
