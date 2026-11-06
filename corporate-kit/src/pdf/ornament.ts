import type { Rgb } from './document';

/**
 * The brand, drawn rather than embedded.
 *
 * A PDF made of base-14 fonts and vector operators cannot include a PNG or an
 * SVG, and embedding one would mean carrying a font and an image pipeline into
 * a console that runs in a browser. It does not need to: the mark is four
 * shapes and two rules of text, so it is drawn here from the same numbers the
 * web wordmark uses, and it stays sharp at any print size for the same reason
 * a QR code does.
 *
 * Everything in this module is geometry and is therefore testable: a test asks
 * where a module lands, not what a screenshot looks like.
 */

/** The palette the mark is drawn in, so a themed document stays themed. */
export interface MarkColours {
  readonly ink: Rgb;
  readonly gradientStart: Rgb;
  readonly gradientEnd: Rgb;
  readonly outline: Rgb;
  readonly check: Rgb;
}

/** The palette in `brand/bsdc-logo.svg`, which is the one the site ships. */
export const BRAND_MARK: MarkColours = {
  ink: [0.106, 0.263, 0.196],
  gradientStart: [0.176, 0.416, 0.31],
  gradientEnd: [0.106, 0.263, 0.196],
  outline: [0.322, 0.718, 0.533],
  check: [1, 1, 1],
};

/** Where a rectangle lands, in page coordinates. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The mark as a watermark: outline only, no fill, no colour of its own.
 *
 * A filled rectangle at four per cent ink is what a watermark should not be —
 * it reads as a grey box behind the type, and on a laser printer it bands. This
 * is the shield and the check drawn as strokes, which is what a security
 * watermark on a printed certificate actually is.
 */
export function watermarkGeometry(origin: Box, colour: Rgb, weight = 0.8): readonly string[] {
  const unit = origin.width / 64;
  const stroke = `${weight.toFixed(2)} w ${colour.map((part) => part.toFixed(3)).join(' ')} RG`;
  const shield =
    `${(origin.x + 32 * unit).toFixed(2)} ${(origin.y + origin.height - 10 * unit).toFixed(2)} m ` +
    `${(origin.x + 12 * unit).toFixed(2)} ${(origin.y + origin.height - 19 * unit).toFixed(2)} l ` +
    `${(origin.x + 12 * unit).toFixed(2)} ${(origin.y + origin.height - 36 * unit).toFixed(2)} l ` +
    `${(origin.x + 32 * unit).toFixed(2)} ${(origin.y + origin.height - 56 * unit).toFixed(2)} l ` +
    `${(origin.x + 52 * unit).toFixed(2)} ${(origin.y + origin.height - 36 * unit).toFixed(2)} l ` +
    `${(origin.x + 52 * unit).toFixed(2)} ${(origin.y + origin.height - 19 * unit).toFixed(2)} l h`;
  const check =
    `${(origin.x + 23 * unit).toFixed(2)} ${(origin.y + origin.height - 33 * unit).toFixed(2)} m ` +
    `${(origin.x + 30 * unit).toFixed(2)} ${(origin.y + origin.height - 26 * unit).toFixed(2)} l ` +
    `${(origin.x + 42 * unit).toFixed(2)} ${(origin.y + origin.height - 41 * unit).toFixed(2)} l`;
  return [`${stroke} 1 J 1 j ${shield} S`, `${stroke} ${check} S`];
}

/**
 * The shield-and-check mark on its own, at `size` points square.
 *
 * A gradient in a PDF needs a shading pattern object; a two-tone approximation
 * of the same gradient needs two rectangles and reads identically at print
 * size. That trade is made deliberately: a certificate is printed at 300 dots
 * per inch on paper where the difference is invisible, and a shading pattern
 * is the single most common reason a hand-built PDF fails to open.
 */
