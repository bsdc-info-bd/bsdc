import { useParams } from 'react-router-dom';
import { Seo } from '@/components/seo';
import { Shield, Clock } from 'lucide-react';
import { config } from '@/config';

export default function LicenseVerifyPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <>
      <Seo title={`License Verification: ${id}`} description="Verify a BSDC software license" />
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
        <div className="max-w-md w-full card p-8 text-center space-y-4">
          <Shield className="h-12 w-12 mx-auto text-brand-500" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">License Verification</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">License ID: {id}</p>

          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <Clock className="h-8 w-8 mx-auto text-yellow-500 mb-2" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              License verification requires Firebase to be configured. The system will validate licenses against the database.
            </p>
          </div>

          <p className="text-2xs text-gray-400">
            {config.siteName} &bull; {config.siteUrl}
          </p>
        </div>
      </div>
    </>
  );
}
