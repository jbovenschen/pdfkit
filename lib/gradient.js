class PDFGradient {
  constructor(doc) {
    this.doc = doc;
    this.stops = [];
    this.embedded = false;
    this.transform = [1, 0, 0, 1, 0, 0];
    this._colorSpace = 'DeviceRGB';
  }
    
  stop(pos, color, opacity) {
    if (opacity == null) { opacity = 1; }
    opacity = Math.max(0, Math.min(1, opacity));
    this.stops.push([pos, this.doc._normalizeColor(color), opacity]);
    return this;
  }
    
  setTransform(m11, m12, m21, m22, dx, dy) {
    this.transform = [m11, m12, m21, m22, dx, dy];
    return this;
  }

  embed(m) {
    let asc, i;
    let end, fn;
    if (this.stops.length === 0) { return; }
    this.embedded = true;
    this.matrix = m;
    
    // if the last stop comes before 100%, add a copy at 100%
    let last = this.stops[this.stops.length - 1];
    if (last[0] < 1) {
      this.stops.push([1, last[1], last[2]]);
    }
    
    let bounds = [];
    let encode = [];
    let stops = [];
    
    for (i = 0, end = this.stops.length - 1, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
      encode.push(0, 1);
      if ((i + 2) !== this.stops.length) {
        bounds.push(this.stops[i + 1][0]);
      }
      
      fn = this.doc.ref({
        FunctionType: 2,
        Domain: [0, 1],
        C0: this.stops[i + 0][1],
        C1: this.stops[i + 1][1],
        N: 1
      });
        
      stops.push(fn);
      fn.end();
    }
    
    // if there are only two stops, we don't need a stitching function
    if (stops.length === 1) {
      fn = stops[0];
    } else {
      fn = this.doc.ref({
        FunctionType: 3, // stitching function
        Domain: [0, 1],
        Functions: stops,
        Bounds: bounds,
        Encode: encode
      });
        
      fn.end();
    }
        
    this.id = `Sh${++this.doc._gradCount}`;
    
    let shader = this.shader(fn);
    shader.end();
    
    let pattern = this.doc.ref({
      Type: 'Pattern',
      PatternType: 2,
      Shading: shader,
      Matrix: (Array.from(this.matrix).map((v) => +v.toFixed(5)))
    });

    pattern.end();
    
    if (this.stops.some(stop => stop[2] < 1)) {
      let grad = this.opacityGradient();
      grad._colorSpace = 'DeviceGray';
      
      for (let stop of Array.from(this.stops)) {
        grad.stop(stop[0], [stop[2]]);
      }
        
      grad = grad.embed(this.matrix);
      
      let pageBBox = [0, 0, this.doc.page.width, this.doc.page.height];
      
      let form = this.doc.ref({
        Type: 'XObject',
        Subtype: 'Form',
        FormType: 1,
        BBox: pageBBox,
        Group: {
          Type: 'Group',
          S: 'Transparency',
          CS: 'DeviceGray'
        },
        Resources: {
          ProcSet: ['PDF', 'Text', 'ImageB', 'ImageC', 'ImageI'],
          Pattern: {
            Sh1: grad
          }
        }
      });
      
      form.write("/Pattern cs /Sh1 scn");
      form.end(`${pageBBox.join(" ")} re f`);
      
      let gstate = this.doc.ref({
        Type: 'ExtGState',
        SMask: {
          Type: 'Mask',
          S: 'Luminosity',
          G: form
        }
      });
      
      gstate.end();
      
      let opacityPattern = this.doc.ref({
        Type: 'Pattern',
        PatternType: 1,
        PaintType: 1,
        TilingType: 2,
        BBox: pageBBox,
        XStep: pageBBox[2],
        YStep: pageBBox[3],
        Resources: {
          ProcSet: ['PDF', 'Text', 'ImageB', 'ImageC', 'ImageI'],
          Pattern: {
            Sh1: pattern
          },
          ExtGState: {
            Gs1: gstate
          }
        }
      });
      
      opacityPattern.write("/Gs1 gs /Pattern cs /Sh1 scn");
      opacityPattern.end(`${pageBBox.join(" ")} re f`);
      
      this.doc.page.patterns[this.id] = opacityPattern;
      
    } else {
      this.doc.page.patterns[this.id] = pattern;
    }
      
    return pattern;
  }

  apply(op) {
    // apply gradient transform to existing document ctm
    let [m0, m1, m2, m3, m4, m5] = Array.from(this.doc._ctm.slice());
    let [m11, m12, m21, m22, dx, dy] = Array.from(this.transform);
    let m = [(m0 * m11) + (m2 * m12),
         (m1 * m11) + (m3 * m12),
         (m0 * m21) + (m2 * m22),
         (m1 * m21) + (m3 * m22),
         (m0 * dx) + (m2 * dy) + m4,
         (m1 * dx) + (m3 * dy) + m5];

    if (!this.embedded || (m.join(" ") !== this.matrix.join(" "))) { this.embed(m); }
    return this.doc.addContent(`/${this.id} ${op}`);
  }
}

class PDFLinearGradient extends PDFGradient {
  constructor(doc, x1, y1, x2, y2) {
    {
      // Hack: trick babel into allowing this before super.
      if (false) { super(); }
      let thisFn = (() => { this; }).toString();
      let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
      eval(`${thisName} = this;`);
    }
    this.doc = doc;
    this.x1 = x1;
    this.y1 = y1;
    this.x2 = x2;
    this.y2 = y2;
    super(...arguments);
  }
    
  shader(fn) {
    return this.doc.ref({
      ShadingType: 2,
      ColorSpace: this._colorSpace,
      Coords: [this.x1, this.y1, this.x2, this.y2],
      Function: fn,
      Extend: [true, true]});
  }
      
  opacityGradient() {
    return new PDFLinearGradient(this.doc, this.x1, this.y1, this.x2, this.y2);
  }
}
    
class PDFRadialGradient extends PDFGradient {
  constructor(doc, x1, y1, r1, x2, y2, r2) {
    {
      // Hack: trick babel into allowing this before super.
      if (false) { super(); }
      let thisFn = (() => { this; }).toString();
      let thisName = thisFn.slice(thisFn.indexOf('{') + 1, thisFn.indexOf(';')).trim();
      eval(`${thisName} = this;`);
    }
    this.doc = doc;
    this.x1 = x1;
    this.y1 = y1;
    this.r1 = r1;
    this.x2 = x2;
    this.y2 = y2;
    this.r2 = r2;
    super(...arguments);
  }
    
  shader(fn) {
    return this.doc.ref({
      ShadingType: 3,
      ColorSpace: this._colorSpace,
      Coords: [this.x1, this.y1, this.r1, this.x2, this.y2, this.r2],
      Function: fn,
      Extend: [true, true]});
  }
      
  opacityGradient() {
    return new PDFRadialGradient(this.doc, this.x1, this.y1, this.r1, this.x2, this.y2, this.r2);
  }
}
      
export { PDFGradient, PDFLinearGradient, PDFRadialGradient };