export function markGeometry(origin: Box, colours: MarkColours): readonly string[] {
  const { x, y, width, height } = origin;
  const unit = width / 64;
  const rounded = (value: number): string => value.toFixed(2);
  const fill = (colour: Rgb): string => colour.map((part) => part.toFixed(3)).join(' ');

  // The shield: from the top centre, out to the shoulders, down the sides and
  // in to the point. Same proportions as the SVG's `translate(8 8)` group.
  const shieldPath =
    `${rounded(x + 32 * unit)} ${rounded(y + height - 12 * unit)} m ` +
    `${rounded(x + 16 * unit)} ${rounded(y + height - 20 * unit)} l ` +
    `${rounded(x + 16 * unit)} ${rounded(y + height - 34 * unit)} l ` +
    `${rounded(x + 32 * unit)} ${rounded(y + height - 53 * unit)} l ` +
    `${rounded(x + 48 * unit)} ${rounded(y + height - 34 * unit)} l ` +
    `${rounded(x + 48 * unit)} ${rounded(y + height - 20 * unit)} l h`;

  const checkPath =
    `${rounded(x + 25 * unit)} ${rounded(y + height - 32 * unit)} m ` +
    `${rounded(x + 30 * unit)} ${rounded(y + height - 27 * unit)} l ` +
    `${rounded(x + 39 * unit)} ${rounded(y + height - 37 * unit)} l`;

  return [
    // The rounded square, in two bands: the gradient, then the darker foot.
    `${fill(colours.gradientStart)} rg ${rounded(x)} ${rounded(y)} ${rounded(width)} ` +
      `${rounded(height)} re f`,
    `${fill(colours.gradientEnd)} rg ${rounded(x)} ${rounded(y)} ${rounded(width)} ` +
      `${rounded(height * 0.35)} re f`,
    // The shield outline.
    `1.6 w ${fill(colours.outline)} RG ${shieldPath} S`,
    // The check.
    `2 w ${fill(colours.check)} RG 1 J 1 j ${checkPath} S`,
  ];
}

/**
 * The wordmark: three rules of type the base-14 fonts can draw exactly.
 *
 * The web mark sets "BSDC" in a heavy grotesque and the full name under it in
 * letterspaced capitals. Helvetica-Bold is a grotesque, so the same two rules
 * of type are drawn here with the same proportions — the printed mark and the
 * screen mark are the same mark, not two designs that resemble each other.
 */
export interface WordmarkLayout {
  readonly mark: Box;
  readonly title: {
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly size: number;
  };
  readonly subtitle: {
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly size: number;
  };
  readonly underline: { readonly from: number; readonly to: number; readonly y: number };
}

export function wordmarkLayout(origin: Box): WordmarkLayout {
  const markSize = origin.height;
  const textX = origin.x + markSize + markSize * 0.28;
  return {
    mark: { x: origin.x, y: origin.y, width: markSize, height: markSize },
    title: {
      text: 'BSDC',
      x: textX,
      y: origin.y + markSize * 0.52,
      size: markSize * 0.5,
    },
    subtitle: {
      text: 'BANGLADESH SOFTWARE DEVELOPMENT COMMUNITY',
      x: textX,
      y: origin.y + markSize * 0.2,
      size: Math.max(4.6, markSize * 0.105),
    },
    underline: {
      from: textX,
      to: textX + markSize * 3.1,
      y: origin.y + markSize * 0.07,
    },
  };
}

/**
 * A guilloche: the interwoven line work that distinguishes a printed
 * certificate from a page with a border.
 *
 * Two sine waves a quarter turn apart, plus their envelope. It is arithmetic —
 * forty line segments per wave — so it is cheap, vector, and it cannot be
 * mistaken for a photograph the way a scanned ornament would be.
 */
export function guilloche(
  origin: Box,
  options: { readonly strokes?: number; readonly amplitude?: number; readonly steps?: number } = {},
): readonly string[] {
  const strokes = options.strokes ?? 3;
  const amplitude = options.amplitude ?? origin.height / 2;
  const steps = options.steps ?? 96;
  const mid = origin.y + origin.height / 2;
  const ops: string[] = [];

  for (let stroke = 0; stroke < strokes; stroke += 1) {
    const phase = (stroke / strokes) * Math.PI;
    const weight = 0.35 - stroke * 0.07;
    for (const wave of [0, Math.PI / 2]) {
      const points: string[] = [];
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const x = origin.x + t * origin.width;
        // Tapered at both ends, so the ornament fades rather than stops.
        const taper = Math.sin(Math.PI * t) ** 0.6;
        const y = mid + Math.sin(t * Math.PI * 4 + phase + wave) * amplitude * taper;
        points.push(`${x.toFixed(2)} ${y.toFixed(2)} ${step === 0 ? 'm' : 'l'}`);
      }
      ops.push(`${weight.toFixed(2)} w ${points.join(' ')} S`);
    }
  }
  return ops;
}

/**
 * A seal, drawn: four concentric bands, each with one job.
 *
 * From the outside in — the rim, the milled edge, the caption, the field. The
 * bands are fixed proportions of the radius rather than absolute points, so a
 * seal on a small sheet is the same seal, not a crowded one, and the caption
 * radius is exported because type set around a circle has to know exactly
 * where the ring is or it will collide with it.
 */
export const SEAL_BANDS = {
  rim: 1,
  mills: [0.9, 0.965],
  caption: 0.795,
  field: 0.66,
  mark: 0.5,
} as const;

