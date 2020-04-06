import path from 'path'
import fs from 'fs'
import _ from 'underscore'
import ejs from 'ejs'
import entities from 'entities'
import request from 'superagent'
require('superagent-proxy')(request)
import fsExtra from 'fs-extra'
import mime from 'mime'
import archiver from 'archiver'
import nodeFetch from 'node-fetch'
import fetchRetry, { RequestInit } from '@zeit/fetch-retry'

const fetch = fetchRetry(nodeFetch)

// provides rm -rf for deleting temp directory across various platforms.
import rimraf from 'rimraf'

import makeUuid from './uuid'
import processContent, { ProcessedChapter, ChapterImage } from './content'
import { isError, isWarn, isInfo } from './consoleColors'

// Editors can highlight and format this
// const html = String.raw
const html = (...args: ArgumentTypes<typeof String.raw>) =>
  String.raw(...args).trim()

enum LOG {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

const transparentPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

class EPub {
  options: EPubOptions & {
    output: string
    docHeader?: string
    tempDir: string
    fonts: string[]
    uuid?: string
    id?: string
    description: string
    date: string
    _coverMediaType?: string | null
    _coverExtension?: string | null
  }
  id: any
  uuid: any
  private htmlAttributes?: string
  private content: ProcessedChapter[]
  private images: ChapterImage[]
  promise: Promise<any>
  constructor(options: EPubOptions, output: string) {
    this.options = {
      output,
      fonts: [],
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
      requestInit: {
        timeout: 30000,
        ...options.requestInit,
      },
    }
    const self = this

    if (!this.options.output) {
      this.log(LOG.ERROR, 'No Output Path')
      throw new Error('No Output Path')
    }

    if (!options.title || !options.content) {
      this.log(LOG.ERROR, 'Title and content are both required')
      throw new Error('Title and content are both required')
    }

    if (options.version === 2) {
      this.htmlAttributes = `lang="${self.options.lang}" xmlns="http://www.w3.org/1999/xhtml"`
      this.options.docHeader = html`
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
      `
    } else {
      this.htmlAttributes = `lang="${self.options.lang}" xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"`
      this.options.docHeader = html`
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE html>
      `
    }
    if (typeof options.author === 'string') {
      this.options.author = [options.author]
    }
    if (_.isEmpty(this.options.author)) {
      this.options.author = ['anonymous']
    }
    this.id = makeUuid()
    this.uuid = path.resolve(this.options.tempDir, this.id)
    this.options.uuid = this.uuid
    this.options.id = this.id

    const { content, images } = processContent({
      content: options.content,
      uuid: this.uuid,
      defaultSrc: transparentPng,
    })

    this.content = content
    this.images = images

    if (this.options.cover) {
      this.options._coverMediaType = mime.getType(this.options.cover)
      this.options._coverExtension = mime.getExtension(
        this.options._coverMediaType || 'image'
      )
    }
    this.promise = this.render()
  }

