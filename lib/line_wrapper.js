import { EventEmitter } from 'events';
import LineBreaker from 'linebreak';

class LineWrapper extends EventEmitter {
  constructor(document, options) {
    {
      // Hack: trick babel into allowing this before super.
      if (false) { super(); }
      let thisFn = (() => { this; }).toString();
      let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
      eval(`${thisName} = this;`);
    }
    this.document = document;
    this.indent    = options.indent || 0;
    this.characterSpacing = options.characterSpacing || 0;
    this.wordSpacing = options.wordSpacing === 0;
    this.columns   = options.columns || 1;
    this.columnGap   = options.columnGap != null ? options.columnGap : 18; // 1/4 inch
    this.lineWidth   = (options.width - (this.columnGap * (this.columns - 1))) / this.columns;
    this.spaceLeft = this.lineWidth;
    this.startX    = this.document.x;
    this.startY    = this.document.y;
    this.column    = 1;
    this.ellipsis  = options.ellipsis;
    this.continuedX  = 0;
    this.features = options.features;
    
    // calculate the maximum Y position the text can appear at
    if (options.height != null) {
      this.height = options.height;
      this.maxY = this.startY + options.height;
    } else {
      this.maxY = this.document.page.maxY();
    }
    
    // handle paragraph indents
    this.on('firstLine', options => {
      // if this is the first line of the text segment, and
      // we're continuing where we left off, indent that much
      // otherwise use the user specified indent option
      let indent = this.continuedX || this.indent;
      this.document.x += indent;
      this.lineWidth -= indent;
      
      return this.once('line', () => {
        this.document.x -= indent;
        this.lineWidth += indent;
        if (options.continued && !this.continuedX) {
          this.continuedX = this.indent;
        }
        if (!options.continued) { return this.continuedX = 0; }
      });
    });
    
    // handle left aligning last lines of paragraphs
    this.on('lastLine', options => {
      let { align } = options;
      if (align === 'justify') { options.align = 'left'; }
      this.lastLine = true;
      
      return this.once('line', () => {
        this.document.y += options.paragraphGap || 0;
        options.align = align;
        return this.lastLine = false;
      });
    });
  }
        
  wordWidth(word) {
    return this.document.widthOfString(word, this) + this.characterSpacing + this.wordSpacing;
  }
        
  eachWord(text, fn) {
    // setup a unicode line breaker
    let bk;
    let breaker = new LineBreaker(text);
    let last = null;
    let wordWidths = Object.create(null);
    
    while ((bk = breaker.nextBreak())) {
      var shouldContinue;
      let word = text.slice((last != null ? last.position : undefined) || 0, bk.position);
      let w = wordWidths[word] != null ? wordWidths[word] : (wordWidths[word] = this.wordWidth(word));
      
      // if the word is longer than the whole line, chop it up
      // TODO: break by grapheme clusters, not JS string characters
      if (w > (this.lineWidth + this.continuedX)) {
        // make some fake break objects
        let lbk = last;
        let fbk = {};
        
        while (word.length) {
          // fit as much of the word as possible into the space we have
          let l = word.length;
          while (w > this.spaceLeft) {
            w = this.wordWidth(word.slice(0, --l));
          }
            
          // send a required break unless this is the last piece
          fbk.required = l < word.length;
          shouldContinue = fn(word.slice(0, l), w, fbk, lbk);
          lbk = {required: false};
          
          // get the remaining piece of the word
          word = word.slice(l);
          w = this.wordWidth(word);
          
          if (shouldContinue === false) { break; }
        }
      } else {
        // otherwise just emit the break as it was given to us
        shouldContinue = fn(word, w, bk, last);
      }
        
      if (shouldContinue === false) { break; }
      last = bk;
    }
      
  }
    
