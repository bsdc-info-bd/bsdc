import { Play, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Seo } from '@/components/seo/Seo';
import {
  Alert,
  Button,
  Card,
  SectionHeading,
  SelectField,
  TextField,
  TextareaField,
} from '@/design-system';
import { usePlayground } from '@/hooks/use-opportunities';
import { buildSandboxDocument, type SketchLanguage } from '@/lib/opportunities/opportunity-types';
import { formatRelativeTime } from '@/lib/format';
import { ROUTES } from '@/lib/site';
import { dataErrorKey } from '@/lib/supabase/errors';
import { selectIsSignedIn, useAuthStore } from '@/store/auth-store';

const LANGUAGES: SketchLanguage[] = ['javascript', 'typescript', 'html', 'css', 'sql'];

const STARTER = `const squares = [1, 2, 3, 4].map((n) => n * n);
console.log('squares', squares);`;

/**
 * The playground. Code runs inside an iframe sandboxed to allow-scripts only:
 * no same-origin access, no storage, no cookies, no way back into the host
 * page. Nothing is executed on a server.
 */
export default function PlaygroundPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const isSignedIn = useAuthStore(selectIsSignedIn);
  const playground = usePlayground();

  const [sketchId, setSketchId] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState(t('playground.untitled'));
  const [sketchLanguage, setSketchLanguage] = useState<SketchLanguage>('javascript');
  const [code, setCode] = useState(STARTER);
  const [running, setRunning] = useState('');

  const srcDoc = useMemo(
    () => (running.length === 0 ? '' : buildSandboxDocument(sketchLanguage, running)),
    [running, sketchLanguage],
  );

  async function save() {
    try {
      const saved = await playground.save({
        ...(sketchId === undefined ? {} : { id: sketchId }),
        title: title.trim().length > 0 ? title.trim() : t('playground.untitled'),
        language: sketchLanguage,
        code,
      });
      setSketchId(saved.id);
      toast.success(t('playground.saved'));
    } catch (error) {
      toast.error(t(dataErrorKey(error)));
    }
  }

  return (
    <>
      <Seo
        title={t('playground.metaTitle')}
        description={t('playground.metaDescription')}
        path={ROUTES.playground}
      />

      <div className="fab-container py-6 sm:py-10">
        <SectionHeading title={t('playground.title')} description={t('playground.description')} />

        <Alert tone="info" title={t('playground.sandboxTitle')} className="mt-4">
          <p>{t('playground.sandboxBody')}</p>
        </Alert>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label={t('playground.sketchTitle')}
                value={title}
                maxLength={120}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
              />
              <SelectField
                label={t('playground.language')}
                value={sketchLanguage}
                onChange={(event) => {
                  setSketchLanguage(event.target.value as SketchLanguage);
                }}
                options={LANGUAGES.map((item) => ({
                  value: item,
                  label: t(`playground.languages.${item}`),
                }))}
              />
            </div>

            <div className="mt-3">
              <TextareaField
                label={t('playground.code')}
                rows={16}
                spellCheck={false}
                className="font-mono"
                value={code}
                maxLength={40000}
                counterMax={40000}
                onChange={(event) => {
                  setCode(event.target.value);
                }}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setRunning(code);
                }}
              >
                <Play size={16} />
                {t('playground.run')}
              </Button>
              {isSignedIn ? (
                <Button
                  variant="secondary"
                  disabled={playground.isSaving}
                  onClick={() => {
                    void save();
                  }}
                >
                  <Save size={16} />
                  {t('playground.save')}
                </Button>
              ) : (
                <p className="self-center text-xs text-muted">{t('playground.signInToSave')}</p>
              )}
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold">{t('playground.output')}</h2>
            {srcDoc.length === 0 ? (
              <p className="mt-3 text-sm text-muted">{t('playground.notRunYet')}</p>
            ) : (
              <iframe
                title={t('playground.output')}
                sandbox="allow-scripts"
                srcDoc={srcDoc}
                className="mt-3 h-96 w-full rounded-lg border border-line bg-white"
              />
            )}
          </Card>
        </div>

        {isSignedIn && playground.sketches.length > 0 ? (
          <section className="mt-6" aria-labelledby="my-sketches">
            <h2 id="my-sketches" className="text-lg font-semibold">
              {t('playground.mySketches')}
            </h2>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {playground.sketches.map((sketch) => (
                <Card
                  as="li"
                  key={sketch.id}
                  padded={false}
                  className="flex items-center gap-2 p-3"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-start"
                    onClick={() => {
                      setSketchId(sketch.id);
                      setTitle(sketch.title);
                      setSketchLanguage(sketch.language);
                      setCode(sketch.code);
                      setRunning('');
                    }}
                  >
                    <span className="fab-truncate block text-sm font-semibold">{sketch.title}</span>
                    <span className="block text-2xs text-muted">
                      {t(`playground.languages.${sketch.language}`)} ·{' '}
                      {formatRelativeTime(new Date(sketch.updatedAt), language)}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void playground.remove(sketch.id);
                    }}
                  >
                    <Trash2 size={14} />
                    <span className="fab-sr-only">{t('common.delete')}</span>
                  </Button>
                </Card>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
