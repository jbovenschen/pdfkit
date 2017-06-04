import SVGPath from '../path';
import { number } from '../object';

// This constant is used to approximate a symmetrical arc using a cubic
// Bezier curve.
const KAPPA = 4.0 * ((Math.sqrt(2) - 1.0) / 3.0);
export default {
  initVector() {
    this._ctm = [1, 0, 0, 1, 0, 0]; // current transformation matrix
    return this._ctmStack = [];
  },

  save() {
    this._ctmStack.push(this._ctm.slice());
    // TODO: save/restore colorspace and styles so not setting it unnessesarily all the time?
    return this.addContent('q');
  },

  restore() {
    this._ctm = this._ctmStack.pop() || [1, 0, 0, 1, 0, 0];
    return this.addContent('Q');
  },

  closePath() {
    return this.addContent('h');
  },

  lineWidth(w) {
    return this.addContent(`${number(w)} w`);
  },

  _CAP_STYLES: {
    BUTT: 0,
    ROUND: 1,
    SQUARE: 2
  },

  lineCap(c) {
    if (typeof c === 'string') { c = this._CAP_STYLES[c.toUpperCase()]; }
    return this.addContent(`${c} J`);
  },

  _JOIN_STYLES: {
    MITER: 0,
    ROUND: 1,
    BEVEL: 2
  },

  lineJoin(j) {
    if (typeof j === 'string') { j = this._JOIN_STYLES[j.toUpperCase()]; }
    return this.addContent(`${j} j`);
  },

  miterLimit(m) {
    return this.addContent(`${number(m)} M`);
  },

  dash(length, options) {
    let phase;
    if (options == null) { options = {}; }
    if (length == null) { return this; }
    if (Array.isArray(length)) {
      length = (Array.from(length).map((v) => number(v))).join(' ');
      phase = options.phase || 0;
      return this.addContent(`[${length}] ${number(phase)} d`);
    } else {
      let space = options.space != null ? options.space : length;
      phase = options.phase || 0;
      return this.addContent(`[${number(length)} ${number(space)}] ${number(phase)} d`);
    }
  },

  undash() {
    return this.addContent("[] 0 d");
  },

  moveTo(x, y) {
    return this.addContent(`${number(x)} ${number(y)} m`);
  },

  lineTo(x, y) {
    return this.addContent(`${number(x)} ${number(y)} l`);
  },

  bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
    return this.addContent(`${number(cp1x)} ${number(cp1y)} ${number(cp2x)} ${number(cp2y)} ${number(x)} ${number(y)} c`);
  },

  quadraticCurveTo(cpx, cpy, x, y) {
    return this.addContent(`${number(cpx)} ${number(cpy)} ${number(x)} ${number(y)} v`);
  },

  rect(x, y, w, h) {
    return this.addContent(`${number(x)} ${number(y)} ${number(w)} ${number(h)} re`);
  },

  roundedRect(x, y, w, h, r) {
    if (r == null) { r = 0; }
    r = Math.min(r, 0.5 * w, 0.5 * h);

    // amount to inset control points from corners (see `ellipse`)
    let c = r * (1.0 - KAPPA);

    this.moveTo(x + r, y);
    this.lineTo((x + w) - r, y);
    this.bezierCurveTo((x + w) - c, y, x + w, y + c, x + w, y + r);
    this.lineTo(x + w, (y + h) - r);
    this.bezierCurveTo(x + w, (y + h) - c, (x + w) - c, y + h, (x + w) - r, y + h);
    this.lineTo(x + r, y + h);
    this.bezierCurveTo(x + c, y + h, x, (y + h) - c, x, (y + h) - r);
    this.lineTo(x, y + r);
    this.bezierCurveTo(x, y + c, x + c, y, x + r, y);
    return this.closePath();
  },

  ellipse(x, y, r1, r2) {
    // based on http://stackoverflow.com/questions/2172798/how-to-draw-an-oval-in-html5-canvas/2173084#2173084
    if (r2 == null) { r2 = r1; }
    x -= r1;
    y -= r2;
    let ox = r1 * KAPPA;
    let oy = r2 * KAPPA;
    let xe = x + (r1 * 2);
    let ye = y + (r2 * 2);
    let xm = x + r1;
    let ym = y + r2;

    this.moveTo(x, ym);
    this.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
    this.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
    this.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
    this.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);
    return this.closePath();
  },

  circle(x, y, radius) {
    return this.ellipse(x, y, radius);
  },

  polygon(...points) {
    this.moveTo(...Array.from(points.shift() || []));
    for (let point of Array.from(points)) { this.lineTo(...Array.from(point || [])); }
    return this.closePath();
  },

  path(path) {
    SVGPath.apply(this, path);
    return this;
  },

  _windingRule(rule) {
    if (/even-?odd/.test(rule)) {
      return '*';
    }

    return '';
  },

  fill(color, rule) {
    if (/(even-?odd)|(non-?zero)/.test(color)) {
      rule = color;
      color = null;
    }

    if (color) { this.fillColor(color); }
    return this.addContent(`f${this._windingRule(rule)}`);
  },

  stroke(color) {
    if (color) { this.strokeColor(color); }
    return this.addContent('S');
  },

  fillAndStroke(fillColor, strokeColor, rule) {
    if (strokeColor == null) { strokeColor = fillColor; }
    let isFillRule = /(even-?odd)|(non-?zero)/;
    if (isFillRule.test(fillColor)) {
      rule = fillColor;
      fillColor = null;
    }

    if (isFillRule.test(strokeColor)) {
      rule = strokeColor;
      strokeColor = fillColor;
    }

    if (fillColor) {
      this.fillColor(fillColor);
      this.strokeColor(strokeColor);
    }

    return this.addContent(`B${this._windingRule(rule)}`);
  },

  clip(rule) {
    return this.addContent(`W${this._windingRule(rule)} n`);
  },

  transform(m11, m12, m21, m22, dx, dy) {
    // keep track of the current transformation matrix
    let m = this._ctm;
    let [m0, m1, m2, m3, m4, m5] = Array.from(m);
    m[0] = (m0 * m11) + (m2 * m12);
    m[1] = (m1 * m11) + (m3 * m12);
    m[2] = (m0 * m21) + (m2 * m22);
    m[3] = (m1 * m21) + (m3 * m22);
    m[4] = (m0 * dx) + (m2 * dy) + m4;
    m[5] = (m1 * dx) + (m3 * dy) + m5;

    let values = ([m11, m12, m21, m22, dx, dy].map((v) => number(v))).join(' ');
    return this.addContent(`${values} cm`);
  },

  translate(x, y) {
    return this.transform(1, 0, 0, 1, x, y);
  },

  rotate(angle, options) {
    let y;
    if (options == null) { options = {}; }
    let rad = (angle * Math.PI) / 180;
    let cos = Math.cos(rad);
    let sin = Math.sin(rad);
    let x = (y = 0);

    if (options.origin != null) {
      [x, y] = Array.from(options.origin);
      let x1 = (x * cos) - (y * sin);
      let y1 = (x * sin) + (y * cos);
      x -= x1;
      y -= y1;
    }

    return this.transform(cos, sin, -sin, cos, x, y);
  },

  scale(xFactor, yFactor, options) {
    let y;
    if (yFactor == null) { yFactor = xFactor; }
    if (options == null) { options = {}; }
    if (arguments.length === 2) {
      yFactor = xFactor;
      options = yFactor;
    }

    let x = (y = 0);
    if (options.origin != null) {
      [x, y] = Array.from(options.origin);
      x -= xFactor * x;
      y -= yFactor * y;
    }

    return this.transform(xFactor, 0, 0, yFactor, x, y);
  }
};
