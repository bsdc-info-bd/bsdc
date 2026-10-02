import qrcode from 'qrcode-generator';

/**
 * A QR code as a square of booleans. Both the screen preview and the printed
 * document draw from this one matrix, so what a reader scans off a monitor
 * and what they scan off paper are the same code.
 */
export type QrMatrix = {
  readonly size: number;
  readonly modules: readonly (readonly boolean[])[];
};

/**
 * Error correction level M recovers about fifteen per cent of a damaged
 * symbol, which is the right trade for a code that will be printed, folded
 * and photographed.
 */
export function qrMatrix(text: string): QrMatrix {
  const code = qrcode(0, 'M');
  code.addData(text);
  code.make();
  const size = code.getModuleCount();
  const modules: boolean[][] = [];
  for (let row = 0; row < size; row += 1) {
    const line: boolean[] = [];
    for (let column = 0; column < size; column += 1) {
      line.push(code.isDark(row, column));
    }
    modules.push(line);
  }
  return { size, modules };
}

/**
 * An SVG path covering every dark module. One path rather than hundreds of
 * rectangles keeps the markup small enough to inline in a preview.
 */
export function qrPath(matrix: QrMatrix): string {
  const parts: string[] = [];
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (matrix.modules[row]?.[column] === true) {
        parts.push(`M${column} ${row}h1v1h-1z`);
      }
    }
  }
  return parts.join('');
}

/** A complete, self-contained SVG document for a code, sized in modules. */
export function qrSvg(text: string, options: { readonly quietZone?: number } = {}): string {
  const matrix = qrMatrix(text);
  const quiet = options.quietZone ?? 2;
  const extent = matrix.size + quiet * 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}" shape-rendering="crispEdges" role="img">`,
    `<rect width="${extent}" height="${extent}" fill="#ffffff"/>`,
    `<g transform="translate(${quiet} ${quiet})" fill="#000000"><path d="${qrPath(matrix)}"/></g>`,
    '</svg>',
  ].join('');
}
