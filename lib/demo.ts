import EPub, { EPubOptions } from '.'

const option: EPubOptions = {
  title: "Alice's Adventures in Wonderland", // *Required, title of the book.
  tocTitle: 'Contents',
  author: 'Lewis Carroll', // *Required, name of the author.
  publisher: 'Macmillan & Co.', // optional
  //   cover: 'http://demo.com/url-to-cover-image.jpg', // Url or File path, both ok.
  content: [
    {
      title: 'About the author', // Optional
      author: 'John Doe', // Optional
      data:
        '<h2>Charles Lutwidge Dodgson</h2>' +
        '<div lang="en">Better known by the pen name Lewis Carroll...</div>', // pass html string
    },
    {
      title: 'Down the Rabbit Hole',
      data: '<p>Alice was beginning to get very tired...</p>',
    },
  ],
}

new EPub(option, './path.epub')
