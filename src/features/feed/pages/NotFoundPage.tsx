import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { Button } from '@/components/ui';
import { FileQuestion, Home } from 'lucide-react';

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <>
      <Seo title="Page Not Found" noindex />
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <FileQuestion className="h-20 w-20 text-gray-300 dark:text-gray-700 mb-6" aria-hidden="true" />
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">404</h1>
        <p className="text-lg text-gray-500 dark:text-gray-400 mb-6 max-w-md">
          {t('errors.notFound')}. The page you are looking for does not exist or has been moved.
        </p>
        <div className="flex gap-3">
          <Link to="/"><Button variant="primary"><Home className="h-4 w-4" /> Go Home</Button></Link>
          <Button variant="outline" onClick={() => window.history.back()}>Go Back</Button>
        </div>
      </div>
    </>
  );
}