export function sealGeometry(
  centre: { readonly x: number; readonly y: number },
  radius: number,
  colours: { readonly ink: Rgb; readonly ring: Rgb },
): readonly string[] {
  const fill = (colour: Rgb): string => colour.map((part) => part.toFixed(3)).join(' ');
  const op = (weight: number, colour: Rgb, path: string, paint: 'S' | 'f'): string =>
    `${weight.toFixed(2)} w ${fill(colour)} RG ${path} ${paint}`;
  const circle = (r: number): string =>
    `${centre.x.toFixed(2)} ${centre.y.toFixed(2)} ${r.toFixed(2)} 0 360 arc`;

  const ops: string[] = [
    // The field, then the rim over it.
    `${fill(colours.ring)} rg ${circle(radius)} f`,
    op(1.1, colours.ink, circle(radius), 'S'),
    op(0.45, colours.ink, circle(radius * SEAL_BANDS.field), 'S'),
  ];

  // The milled edge: sixty short rays between the rim and the caption ring,
  // which is what stops a printed seal looking like a sticker.
  const mills = 60;
  for (let mill = 0; mill < mills; mill += 1) {
    const angle = (mill / mills) * Math.PI * 2;
    const [inner, outer] = SEAL_BANDS.mills as readonly [number, number];
    ops.push(
      op(
        0.4,
        colours.ink,
        `${(centre.x + Math.cos(angle) * radius * inner).toFixed(2)} ` +
          `${(centre.y + Math.sin(angle) * radius * inner).toFixed(2)} m ` +
          `${(centre.x + Math.cos(angle) * radius * outer).toFixed(2)} ` +
          `${(centre.y + Math.sin(angle) * radius * outer).toFixed(2)} l`,
        'S',
      ),
    );
  }
  return ops;
}

/** The characters of a curved caption, each with the transform that places it. */
export interface CurvedCharacter {
  readonly character: string;
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
  readonly size: number;
}

/**
 * Sets a caption around an arc, on the top or the bottom of a ring.
 *
 * The type is fitted, not hoped for. Each character is allotted the angle its
 * own advance subtends at this radius, the run is centred on the vertical, and
 * if the whole caption would take more than `maxSweep` of the ring the type is
 * scaled down until it fits. Without that last step a long caption silently
 * wraps past the bottom of the seal and collides with the caption on the other
 * side — which is what a badge looks like when it has been typeset by
 * arithmetic that never checked.
 */
export function curvedCaption(
  text: string,
  centre: { readonly x: number; readonly y: number },
  radius: number,
  options: {
    readonly half?: 'top' | 'bottom';
    readonly size?: number;
    readonly maxSweep?: number;
  } = {},
): readonly CurvedCharacter[] {
  const half = options.half ?? 'top';
  const requested = options.size ?? 6.5;
  // A ring is not a line: 160 degrees of it is as much caption as reads well.
  const maxSweep = options.maxSweep ?? (Math.PI * 8) / 9;
  const characters = [...text];
  if (characters.length === 0 || radius <= 0) return [];

  /** The advance of one character, in ems: spaces are half a letter. */
  const advanceEm = (character: string): number => (character === ' ' ? 0.28 : 0.58);
  const totalEm = characters.reduce((sum, character) => sum + advanceEm(character), 0);
  // Fitting: angle = (ems * size) / radius, so the largest size that fits.
  const size = Math.min(requested, (maxSweep * radius) / Math.max(totalEm, 0.001));
  const sweep = (totalEm * size) / radius;

  // The caption is centred on the vertical: the top runs right to left from the
  // apex, the bottom runs left to right from the nadir.
  const middle = half === 'top' ? Math.PI / 2 : -Math.PI / 2;
  const direction = half === 'top' ? -1 : 1;
  let travelled = 0;

  return characters.map((character) => {
    const advance = (advanceEm(character) * size) / radius;
    const offset = middle + direction * (travelled + advance / 2 - sweep / 2);
    travelled += advance;
    return {
      character,
      x: centre.x + Math.cos(offset) * radius,
      y: centre.y + Math.sin(offset) * radius,
      // Type on a circle stands up from it: the top of the glyph points away
      // from the centre at the top of the ring, and towards it at the bottom.
      rotate: half === 'top' ? offset - Math.PI / 2 : offset + Math.PI / 2,
      size,
    };
  });
}

