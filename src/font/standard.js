import AFMFont from './afm';
import PDFFont from '../font';
import fs from 'fs';

var StandardFont = (function() {
  let STANDARD_FONTS = undefined;
  StandardFont = class StandardFont extends PDFFont {
    static initClass() {
      
      // This insanity is so browserify can inline the font files
      STANDARD_FONTS = {
        "Courier"() { return fs.readFileSync(__dirname + "/../font/data/Courier.afm", 'utf8'); },
        "Courier-Bold"() { return fs.readFileSync(__dirname + "/../font/data/Courier-Bold.afm", 'utf8'); },
        "Courier-Oblique"() { return fs.readFileSync(__dirname + "/../font/data/Courier-Oblique.afm", 'utf8'); },
        "Courier-BoldOblique"() { return fs.readFileSync(__dirname + "/../font/data/Courier-BoldOblique.afm", 'utf8'); },
        "Helvetica"() { return fs.readFileSync(__dirname + "/../font/data/Helvetica.afm", 'utf8'); },
        "Helvetica-Bold"() { return fs.readFileSync(__dirname + "/../font/data/Helvetica-Bold.afm", 'utf8'); },
        "Helvetica-Oblique"() { return fs.readFileSync(__dirname + "/../font/data/Helvetica-Oblique.afm", 'utf8'); },
        "Helvetica-BoldOblique"() { return fs.readFileSync(__dirname + "/../font/data/Helvetica-BoldOblique.afm", 'utf8'); },
        "Times-Roman"() { return fs.readFileSync(__dirname + "/../font/data/Times-Roman.afm", 'utf8'); },
        "Times-Bold"() { return fs.readFileSync(__dirname + "/../font/data/Times-Bold.afm", 'utf8'); },
        "Times-Italic"() { return fs.readFileSync(__dirname + "/../font/data/Times-Italic.afm", 'utf8'); },
        "Times-BoldItalic"() { return fs.readFileSync(__dirname + "/../font/data/Times-BoldItalic.afm", 'utf8'); },
        "Symbol"() { return fs.readFileSync(__dirname + "/../font/data/Symbol.afm", 'utf8'); },
        "ZapfDingbats"() { return fs.readFileSync(__dirname + "/../font/data/ZapfDingbats.afm", 'utf8'); }
      };
    }
    constructor(document, name, id) {
      {
        // Hack: trick babel into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.document = document;
      this.name = name;
      this.id = id;
      this.font = new AFMFont(STANDARD_FONTS[this.name]());
      ({ascender: this.ascender,descender: this.descender,bbox: this.bbox,lineGap: this.lineGap} = this.font);
    }
    
    embed() {
      this.dictionary.data = {
        Type: 'Font',
        BaseFont: this.name,
        Subtype: 'Type1',
        Encoding: 'WinAnsiEncoding'
      };
      
      return this.dictionary.end();
    }
    
    encode(text) {
      let encoded = this.font.encodeText(text);
      let glyphs = this.font.glyphsForString(`${text}`);
      let advances = this.font.advancesForGlyphs(glyphs);
      let positions = [];
      for (let i = 0; i < glyphs.length; i++) {
        let glyph = glyphs[i];
        positions.push({
          xAdvance: advances[i],
          yAdvance: 0,
          xOffset: 0,
          yOffset: 0,
          advanceWidth: this.font.widthOfGlyph(glyph)
        });
      }
      
      return [encoded, positions];
    }
    
    widthOfString(string, size) {
      let glyphs = this.font.glyphsForString(`${string}`);
      let advances = this.font.advancesForGlyphs(glyphs);
    
      let width = 0;
      for (let advance of Array.from(advances)) {
        width += advance;
      }
    
      let scale = size / 1000;  
      return width * scale;
    }
    
    static isStandardFont(name) {
      return name in STANDARD_FONTS;
    }
  };
  StandardFont.initClass();
  return StandardFont;
})();
  
export default StandardFont;
