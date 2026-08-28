import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Seo } from '@/components/seo';
import { Search as SearchIcon, Users, FileText, Hash } from 'lucide-react';

export default function SearchPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [searchInput, setSearchInput] = useState(query);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setSearchParams({ q: searchInput.trim() });
    }
  };

  return (
    <>
      <Seo title={query ? `Search: ${query}` : t('common.search')} description="Search BSDC" />
      <div className="max-w-3xl mx-auto space-y-6">
        <form onSubmit={handleSearch}>
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('search.searchPlaceholder')}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 text-base"
              aria-label={t('search.searchPlaceholder')}
            />
          </div>
        </form>

        {query ? (
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('search.noResults', { query })}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              {t('search.recentSearches')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                <FileText className="h-5 w-5 text-gray-400" />
                <span className="text-sm text-gray-600 dark:text-gray-400">{t('search.searchPosts')}</span>
              </button>
              <button className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                <Users className="h-5 w-5 text-gray-400" />
                <span className="text-sm text-gray-600 dark:text-gray-400">{t('search.searchUsers')}</span>
              </button>
              <button className="card p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                <Hash className="h-5 w-5 text-gray-400" />
                <span className="text-sm text-gray-600 dark:text-gray-400">{t('search.searchTags')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
