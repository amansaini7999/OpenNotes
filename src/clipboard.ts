const imageTypes = ['image/png', 'image/jpeg', 'image/webp']

export function clipboardFormats(data: DataTransfer): string {
  const formats = [...data.types, ...Array.from(data.files, file => file.type)]
  return [...new Set(formats.filter(type => /^(?:image\/[a-z0-9.+-]+|text\/(?:plain|html|uri-list))$/i.test(type)))].slice(0, 8).join(', ') || 'none exposed'
}

function imageFile(blob: Blob): File {
  const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1]
  return new File([blob], `pasted-image.${extension}`, { type: blob.type })
}

export function embeddedClipboardImages(html: string): File[] {
  if (html.length > 30_000_000) throw new Error('The copied image is too large. Use Choose image for files up to 20 MB.')
  const template = document.createElement('template')
  template.innerHTML = html
  const files: File[] = []
  for (const image of template.content.querySelectorAll('img')) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(image.getAttribute('src') ?? '')
    if (!match) continue
    const bytes = Uint8Array.from(atob(match[2].replace(/\s/g, '')), character => character.charCodeAt(0))
    files.push(imageFile(new Blob([bytes], { type: match[1].toLowerCase() })))
  }
  return files
}

export function pastedImages(data: DataTransfer): File[] {
  const files = Array.from(data.files)
  if (!files.length) {
    for (const item of Array.from(data.items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
  }
  const images = files.flatMap(file => {
    const extension = /\.(png|jpe?g|webp)$/i.exec(file.name)?.[1].toLowerCase()
    const type = file.type || (extension ? extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}` : '')
    return imageTypes.includes(type) ? [imageFile(new Blob([file], { type }))] : []
  })
  if (images.length) return images
  if (files.some(file => file.type.startsWith('image/'))) throw new Error('This copied image format is not supported. Copy a screenshot or choose a PNG, JPEG or WebP file.')
  return embeddedClipboardImages(data.getData('text/html'))
}

export async function readClipboardImages(items: ClipboardItem[]): Promise<File[]> {
  const files: File[] = []
  for (const item of items) {
    const type = item.types.find(type => imageTypes.includes(type))
    if (type) files.push(imageFile(new Blob([await item.getType(type)], { type })))
    else if (item.types.includes('text/html')) files.push(...embeddedClipboardImages(await (await item.getType('text/html')).text()))
  }
  return files
}
