import { ContentChapter } from './content'
import uslug from 'uslug'
import { remove as removeDiacritics } from 'diacritics'
import path from 'path'

export const makeChapterPath = (
  content: ContentChapter,
  options: { uuid: string; index: number }
): { href: string; filePath: string } => {
  if (!content.filename) {
    const titleSlug = uslug(removeDiacritics(content.title || 'no title'))
    const href = `${options.index}_${titleSlug}.xhtml`
    const filePath = path.resolve(
      options.uuid,
      `./OEBPS/${options.index}_${titleSlug}.xhtml`
    )
    return {
      href,
      filePath,
    }
  } else {
    const href = content.filename.match(/\.xhtml$/)
      ? content.filename
      : `${content.filename}.xhtml`
    if (content.filename.match(/\.xhtml$/)) {
      return {
        href,
        filePath: path.resolve(options.uuid, `./OEBPS/${content.filename}`),
      }
    } else {
      return {
        href,
        filePath: path.resolve(
          options.uuid,
          `./OEBPS/${content.filename}.xhtml`
        ),
      }
    }
  }
}