  log(level: string | LOG, ...message: any) {
    if (level === LOG.ERROR) {
      console.error(isError, ...message)
    } else if (level === LOG.WARN) {
      console.warn(isWarn, ...message)
    } else if (level === LOG.INFO && this.options.verbose) {
      console.log(isInfo, ...message)
    } else if (this.options.verbose) {
      console.log(isInfo, level, ...message)
    }
  }
  async render() {
    this.log(LOG.INFO, 'Rendering')
    try {
      this.log(LOG.INFO, 'Generating Template Files')
      await this.generateTempFile()
      this.log(LOG.INFO, 'Downloading Images')
      await this.downloadAllImage()
      this.log(LOG.INFO, 'Downloading Cover')
      await this.makeCover()
      this.log(LOG.INFO, 'Generating EPUB file')
      const result = await this.genEpub()
      return result
    } catch (err) {
      throw err
    }
  }
  templateChapter(chapter: ProcessedChapter) {
    const title =
      chapter.title && this.options.appendChapterTitles
        ? `<h1>${entities.encodeXML(chapter.title)}</h1>`
        : ''
    const author =
      chapter.title && chapter.author && Array.isArray(chapter.author)
        ? `<p class='epub-author'>${entities.encodeXML(
            chapter.author.join(', ')
          )}</p>`
        : ''
    const epubLink =
      chapter.title && chapter.url
        ? `<p class='epub-link'><a href='${chapter.url}'>${chapter.url}</a></p>`
        : ''

    return html`
      ${this.options.docHeader}
      <html ${this.htmlAttributes || ''}>
        <head>
          <meta charset="UTF-8" />
          <title>${entities.encodeXML(chapter.title || '')}</title>
          <link rel="stylesheet" type="text/css" href="style.css" />
        </head>
        <body>
          ${title} ${author} ${epubLink} ${chapter.data}
        </body>
      </html>
    `
  }
  async generateTempFile() {
    await fsExtra.mkdirp(this.options.tempDir)
    await fsExtra.mkdirp(this.uuid)
    await fsExtra.mkdirp(path.resolve(this.uuid, './OEBPS'))
    if (!this.options.css) {
      this.options.css = fs.readFileSync(
        path.resolve(__dirname, '../templates/template.css'),
        'utf8'
      )
    }
    await fsExtra.writeFile(
      path.resolve(this.uuid, './OEBPS/style.css'),
      this.options.css
    )
    if (this.options.fonts.length) {
      fs.mkdirSync(path.resolve(this.uuid, './OEBPS/fonts'))
      this.options.fonts = _.map(this.options.fonts, font => {
        if (!fs.existsSync(font)) {
          throw new Error('Custom font not found at ' + font + '.')
        }
        const filename = path.basename(font)
        fsExtra.copySync(
          font,
          path.resolve(this.uuid, './OEBPS/fonts/' + filename)
        )
        return filename
      })
    }
    for (const chapter of this.content) {
      const data = this.templateChapter(chapter)
      await fsExtra.writeFile(chapter.filePath, data)
    }

    // write meta-inf/container.xml
    fs.mkdirSync(this.uuid + '/META-INF')
    fs.writeFileSync(
      `${this.uuid}/META-INF/container.xml`,
      html`
        <?xml version="1.0" encoding="UTF-8" ?>
        <container
          version="1.0"
          xmlns="urn:oasis:names:tc:opendocument:xmlns:container"
        >
          <rootfiles>
            <rootfile
              full-path="OEBPS/content.opf"
              media-type="application/oebps-package+xml"
            />
          </rootfiles>
        </container>
      `
    )

    if (this.options.version === 2) {
      // write meta-inf/com.apple.ibooks.display-options.xml [from pedrosanta:xhtml#6]
      fs.writeFileSync(
        `${this.uuid}/META-INF/com.apple.ibooks.display-options.xml`,
        html`
          <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
          <display_options>
            <platform name="*">
              <option name="specified-fonts">true</option>
            </platform>
          </display_options>
        `
      )
    }

    const opfPath =
      this.options.customOpfTemplatePath ||
      path.resolve(
        __dirname,
        `../templates/epub${this.options.version}/content.opf.ejs`
      )
    if (!fs.existsSync(opfPath)) {
      throw new Error('Custom file to OPF template not found.')
    }

    const ncxTocPath =
      this.options.customNcxTocTemplatePath ||
      path.resolve(__dirname, '../templates/toc.ncx.ejs')
    if (!fs.existsSync(ncxTocPath)) {
      throw new Error('Custom file the NCX toc template not found.')
    }

    const htmlTocPath =
      this.options.customHtmlTocTemplatePath ||
      path.resolve(
        __dirname,
        `../templates/epub${this.options.version}/toc.xhtml.ejs`
      )
    if (!fs.existsSync(htmlTocPath)) {
      throw new Error('Custom file to HTML toc template not found.')
    }
    const images = this.images.filter(img => !img.url.startsWith('data:'))
    return Promise.all(
      [
        [opfPath, path.resolve(this.uuid, './OEBPS/content.opf')],
        [ncxTocPath, path.resolve(this.uuid, './OEBPS/toc.ncx')],
        [htmlTocPath, path.resolve(this.uuid, './OEBPS/toc.xhtml')],
      ].map(async ([template, output]) => {
        const rendered = await ejs.renderFile(template, {
          ...this.options,
          content: this.content,
          images,
        })
        return fsExtra.writeFile(output, rendered)
      })
    )
  }

  makeCover() {
    if (this.options.cover) {
      const destPath = path.resolve(
        this.uuid,
        './OEBPS/cover.' + this.options._coverExtension
      )
      const writable = fs.createWriteStream(destPath, { encoding: 'binary' })
      return this.fetch(this.options.cover, writable)
    }
    return Promise.resolve()
  }

  async fetch(url: string, output: NodeJS.WritableStream) {
    if (url.indexOf('http') === 0) {
      const result = await fetch(url, this.options.requestInit)
      if (result.ok) {
        this.log(LOG.INFO, '[Download Success]', url)
        result.body.pipe(output)
      } else {
        throw new Error(
          `[Download Error] Error while downloading ${url} ${result.status} ${result.statusText}`
        )
      }
    } else {
      const readable = fs.createReadStream(url)
      readable.pipe(output)
    }
    return new Promise(resolve => {
      output.once('finish', () => {
        this.log(LOG.INFO, '[Download Success]', url)
        resolve()
      })
    })
  }
  async downloadImage(options: ImageOption) {
    if (!options.url && typeof options !== 'string') {
      return
    }
    const filename = path.resolve(
      this.uuid,
      './OEBPS/images/' + options.id + '.' + options.extension
    )
    if (options.url.indexOf('file://') === 0) {
      const auxPath = options.url.substr(7)
      await fsExtra.copy(auxPath, filename)
      return options
    } else {
      const writable = fs.createWriteStream(filename, { encoding: 'binary' })
      const imagePath =
        options.url.indexOf('http') === 0
          ? options.url
          : path.resolve(options.dir, options.url)
      try {
        await this.fetch(imagePath, writable)
      } catch (error) {
        fs.unlinkSync(filename)
        this.log(LOG.ERROR, error.message)
      }
      return
    }
  }

