/**
 * INFJ Sage — artwork source.
 *
 * This module owns the character's geometry. The same region is embedded
 * verbatim inside `lib/client.js` (which cannot import, because it is built as
 * a self-contained lazy-CJS bundle), and `tools/build-art.mjs` regenerates the
 * embedded copy from here. `tools/check.mjs` fails the build when the two
 * copies drift apart, so there is exactly one place to edit the drawing.
 *
 * The drawing is flat low-poly: no gradients, no strokes on the body, and a
 * fixed 400x400 coordinate space. Live movement is introduced by CSS on the
 * group ids, never by extra geometry.
 */

export const ART_VIEWBOX = 400;

/** Transparent strip between the artwork's bottom edge and the box edge. */
export const BOTTOM_INSET = 16;

export const SVG_NS = 'http://www.w3.org/2000/svg';

/* ART-REGION-START */
function poly(points, fill, extra) {
  return { tag: 'polygon', attrs: Object.assign({ points: points, fill: fill }, extra || {}) };
}

function path(d, fill, extra) {
  return { tag: 'path', attrs: Object.assign({ d: d, fill: fill }, extra || {}) };
}

function ellipse(cx, cy, rx, ry, fill, extra) {
  return { tag: 'ellipse', attrs: Object.assign({ cx: cx, cy: cy, rx: rx, ry: ry, fill: fill }, extra || {}) };
}

function group(key, children, attrs) {
  return { tag: 'g', key: key, attrs: Object.assign({ id: key }, attrs || {}), children: children };
}

/**
 * The staff, drawn after the arm so the shaft reads in front of the sleeve.
 * It leans right and is gripped at (430, 300).
 */
function staffShapes() {
  return [
    poly('418,362 490,190 504,192 432,366', '#5E7C33'),
    poly('490,190 508,144 519,148 501,196', '#4F6B2B'),
    path('M494 184 Q522 158 546 140', 'none', {
      stroke: '#5E7C33',
      'stroke-width': 7,
      'stroke-linecap': 'round'
    }),
    path('M502 162 Q508 138 502 120', 'none', {
      stroke: '#5E7C33',
      'stroke-width': 7,
      'stroke-linecap': 'round'
    })
  ];
}

/**
 * The whole character as a flat list of group descriptors, back to front.
 * @param {{ headOnly?: boolean }} [options] `headOnly` drops everything except
 * the head and beard, for the small restore affordance.
 * @returns {object[]}
 */
