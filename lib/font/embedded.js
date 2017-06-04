import PDFFont from '../font';
import PDFObject from '../object';

var EmbeddedFont = (function() {
  let toHex = undefined;
  EmbeddedFont = class EmbeddedFont extends PDFFont {
    static initClass() {
  
      toHex = function(...codePoints) {
        let codes = Array.from(codePoints).map((code) =>
          (`0000${code.toString(16)}`).slice(-4));
  
        return codes.join('');
      };
    }
    constructor(document, font, id) {
      {
        // Hack: trick babel into allowing this before super.
        if (false) { super(); }
        let thisFn = (() => { this; }).toString();
        let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
        eval(`${thisName} = this;`);
      }
      this.document = document;
      this.font = font;
      this.id = id;
      this.subset = this.font.createSubset();
      this.unicode = [[0]];
      this.widths = [this.font.getGlyph(0).advanceWidth];

      this.name = this.font.postscriptName;
      this.scale = 1000 / this.font.unitsPerEm;
      this.ascender = this.font.ascent * this.scale;
      this.descender = this.font.descent * this.scale;
      this.lineGap = this.font.lineGap * this.scale;
      this.bbox = this.font.bbox;
    }

    encode(text, features) {
      let {glyphs, positions} = this.font.layout(text, features);

      let res = [];
      for (let i = 0; i < glyphs.length; i++) {
        let glyph = glyphs[i];
        let gid = this.subset.includeGlyph(glyph.id);
        res.push((`0000${gid.toString(16)}`).slice(-4));

        if (this.widths[gid] == null) { this.widths[gid] = glyph.advanceWidth * this.scale; }
        if (this.unicode[gid] == null) { this.unicode[gid] = glyph.codePoints; }

        for (let key in positions[i]) {
          positions[i][key] *= this.scale;
        }

        positions[i].advanceWidth = glyph.advanceWidth * this.scale;
      }

      return [res, positions];
    }

    widthOfString(string, size, features) {
      let width = this.font.layout(string, features).advanceWidth;
      let scale = size / this.font.unitsPerEm;
      return width * scale;
    }

    embed() {
      let isCFF = (this.subset.cff != null);
      let fontFile = this.document.ref();

      if (isCFF) {
        fontFile.data.Subtype = 'CIDFontType0C';
      }

      this.subset.encodeStream().pipe(fontFile);

      let familyClass = ((this.font['OS/2'] != null ? this.font['OS/2'].sFamilyClass : undefined) || 0) >> 8;
      let flags = 0;
      if (this.font.post.isFixedPitch) { flags |= 1 << 0; }
      if (1 <= familyClass && familyClass <= 7) { flags |= 1 << 1; }
      flags |= 1 << 2; // assume the font uses non-latin characters
      if (familyClass === 10) { flags |= 1 << 3; }
      if (this.font.head.macStyle.italic) { flags |= 1 << 6; }

      // generate a random tag (6 uppercase letters. 65 is the char code for 'A')
      let tag = ([0, 1, 2, 3, 4, 5].map((i) => String.fromCharCode((Math.random() * 26) + 65))).join('');
      let name = tag + '+' + this.font.postscriptName;

      let { bbox } = this.font;
      let descriptor = this.document.ref({
        Type: 'FontDescriptor',
        FontName: name,
        Flags: flags,
        FontBBox: [bbox.minX * this.scale, bbox.minY * this.scale, bbox.maxX * this.scale, bbox.maxY * this.scale],
        ItalicAngle: this.font.italicAngle,
        Ascent: this.ascender,
        Descent: this.descender,
        CapHeight: (this.font.capHeight || this.font.ascent) * this.scale,
        XHeight: (this.font.xHeight || 0) * this.scale,
        StemV: 0
      }); // not sure how to calculate this

      if (isCFF) {
        descriptor.data.FontFile3 = fontFile;
      } else {
        descriptor.data.FontFile2 = fontFile;
      }

      descriptor.end();

      let descendantFont = this.document.ref({
        Type: 'Font',
        Subtype: isCFF ? 'CIDFontType0' : 'CIDFontType2',
        BaseFont: name,
        CIDSystemInfo: {
          Registry: new String('Adobe'),
          Ordering: new String('Identity'),
          Supplement: 0
        },
        FontDescriptor: descriptor,
        W: [0, this.widths]});

      descendantFont.end();

      this.dictionary.data = {
        Type: 'Font',
        Subtype: 'Type0',
        BaseFont: name,
        Encoding: 'Identity-H',
        DescendantFonts: [descendantFont],
        ToUnicode: this.toUnicodeCmap()
      };

      return this.dictionary.end();
    }

    // Maps the glyph ids encoded in the PDF back to unicode strings
    // Because of ligature substitutions and the like, there may be one or more
    // unicode characters represented by each glyph.
    toUnicodeCmap() {
      let cmap = this.document.ref();

      let entries = [];
      for (let codePoints of Array.from(this.unicode)) {
        let encoded = [];

        // encode codePoints to utf16
        for (let value of Array.from(codePoints)) {
          if (value > 0xffff) {
            value -= 0x10000;
            encoded.push(toHex(((value >>> 10) & 0x3ff) | 0xd800));
            value = 0xdc00 | (value & 0x3ff);
          }

          encoded.push(toHex(value));
        }

        entries.push(`<${encoded.join(' ')}>`);
      }

      cmap.end(`\
/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo <<
  /Registry (Adobe)
  /Ordering (UCS)
  /Supplement 0
>> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000><ffff>
endcodespacerange
1 beginbfrange
<0000> <${toHex(entries.length - 1)}> [${entries.join(' ')}]
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end\
`
      );

      return cmap;
    }
  };
  EmbeddedFont.initClass();
  return EmbeddedFont;
})();

export default EmbeddedFont;
