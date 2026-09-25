import { anchor as a, type SketchDoc, type Anchor } from './model';

export interface Preset {
  id: string;
  name: string;
  /** Suggested stroke weight for this sketch. */
  weight: number;
  doc: SketchDoc;
}

const open = (id: string, anchors: Anchor[]) => ({ id, closed: false, anchors });
const closed = (id: string, anchors: Anchor[]) => ({ id, closed: true, anchors });
const pts = (id: string, list: [number, number][], isClosed = false) => ({
  id,
  closed: isClosed,
  anchors: list.map(([x, y]) => a(x, y)),
});

/** A circle drawn the Illustrator way: four smooth anchors. */
function circle(id: string, cx: number, cy: number, rx: number, ry = rx): SketchDoc['paths'][number] {
  const kx = rx * 0.5523;
  const ky = ry * 0.5523;
  return closed(id, [
    a(cx + rx, cy, { x: cx + rx, y: cy + ky }, { x: cx + rx, y: cy - ky }),
    a(cx, cy - ry, { x: cx + kx, y: cy - ry }, { x: cx - kx, y: cy - ry }),
    a(cx - rx, cy, { x: cx - rx, y: cy - ky }, { x: cx - rx, y: cy + ky }),
    a(cx, cy + ry, { x: cx - kx, y: cy + ry }, { x: cx + kx, y: cy + ry }),
  ]);
}

/** The sketch behind the "Vonts Quill" masthead font. */
export const QUILL: Preset = {
  id: 'quill',
  name: 'Quill',
  weight: 104,
  doc: {
    paths: [
      open('q1', [a(520, 280, null, { x: 600, y: 240 }), a(430, 700, { x: 460, y: 500 }, { x: 400, y: 820 }), a(580, 690, { x: 500, y: 800 })]),
      open('q2', [a(250, 690), a(650, 290)]),
      open('q3', [a(290, 750), a(690, 350)]),
    ],
  },
};

/** The sketch behind the "Vonts Slab" heading font. */
export const SLAB: Preset = {
  id: 'slab',
  name: 'Slab',
  weight: 120,
  doc: {
    paths: [
      pts('s1', [
        [420, 300],
        [480, 300],
        [480, 760],
        [540, 760],
      ]),
      open('s2', [a(560, 300, null, { x: 640, y: 300 }), a(640, 400, { x: 640, y: 330 })]),
    ],
  },
};

export const PRESETS: Preset[] = [
  { id: 'loop', name: 'Loop', weight: 64, doc: { paths: [circle('o', 500, 510, 230, 250)] } },
  QUILL,
  {
    id: 'block',
    name: 'Block',
    weight: 80,
    doc: {
      paths: [
        pts(
          'b',
          [
            [300, 300],
            [700, 300],
            [700, 700],
            [300, 700],
          ],
          true,
        ),
      ],
    },
  },
  SLAB,
  {
    id: 'zigzag',
    name: 'Zigzag',
    weight: 58,
    doc: { paths: [pts('z', Array.from({ length: 9 }, (_, i) => [150 + i * 88, i % 2 ? 380 : 620] as [number, number]))] },
  },
  {
    id: 'hex',
    name: 'Hex',
    weight: 72,
    doc: {
      paths: [
        pts(
          'h',
          Array.from({ length: 6 }, (_, i) => {
            const t = (i / 6) * Math.PI * 2 + Math.PI / 6;
            return [Math.round(500 + 230 * Math.cos(t)), Math.round(510 + 230 * Math.sin(t))] as [number, number];
          }),
          true,
        ),
      ],
    },
  },
  {
    id: 'wide-a',
    name: 'Wide A',
    weight: 70,
    doc: {
      paths: [
        open('a1', [a(300, 760), a(560, 400, null, { x: 600, y: 330 }), a(680, 300, { x: 620, y: 280 })]),
        pts('a2', [
          [400, 640],
          [700, 640],
        ]),
        pts('a3', [
          [680, 300],
          [720, 760],
          [780, 760],
        ]),
      ],
    },
  },
  {
    id: 'ribbon',
    name: 'Ribbon',
    weight: 90,
    doc: {
      paths: [
        open('r1', [a(200, 700), a(700, 250)]),
        open('r2', [a(260, 780), a(760, 330)]),
        open('r3', [a(300, 560, null, { x: 380, y: 420 }), a(640, 620, { x: 520, y: 760 })]),
      ],
    },
  },
];
