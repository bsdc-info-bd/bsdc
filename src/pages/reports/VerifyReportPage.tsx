/**
 * BSDC — src/pages/reports/VerifyReportPage.tsx
 * Purpose : The public verification page the QR code points at.
 * Owner   : RRC Development / BSDC Platform Team
 * Notes   : No sign-in, no standing, no tracking. A person holding a printed BSDC document can scan
 *   the code on it and be told one of three true things. The id and hash come from the path and the
 *   query string, and both are prefilled into the form so the page works for somebody who typed the
 *   address by hand as well as for somebody who scanned it.
 * Licence : Source-available. Re-deployment or rebranding is not permitted.
 */
import { useSearchParams } from 'react-router-dom';
import { Container } from '@/shared/ui';
import { useSession } from '@/features/auth';
import { VerificationCard } from '@/features/reports';

/**
 * Renders the public verification route.
 * @returns the page element
 */
export function VerifyReportPage(): React.ReactElement {
  const { locale } = useSession();
  const [params] = useSearchParams();
  const hash = params.get('h') ?? '';

  return (
    <Container className="py-6">
      <VerificationCard
        locale={locale}
        {...((window.location.pathname.split('/').pop()?.length ?? 0 > 0)
          ? { reportId: window.location.pathname.split('/').pop() }
          : {})}
        {...(hash.length > 0 ? { hash } : {})}
      />
    </Container>
  );
}