/**
 * A handwritten-looking signature, as a stroke.
 *
 * A certificate signed with a typed name looks like a form, so this draws a
 * plausible hand: a leading ascender, two or three bowls, a descender that
 * sweeps back under the name and a crossing stroke through the bowls — the
 * shape of a name written quickly with a pen that is not lifted.
 *
 * It is generated from the signatory's name, so one person always produces the
 * same signature and two people never share one, and it is decoration: the
 * code and the public desk are what prove the document. The curves are cubic
 * Béziers with control points derived from the seed, which is what makes them
 * read as handwriting rather than as a graph of noise.
 */
export function signatureStrokes(
  name: string,
  origin: Box,
  options: { readonly seed?: number } = {},
): readonly string[] {
  let seed = options.seed ?? 7;
  for (const character of name) seed = (seed * 31 + (character.codePointAt(0) ?? 0)) % 100_003;
  const next = (): number => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };

  // The baseline sits a fifth of the way up the box, and a bowl rises to twice
  // its own radius above the baseline: the x-height is chosen so that the
  // tallest bowl still lands inside the box rather than above it.
  const baseY = origin.y + origin.height * 0.2;
  const height = origin.height;
  const width = origin.width;
  const xHeight = height * 0.34;
  const point = (x: number, y: number): string =>
    `${(origin.x + x).toFixed(2)} ${(baseY + y).toFixed(2)}`;

  /**
   * A loop: an ellipse traced from the baseline, up to the x-height and back,
   * using the cubic control constant that makes four segments a circle
   * (0.5523). Approximating a bowl with straight segments is what makes a
   * generated signature look like a mountain range.
   */
  const bowl = (centreX: number, radiusX: number, radiusY: number): string => {
    const k = 0.5523;
    const ry = radiusY;
    const rx = radiusX;
    // Start at the bottom of the ellipse and go clockwise.
    return (
      `${point(centreX, 0)} m ` +
      `${point(centreX + rx * k, 0)} ${point(centreX + rx, ry * (1 - k))} ${point(centreX + rx, ry)} c ` +
      `${point(centreX + rx, ry * (1 + k))} ${point(centreX + rx * k, ry * 2)} ${point(centreX, ry * 2)} c ` +
      `${point(centreX - rx * k, ry * 2)} ${point(centreX - rx, ry * (1 + k))} ${point(centreX - rx, ry)} c ` +
      `${point(centreX - rx, ry * (1 - k))} ${point(centreX - rx * k, 0)} ${point(centreX, 0)} c`
    );
  };

  /** A single smooth stroke through two points, bowed by `bow`. */
  const sweep = (
    from: { x: number; y: number },
    to: { x: number; y: number },
    bow: number,
  ): string => {
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2 + bow;
    return (
      `${point(from.x, from.y)} m ` +
      `${point(midX, midY)} ${point(midX, midY)} ${point(to.x, to.y)} c`
    );
  };

  const strokes: string[] = [];

  // The capital: an ascender that leans, curves at the top of the stroke and
  // comes back down to the baseline, which is how a written "R" or "N" starts.
  const ascenderX = width * (0.1 + next() * 0.03);
  strokes.push(
    sweep({ x: 0, y: 0 }, { x: ascenderX, y: height * 0.34 }, height * 0.12) +
      ` ${point(ascenderX + width * 0.02, height * 0.34)} m ` +
      `${point(ascenderX + width * 0.05, height * 0.6)} ${point(ascenderX + width * 0.02, height * 0.05)} ` +
      `${point(ascenderX + width * 0.04, 0)} c`,
  );

  // Two or three bowls, touching, each a real loop.
  let x = ascenderX + width * 0.05;
  const bowls = 2 + (next() > 0.45 ? 1 : 0);
  for (let index = 0; index < bowls; index += 1) {
    const rx = width * (0.048 + next() * 0.018);
    const ry = xHeight * (0.92 + next() * 0.16);
    strokes.push(bowl(x + rx, rx, ry));
    x += rx * 2 + width * 0.008;
  }

  // The tail: down below the baseline, out to the right, and a flick back up
  // through the bowls, which is the gesture that says "signed".
  strokes.push(sweep({ x, y: 0 }, { x: x + width * 0.11, y: -height * 0.34 }, height * 0.16));
  strokes.push(
    sweep(
      { x: x + width * 0.1, y: -height * 0.3 },
      { x: x + width * 0.03, y: height * 0.28 },
      width * 0.02,
    ),
  );

  const ops: string[] = [
    `1.15 w 0.07 g 0.07 G 1 J 1 j ${strokes.join(' ')} S`,
    // A rule under it, the way a signature line is ruled.
    `0.5 w 0.62 G ${origin.x.toFixed(2)} ${(baseY - 5).toFixed(2)} m ` +
      `${(origin.x + width).toFixed(2)} ${(baseY - 5).toFixed(2)} l S`,
  ];
  return ops;
}
