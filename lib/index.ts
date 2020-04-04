import path from 'path'
import fs from 'fs'
import Q from 'q'
import _ from 'underscore'
import uslug from 'uslug'
import ejs from 'ejs'
import cheerio from 'cheerio'
import entities from 'entities'
import request from 'superagent'
require('superagent-proxy')(request)
import fsextra from 'fs-extra'
import { remove as removeDiacritics } from 'diacritics'
import mime from 'mime'
import archiver from 'archiver'

// provides rm -rf for deleting temp directory across various platforms.
import rimraf from 'rimraf'

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })

class EPub {
  options: EPubOptions & {
    output: string
    docHeader?: string
    tempDir: string
    fonts: string[]
    images: Array<{
      id: string
      url: string
      dir: string
      mediaType: string
      extension: string
    }>
    uuid?: string
    id?: string
    description: string
    date: string
    _coverMediaType?: string | null
    _coverExtension?: string | null
  }
  defer: any
  id: any
  uuid: any
  promise: any
  constructor(options: EPubOptions, output: string) {
    this.options = {
      output,
      fonts: [],
      images: [],
      description: options.title,
      publisher: 'anonymous',
      author: ['anonymous'],
      tocTitle: 'Table Of Contents',
      appendChapterTitles: true,
      date: new Date().toISOString(),
      lang: 'en',
      customOpfTemplatePath: null,
      customNcxTocTemplatePath: null,
      customHtmlTocTemplatePath: null,
      version: 3,
      tempDir: path.resolve(__dirname, '../tempDir/'),
      ...options,
    }
    const self = this
    this.defer = Q.defer()

    if (!this.options.output) {
      console.error(new Error('No Output Path'))
      this.defer.reject(new Error('No output path'))
      return
    }

    if (!options.title || !options.content) {
      console.error(new Error('Title and content are both required'))
      this.defer.reject(new Error('Title and content are both required'))
      return
    }

    if (options.version === 2) {
      this.options.docHeader = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${self.options.lang}">\
`
    } else {
      this.options.docHeader = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${self.options.lang}">\
`
    }

    if (typeof options.author === 'string') {
      this.options.author = [options.author]
    }
    if (_.isEmpty(this.options.author)) {
      this.options.author = ['anonymous']
    }
    this.id = uuid()
    this.uuid = path.resolve(this.options.tempDir, this.id)
    this.options.uuid = this.uuid
    this.options.id = this.id
    this.options.images = []
    this.options.content = _.map(options.content as InternalChapter[], function(
      content: InternalChapter,
      index
    ) {
      if (!content.filename) {
        const titleSlug = uslug(removeDiacritics(content.title || 'no title'))
        content.href = `${index}_${titleSlug}.xhtml`
        content.filePath = path.resolve(
          self.uuid,
          `./OEBPS/${index}_${titleSlug}.xhtml`
        )
      } else {
        content.href = content.filename.match(/\.xhtml$/)
          ? content.filename
          : `${content.filename}.xhtml`
        if (content.filename.match(/\.xhtml$/)) {
          content.filePath = path.resolve(
            self.uuid,
            `./OEBPS/${content.filename}`
          )
        } else {
          content.filePath = path.resolve(
            self.uuid,
            `./OEBPS/${content.filename}.xhtml`
          )
        }
      }

      content.id = `item_${index}`
      content.dir = path.dirname(content.filePath)
      if (!content.excludeFromToc) {
        content.excludeFromToc = false
      }
      if (!content.beforeToc) {
        content.beforeToc = false
      }

      //fix Author Array
      content.author =
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
      ).each(function(elemIndex, elem) {
        const attrs = elem.attribs
        const that = elem
        // const that = this
        if (['img', 'br', 'hr'].includes(that.name)) {
          if (that.name === 'img') {
            $(that).attr('alt', $(that).attr('alt') || 'image-placeholder')
          }
        }

        for (let k in attrs) {
          // const v = attrs[k]
          if (Array.from(allowedAttributes).includes(k)) {
            if (k === 'type') {
              if (that.name !== 'script') {
                $(that).removeAttr(k)
              }
            }
          } else {
            $(that).removeAttr(k)
          }
        }
        if (self.options.version === 2) {
          if (Array.from(allowedXhtml11Tags).includes(that.name)) {
            return
          } else {
            console.log(
              'Warning (content[' + index + ']):',
              that.name,
              "tag isn't allowed on EPUB 2/XHTML 1.1 DTD."
            )
            const child = $(that).html()
            return $(that).replaceWith($('<div>' + child + '</div>'))
          }
        }
        return
      })

      $('img').each(function(index, elem) {
        let extension, id, image
        const url = $(elem).attr('src') || ''
        if (
          (image = self.options.images?.find(element => element.url === url))
        ) {
          ;({ id } = image)
          ;({ extension } = image)
        } else {
          id = uuid()
          const mediaType =
            mime.getType(url.replace(/\?.*/, '')) || 'application/octet-stream'
          extension = mime.getExtension(mediaType) || 'blob'
          const { dir } = content
          self.options.images.push({ id, url, dir, mediaType, extension })
        }
        return $(elem).attr('src', `images/${id}.${extension}`)
      })
      content.data = $.xml()
      return content
    })

