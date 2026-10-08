// INFJ Sage — browser half. Self-contained bundle, no build step required.
//
// Registers one factory with the DSH client module loader. Every side effect
// (styles, DOM) is created inside the factory closure, so nothing runs until the
// plugin is first materialised. The companion reads the client session stores
// through the props the slot renderer binds, and writes only to its own
// elements and to one namespaced localStorage key.
//
// Contract notes (verified against the installed DSH client):
//   * A bundle registers `{ id, factory }` with `window.__ModuleLoader__.load`.
//   * `factory` returns a Cordis plugin: `{ name, inject, apply(ctx) }`.
//   * Only React and ReactDOM are assumed to exist; every icon here is inline
//     SVG, so no optional UI package can break the pet.
//   * A slot component receives the injected business shares, which is where
//     `useSessions` and `useSessionStatus` come from.
window.__ModuleLoader__.load({
  id: 'dsh-plugin-infj-pet',
  factory: function (require) {
    'use strict';

    var React = require('react');
    var h = React.createElement;

    var module = { exports: {} };
    var exports = module.exports;

    /* ------------------------------------------------------------------ *
     * Constants
     * ------------------------------------------------------------------ */

    var STORE_KEY = 'dsh-plugin-infj-pet:v1';
    var STYLE_ID = 'dsh-plugin-infj-pet-styles';
    var ART_VIEWBOX = 400;
    /** Transparent strip between the artwork's bottom edge and the box edge. */
    var BOTTOM_INSET = 16;
    var MIN_BOX = 72;
    var EDGE_SNAP = 18;

    var SIZES = [
      { id: 's', label: { zh: '小', en: 'Small' }, px: 104 },
      { id: 'm', label: { zh: '中', en: 'Medium' }, px: 148 },
      { id: 'l', label: { zh: '大', en: 'Large' }, px: 200 }
    ];

    var NAP_CHOICES = [
      { id: 60000, label: { zh: '1 分钟', en: '1 min' } },
      { id: 180000, label: { zh: '3 分钟', en: '3 min' } },
      { id: 600000, label: { zh: '10 分钟', en: '10 min' } },
      { id: 0, label: { zh: '不睡', en: 'Never' } }
    ];

    /** The six visible states, each paired with the INFJ trait it expresses. */
    var STATES = ['resting', 'working', 'waiting', 'celebrating', 'sleeping', 'error'];

    var TRAITS = [
      {
        id: 'inner',
        badge: 'I',
        state: 'resting',
        title: { zh: '独处即充电', en: 'Recharged alone' },
        body: {
          zh: '安静的时候不是掉线，而是在把白天的碎片慢慢拼回一张完整的地图。',
          en: 'The quiet is not a blank — it is where the day is reassembled into one map.'
        }
      },
      {
        id: 'insight',
        badge: 'N',
        state: 'working',
        title: { zh: '先看模式，再看任务', en: 'Patterns before tasks' },
        body: {
          zh: '比起逐条打勾，更想先弄明白这些事到底指向同一个什么东西。',
          en: 'More interested in what all these pieces point at than in ticking them off one by one.'
        }
      },
      {
        id: 'empathy',
        badge: 'F',
        state: 'waiting',
        title: { zh: '先接住情绪', en: 'Feelings first' },
        body: {
          zh: '在做决定之前，会先确认对面的人是不是还好。',
          en: 'Before the decision, a check that whoever is on the other side is all right.'
        }
      },
      {
        id: 'resolve',
        badge: 'J',
        state: 'celebrating',
        title: { zh: '低调地笃定', en: 'Quiet conviction' },
        body: {
          zh: '事情做完了也不太喧哗，只是在心里轻轻合上一扇门。',
          en: 'Finished work is not announced loudly — a door is simply closed, gently, inside.'
        }
      },
      {
        id: 'ideal',
        badge: '∞',
        state: 'sleeping',
        title: { zh: '理想主义的续航', en: 'Idealist stamina' },
        body: {
          zh: '为了一个觉得值得的方向，可以非常安静地走很久很久。',
          en: 'For a direction that feels worth it, the walking stays quiet and long.'
        }
      },
      {
        id: 'shadow',
        badge: '!',
        state: 'error',
        title: { zh: '过载时向内自责', en: 'Overload turns inward' },
        body: {
          zh: '出问题时第一反应常常是「是不是我没想周全」，而不是向外发火。',
          en: 'When something breaks the first question is usually inward: what did I fail to foresee?'
        }
      }
    ];

    var LINES = {
      resting: [
        { zh: '今天也辛苦啦。', en: 'You made it through today.' },
        { zh: '安静一会儿，思路会自己回来。', en: 'Sit still a moment; the thread comes back on its own.' },
        { zh: '我在，不急。', en: 'I am here. No rush.' }
      ],
      working: [
        { zh: '我看着呢，慢慢来。', en: 'I am watching. Take your time.' },
        { zh: '这几件事，好像指向同一个方向。', en: 'These things seem to point the same way.' },
        { zh: '专注的时候，世界会变小，也会变清楚。', en: 'Focus shrinks the world, then sharpens it.' }
      ],
      waiting: [
        { zh: '需要你拿主意了。', en: 'A decision is waiting on you.' },
        { zh: '我先听着，你想好了再说。', en: 'I am listening. Answer when you are ready.' },
        { zh: '别急，这一步值得多想一下。', en: 'No rush — this step deserves a second thought.' }
      ],
      celebrating: [
        { zh: '这一步走完了。', en: 'That step is done.' },
        { zh: '轻轻地，为你高兴。', en: 'Quietly glad for you.' },
        { zh: '记下来了，这是有意义的一次。', en: 'Noted. That one mattered.' }
      ],
      sleeping: [
        { zh: '先歇一会儿，灵感也要充电。', en: 'Resting a while — inspiration needs charging too.' },
        { zh: '（安静地呼吸）', en: '(breathing quietly)' },
        { zh: '梦里会有更好的写法。', en: 'There is a better way to write it, in the dream.' }
      ],
      error: [
        { zh: '这里出问题了，我们一起看看。', en: 'Something broke here. Let us look together.' },
        { zh: '不是你的错，先深呼吸。', en: 'Not your fault. Breathe first.' },
        { zh: '失败也是信息。', en: 'A failure is also information.' }
      ]
    };

    var ART_STATES = {
      resting: [{ zh: '静观', en: 'Observing' }, { zh: '思绪在慢慢归位', en: 'Thoughts settling back' }],
      working: [{ zh: '洞察', en: 'Insight' }, { zh: '正在寻找其中的模式', en: 'Looking for the pattern' }],
      waiting: [{ zh: '共情', en: 'Empathy' }, { zh: '在等你的回应', en: 'Waiting on your answer' }],
      celebrating: [{ zh: '笃定', en: 'Resolve' }, { zh: '刚完成一件事', en: 'Something just finished' }],
      sleeping: [{ zh: '充电', en: 'Recharging' }, { zh: '理想主义也要睡眠', en: 'Even idealism needs sleep' }],
      error: [{ zh: '受挫', en: 'Setback' }, { zh: '遇到了一个错误', en: 'Something went wrong' }]
    };

    var TEXT = {
      companion: { zh: 'INFJ 贤者', en: 'INFJ Sage' },
      settings: { zh: '设置', en: 'Settings' },
      close: { zh: '关闭', en: 'Close' },
      back: { zh: '返回', en: 'Back' },
      poke: { zh: '戳一下说说话', en: 'Poke to talk' },
      pretend: { zh: '姿势预览', en: 'Pose preview' },
      traits: { zh: '性格特质', en: 'Character traits' },
      scope: { zh: '观察范围', en: 'Scope' },
      scopeAll: { zh: '所有会话', en: 'All sessions' },
      scopeOne: { zh: '当前会话', en: 'This session' },
      size: { zh: '大小', en: 'Size' },
      nap: { zh: '打盹等待', en: 'Nap after' },
      tips: { zh: '自动提示', en: 'Auto tips' },
      theme: { zh: '配色', en: 'Palette' },
      themeAuto: { zh: '跟随主题', en: 'Follow theme' },
      themeLight: { zh: '浅色', en: 'Light' },
      themeDark: { zh: '深色', en: 'Dark' },
      motion: { zh: '动效', en: 'Motion' },
      motionAuto: { zh: '跟随系统', en: 'System' },
      on: { zh: '开', en: 'On' },
      off: { zh: '关', en: 'Off' },
      hide: { zh: '躲起来', en: 'Tuck away' },
      reset: { zh: '回到角落', en: 'Reset position' },
      restore: { zh: '唤回贤者', en: 'Bring back the Sage' },
      pokeHint: { zh: '单击说话 · 拖动移动 · 右键设置', en: 'Click to talk · Drag to move · Right-click for settings' },
      stateLabel: { zh: '当前状态', en: 'State' },
      asSubagent: { zh: '正在陪着 {n} 个子任务', en: 'Accompanying {n} child task(s)' },
      asWorking: { zh: '正在陪着 {n} 个会话工作', en: 'Working alongside {n} session(s)' },
      asWaiting: { zh: '{n} 个会话在等你回应', en: '{n} session(s) waiting on you' },
      asIdle: { zh: '暂时没有任务在跑', en: 'Nothing is running right now' },
      asOffline: { zh: '还未连接到 Host', en: 'Not connected to the Host yet' }
    };

    /* ------------------------------------------------------------------ *
     * Helpers
     * ------------------------------------------------------------------ */

    function clamp(value, min, max) {
      return value < min ? min : value > max ? max : value;
    }

    function pick(language, entry) {
      if (!entry) return '';
      return language === 'zh' ? entry.zh : entry.en;
    }

    function normalizeLanguage(value) {
      if (typeof value !== 'string') return undefined;
      var lower = value.toLowerCase();
      if (lower.indexOf('zh') === 0 || lower.indexOf('chinese') >= 0) return 'zh';
      if (lower.indexOf('en') === 0) return 'en';
      return undefined;
    }

    function guessLanguage() {
      try {
        return normalizeLanguage(globalThis.navigator && globalThis.navigator.language) || 'en';
      } catch (error) {
        return 'en';
      }
    }

    function readLocale(ctx) {
      try {
        return normalizeLanguage(ctx && ctx.locale && ctx.locale.getSnapshot && ctx.locale.getSnapshot().active);
      } catch (error) {
        return undefined;
      }
    }

    function observeLocale(ctx, onLanguage) {
      var stopped = false;
      var previous;
      function publish() {
        if (stopped) return;
        var next = readLocale(ctx);
        if (next && next !== previous) {
          previous = next;
          onLanguage(next);
        }
      }
      var unsubscribe = function () {};
      try {
        if (ctx && ctx.locale && typeof ctx.locale.subscribe === 'function') {
          unsubscribe = ctx.locale.subscribe(publish) || unsubscribe;
        }
      } catch (error) {
        unsubscribe = function () {};
      }
      publish();
      return function () {
        if (stopped) return;
        stopped = true;
        try {
          unsubscribe();
        } catch (error) {
          /* a torn-down store must not poison teardown */
        }
      };
    }

    function format(template, values) {
      return String(template).replace(/\{(\w+)\}/g, function (match, key) {
        return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match;
      });
    }

    function createStore() {
      var memory = {};
      function read() {
        try {
          var raw = globalThis.localStorage && globalThis.localStorage.getItem(STORE_KEY);
          if (!raw) return Object.assign({}, memory);
          var parsed = JSON.parse(raw);
          return parsed && typeof parsed === 'object' ? parsed : Object.assign({}, memory);
        } catch (error) {
          return Object.assign({}, memory);
        }
      }
      function write(patch) {
        memory = Object.assign({}, memory, patch);
        try {
          if (globalThis.localStorage) globalThis.localStorage.setItem(STORE_KEY, JSON.stringify(memory));
        } catch (error) {
          /* private mode or a full quota: the in-memory copy still applies */
        }
        return memory;
      }
      return { read: read, write: write };
    }

    function prefersReducedMotion() {
      try {
        return globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
      } catch (error) {
        return false;
      }
    }

    function viewport() {
      return {
        width: globalThis.innerWidth || 1280,
        height: globalThis.innerHeight || 800
      };
    }

    /* ------------------------------------------------------------------ *
     * Artwork — a low-poly sage in the INFJ palette
     * ------------------------------------------------------------------ */

    /* ART-REGION-START */
// --- generated from lib/art.js by tools/build-art.mjs: do not edit here ---
// ART_VIEWBOX and BOTTOM_INSET are defined above; the region captures them.
var ART = (function () {

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
  return { viewBox: ART_VIEWBOX, bottomInset: BOTTOM_INSET, nodes: sageNodes };
})();
/* ART-REGION-END */



    /**
     * Renders one node description. Written as a single-argument function so it
     * can be handed straight to `Array.prototype.map` without index leakage.
     */
    function renderNode(node) {
      var attrs = Object.assign({}, node.attrs);
      if (node.key) attrs.key = node.key;
      var children = node.children
        ? node.children.map(function (child) {
            return renderNode(child);
          })
        : undefined;
      return h(node.tag, attrs, children);
    }

    /** The character as an inline SVG element. */
    function renderSage(options) {
      var opts = options || {};
      var sized = typeof opts.size === 'number';
      return h(
        'svg',
        {
          className: 'infj-sage-svg',
          viewBox: '0 0 ' + ART.viewBox + ' ' + ART.viewBox,
          width: opts.size,
          height: opts.size,
          xmlns: 'http://www.w3.org/2000/svg',
          role: sized ? undefined : 'img',
          'aria-label': sized ? undefined : 'INFJ Sage',
          'aria-hidden': sized ? 'true' : undefined,
          focusable: 'false'
        },
        ART.nodes({ headOnly: opts.headOnly === true }).map(renderNode)
      );
    }

    /* ------------------------------------------------------------------ *
     * Behaviour — a pure projection plus a small transition machine
     * ------------------------------------------------------------------ */

    /**
     * Folds the client stores into the few numbers the companion cares about.
     * Reads identity and status only; never message content.
     */
    function project(input) {
      var catalog = input.catalog || {};
      var byId = catalog.byId || {};
      var statuses = input.statuses;
      var ids = {};
      Object.keys(byId).forEach(function (id) {
        ids[id] = true;
      });
      if (statuses && typeof statuses.forEach === 'function') {
        statuses.forEach(function (value, key) {
          ids[key] = true;
        });
      }

      var runningMain = 0;
      var runningChild = 0;
      var pending = 0;
      Object.keys(ids).forEach(function (id) {
        var status = statuses && typeof statuses.get === 'function' ? statuses.get(id) : undefined;
        var row = byId[id];
        var isChild = row ? row.origin === 'subagent' : undefined;
        var running = status && typeof status.running === 'boolean' ? status.running : row && row.running;
        if (status && status.pendingInteraction != null) pending += 1;
        if (running !== true) return;
        if (isChild === true) runningChild += 1;
        else runningMain += 1;
      });

      return {
        connected: input.connected === true,
        ready: catalog.phase === 'ready',
        running: runningMain,
        children: runningChild,
        pending: pending
      };
    }

    function describe(projection, language) {
      if (!projection.connected) return pick(language, TEXT.asOffline);
      if (projection.pending > 0) return format(pick(language, TEXT.asWaiting), { n: projection.pending });
      if (projection.running > 0) return format(pick(language, TEXT.asWorking), { n: projection.running });
      if (projection.children > 0) return format(pick(language, TEXT.asSubagent), { n: projection.children });
      return pick(language, TEXT.asIdle);
    }

    /**
     * @param {{ now: () => number, celebrationMs: number, errorMs: number, napMs: number }} options
     */
    function createMachine(options) {
      var settings = Object.assign({}, options);
      var at = settings.now();
      var last = {
        activeAt: at,
        celebrationUntil: 0,
        errorUntil: 0,
        previousRunning: 0,
        seenRunning: false,
        // Left undefined so the very first update counts as a transition and the
        // companion introduces itself exactly once.
        state: undefined,
        reason: 'boot'
      };
      var override = { state: undefined, until: 0 };

      function update(projection) {
        var now = settings.now();
        var changed = false;

        if (projection.running > 0) {
          // A rising edge starts the clock; the falling edge is the only place a
          // completion can be inferred, and only for work we actually watched.
          last.seenRunning = true;
          last.activeAt = now;
          if (projection.running !== last.previousRunning) changed = true;
          last.previousRunning = projection.running;
        } else {
          if (last.previousRunning > 0) {
            if (last.seenRunning && projection.connected) {
              last.celebrationUntil = now + settings.celebrationMs;
              last.reason = 'turn-ended';
            }
            last.seenRunning = false;
            last.activeAt = now;
            changed = true;
          }
          last.previousRunning = 0;
        }

        if (projection.pending > 0) last.activeAt = now;

        var celebrating = last.celebrationUntil > now;
        var failing = last.errorUntil > now;
        var napping = settings.napMs > 0 && now - last.activeAt >= settings.napMs;

        var state;
        if (failing) state = 'error';
        else if (celebrating) state = 'celebrating';
        else if (napping && projection.running === 0 && projection.pending === 0) state = 'sleeping';
        else if (projection.pending > 0) state = 'waiting';
        else if (projection.running > 0) state = 'working';
        else state = 'resting';

        if (override.state) {
          if (override.until > now) state = override.state;
          else override.state = undefined;
        }

        var transition = state !== last.state;
        if (transition) {
          last.state = state;
          changed = true;
        }
        return { state: state, transition: transition, changed: changed };
      }

      return {
        update: update,
        force: function (state, ms) {
          override.state = state;
          override.until = settings.now() + (ms || 8000);
          last.activeAt = settings.now();
        },
        configure: function (patch) {
          Object.assign(settings, patch);
        },
        debug: function () {
          return Object.assign({}, last);
        }
      };
    }

    /** Chooses a different line than the previous one whenever the pool allows it. */
    function makePicker(random) {
      var lastIndex = -1;
      return function (pool) {
        if (!pool || pool.length === 0) return undefined;
        var index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length) || 0));
        if (pool.length > 1 && index === lastIndex) index = (index + 1) % pool.length;
        lastIndex = index;
        return pool[index];
      };
    }

    /* ------------------------------------------------------------------ *
     * Fallback mount, used only when the slot registry is unavailable
     * ------------------------------------------------------------------ */

    function mountDirect(ctx, Companion) {
      var container = document.createElement('div');
      container.setAttribute('data-infj-pet', 'direct');
      document.body.appendChild(container);
      var root = null;
      try {
        var client = require('react-dom/client');
        root = client.createRoot(container);
        root.render(h(Companion, {}));
      } catch (error) {
        // Last resort: a plain node so the companion still has a presence
        // rather than failing the whole plugin silently.
        container.textContent = 'INFJ';
        return function () {
          container.remove();
        };
      }
      return function () {
        try {
          root.unmount();
        } catch (error) {
          /* ignore */
        }
        container.remove();
      };
    }

    /* ------------------------------------------------------------------ *
     * Styles
     * ------------------------------------------------------------------ */

    var CSS = [
      '.infj-pet{position:fixed;z-index:2147482000;user-select:none;-webkit-user-select:none;touch-action:none;',
      'outline:none;cursor:grab;--s-line:rgba(22,44,20,0.34);--s-panel:rgba(250,253,246,0.97);--s-ink:#1F3320;',
      '--s-ink-dim:#5C7358;--s-chip:rgba(80,120,60,0.14);--s-accent:#3E8F6B;--s-accent-soft:rgba(62,143,107,0.16);',
      '--s-shadow:0 0 2px rgba(255,255,255,0.9),0 0 6px rgba(255,255,255,0.5);',
      'font:400 12px/1.5 system-ui,-apple-system,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}',
      '.infj-pet:active{cursor:grabbing}',
      '.infj-pet[data-palette="light"]{--s-panel:rgba(252,254,250,0.98);--s-ink:#1B2C1C;--s-ink-dim:#546B52}',
      '.infj-pet[data-palette="dark"]{--s-line:rgba(214,238,214,0.42);--s-panel:rgba(26,38,26,0.97);--s-ink:#E8F2E4;',
      '--s-ink-dim:#A8BF9F;--s-chip:rgba(180,220,160,0.14);--s-accent:#6FD3A8;--s-accent-soft:rgba(111,211,168,0.18);',
      '--s-shadow:0 0 2px rgba(0,0,0,0.55),0 0 6px rgba(0,0,0,0.35)}',
      '.infj-hit{position:absolute;left:20%;top:4%;width:64%;height:90%;border-radius:50%;background:transparent}',
      '.infj-wrap{position:absolute;left:0;width:100%;aspect-ratio:1/1}',
      '.infj-sage-svg{display:block;width:100%;height:100%;overflow:visible}',
      '.infj-pet .infj-sage-svg{filter:drop-shadow(0 0 1.5px var(--s-line)) drop-shadow(0 6px 12px rgba(20,40,20,0.18))}',
      '.infj-pet #head{transform-box:view-box;transform-origin:200px 276px}',
      '.infj-pet #beard{transform-box:view-box;transform-origin:200px 306px}',
      '.infj-pet #body{transform-box:view-box;transform-origin:204px 372px}',
      // The arm and the staff share one pivot at the shoulder so the hand keeps
      // holding the shaft through every pose.
      '.infj-pet #arm-staff,.infj-pet #staff{transform-box:view-box;transform-origin:406px 274px}',
      '.infj-pet #arm-left{transform-box:view-box;transform-origin:116px 266px}',
      '.infj-pet #brows{transform-box:view-box;transform-origin:200px 226px}',
      '.infj-pet #eyes ellipse{transform-box:fill-box;transform-origin:center}',
      '.infj-pet #sparkles,.infj-pet #zs{opacity:0}',
      '.infj-pet #sparkles path:nth-child(2){animation-delay:.5s}',
      '.infj-pet #sparkles path:nth-child(3){animation-delay:2.6s}',
      '.infj-pet #sparkles path:nth-child(4){animation-delay:1.4s}',
      '.infj-pet[data-motion="on"][data-state="resting"] #head{animation:infj-float 6.8s ease-in-out infinite}',
      '.infj-pet[data-motion="on"][data-state="resting"] #body{animation:infj-breathe 5.4s ease-in-out infinite}',
      '.infj-pet[data-motion="on"][data-state="resting"] #beard{animation:infj-sway 7.6s ease-in-out infinite}',
      '.infj-pet[data-motion="on"][data-state="working"] #head{animation:infj-tilt 3.4s ease-in-out infinite}',
      '.infj-pet[data-motion="on"][data-state="working"] #body{animation:infj-breathe 3.6s ease-in-out infinite}',
      '.infj-pet[data-motion="on"][data-state="working"] #arm-staff,.infj-pet[data-motion="on"][data-state="working"] #staff{animation:infj-staff-swing 4.4s ease-in-out infinite}',
      '.infj-pet[data-motion="on"][data-state="working"] #brows{animation:infj-brow 3.4s ease-in-out infinite}',
      '.infj-pet[data-motion="on"][data-state="waiting"] #head{animation:infj-nod 4.2s ease-in-out infinite}',
      '.infj-pet[data-motion="on"][data-state="waiting"] #arm-left{animation:infj-offer 4.2s ease-in-out infinite}',
      '.infj-pet[data-motion="on"][data-state="waiting"] #brows{animation:infj-brow-soft 4.2s ease-in-out infinite}',
      '.infj-pet[data-motion="on"][data-state="celebrating"]{animation:infj-hop 3s ease-in-out infinite}',
      '.infj-pet[data-motion="on"][data-state="celebrating"] #head{animation:infj-float 2.4s ease-in-out infinite}',
      '.infj-pet[data-motion="on"][data-state="celebrating"] #arm-staff,.infj-pet[data-motion="on"][data-state="celebrating"] #staff{animation:infj-raise 3s ease-in-out infinite}',
      '.infj-pet[data-motion="on"][data-state="celebrating"] #sparkles{animation:infj-sparkle 3s ease-in-out infinite}',
      '.infj-pet[data-motion="on"][data-state="sleeping"] #body{animation:infj-breathe 8s ease-in-out infinite}',
      '.infj-pet[data-motion="on"][data-state="sleeping"] #head{animation:infj-float 12s ease-in-out infinite}',
      '.infj-pet[data-motion="on"][data-state="sleeping"] #zs{animation:infj-sparkle 7s ease-in-out infinite}',
      '.infj-pet[data-motion="on"][data-state="error"] #head{animation:infj-shake 1.1s ease-in-out 2}',
      '.infj-pet[data-motion="on"][data-state="error"] #arm-staff,.infj-pet[data-motion="on"][data-state="error"] #staff{animation:infj-droop 3s ease-in-out infinite}',
      '.infj-pet[data-motion="on"] #eyes ellipse:nth-child(1),.infj-pet[data-motion="on"] #eyes ellipse:nth-child(2){',
      'animation:infj-blink 6.4s infinite}',
      '.infj-pet[data-state="sleeping"] #eyes{opacity:0.18}',
      '.infj-pet.is-poked .infj-wrap{animation:infj-pop .44s ease-out}',
      '@keyframes infj-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}',
      '@keyframes infj-breathe{0%,100%{transform:translateY(0) scaleY(1)}50%{transform:translateY(2px) scaleY(0.985)}}',
      '@keyframes infj-blink{0%,94%,100%{transform:scaleY(1)}96.5%{transform:scaleY(0.1)}}',
      '@keyframes infj-tilt{0%,100%{transform:rotate(-1.6deg)}50%{transform:rotate(1.6deg)}}',
      '@keyframes infj-nod{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(3px) rotate(1.4deg)}}',
      '@keyframes infj-sway{0%,100%{transform:rotate(-1.1deg)}50%{transform:rotate(1.1deg)}}',
      '@keyframes infj-staff-swing{0%,100%{transform:rotate(-1.4deg)}50%{transform:rotate(2.6deg)}}',
      '@keyframes infj-raise{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(9deg)}}',
      '@keyframes infj-droop{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-3.4deg)}}',
      '@keyframes infj-offer{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-7deg)}}',
      '@keyframes infj-brow{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.4px)}}',
      '@keyframes infj-brow-soft{0%,100%{transform:translateY(0)}50%{transform:translateY(1.4px)}}',
      '@keyframes infj-hop{0%,100%{transform:translateY(0)}45%{transform:translateY(-10px)}}',
      '@keyframes infj-shake{0%,100%{transform:rotate(0deg)}25%{transform:rotate(-3.4deg)}75%{transform:rotate(3.4deg)}}',
      '@keyframes infj-sparkle{0%,72%,100%{opacity:0}82%{opacity:1}92%{opacity:0.35}}',
      '@keyframes infj-pop{0%{transform:scale(1)}38%{transform:scale(1.07) rotate(-1.5deg)}100%{transform:scale(1)}}',
      '@keyframes infj-bubble-in{0%{opacity:0;transform:translateY(6px) scale(.94)}100%{opacity:1;transform:none}}',
      '.infj-bubble{position:absolute;bottom:calc(100% + 10px);left:50%;transform:translateX(-50%);max-width:250px;',
      'min-width:72px;padding:8px 12px;border-radius:14px;background:var(--s-panel);color:var(--s-ink);',
      'font-size:12.5px;font-weight:500;box-shadow:0 6px 22px rgba(16,34,16,0.18),0 1px 0 rgba(255,255,255,0.5) inset;',
      'border:1px solid var(--s-chip);pointer-events:none;animation:infj-bubble-in .22s ease-out;text-align:center;',
      'word-break:break-word;z-index:4}',
      '.infj-bubble.is-below{bottom:auto;top:calc(100% + 8px)}',
      '.infj-bubble::after{content:"";position:absolute;left:50%;bottom:-5px;width:10px;height:10px;margin-left:-5px;',
      'background:var(--s-panel);border-right:1px solid var(--s-chip);border-bottom:1px solid var(--s-chip);',
      'transform:rotate(45deg)}',
      '.infj-bubble.is-below::after{bottom:auto;top:-5px;border:none;border-left:1px solid var(--s-chip);',
      'border-top:1px solid var(--s-chip)}',
      '.infj-panel{position:absolute;bottom:calc(100% + 12px);left:50%;transform:translateX(-50%);width:252px;',
      'max-height:min(74vh,540px);overflow:auto;overscroll-behavior:contain;padding:10px;border-radius:16px;',
      'background:var(--s-panel);color:var(--s-ink);border:1px solid var(--s-chip);',
      'box-shadow:0 18px 44px rgba(12,30,12,0.24);pointer-events:auto;cursor:default;z-index:5;',
      'animation:infj-bubble-in .18s ease-out}',
      '.infj-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}',
      '.infj-panel-title{font-weight:650;font-size:12.5px;letter-spacing:.2px}',
      '.infj-close,.infj-back{border:none;background:transparent;color:var(--s-ink-dim);cursor:pointer;',
      'font:inherit;font-size:15px;line-height:1;padding:2px 4px;border-radius:6px}',
      '.infj-close:hover,.infj-back:hover{background:var(--s-chip);color:var(--s-ink)}',
      '.infj-status{margin:2px 0 8px;color:var(--s-ink-dim);font-size:11.5px}',
      '.infj-status em{font-style:normal;color:var(--s-accent);font-weight:600}',
      '.infj-cta{width:100%;border:none;border-radius:10px;padding:7px 10px;cursor:pointer;font:inherit;font-weight:600;',
      'background:var(--s-accent-soft);color:var(--s-accent);margin-bottom:8px}',
      '.infj-cta:hover{background:var(--s-accent);color:#fff}',
      '.infj-row{display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-top:1px solid var(--s-chip)}',
      '.infj-row-label{flex:0 0 56px;color:var(--s-ink-dim);font-size:11px;padding-top:3px}',
      '.infj-row-opts{display:flex;flex-wrap:wrap;gap:4px;flex:1 1 auto}',
      '.infj-opt{border:1px solid var(--s-chip);background:transparent;color:var(--s-ink-dim);cursor:pointer;',
      'font:inherit;font-size:11px;padding:3px 7px;border-radius:999px;white-space:nowrap}',
      '.infj-opt:hover{color:var(--s-ink);border-color:var(--s-accent)}',
      '.infj-opt.is-active{background:var(--s-accent-soft);border-color:var(--s-accent);color:var(--s-accent);font-weight:600}',
      '.infj-hint{margin:8px 0 0;color:var(--s-ink-dim);font-size:10.5px;line-height:1.5;',
      'border-top:1px solid var(--s-chip);padding-top:7px}',
      '.infj-list{display:flex;flex-direction:column;gap:7px;margin-top:4px}',
      '.infj-trait{display:flex;gap:8px;align-items:flex-start}',
      '.infj-trait-badge{flex:0 0 22px;height:22px;border-radius:50%;background:var(--s-accent-soft);color:var(--s-accent);',
      'display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px}',
      '.infj-trait-text strong{display:block;font-size:11.5px;font-weight:650}',
      '.infj-trait-text p{margin:1px 0 0;color:var(--s-ink-dim);font-size:11px;line-height:1.5}',
      '.infj-restore{position:fixed;right:12px;bottom:12px;z-index:2147482000;width:40px;height:40px;padding:0;',
      'border-radius:50%;border:1px solid rgba(80,120,60,0.22);background:rgba(250,253,246,0.94);cursor:pointer;',
      'box-shadow:0 6px 18px rgba(16,34,16,0.22);display:flex;align-items:center;justify-content:center;overflow:hidden}',
      '.infj-restore:hover{transform:translateY(-1px)}',
      '.infj-restore svg{width:34px;height:34px;margin-top:6px}',
      '@media (prefers-reduced-motion: reduce){.infj-pet *,.infj-pet.is-poked .infj-wrap{animation:none !important}}'
    ].join('');

    function injectStyles() {
      if (document.getElementById(STYLE_ID)) return function () {};
      var style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
      return function () {
        style.remove();
      };
    }

    /* ------------------------------------------------------------------ *
     * Component
     * ------------------------------------------------------------------ */

    function readPreferences(store) {
      var saved = store.read();
      var size = SIZES.some(function (option) {
        return option.id === saved.size;
      })
        ? saved.size
        : 'm';
      var nap = NAP_CHOICES.some(function (choice) {
        return choice.id === saved.napMs;
      })
        ? saved.napMs
        : 180000;
      return {
        scope: saved.scope === 'current' ? 'current' : 'all',
        size: size,
        napMs: nap,
        tips: saved.tips !== false,
        palette: saved.palette === 'light' || saved.palette === 'dark' ? saved.palette : 'auto',
        motion: saved.motion === 'on' || saved.motion === 'off' ? saved.motion : 'auto',
        hidden: saved.hidden === true,
        theme: saved.theme === 'light' || saved.theme === 'dark' ? saved.theme : null,
        x: typeof saved.x === 'number' && Number.isFinite(saved.x) ? saved.x : null,
        y: typeof saved.y === 'number' && Number.isFinite(saved.y) ? saved.y : null,
        language: normalizeLanguage(saved.language)
      };
    }

    function createCompanion(ctx) {
      var store = createStore();
      var initial = readPreferences(store);
      var systemReducedMotion = prefersReducedMotion();

      function Companion(props) {
        var useSessions = typeof props.useSessions === 'function' ? props.useSessions : null;
        var useSessionStatus = typeof props.useSessionStatus === 'function' ? props.useSessionStatus : null;

        // The selector identity is stable so the renderer's subscription is not
        // torn down and rebuilt on every render.
        var catalogSelector = React.useCallback(function (snapshot) {
          return snapshot;
        }, []);
        var statusSelector = React.useCallback(function (map) {
          return map;
        }, []);

        var catalog = useSessions ? useSessions(catalogSelector) : undefined;
        var statuses = useSessionStatus ? useSessionStatus(statusSelector) : undefined;

        var connection = props.connection;
        var [connected, setConnected] = React.useState(function () {
          try {
            return connection && connection.state && connection.state.getSnapshot() === 'connected';
          } catch (error) {
            return false;
          }
        });

        var [language, setLanguage] = React.useState(initial.language || readLocale(ctx) || guessLanguage());
        var [prefs, setPrefs] = React.useState(initial);
        var [panel, setPanel] = React.useState(null);
        var [line, setLine] = React.useState(null);
        var [visible, setVisible] = React.useState(initial.tips);

        var projection = React.useMemo(
          function () {
            return project({ catalog: catalog, statuses: statuses, connected: connected });
          },
          [catalog, statuses, connected]
        );

        var machineRef = React.useRef(null);
        if (!machineRef.current) {
          machineRef.current = createMachine({
            now: function () {
              return Date.now();
            },
            celebrationMs: 4200,
            errorMs: 6000,
            napMs: initial.napMs
          });
        }

        var [state, setState] = React.useState('resting');
        var pickLine = React.useMemo(function () {
          return makePicker(Math.random);
        }, []);

        machineRef.current.configure({ napMs: prefs.napMs });

        // Advance the machine on every projection change and keep it ticking so
        // a nap can begin without any store activity.
        React.useEffect(
          function () {
            var result = machineRef.current.update(projection);
            setState(result.state);
            if (result.transition && prefs.tips) {
              var next = pickLine(LINES[result.state] || LINES.resting);
              setLine(next);
              setVisible(true);
            }
          },
          [projection, prefs.tips, pickLine]
        );

        React.useEffect(
          function () {
            var timer = globalThis.setInterval(function () {
              var result = machineRef.current.update(projection);
              setState(result.state);
              if (result.transition && prefs.tips) {
                setLine(pickLine(LINES[result.state] || LINES.resting));
                setVisible(true);
              }
            }, 5000);
            return function () {
              globalThis.clearInterval(timer);
            };
          },
          [projection, prefs.tips, pickLine]
        );

        // A tip fades on its own so the pet stays quiet while work continues.
        React.useEffect(
          function () {
            if (!line) return undefined;
            var hide = globalThis.setTimeout(function () {
              setVisible(false);
            }, 5200);
            return function () {
              globalThis.clearTimeout(hide);
            };
          },
          [line]
        );

        // Follow the DSH language until the person picks one explicitly.
        React.useEffect(
          function () {
            if (initial.language) return undefined;
            return observeLocale(ctx, setLanguage);
          },
          []
        );

        React.useEffect(
          function () {
            if (!connection || !connection.state || typeof connection.state.subscribe !== 'function') return undefined;
            var unsubscribe = connection.state.subscribe(function () {
              try {
                setConnected(connection.state.getSnapshot() === 'connected');
              } catch (error) {
                setConnected(false);
              }
            });
            return function () {
              try {
                unsubscribe();
              } catch (error) {
                /* ignore */
              }
            };
          },
          [connection]
        );

        var size = SIZES.find(function (option) {
          return option.id === prefs.size;
        }) || SIZES[1];

        var rootRef = React.useRef(null);
        var dragRef = React.useRef(null);
        var [position, setPosition] = React.useState(function () {
          return { x: initial.x, y: initial.y };
        });

        function updatePrefs(patch) {
          setPrefs(function (previous) {
            return Object.assign({}, previous, patch);
          });
          store.write(patch);
        }

        function bounds(boxSize) {
          var view = viewport();
          return {
            maxX: Math.max(0, view.width - boxSize),
            maxY: Math.max(0, view.height - boxSize)
          };
        }

        function currentBox() {
          var node = rootRef.current;
          if (node) {
            var rect = node.getBoundingClientRect();
            return { x: rect.left, y: rect.top };
          }
          return { x: position.x, y: position.y };
        }

        function say(nextState) {
          setLine(pickLine(LINES[nextState] || LINES.resting));
          setVisible(true);
        }

        function poke(event) {
          event?.preventDefault?.();
          setPanel(null);
          say(state);
          var node = rootRef.current;
          if (node && prefs.motion !== 'off' && !systemReducedMotion) {
            node.classList.remove('is-poked');
            void node.offsetWidth;
            node.classList.add('is-poked');
            globalThis.setTimeout(function () {
              node.classList.remove('is-poked');
            }, 460);
          }
        }

        function onPointerDown(event) {
          if (event.button !== undefined && event.button !== 0) return;
          var start = currentBox();
          dragRef.current = {
            pointerId: event.pointerId,
            originX: event.clientX,
            originY: event.clientY,
            startX: start.x,
            startY: start.y,
            moved: false
          };
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch (error) {
            /* capture is a nicety, not a requirement */
          }
        }

        function onPointerMove(event) {
          var drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          var dx = event.clientX - drag.originX;
          var dy = event.clientY - drag.originY;
          if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
          if (!drag.moved) return;
          var limit = bounds(size.px);
          setPosition({
            x: clamp(drag.startX + dx, 0, limit.maxX),
            y: clamp(drag.startY + dy, 0, limit.maxY)
          });
        }

        function onPointerUp(event) {
          var drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          dragRef.current = null;
          try {
            event.currentTarget.releasePointerCapture(event.pointerId);
          } catch (error) {
            /* ignore */
          }
          if (!drag.moved) {
            poke();
            return;
          }
          var box = currentBox();
          var limit = bounds(size.px);
          var snappedX = box.x <= EDGE_SNAP ? 0 : box.x >= limit.maxX - EDGE_SNAP ? limit.maxX : box.x;
          var next = { x: Math.round(clamp(snappedX, 0, limit.maxX)), y: Math.round(clamp(box.y, 0, limit.maxY)) };
          setPosition(next);
          store.write({ x: next.x, y: next.y });
        }

        function onContextMenu(event) {
          event.preventDefault();
          event.stopPropagation();
          setPanel(function (previous) {
            return previous ? null : 'menu';
          });
        }

        function onKeyDown(event) {
          if (event.key === 'Enter' || event.key === ' ') {
            poke(event);
          } else if (event.key === 'Escape') {
            setPanel(null);
          }
        }

        if (prefs.hidden) {
          return h(
            'button',
            {
              type: 'button',
              className: 'infj-restore',
              title: pick(language, TEXT.restore),
              'aria-label': pick(language, TEXT.restore),
              onClick: function (event) {
                event.stopPropagation();
                updatePrefs({ hidden: false });
              }
            },
            renderSage({ size: 34, headOnly: true })
          );
        }

        var effectiveMotion = prefs.motion === 'auto' ? (systemReducedMotion ? 'off' : 'on') : prefs.motion;
        var artwork = ART_STATES[state] || ART_STATES.resting;
        var title = pick(language, TEXT.companion);
        var isDarkTheme = prefs.theme
          ? prefs.theme === 'dark'
          : (function () {
              try {
                return document.body?.hasAttribute('data-ds-dark-theme') === true;
              } catch (error) {
                return false;
              }
            })();
        var palette = prefs.palette === 'auto' ? (isDarkTheme ? 'dark' : 'light') : prefs.palette;

        var style = {
          width: size.px,
          height: size.px,
          left: position.x == null ? undefined : position.x + 'px',
          top: position.y == null ? undefined : position.y + 'px',
          right: position.x == null ? '24px' : undefined,
          bottom: position.x == null ? '24px' : undefined
        };

        var children = [];

        if (line && (visible || panel)) {
          children.push(
            h(
              'div',
              {
                key: 'bubble',
                className: 'infj-bubble' + (position.y != null && position.y < 130 ? ' is-below' : ''),
                lang: language === 'zh' ? 'zh-CN' : 'en'
              },
              pick(language, line)
            )
          );
        }

        if (panel) {
          children.push(h(Panel, {
            key: 'panel',
            panel: panel,
            language: language,
            state: state,
            artwork: artwork,
            projection: projection,
            prefs: prefs,
            scopeAll: prefs.scope !== 'current',
            onPanel: setPanel,
            onPoke: poke,
            onPrefs: updatePrefs,
            onPreview: function (name) {
              machineRef.current.force(name, 9000);
              setState(name);
              say(name);
              setPanel(null);
            }
          }));
        }

        children.push(h('div', { className: 'infj-hit', key: 'hit' }));
        children.push(
          h(
            'div',
            {
              key: 'wrap',
              className: 'infj-wrap',
              style: { bottom: (BOTTOM_INSET * size.px) / ART_VIEWBOX + 'px' }
            },
            renderSage({})
          )
        );

        return h(
          'div',
          {
            ref: rootRef,
            className: 'infj-pet',
            style: style,
            'data-state': state,
            'data-motion': effectiveMotion,
            'data-palette': palette,
            title: title + ' — ' + pick(language, artwork[0]),
            tabIndex: 0,
            role: 'button',
            'aria-label': title + ' — ' + pick(language, artwork[0]),
            onPointerDown: onPointerDown,
            onPointerMove: onPointerMove,
            onPointerUp: onPointerUp,
            onPointerCancel: onPointerUp,
            onContextMenu: onContextMenu,
            onKeyDown: onKeyDown
          },
          children
        );
      }

      return Companion;
    }

    /** The settings dialog, kept out of the main component for readability. */
    function Panel(props) {
      var language = props.language;
      var t = function (entry) {
        return pick(language, entry);
      };

      function optionRow(key, label, options) {
        return h(
          'div',
          { className: 'infj-row', key: key },
          h('span', { className: 'infj-row-label' }, label),
          h('div', { className: 'infj-row-opts' }, options)
        );
      }

      function option(key, label, active, onSelect) {
        return h(
          'button',
          {
            key: key,
            type: 'button',
            className: 'infj-opt' + (active ? ' is-active' : ''),
            onClick: function (event) {
              event.stopPropagation();
              onSelect();
            }
          },
          label
        );
      }

      var stop = function (event) {
        event.stopPropagation();
      };

      if (props.panel === 'traits') {
        return h(
          'div',
          {
            className: 'infj-panel',
            role: 'dialog',
            lang: language === 'zh' ? 'zh-CN' : 'en',
            onPointerDown: stop,
            onContextMenu: function (event) {
              event.preventDefault();
              stop(event);
            }
          },
          h(
            'div',
            { className: 'infj-panel-head' },
            h(
              'button',
              {
                type: 'button',
                className: 'infj-back',
                onClick: function (event) {
                  stop(event);
                  props.onPanel('menu');
                }
              },
              '‹ ' + t(TEXT.back)
            ),
            h('span', { className: 'infj-panel-title' }, t(TEXT.traits))
          ),
          h(
            'div',
            { className: 'infj-list' },
            TRAITS.map(function (trait) {
              return h(
                'div',
                { className: 'infj-trait', key: trait.id },
                h('span', { className: 'infj-trait-badge' }, trait.badge),
                h(
                  'div',
                  { className: 'infj-trait-text' },
                  h('strong', null, t(trait.title)),
                  h('p', null, t(trait.body))
                )
              );
            })
          )
        );
      }

      var language2 = language;
      return h(
        'div',
        {
          className: 'infj-panel',
          role: 'dialog',
          'aria-label': t(TEXT.settings),
          lang: language2 === 'zh' ? 'zh-CN' : 'en',
          onPointerDown: stop,
          onContextMenu: function (event) {
            event.preventDefault();
            stop(event);
          }
        },
        h(
          'div',
          { className: 'infj-panel-head' },
          h('span', { className: 'infj-panel-title' }, t(TEXT.companion) + ' · ' + t(TEXT.settings)),
          h(
            'button',
            {
              type: 'button',
              className: 'infj-close',
              'aria-label': t(TEXT.close),
              onClick: function (event) {
                stop(event);
                props.onPanel(null);
              }
            },
            '×'
          )
        ),
        h(
          'p',
          { className: 'infj-status' },
          h('em', null, t(TEXT.stateLabel) + ': '),
          t(props.artwork[0]) + ' · ' + describe(props.projection, language2)
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'infj-cta',
            onClick: function (event) {
              stop(event);
              props.onPoke();
            }
          },
          t(TEXT.poke)
        ),
        optionRow(
          'preview',
          t(TEXT.pretend),
          STATES.map(function (name) {
            return option('st-' + name, t(ART_STATES[name][0]), false, function () {
              props.onPreview(name);
            });
          })
        ),
        optionRow('scope', t(TEXT.scope), [
          option('sc-all', t(TEXT.scopeAll), props.scopeAll, function () {
            props.onPrefs({ scope: 'all' });
          }),
          option('sc-one', t(TEXT.scopeOne), !props.scopeAll, function () {
            props.onPrefs({ scope: 'current' });
          })
        ]),
        optionRow(
          'size',
          t(TEXT.size),
          SIZES.map(function (choice) {
            return option('sz-' + choice.id, t(choice.label), props.prefs.size === choice.id, function () {
              props.onPrefs({ size: choice.id });
            });
          })
        ),
        optionRow(
          'nap',
          t(TEXT.nap),
          NAP_CHOICES.map(function (choice) {
            return option('nap-' + choice.id, t(choice.label), props.prefs.napMs === choice.id, function () {
              props.onPrefs({ napMs: choice.id });
            });
          })
        ),
        optionRow('palette', t(TEXT.theme), [
          option('pa-auto', t(TEXT.themeAuto), props.prefs.palette === 'auto', function () {
            props.onPrefs({ palette: 'auto' });
          }),
          option('pa-light', t(TEXT.themeLight), props.prefs.palette === 'light', function () {
            props.onPrefs({ palette: 'light' });
          }),
          option('pa-dark', t(TEXT.themeDark), props.prefs.palette === 'dark', function () {
            props.onPrefs({ palette: 'dark' });
          })
        ]),
        optionRow('motion', t(TEXT.motion), [
          option('mo-auto', t(TEXT.motionAuto), props.prefs.motion === 'auto', function () {
            props.onPrefs({ motion: 'auto' });
          }),
          option('mo-on', t(TEXT.on), props.prefs.motion === 'on', function () {
            props.onPrefs({ motion: 'on' });
          }),
          option('mo-off', t(TEXT.off), props.prefs.motion === 'off', function () {
            props.onPrefs({ motion: 'off' });
          })
        ]),
        optionRow('tips', t(TEXT.tips), [
          option('tp-on', t(TEXT.on), props.prefs.tips, function () {
            props.onPrefs({ tips: true });
          }),
          option('tp-off', t(TEXT.off), !props.prefs.tips, function () {
            props.onPrefs({ tips: false });
          })
        ]),
        optionRow('traits', t(TEXT.traits), [
          option('open-traits', 'INFJ →', true, function () {
            props.onPanel('traits');
          })
        ]),
        optionRow('view', '', [
          option('reset', t(TEXT.reset), false, function () {
            props.onPrefs({ x: null, y: null });
            props.onPanel(null);
          }),
          option('hide', t(TEXT.hide), false, function () {
            props.onPrefs({ hidden: true });
            props.onPanel(null);
          })
        ]),
        h('p', { className: 'infj-hint' }, t(TEXT.pokeHint))
      );
    }

    /* ------------------------------------------------------------------ *
     * Plugin
     * ------------------------------------------------------------------ */

    exports.name = 'infjPetClient';
    exports.inject = ['slots', 'sessions', 'connection', 'locale'];
    exports.apply = function apply(ctx) {
      var disposeStyles = injectStyles();
      var disposeMount = null;
      var Companion = createCompanion(ctx);

      function PetRoot(props) {
        return h(Companion, props);
      }

      try {
        if (ctx && ctx.slots && typeof ctx.slots.inject === 'function') {
          disposeMount = ctx.slots.inject('shell.overlay', function () {
            return ctx.slots.register({ name: 'shell.overlay', id: 'infj-pet', order: 92 }, PetRoot);
          });
        } else {
          disposeMount = mountDirect(ctx, Companion);
        }
      } catch (error) {
        disposeMount = mountDirect(ctx, Companion);
      }

      return function () {
        try {
          if (typeof disposeMount === 'function') disposeMount();
        } catch (error) {
          /* ignore */
        }
        disposeStyles();
      };
    };

    return exports;
  }
});