  wrap(text, options) {
    // override options from previous continued fragments
    if (options.indent != null) { this.indent    = options.indent; }
    if (options.characterSpacing != null) { this.characterSpacing = options.characterSpacing; }
    if (options.wordSpacing != null) { this.wordSpacing = options.wordSpacing; }
    if (options.ellipsis != null) { this.ellipsis  = options.ellipsis; }
    
    // make sure we're actually on the page 
    // and that the first line of is never by 
    // itself at the bottom of a page (orphans)
    let nextY = this.document.y + this.document.currentLineHeight(true);
    if ((this.document.y > this.maxY) || (nextY > this.maxY)) {
      this.nextSection();
    }
        
    let buffer = '';
    let textWidth = 0;
    let wc = 0;
    let lc = 0;
    
    let { y } = this.document; // used to reset Y pos if options.continued (below)
    let emitLine = () => {
      options.textWidth = textWidth + (this.wordSpacing * (wc - 1));
      options.wordCount = wc;
      options.lineWidth = this.lineWidth;
      ({ y } = this.document);
      this.emit('line', buffer, options, this);
      return lc++;
    };
      
    this.emit('sectionStart', options, this);
    
    this.eachWord(text, (word, w, bk, last) => {
      if ((last == null) || last.required) {
        this.emit('firstLine', options, this);
        this.spaceLeft = this.lineWidth;
      }
      
      if (w <= this.spaceLeft) {
        buffer += word;
        textWidth += w;
        wc++;
      }
              
      if (bk.required || (w > this.spaceLeft)) {
        if (bk.required) {
          this.emit('lastLine', options, this);
        }
          
        // if the user specified a max height and an ellipsis, and is about to pass the
        // max height and max columns after the next line, append the ellipsis
        let lh = this.document.currentLineHeight(true);
        if ((this.height != null) && this.ellipsis && ((this.document.y + (lh * 2)) > this.maxY) && (this.column >= this.columns)) {
          if (this.ellipsis === true) { this.ellipsis = '…'; } // map default ellipsis character
          buffer = buffer.replace(/\s+$/, '');
          textWidth = this.wordWidth(buffer + this.ellipsis);
          
          // remove characters from the buffer until the ellipsis fits
          while (textWidth > this.lineWidth) {
            buffer = buffer.slice(0, -1).replace(/\s+$/, '');
            textWidth = this.wordWidth(buffer + this.ellipsis);
          }
        
          buffer = buffer + this.ellipsis;
        }
          
        if (bk.required && (w > this.spaceLeft)) {
          buffer = word;
          textWidth = w;
          wc = 1;
        }

        emitLine();
        
        // if we've reached the edge of the page, 
        // continue on a new page or column
        if ((this.document.y + lh) > this.maxY) {
          let shouldContinue = this.nextSection();
          
          // stop if we reached the maximum height
          if (!shouldContinue) {
            wc = 0;
            buffer = '';
            return false;
          }
        }
        
        // reset the space left and buffer
        if (bk.required) {
          this.spaceLeft = this.lineWidth;
          buffer = '';
          textWidth = 0;
          return wc = 0;
        } else {
          // reset the space left and buffer
          this.spaceLeft = this.lineWidth - w;
          buffer = word;
          textWidth = w;
          return wc = 1;
        }
      } else {
        return this.spaceLeft -= w;
      }
    });
      
    if (wc > 0) {
      this.emit('lastLine', options, this);
      emitLine();
    }
        
    this.emit('sectionEnd', options, this);
    
    // if the wrap is set to be continued, save the X position
    // to start the first line of the next segment at, and reset
    // the y position
    if (options.continued === true) {
      if (lc > 1) { this.continuedX = 0; }
      this.continuedX += options.textWidth;
      return this.document.y = y;
    } else {
      return this.document.x = this.startX;
    }
  }
          
  nextSection(options) {
    this.emit('sectionEnd', options, this);
    
    if (++this.column > this.columns) {
      // if a max height was specified by the user, we're done.
      // otherwise, the default is to make a new page at the bottom.
      if (this.height != null) { return false; }
               
      this.document.addPage();
      this.column = 1;
      this.startY = this.document.page.margins.top;
      this.maxY = this.document.page.maxY();
      this.document.x = this.startX;
      if (this.document._fillColor) { this.document.fillColor(...Array.from(this.document._fillColor || [])); }
      this.emit('pageBreak', options, this);
    } else {
      this.document.x += this.lineWidth + this.columnGap;
      this.document.y = this.startY;
      this.emit('columnBreak', options, this);
    }
    
    this.emit('sectionStart', options, this);
    return true;
  }
}
      
export default LineWrapper;