    if (this.options.cover) {
      this.options._coverMediaType = mime.getType(this.options.cover)
      this.options._coverExtension = mime.getExtension(
        this.options._coverMediaType || 'application/octet-stream'
      )
    }

    this.render()
    this.promise = this.defer.promise
  }

  render() {
    const self = this
    if (self.options.verbose) {
      console.log('Generating Template Files.....')
    }
    return this.generateTempFile().then(
      function() {
        if (self.options.verbose) {
          console.log('Downloading Images...')
        }
        return self.downloadAllImage().fin(
          function() {
            if (self.options.verbose) {
              console.log('Making Cover...')
            }
            return self.makeCover().then(
              function() {
                if (self.options.verbose) {
                  console.log('Generating Epub Files...')
                }
                return self.genEpub().then(
                  function(result) {
                    if (self.options.verbose) {
                      console.log('About to finish...')
                    }
                    self.defer.resolve(result)
                    if (self.options.verbose) {
                      return console.log('Done.')
                    }
                  },
                  err => self.defer.reject(err)
                )
              },
              err => self.defer.reject(err)
            )
          }
          // Q type definition says it expect only one argument
          // err => self.defer.reject(err)
        )
      },
      err => self.defer.reject(err)
    )
  }

  generateTempFile() {
    const generateDefer = Q.defer()

    const self = this
    if (!fs.existsSync(this.options.tempDir)) {
      fs.mkdirSync(this.options.tempDir)
    }
    fs.mkdirSync(this.uuid)
    fs.mkdirSync(path.resolve(this.uuid, './OEBPS'))
    if (!this.options.css) {
      this.options.css = fs.readFileSync(
        path.resolve(__dirname, '../templates/template.css'),
        'utf8'
      )
    }
    fs.writeFileSync(
      path.resolve(this.uuid, './OEBPS/style.css'),
      this.options.css
    )
    if (self.options.fonts.length) {
      fs.mkdirSync(path.resolve(this.uuid, './OEBPS/fonts'))
      this.options.fonts = _.map(this.options.fonts, function(font) {
        if (!fs.existsSync(font)) {
          throw new Error('Custom font not found at ' + font + '.')
        }
        const filename = path.basename(font)
        fsextra.copySync(
          font,
          path.resolve(self.uuid, './OEBPS/fonts/' + filename)
        )
        return filename
      })
    }
    _.each(this.options.content as InternalChapter[], function(content) {
      let data = `${self.options.docHeader}
  <head>
  <meta charset="UTF-8" />
  <title>${entities.encodeXML(content.title || '')}</title>
  <link rel="stylesheet" type="text/css" href="style.css" />
  </head>
<body>\
`
      data +=
        content.title && self.options.appendChapterTitles
          ? `<h1>${entities.encodeXML(content.title)}</h1>`
          : ''
      data +=
        content.title && content.author && Array.isArray(content.author)
          ? `<p class='epub-author'>${entities.encodeXML(
              content.author.join(', ')
            )}</p>`
          : ''
      data +=
        content.title && content.url
          ? `<p class='epub-link'><a href='${content.url}'>${content.url}</a></p>`
          : ''
      data += `${content.data}</body></html>`
      return fs.writeFileSync(content.filePath, data)
    })

    // write meta-inf/container.xml
    fs.mkdirSync(this.uuid + '/META-INF')
    fs.writeFileSync(
      `${this.uuid}/META-INF/container.xml`,
      '<?xml version="1.0" encoding="UTF-8" ?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
    )

    if (self.options.version === 2) {
      // write meta-inf/com.apple.ibooks.display-options.xml [from pedrosanta:xhtml#6]
      fs.writeFileSync(
        `${this.uuid}/META-INF/com.apple.ibooks.display-options.xml`,
        `\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<display_options>
  <platform name="*">
    <option name="specified-fonts">true</option>
  </platform>
</display_options>\
`
      )
    }

    const opfPath =
      self.options.customOpfTemplatePath ||
      path.resolve(
        __dirname,
        `../templates/epub${self.options.version}/content.opf.ejs`
      )
    if (!fs.existsSync(opfPath)) {
      generateDefer.reject(new Error('Custom file to OPF template not found.'))
      return generateDefer.promise
    }

    const ncxTocPath =
      self.options.customNcxTocTemplatePath ||
      path.resolve(__dirname, '../templates/toc.ncx.ejs')
    if (!fs.existsSync(ncxTocPath)) {
      generateDefer.reject(
        new Error('Custom file the NCX toc template not found.')
      )
      return generateDefer.promise
    }

    const htmlTocPath =
      self.options.customHtmlTocTemplatePath ||
      path.resolve(
        __dirname,
        `../templates/epub${self.options.version}/toc.xhtml.ejs`
      )
    if (!fs.existsSync(htmlTocPath)) {
      generateDefer.reject(
        new Error('Custom file to HTML toc template not found.')
      )
      return generateDefer.promise
    }

    Q.all([
      Q.nfcall(ejs.renderFile, opfPath, self.options),
      Q.nfcall(ejs.renderFile, ncxTocPath, self.options),
      Q.nfcall(ejs.renderFile, htmlTocPath, self.options),
    ]).spread(
      function(data1, data2, data3) {
        fs.writeFileSync(path.resolve(self.uuid, './OEBPS/content.opf'), data1)
        fs.writeFileSync(path.resolve(self.uuid, './OEBPS/toc.ncx'), data2)
        fs.writeFileSync(path.resolve(self.uuid, './OEBPS/toc.xhtml'), data3)
        return generateDefer.resolve()
      },
      function(err) {
        console.error(arguments)
        return generateDefer.reject(err)
      }
    )

    return generateDefer.promise
  }

  makeCover() {
    const userAgent =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/34.0.1847.116 Safari/537.36'
    const coverDefer = Q.defer()
    if (this.options.cover) {
      const destPath = path.resolve(
        this.uuid,
        './OEBPS/cover.' + this.options._coverExtension
      )
      let writeStream = null
      if (this.options.cover.slice(0, 4) === 'http') {
        writeStream = request
          .get(this.options.cover)
          .set({ 'User-Agent': userAgent })
        writeStream.pipe(fs.createWriteStream(destPath))
      } else {
        writeStream = fs.createReadStream(this.options.cover)
        writeStream.pipe(fs.createWriteStream(destPath))
      }

      writeStream.on('end', function() {
        console.log('[Success] cover image downloaded successfully!')
        return coverDefer.resolve()
      })
      writeStream.on('error', function(err) {
        console.error('Error', err)
        return coverDefer.reject(err)
      })
    } else {
      coverDefer.resolve()
    }

    return coverDefer.promise
  }

  downloadImage(options: ImageOption) {
    const downloadImageDefer = Q.defer()
    const self = this
    const userAgent =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/34.0.1847.116 Safari/537.36'
    if (!options.url && typeof options !== 'string') {
      return downloadImageDefer.resolve(false)
    }
    const filename = path.resolve(
      self.uuid,
      './OEBPS/images/' + options.id + '.' + options.extension
    )
    if (options.url.indexOf('file://') === 0) {
      const auxpath = options.url.substr(7)
      fsextra.copySync(auxpath, filename)
      return downloadImageDefer.resolve(options)
    } else {
      let requestAction
      if (options.url.indexOf('http') === 0) {
        requestAction = request
          .get(options.url)
          .set({ 'User-Agent': userAgent })
        requestAction.pipe(fs.createWriteStream(filename))
      } else {
        requestAction = fs.createReadStream(
          path.resolve(options.dir, options.url)
        )
        requestAction.pipe(fs.createWriteStream(filename))
      }
      requestAction.on('error', function(err) {
        console.error(
          '[Download Error]',
          'Error while downloading',
          options.url,
          err
        )
        fs.unlinkSync(filename)
        return downloadImageDefer.reject(err)
      })

      requestAction.on('end', function() {
        console.log('[Download Success]', options.url)
        return downloadImageDefer.resolve(options)
      })
      return downloadImageDefer.resolve(false)
    }
  }

  downloadAllImage() {
    const self = this
    const imgDefer = Q.defer()
    if (!self.options.images.length) {
      imgDefer.resolve()
    } else {
      fs.mkdirSync(path.resolve(this.uuid, './OEBPS/images'))
      const deferArray: Promise<ImageOption>[] = []
      _.each(self.options.images, image =>
        deferArray.push(self.downloadImage(image) as any)
      )
      Q.all(deferArray).fin(() => imgDefer.resolve())
    }
    return imgDefer.promise
  }

  genEpub() {
    // Thanks to Paul Bradley
    // http://www.bradleymedia.org/gzip-markdown-epub/ (404 as of 28.07.2016)
    // Web Archive URL:
    // http://web.archive.org/web/20150521053611/http://www.bradleymedia.org/gzip-markdown-epub
    // or Gist:
    // https://gist.github.com/cyrilis/8d48eef37fbc108869ac32eb3ef97bca

    const genDefer = Q.defer()

    const self = this
    const cwd = this.uuid

    const archive = archiver('zip', { zlib: { level: 9 } })
    const output = fs.createWriteStream(self.options.output)
    console.log('Zipping temp dir to', self.options.output)
    archive.append('application/epub+zip', { store: true, name: 'mimetype' })
    archive.directory(cwd + '/META-INF', 'META-INF')
    archive.directory(cwd + '/OEBPS', 'OEBPS')
    archive.pipe(output)
    archive.on('end', function() {
      console.log('Done zipping, clearing temp dir...')
      return rimraf(cwd, function(err) {
        if (err) {
          return genDefer.reject(err)
        } else {
          return genDefer.resolve()
        }
      })
    })
    archive.on('error', err => genDefer.reject(err))
    archive.finalize()

    return genDefer.promise
  }
}
module.exports = EPub
export default EPub
export type EPubOptions = {
  /** Title of the book */
  title: string
  /** Name of the author for the book, string or array, eg. "Alice" or ["Alice", "Bob"] */
  author: string | string[]
  /** Publisher name (optional) */
  publisher?: string
  /** Book cover image (optional), File path (absolute path) or web url, eg. "http://abc.com/book-cover.jpg" or "/User/Alice/images/book-cover.jpg" */
  cover?: string
  /** Out put path (absolute path), you can also path output as the second argument when use new , eg: new Epub(options, output) */
  output?: string
  /** You can specify the version of the generated EPUB, 3 the latest version (http://idpf.org/epub/30) or 2 the previous version (http://idpf.org/epub/201, for better compatibility with older readers). If not specified, will fallback to 3. */
  version?: number
  /** If you really hate our css, you can pass css string to replace our default style. eg: "body{background: #000}" */
  css?: string
  /** Array of (absolute) paths to custom fonts to include on the book so they can be used on custom css. Ex: if you configure the array to fonts: ['/path/to/Merriweather.ttf'] you can use the following on the custom CSS: `@font-face { font-family: "Merriweather"; font-style: normal; font-weight: normal; src : url("./fonts/Merriweather.ttf"); }` */
  fonts?: string[]
  /** Language of the book in 2 letters code (optional). If not specified, will fallback to en. */
  lang?: string
  /** Title of the table of contents. If not specified, will fallback to Table Of Contents. */
  tocTitle?: string
  /** Automatically append the chapter title at the beginning of each contents. You can disable that by specifying false. */
  appendChapterTitles?: boolean
  /** Optional. For advanced customizations: absolute path to an OPF template. */
  customOpfTemplatePath?: null | string
  /** Optional. For advanced customizations: absolute path to a NCX toc template. */
  customNcxTocTemplatePath?: null | string
  /** Optional. For advanced customizations: absolute path to a HTML toc template. */
  customHtmlTocTemplatePath?: null | string
  /** Book Chapters content. It's should be an array of objects. eg. [{title: "Chapter 1",data: "<div>..."}, {data: ""},...] */
  content: Chapter[]
  verbose?: boolean
  tempDir?: string
}
type Chapter = {
  /** optional, Chapter title */
  title?: string
  /** optional, if each book author is different, you can fill it. */
  author?: string | string[]
  /** required, HTML String of the chapter content. image paths should be absolute path (should start with "http" or "https"), so that they could be downloaded. With the upgrade is possible to use local images (for this the path must start with file: //) */
  data: string
  /** optional, if is not shown on Table of content, default: false; */
  excludeFromToc?: boolean
  /** optional, if is shown before Table of content, such like copyright pages. default: false; */
  beforeToc?: string | boolean
  /** optional, specify filename for each chapter, default: undefined; */
  filename?: string
  /** specify whether or not to console.log progress messages, default: false. */
  verbose?: boolean
}
type ImageOption = {
  id: string
  url: string
  mediaType: string
  extension: string
  dir: string
}

type InternalChapter = Chapter & {
  id: string
  dir: string
  href: string
  url: string
  filePath: string
}