function sageNodes(options) {
  var opts = options || {};
  var nodes = [
    group('shadow', [ellipse(196, 392, 84, 10, 'rgba(0,0,0,0.20)')]),

    // Arm behind the robe so the sleeve tucks into the shoulder.
    group('arm-staff', [
      poly('340,268 368,286 402,320 388,340', '#82B65F'),
      poly('368,286 402,320 388,340 352,306', '#6FA453'),
      poly('400,314 428,332 404,352 378,332', '#EEB49A')
    ]),

    group('feet', [
      poly('150,366 208,366 208,390 138,390 138,378', '#1F6B5A'),
      poly('150,366 208,366 208,376 144,376', '#2E8370'),
      poly('232,366 290,366 290,378 290,390 222,390', '#1F6B5A'),
      poly('232,366 290,366 290,376 232,376', '#2E8370')
    ]),

    group('body', [
      group('robe', [
        poly('140,272 168,252 248,244 276,264 292,362 116,350', '#93C46C'),
        poly('214,242 266,256 284,284 292,358 218,350', '#8ABA63'),
        poly('266,330 292,358 230,350', '#7CAC57'),
        poly('202,296 292,358 116,350', '#9BCB74'),
        poly('116,350 292,358 294,370 114,362', '#6FA24C'),
        poly('148,262 174,246 194,248 168,272', '#3E8F6B'),
        poly('266,262 240,248 220,250 246,272', '#2F7D5C'),
        poly('126,286 148,274 204,360 176,358', '#7FB55F'),
        poly('154,260 180,252 244,336 220,344', '#A9D97E', { opacity: 0.45 }),
        poly('244,292 266,296 188,366 168,362', '#82B25E', { opacity: 0.4 })
      ]),
      group('legs', [
        poly('158,314 212,314 212,360 144,356 144,344', '#2A7A63'),
        poly('228,314 282,314 282,348 282,362 222,358', '#2A7A63')
      ]),
      group('arm-left', [
        poly('124,262 152,268 146,304 120,300', '#7FB55F'),
        poly('124,262 140,266 134,300 120,300', '#6FA453'),
        poly('120,296 148,298 146,324 118,320', '#EEB49A')
      ]),
      group('sash', [
        poly('248,270 266,302 290,340 272,352', '#3FBBA0'),
        poly('250,272 258,286 278,330 270,336', '#5FD3B8', { opacity: 0.7 }),
        poly('116,310 286,300 288,312 118,324', '#3FBBA0'),
        poly('116,310 286,300 286,306 116,316', '#5FD3B8', { opacity: 0.5 }),
        poly('278,300 294,292 298,306 284,316', '#2E9B84')
      ]),
      poly('126,254 266,246 266,258 126,266', '#C9D6C6')
    ]),

    // The staff sits in front of the arm it crosses.
    group('staff', staffShapes()),

    group('head', [
      poly('200,152 236,160 268,178 286,206 280,252 250,276 200,280 150,276 120,252 114,206 132,178 164,160', '#EFC7AC'),
      poly('200,150 180,156 150,176 128,204 124,240 126,250 178,240 158,184 186,152', '#F7D6BB'),
      poly('200,152 236,160 268,178 286,206 280,252 250,276 200,280 232,244 244,196 226,156', '#F3CFB4'),
      poly('162,146 200,118 250,142 240,160 200,150', '#D6D5D0'),
      poly('162,146 200,118 178,152', '#BDBBB4'),
      poly('136,202 264,202 264,215 136,215', '#CFD2CF'),
      poly('172,262 186,216 208,236', '#D8AF95', { opacity: 0.5 }),
      group('brows', [
        poly('152,218 186,226 185,238 150,230', '#D8D8D2'),
        poly('248,218 282,226 284,238 250,230', '#D8D8D2')
      ]),
      group('eyes', [
        ellipse(174, 240, 7, 9.2, '#24401F'),
        ellipse(260, 240, 7, 9.2, '#24401F'),
        ellipse(176.4, 236.4, 2.4, 3.2, '#FFFFFF', { opacity: 0.85 }),
        ellipse(262.4, 236.4, 2.4, 3.2, '#FFFFFF', { opacity: 0.85 })
      ]),
      group('beard', [
        poly(
          '180,262 184,270 190,278 196,284 200,286 204,284 210,278 216,270 220,262 ' +
            '226,278 230,296 231,310 229,322 223,333 213,342 200,346 187,342 177,333 ' +
            '171,322 169,310 170,296 174,278',
          '#EDEDEA'
        ),
        poly(
          '174,264 180,270 188,276 194,279 200,282 206,279 212,276 220,270 226,264 ' +
            '230,272 224,284 214,292 206,295 200,296 194,295 186,292 176,284 170,272',
          '#FAFAF7'
        ),
        poly('196,298 204,298 204,338 200,342 196,338', '#D6D6D0', { opacity: 0.65 })
      ])
    ]),

    group('sparkles', [
      path('M0 -9 L2.6 -2.6 L9 0 L2.6 2.6 L0 9 L-2.6 2.6 L-9 0 L-2.6 -2.6 Z', '#C8992E', {
        transform: 'translate(560 112) scale(0.8)'
      }),
      path('M0 -9 L2.6 -2.6 L9 0 L2.6 2.6 L0 9 L-2.6 2.6 L-9 0 L-2.6 -2.6 Z', '#D8A93C', {
        transform: 'translate(348 150) scale(0.62)'
      }),
      path('M0 -9 L2.6 -2.6 L9 0 L2.6 2.6 L0 9 L-2.6 2.6 L-9 0 L-2.6 -2.6 Z', '#C8992E', {
        transform: 'translate(316 92) scale(0.5)'
      }),
      path('M0 -9 L2.6 -2.6 L9 0 L2.6 2.6 L0 9 L-2.6 2.6 L-9 0 L-2.6 -2.6 Z', '#B9CE86', {
        transform: 'translate(78 304) scale(0.45)'
      })
    ]),

    group('zs', [
      poly('322,120 340,120 322,138 340,138 340,145 316,145 334,127 316,127 316,120', '#7E9C82'),
      poly('348,84 362,84 348,98 362,98 362,104 342,104 356,90 342,90 342,84', '#93AE96')
    ])
  ];

  if (opts.headOnly) {
    var keep = { shadow: false, 'arm-staff': false, staff: false, feet: false, body: false, sparkles: false, zs: false };
    nodes = nodes.filter(function (node) {
      return keep[node.key] !== false;
    });
  }
  return nodes;
}
/* ART-REGION-END */

/**
 * Serialises one node descriptor to an SVG element string, preserving attribute
 * order so a regenerated file is byte-stable.
 * @param {object} node
 * @returns {string}
 */
export function serializeNode(node) {
  var attrs = Object.keys(node.attrs || {})
    .filter(function (name) {
      return node.attrs[name] !== undefined;
    })
    .map(function (name) {
      return ' ' + name + '="' + String(node.attrs[name]).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"';
    })
    .join('');
  var children = (node.children || []).map(serializeNode).join('');
  return '<' + node.tag + attrs + (children ? '>' + children + '</' + node.tag + '>' : '/>');
}

/**
 * The character as a standalone SVG document string.
 * @param {{ headOnly?: boolean, size?: number, background?: string }} [options]
 * @returns {string}
 */
export function renderSageSvg(options) {
  var opts = options || {};
  var size = opts.size || ART_VIEWBOX;
  var body = sageNodes({ headOnly: opts.headOnly === true }).map(serializeNode).join('');
  var background = opts.background
    ? '<rect width="' + ART_VIEWBOX + '" height="' + ART_VIEWBOX + '" fill="' + opts.background + '"/>'
    : '';
  return (
    '<svg xmlns="' +
    SVG_NS +
    '" viewBox="0 0 ' +
    ART_VIEWBOX +
    ' ' +
    ART_VIEWBOX +
    '" width="' +
    size +
    '" height="' +
    size +
    '" role="img" aria-label="INFJ Sage">' +
    background +
    body +
    '</svg>'
  );
}

export { sageNodes };
