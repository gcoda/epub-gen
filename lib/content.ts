import mime from 'mime'
import path from 'path'
import cheerio from 'cheerio'
import { makeChapterPath } from './contentPath'
import makeUuid from './uuid'
export type ChapterImage = {
  id: string
  url: string
  mediaType: string
  extension: string
  dir: string
}

type ContentOptions = {
  uuid: string
  version?: number
  defaultSrc?: string
  content: ContentChapter[]
}

export default ({
  uuid,
  version,
  content: chapters,
  defaultSrc = '',
}: ContentOptions) => {
  const images: ChapterImage[] = []
  const content: ProcessedChapter[] = chapters.map((content, index) => {
    const { filePath, href } = makeChapterPath(content, { uuid, index })
    const id = `item_${index}`
    const dir = path.dirname(filePath)
    const excludeFromToc = !!content.excludeFromToc
    const beforeToc = !!content.beforeToc

    const author =
      typeof content.author === 'string'
        ? [content.author]
        : Array.isArray(content.author)
        ? content.author
        : []

    // prettier-ignore
    const allowedAttributes = [ 'content', 'alt', 'id', 'title', 'src', 'href', 'about', 'accesskey', 'aria-activedescendant', 'aria-atomic', 'aria-autocomplete', 'aria-busy', 'aria-checked', 'aria-controls', 'aria-describedat', 'aria-describedby', 'aria-disabled', 'aria-dropeffect', 'aria-expanded', 'aria-flowto', 'aria-grabbed', 'aria-haspopup', 'aria-hidden', 'aria-invalid', 'aria-label', 'aria-labelledby', 'aria-level', 'aria-live', 'aria-multiline', 'aria-multiselectable', 'aria-orientation', 'aria-owns', 'aria-posinset', 'aria-pressed', 'aria-readonly', 'aria-relevant', 'aria-required', 'aria-selected', 'aria-setsize', 'aria-sort', 'aria-valuemax', 'aria-valuemin', 'aria-valuenow', 'aria-valuetext', 'class', 'content', 'contenteditable', 'contextmenu', 'datatype', 'dir', 'draggable', 'dropzone', 'hidden', 'hreflang', 'id', 'inlist', 'itemid', 'itemref', 'itemscope', 'itemtype', 'lang', 'media', 'ns1:type', 'ns2:alphabet', 'ns2:ph', 'onabort', 'onblur', 'oncanplay', 'oncanplaythrough', 'onchange', 'onclick', 'oncontextmenu', 'ondblclick', 'ondrag', 'ondragend', 'ondragenter', 'ondragleave', 'ondragover', 'ondragstart', 'ondrop', 'ondurationchange', 'onemptied', 'onended', 'onerror', 'onfocus', 'oninput', 'oninvalid', 'onkeydown', 'onkeypress', 'onkeyup', 'onload', 'onloadeddata', 'onloadedmetadata', 'onloadstart', 'onmousedown', 'onmousemove', 'onmouseout', 'onmouseover', 'onmouseup', 'onmousewheel', 'onpause', 'onplay', 'onplaying', 'onprogress', 'onratechange', 'onreadystatechange', 'onreset', 'onscroll', 'onseeked', 'onseeking', 'onselect', 'onshow', 'onstalled', 'onsubmit', 'onsuspend', 'ontimeupdate', 'onvolumechange', 'onwaiting', 'prefix', 'property', 'rel', 'resource', 'rev', 'role', 'spellcheck', 'style', 'tabindex', 'target', 'title', 'type', 'typeof', 'vocab', 'xml:base', 'xml:lang', 'xml:space', 'colspan', 'rowspan', 'epub:type', 'epub:prefix', ]
    // prettier-ignore
    const allowedXhtml11Tags = [ 'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'address', 'hr', 'pre', 'blockquote', 'center', 'ins', 'del', 'a', 'span', 'bdo', 'br', 'em', 'strong', 'dfn', 'code', 'samp', 'kbd', 'bar', 'cite', 'abbr', 'acronym', 'q', 'sub', 'sup', 'tt', 'i', 'b', 'big', 'small', 'u', 's', 'strike', 'basefont', 'font', 'object', 'param', 'img', 'table', 'caption', 'colgroup', 'col', 'thead', 'tfoot', 'tbody', 'tr', 'th', 'td', 'embed', 'applet', 'iframe', 'img', 'map', 'noscript', 'ns:svg', 'object', 'script', 'table', 'tt', 'var', ]

    let $ = cheerio.load(content.data, {
      lowerCaseTags: true,
      recognizeSelfClosing: true,
    })

    // Only body innerHTML is allowed
    if ($('body').length) {
      $ = cheerio.load($('body').html() as string, {
        lowerCaseTags: true,
        recognizeSelfClosing: true,
      })
    }
    $(
      $('*')
        .get()
        .reverse()
    ) //
      .each((elemIndex, el) => {
        const attrs = el.attribs
        // const that = this
        if (['img', 'br', 'hr'].includes(el.name)) {
          if (el.name === 'img') {
            $(el).attr('alt', $(el).attr('alt') || 'image-placeholder')
          }
        }

        for (let k in attrs) {
          // const v = attrs[k]
          if (Array.from(allowedAttributes).includes(k)) {
            if (k === 'type') {
              if (el.name !== 'script') {
                $(el).removeAttr(k)
              }
            }
          } else {
            $(el).removeAttr(k)
          }
        }
        if (version === 2) {
          if (Array.from(allowedXhtml11Tags).includes(el.name)) {
            return
          } else {
            console.log(
              'Warning (content[' + index + ']):',
              el.name,
              "tag isn't allowed on EPUB 2/XHTML 1.1 DTD."
            )
            const child = $(el).html()
            return $(el).replaceWith($('<div>' + child + '</div>'))
          }
        }
        return
      })

    $('img').each(function(index, elem) {
      let extension, id, image
      const url = $(elem).attr('src') || defaultSrc
      if (!url.length) {
        $(elem).remove()
        return
      }
      if ((image = images.find(element => element.url === url))) {
        id = image.id
        extension = image.extension
      } else {
        id = makeUuid()
        const mediaType = url.startsWith('data:')
          ? url.replace(/data:([\w\/\+]+).*/, '$1')
          : mime.getType(url.replace(/\?.*/, ''))
        if (mediaType) {
          extension = mime.getExtension(mediaType) || 'blob'
          images.push({ id, url, dir, mediaType, extension })
        }
      }
      if (url.startsWith('data:')) {
        $(elem).attr('src', url)
      } else {
        $(elem).attr('src', `images/${id}.${extension}`)
      }
    })
    const data = $.xml()
    const result: ProcessedChapter = {
      ...content,
      data,
      dir,
      filePath,
      href,
      id,
      excludeFromToc,
      beforeToc,
      author,
    }
    return result
  })
  return { content, images }
}

export type ContentChapter = {
  /**
   * optional, Chapter title */
  title?: string
  /**
   * optional, if each book author is different, you can fill it. */
  author?: string | string[]
  /**
   * required, HTML String of the chapter content. image paths should be absolute path (should start with "http" or "https"), so that they could be downloaded. With the upgrade is possible to use local images (for this the path must start with file: //) */
  data: string
  /**
   * optional, if is not shown on Table of content, default: false; */
  excludeFromToc?: boolean
  /**
   * optional, if is shown before Table of content, such like copyright pages. default: false; */
  beforeToc?: string | boolean
  /**
   * optional, specify filename for each chapter, default: undefined; */
  filename?: string
  /**
   * specify whether or not to console.log progress messages, default: false. */
  verbose?: boolean
}

export type ProcessedChapter = ContentChapter & {
  id: string
  dir: string
  href: string
  filePath: string
  url?: string
}