  async downloadAllImage() {
    if (!this.images.length) {
      return
    } else {
      fs.mkdirSync(path.resolve(this.uuid, './OEBPS/images'))
      return Promise.all(
        this.images
          .filter(img => !img.url.startsWith('data:'))
          .map(img => this.downloadImage(img))
      )
    }
  }

  genEpub() {
    // Thanks to Paul Bradley
    // http://www.bradleymedia.org/gzip-markdown-epub/ (404 as of 28.07.2016)
    // Web Archive URL:
    // http://web.archive.org/web/20150521053611/http://www.bradleymedia.org/gzip-markdown-epub
    // or Gist:
    // https://gist.github.com/cyrilis/8d48eef37fbc108869ac32eb3ef97bca

    const cwd = this.uuid
    return new Promise((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 9 } })
      const output = fs.createWriteStream(this.options.output)
      this.log(LOG.INFO, 'Zipping temp dir to', this.options.output)
      archive.append('application/epub+zip', { store: true, name: 'mimetype' })
      archive.directory(cwd + '/META-INF', 'META-INF')
      archive.directory(cwd + '/OEBPS', 'OEBPS')
      archive.pipe(output)
      archive.on('end', () => {
        this.log(LOG.INFO, 'Done zipping, clearing temp dir...')
        return rimraf(cwd, function(err) {
          if (err) {
            return reject(err)
          } else {
            return resolve(archive)
          }
        })
      })
      archive.on('error', err => reject(err))
      archive.finalize()
    })
  }
}
module.exports = EPub
export default EPub
export type EPubOptions = {
  /**
   * Title of the book */
  title: string
  /**
   * Name of the author for the book, string or array, eg. "Alice" or ["Alice", "Bob"] */
  author: string | string[]
  /**
   * Publisher name (optional) */
  publisher?: string
  /**
   * Book cover image (optional), File path (absolute path) or web url, eg. "http://abc.com/book-cover.jpg" or "/User/Alice/images/book-cover.jpg" */
  cover?: string
  /**
   * Out put path (absolute path), you can also path output as the second argument when use new , eg: new Epub(options, output) */
  output?: string
  /**
   * You can specify the version of the generated EPUB, 3 the latest version (http://idpf.org/epub/30) or 2 the previous version (http://idpf.org/epub/201, for better compatibility with older readers). If not specified, will fallback to 3. */
  version?: number
  /**
   * If you really hate our css, you can pass css string to replace our default style. eg: "body{background: #000}" */
  css?: string
  /**
   * Array of (absolute) paths to custom fonts to include on the book so they can be used on custom css. Ex: if you configure the array to fonts: ['/path/to/Merriweather.ttf'] you can use the following on the custom CSS: `@font-face { font-family: "Merriweather"; font-style: normal; font-weight: normal; src : url("./fonts/Merriweather.ttf"); }` */
  fonts?: string[]
  /**
   * Language of the book in 2 letters code (optional). If not specified, will fallback to en. */
  lang?: string
  /**
   * Title of the table of contents. If not specified, will fallback to Table Of Contents. */
  tocTitle?: string
  /**
   * Automatically append the chapter title at the beginning of each contents. You can disable that by specifying false. */
  appendChapterTitles?: boolean
  /**
   * Optional. For advanced customizations: absolute path to an OPF template. */
  customOpfTemplatePath?: null | string
  /**
   * Optional. For advanced customizations: absolute path to a NCX toc template. */
  customNcxTocTemplatePath?: null | string
  /**
   * Optional. For advanced customizations: absolute path to a HTML toc template. */
  customHtmlTocTemplatePath?: null | string
  /**
   * Book Chapters content. It's should be an array of objects. eg. [{title: "Chapter 1",data: "<div>..."}, {data: ""},...] */
  content: Chapter[]
  verbose?: boolean
  tempDir?: string
  requestInit?: RequestInit
}
type Chapter = {
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
type ImageOption = {
  id: string
  url: string
  mediaType: string
  extension: string
  dir: string
}

type ArgumentTypes<F extends Function> = F extends (...args: infer A) => any
  ? A
  : never
