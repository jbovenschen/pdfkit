import fontkit from 'fontkit';

class PDFFont {
  static open(document, src, family, id) {
    let font;
    if (typeof src === 'string') {
      if (StandardFont.isStandardFont(src)) {
        return new StandardFont(document, src, id);
      }
        
      font = fontkit.openSync(src, family);
                
    } else if (Buffer.isBuffer(src)) {
      font = fontkit.create(src, family);
      
    } else if (src instanceof Uint8Array) {
      font = fontkit.create(new Buffer(src), family);
      
    } else if (src instanceof ArrayBuffer) {
      font = fontkit.create(new Buffer(new Uint8Array(src)), family);
    }
      
    if ((font == null)) {
      throw new Error('Not a supported font format or standard PDF font.');
    }
      
    return new EmbeddedFont(document, font, id);
  }
    
  constructor() {
    throw new Error('Cannot construct a PDFFont directly.');
  }
    
  encode(text) {
    throw new Error('Must be implemented by subclasses');
  }
      
  widthOfString(text) {
    throw new Error('Must be implemented by subclasses');
  }
    
  ref() {
    return this.dictionary != null ? this.dictionary : (this.dictionary = this.document.ref());
  }
    
  finalize() {
    if (this.embedded || (this.dictionary == null)) { return; }

    this.embed();
    return this.embedded = true;
  }
    
  embed() {
    throw new Error('Must be implemented by subclasses');
  }
      
  lineHeight(size, includeGap) {
    if (includeGap == null) { includeGap = false; }
    let gap = includeGap ? this.lineGap : 0;
    return (((this.ascender + gap) - this.descender) / 1000) * size;
  }
}
  
export default PDFFont;

var StandardFont = require('./font/standard');
var EmbeddedFont = require('./font/embedded');
