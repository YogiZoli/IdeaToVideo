// icons/svg.mjs: an icon's SVG elements as path data, and path data moved
// into another coordinate space. The whiteboard scene draws only <path>
// elements in its own 0 0 1000 560 box (whiteboard-ink's strokes slot), and
// icon sets also use circles, rects, lines and polylines on a 24 grid.

const num = (v) => Number.parseFloat(v);
const attr = (tag, name) => {
  const m = new RegExp(String.raw`\s${name}\s*=\s*"([^"]*)"`).exec(tag);
  return m ? m[1] : null;
};

// Every drawable element of an SVG as path data. Elements that are not
// stroked (stroke="none", Tabler's invisible 24x24 frame) are left out.
export function svgToPaths(svg) {
  const out = [];
  for (const m of String(svg).matchAll(/<(path|circle|ellipse|rect|line|polyline|polygon)\b([^>]*)\/?>/g)) {
    const [tag, kind] = [m[0], m[1]];
    if (attr(tag, "stroke") === "none") continue;
    let d = null;
    if (kind === "path") d = attr(tag, "d");
    else if (kind === "circle" || kind === "ellipse") {
      const cx = num(attr(tag, "cx") ?? 0);
      const cy = num(attr(tag, "cy") ?? 0);
      const rx = num(attr(tag, kind === "circle" ? "r" : "rx") ?? 0);
      const ry = num(attr(tag, kind === "circle" ? "r" : "ry") ?? 0);
      if (rx > 0 && ry > 0) d = `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    } else if (kind === "rect") {
      const x = num(attr(tag, "x") ?? 0);
      const y = num(attr(tag, "y") ?? 0);
      const w = num(attr(tag, "width") ?? 0);
      const h = num(attr(tag, "height") ?? 0);
      let rx = num(attr(tag, "rx") ?? attr(tag, "ry") ?? 0);
      rx = Math.min(rx || 0, w / 2, h / 2);
      if (w > 0 && h > 0) {
        d = rx > 0
          ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${rx} 0 0 1 ${x + w} ${y + rx}V${y + h - rx}A${rx} ${rx} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${rx} 0 0 1 ${x} ${y + h - rx}V${y + rx}A${rx} ${rx} 0 0 1 ${x + rx} ${y}Z`
          : `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      }
    } else if (kind === "line") {
      d = `M${num(attr(tag, "x1") ?? 0)} ${num(attr(tag, "y1") ?? 0)}L${num(attr(tag, "x2") ?? 0)} ${num(attr(tag, "y2") ?? 0)}`;
    } else {
      const pts = (attr(tag, "points") ?? "").trim().split(/[\s,]+/).map(num);
      if (pts.length >= 4) {
        const pairs = [];
        for (let i = 0; i + 1 < pts.length; i += 2) pairs.push(`${pts[i]} ${pts[i + 1]}`);
        d = `M${pairs.join("L")}${kind === "polygon" ? "Z" : ""}`;
      }
    }
    if (d && d.trim()) out.push(d.trim());
  }
  return out;
}

const ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

// Path data as [command, numbers[]] pairs. Arc flags may be written without
// separators ("a1 1 0 011 1"), so they are read one character at a time.
export function parsePath(d) {
  const s = String(d);
  const out = [];
  let i = 0;
  const space = () => {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
  };
  const number = () => {
    space();
    const m = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
    if (!m) throw new Error(`Bad path data near "${s.slice(i, i + 12)}"`);
    i += m[0].length;
    return Number.parseFloat(m[0]);
  };
  const flag = () => {
    space();
    const c = s[i];
    if (c !== "0" && c !== "1") throw new Error(`Bad arc flag near "${s.slice(i, i + 12)}"`);
    i++;
    return Number(c);
  };
  let cmd = null;
  while (true) {
    space();
    if (i >= s.length) break;
    if (/[a-zA-Z]/.test(s[i])) {
      cmd = s[i++];
      if (!(cmd.toUpperCase() in ARGS)) throw new Error(`Unknown path command ${cmd}`);
      if (cmd.toUpperCase() === "Z") {
        out.push([cmd, []]);
        continue;
      }
    } else if (!cmd || cmd.toUpperCase() === "Z") throw new Error(`Bad path data near "${s.slice(i, i + 12)}"`);
    const up = cmd.toUpperCase();
    const vals = up === "A" ? [number(), number(), number(), flag(), flag(), number(), number()] : Array.from({ length: ARGS[up] }, number);
    out.push([cmd, vals]);
    // a moveto followed by more pairs continues as lineto
    if (up === "M") cmd = cmd === "M" ? "L" : "l";
  }
  return out;
}

const r2 = (x) => Math.round(x * 100) / 100;

// Path data scaled by `scale` and moved by (dx, dy). Relative commands only
// scale; absolute ones scale and move. A path that starts with a relative
// "m" starts at an absolute point.
export function transformPath(d, { scale = 1, dx = 0, dy = 0 } = {}) {
  const parts = parsePath(d);
  return parts
    .map(([cmd, v], k) => {
      const up = cmd.toUpperCase();
      const abs = cmd === up || (k === 0 && up === "M");
      const X = (x) => r2(abs ? x * scale + dx : x * scale);
      const Y = (y) => r2(abs ? y * scale + dy : y * scale);
      const c = k === 0 && up === "M" ? "M" : cmd;
      switch (up) {
        case "Z":
          return c;
        case "H":
          return `${c}${X(v[0])}`;
        case "V":
          return `${c}${Y(v[0])}`;
        case "A":
          return `${c}${r2(v[0] * scale)} ${r2(v[1] * scale)} ${v[2]} ${v[3]} ${v[4]} ${X(v[5])} ${Y(v[6])}`;
        default:
          return c + v.map((n, j) => (j % 2 === 0 ? X(n) : Y(n))).join(" ");
      }
    })
    .join("");
}
