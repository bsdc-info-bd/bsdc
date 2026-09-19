/**
 * BSDC — src/app/layouts/PrintLayout.tsx
 * Purpose : Layout used when printing reports, invoices, licences and labels (PART 08.04 R-14).
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : App chrome is stripped by src/styles/layers/print.css; this layout adds the print-only
 *           header (brand, report id, generated-at) required by every PDF and printed artefact
 *           (PART 04 LAW-08).
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import type { ReactNode } from 'react';
import { BrandLogo } from '@/shared/ui/BrandLogo';

/** Props for the print layout. */
export interface PrintLayoutProps {
  readonly children: ReactNode;
  /** Document identifier printed in the header. */
  readonly documentId: string;
  /** ISO timestamp the document was generated. */
  readonly generatedAt: string;
}

/**
 * Renders a print-oriented layout.
 * @param props component props
 * @returns the layout
 */
export function PrintLayout({
  children,
  documentId,
  generatedAt,
}: PrintLayoutProps): React.ReactElement {
  return (
    <div className="bg-white p-8 text-black">
      <header className="mb-6 flex items-center justify-between border-b border-black/20 pb-3">
        <BrandLogo variant="horizontal" height={36} />
        <dl className="text-right text-xs">
          <dt className="font-semibold">Document</dt>
          <dd className="font-mono">{documentId}</dd>
          <dt className="mt-2 font-semibold">Generated</dt>
          <dd className="font-mono">{generatedAt}</dd>
        </dl>
      </header>
      <div>{children}</div>
    </div>
  );
}
