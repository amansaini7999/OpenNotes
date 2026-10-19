import { describe, expect, it } from 'vitest'
import { createNotebook, createPage, insertPagesAfter } from './model'

describe('in-notebook page insertion', () => {
  it('inserts after the current page, preserving existing pages and ink references', () => {
    const notebook = createNotebook('Research')
    const next = createPage()
    notebook.pages.push(next)
    const snapshot = structuredClone(notebook)
    const image = createPage('plain'), pdf = createPage('plain')
    const result = insertPagesAfter(notebook, notebook.pages[0].id, [image, pdf])
    expect(result.pages.map(page => page.id)).toEqual([notebook.pages[0].id, image.id, pdf.id, next.id])
    expect(result.pages[0]).toBe(notebook.pages[0])
    expect(result.pages[3]).toBe(next)
    expect(notebook).toEqual(snapshot)
  })
  it('appends after the last page without creating another notebook', () => {
    const notebook = createNotebook('Notes')
    const page = createPage()
    const result = insertPagesAfter(notebook, notebook.pages[0].id, [page])
    expect(result.id).toBe(notebook.id)
    expect(result.title).toBe('Notes')
    expect(result.pages.at(-1)).toBe(page)
  })
  it('rejects missing anchors, empty inserts and duplicate ids explicitly', () => {
    const notebook = createNotebook('Notes')
    expect(() => insertPagesAfter(notebook, 'missing', [createPage()])).toThrow('no longer exists')
    expect(() => insertPagesAfter(notebook, notebook.pages[0].id, [])).toThrow('did not contain')
    expect(() => insertPagesAfter(notebook, notebook.pages[0].id, [notebook.pages[0]])).toThrow('Duplicate')
    const page = createPage()
    expect(() => insertPagesAfter(notebook, notebook.pages[0].id, [page, page])).toThrow('Duplicate')
  })
  it('accepts exactly 2,000 pages but rejects 2,001 without mutating the source', () => {
    const notebook = createNotebook('Capacity')
    notebook.pages = Array.from({ length: 1999 }, () => createPage())
    expect(insertPagesAfter(notebook, notebook.pages[0].id, [createPage()]).pages).toHaveLength(2000)
    expect(() => insertPagesAfter(notebook, notebook.pages[0].id, [createPage(), createPage()])).toThrow('2,000 pages')
    expect(notebook.pages).toHaveLength(1999)
  })
})
