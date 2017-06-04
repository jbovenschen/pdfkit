/*
PDFDocument - represents an entire PDF document
By Devon Govett
*/

import stream from 'stream';
import fs from 'fs';
import PDFObject from './object';
import PDFReference from './reference';
import PDFPage from './page';

var PDFDocument = (function() {
  let mixin = undefined;
  PDFDocument = class PDFDocument extends stream.Readable {
    static initClass() {
      mixin = methods => {
        return (() => {
          let result = [];
          for (let name in methods) {
            let method = methods[name];
            result.push((this.prototype[name] = method));
          }
          return result;
        })();
      };

      // Load mixins
      mixin(require('./mixins/color'));
      mixin(require('./mixins/vector'));
      mixin(require('./mixins/fonts'));
      mixin(require('./mixins/text'));
      mixin(require('./mixins/images'));
      mixin(require('./mixins/annotations'));
    }
    constructor(options) {
      {
        // Hack: trick babel into allowing this before super.
        if (false) {
          super();
        }
        let thisFn = (() => {
          this;
        }).toString();
        let thisName = thisFn
          .slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';'))
          .trim();
        eval(`${thisName} = this;`);
      }
      if (options == null) {
        options = {};
      }
      this.options = options;
      super(...arguments);

      // PDF version
      this.version = 1.3;

      // Whether streams should be compressed
      this.compress = this.options.compress != null
        ? this.options.compress
        : true;

      this._pageBuffer = [];
      this._pageBufferStart = 0;

      // The PDF object store
      this._offsets = [];
      this._waiting = 0;
      this._ended = false;
      this._offset = 0;

      this._root = this.ref({
        Type: 'Catalog',
        Pages: this.ref({
          Type: 'Pages',
          Count: 0,
          Kids: [],
        }),
      });

      // The current page
      this.page = null;

      // Initialize mixins
      this.initColor();
      this.initVector();
      this.initFonts();
      this.initText();
      this.initImages();

      // Initialize the metadata
      this.info = {
        Producer: 'PDFKit',
        Creator: 'PDFKit',
        CreationDate: new Date(),
      };

      if (this.options.info) {
        for (let key in this.options.info) {
          let val = this.options.info[key];
          this.info[key] = val;
        }
      }

      // Write the header
      // PDF version
      this._write(`%PDF-${this.version}`);

      // 4 binary chars, as recommended by the spec
      this._write('%\xFF\xFF\xFF\xFF');

      // Add the first page
      if (this.options.autoFirstPage !== false) {
        this.addPage();
      }
    }

    addPage(options) {
      // end the current page if needed
      if (options == null) {
        ({ options } = this);
      }
      if (!this.options.bufferPages) {
        this.flushPages();
      }

      // create a page object
      this.page = new PDFPage(this, options);
      this._pageBuffer.push(this.page);

      // add the page to the object store
      let pages = this._root.data.Pages.data;
      pages.Kids.push(this.page.dictionary);
      pages.Count++;

      // reset x and y coordinates
      this.x = this.page.margins.left;
      this.y = this.page.margins.top;

      // flip PDF coordinate system so that the origin is in
      // the top left rather than the bottom left
      this._ctm = [1, 0, 0, 1, 0, 0];
      this.transform(1, 0, 0, -1, 0, this.page.height);

      this.emit('pageAdded');

      return this;
    }

    bufferedPageRange() {
      return { start: this._pageBufferStart, count: this._pageBuffer.length };
    }

    switchToPage(n) {
      let page;
      if (!(page = this._pageBuffer[n - this._pageBufferStart])) {
        throw new Error(
          `switchToPage(${n}) out of bounds, current buffer covers pages ${this._pageBufferStart} to ${this._pageBufferStart + this._pageBuffer.length - 1}`
        );
      }

      return (this.page = page);
    }

    flushPages() {
      // this local variable exists so we're future-proof against
      // reentrant calls to flushPages.
      let pages = this._pageBuffer;
      this._pageBuffer = [];
      this._pageBufferStart += pages.length;
      for (let page of Array.from(pages)) {
        page.end();
      }
    }

    ref(data) {
      let ref = new PDFReference(this, this._offsets.length + 1, data);
      this._offsets.push(null); // placeholder for this object's offset once it is finalized
      this._waiting++;
      return ref;
    }

    _read() {}
    // do nothing, but this method is required by node

    _write(data) {
      if (!Buffer.isBuffer(data)) {
        data = new Buffer(data + '\n', 'binary');
      }

      this.push(data);
      return (this._offset += data.length);
    }

    addContent(data) {
      this.page.write(data);
      return this;
    }

    _refEnd(ref) {
      this._offsets[ref.id - 1] = ref.offset;
      if (--this._waiting === 0 && this._ended) {
        this._finalize();
        return (this._ended = false);
      }
    }

    write(filename, fn) {
      // print a deprecation warning with a stacktrace
      let err = new Error(
        `\
PDFDocument#write is deprecated, and will be removed in a future version of PDFKit. \
Please pipe the document into a Node stream.\
`
      );

      console.warn(err.stack);

      this.pipe(fs.createWriteStream(filename));
      this.end();
      return this.once('end', fn);
    }

    output(fn) {
      // more difficult to support this. It would involve concatenating all the buffers together
      throw new Error(
        `\
PDFDocument#output is deprecated, and has been removed from PDFKit. \
Please pipe the document into a Node stream.\
`
      );
    }

    end() {
      this.flushPages();
      this._info = this.ref();
      for (let key in this.info) {
        let val = this.info[key];
        if (typeof val === 'string') {
          val = new String(val);
        }

        this._info.data[key] = val;
      }

      this._info.end();

      for (let name in this._fontFamilies) {
        let font = this._fontFamilies[name];
        font.finalize();
      }

      this._root.end();
      this._root.data.Pages.end();

      if (this._waiting === 0) {
        return this._finalize();
      } else {
        return (this._ended = true);
      }
    }

    _finalize(fn) {
      // generate xref
      let xRefOffset = this._offset;
      this._write('xref');
      this._write(`0 ${this._offsets.length + 1}`);
      this._write('0000000000 65535 f ');

      for (let offset of Array.from(this._offsets)) {
        offset = `0000000000${offset}`.slice(-10);
        this._write(offset + ' 00000 n ');
      }

      // trailer
      this._write('trailer');
      this._write(
        PDFObject.convert({
          Size: this._offsets.length + 1,
          Root: this._root,
          Info: this._info,
        })
      );

      this._write('startxref');
      this._write(`${xRefOffset}`);
      this._write('%%EOF');

      // end the stream
      return this.push(null);
    }

    toString() {
      return '[object PDFDocument]';
    }
  };
  PDFDocument.initClass();
  return PDFDocument;
})();

export default PDFDocument;
