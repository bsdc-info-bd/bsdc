/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Mail, MapPin, Globe, Flag, Hash, WifiOff, ServerCrash, ShieldCheck } from 'lucide-react';
import { SEOHead, Breadcrumbs } from '@/components/seo/SEOHead';
import { organizationSchema, faqSchema } from '@/config/seo';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { BsdcLogo, RrcLogo } from '@/components/branding/Logo';
import { APP_EMAIL, APP_EMAIL_SECONDARY, FOUNDER_NAME, FOUNDER_SITE, SISTER_PROJECT_NAME, SISTER_PROJECT_URL, APP_URL } from '@/config/constants';
import { PostList } from '@/components/feed/PostList';
import { submitReport } from '@/lib/data';
import { useAuthStore } from '@/stores/authStore';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

/* ------------------------------------------------------------------ About */

export function About() {
  const { t } = useTranslation();
  return (
    <>
      <SEOHead
        title="About BSDC — Bangladesh Software Development Community"
        description="BSDC unites Bangladeshi software developers to share knowledge, code and opportunity. Founded by Rizwan Rahim Chowdhury, built by RRC Development."
        path="/about"
        keywords={['bsdc about', 'bangladesh software community', 'rrc development']}
        jsonLd={[organizationSchema(), faqSchema([
          { q: 'What is BSDC?', a: 'The Bangladesh Software Development Community — the national platform where Bangladeshi developers share knowledge, code, jobs and build the software future of Bangladesh.' },
          { q: 'Who founded BSDC?', a: 'BSDC was founded by Rizwan Rahim Chowdhury, CEO of RRC Development.' },
          { q: 'Is BSDC free?', a: 'Yes. BSDC is free for all developers.' },
        ])]}
      />
      <div className="mx-auto max-w-3xl">
        <Breadcrumbs items={[{ name: 'BSDC', path: '/' }, { name: t('nav.about'), path: '/about' }]} />
        <div className="bsdc-surface bsdc-fabric-hero p-6 sm:p-10">
          <BsdcLogo height={44} stacked className="mx-auto" />
          <p className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-300">{t('footer.aboutBody')}</p>
        </div>

        <div className="mt-6 space-y-4 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          <p>
            The Bangladesh Software Development Community (BSDC) is the pride of Bangladesh — a single home for every
            developer in the country, from a student writing her first line of C to a tech lead shipping systems at national
            scale. BSDC exists so that knowledge never stays locked in one city, one company, or one language.
          </p>
          <p>
            On BSDC you can publish articles and documentation, ask and answer questions, share code snippets in 50+
            languages, showcase projects, post and find jobs, buy and sell in the marketplace, chat in real time, join
            technology groups, earn BSDC points, register software licenses, and grow an audience through the Creator
            Program — in both Bangla and English.
          </p>
          <p>
            BSDC was founded by <strong>{FOUNDER_NAME}</strong> and is built and operated by{' '}
            <strong>RRC Development</strong>. It is a sister initiative of{' '}
            <a className="font-semibold text-brand-600 hover:underline dark:text-brand-400" href={SISTER_PROJECT_URL} target="_blank" rel="noopener noreferrer">
              {SISTER_PROJECT_NAME}
            </a>
            .
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Founder & CEO', value: FOUNDER_NAME, icon: ShieldCheck },
            { label: 'Parent organization', value: 'RRC Development', icon: Globe },
            { label: 'Founded in', value: 'Bangladesh', icon: MapPin },
          ].map((item) => (
            <div key={item.label} className="bsdc-surface p-4 text-center">
              <item.icon className="mx-auto h-5 w-5 text-brand-600" aria-hidden />
              <p className="mt-2 text-xs font-bold uppercase text-neutral-400">{item.label}</p>
              <p className="font-bold">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="bsdc-surface mt-6 flex flex-col items-center gap-3 p-5 text-center">
          <RrcLogo height={26} />
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Contact: <a className="font-semibold text-brand-600 hover:underline" href={`mailto:${APP_EMAIL}`}>{APP_EMAIL}</a> · {APP_EMAIL_SECONDARY} · Founder: <a className="font-semibold text-brand-600 hover:underline" href={FOUNDER_SITE} target="_blank" rel="noopener noreferrer">{FOUNDER_SITE.replace('https://', '')}</a>
          </p>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Contact */

export function Contact() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!name.trim() || !email.trim() || !message.trim()) {
      toast.error('Name, email and message are required');
      return;
    }
    setSending(true);
    try {
      const { addDocument } = await import('@/lib/firestore');
      await addDocument('contactMessages', { name, email, subject, message, createdAt: Date.now() });
      toast.success('Message sent — the BSDC team will reply soon');
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
    } catch {
      toast.error('Could not send message');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <SEOHead title="Contact BSDC" description="Contact the Bangladesh Software Development Community team." path="/contact" />
      <div className="mx-auto max-w-xl">
        <Breadcrumbs items={[{ name: 'BSDC', path: '/' }, { name: t('nav.contact'), path: '/contact' }]} />
        <h1 className="mb-1 text-xl font-extrabold sm:text-2xl">{t('nav.contact')}</h1>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">Questions, partnerships or support — we reply within 48 hours.</p>

        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          <a href={`mailto:${APP_EMAIL}`} className="bsdc-surface inline-flex items-center gap-2 px-3.5 py-2 font-semibold hover:border-brand-400">
            <Mail className="h-4 w-4 text-brand-600" aria-hidden />
            {APP_EMAIL}
          </a>
          <a href={`mailto:${APP_EMAIL_SECONDARY}`} className="bsdc-surface inline-flex items-center gap-2 px-3.5 py-2 font-semibold hover:border-brand-400">
            <Mail className="h-4 w-4 text-brand-600" aria-hidden />
            {APP_EMAIL_SECONDARY}
          </a>
        </div>

        <div className="bsdc-surface space-y-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Your email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea label="Message" value={message} onChange={(e) => setMessage(e.target.value)} minRows={5} />
          <Button loading={sending} onClick={() => void send()}>
            {t('common.send')}
          </Button>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------ Legal pages */

function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <>
      <SEOHead title={`${title} — BSDC`} description={`${title} of the Bangladesh Software Development Community.`} path={`/${title.toLowerCase().replace(/\s+/g, '-')}`} />
      <div className="mx-auto max-w-3xl">
        <Breadcrumbs items={[{ name: 'BSDC', path: '/' }, { name: title, path: `/${title.toLowerCase().replace(/\s+/g, '-')}` }]} />
        <h1 className="mb-1 text-xl font-extrabold sm:text-2xl">{title}</h1>
        <p className="mb-5 text-xs text-neutral-400">Last updated: {updated}</p>
        <div className="bsdc-surface space-y-5 p-6 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300 sm:p-8">{children}</div>
      </div>
    </>
  );
}

export function Terms() {
  return (
    <LegalShell title="Terms of Service" updated="January 2026">
      <section>
        <h2 className="mb-2 font-bold text-neutral-900 dark:text-neutral-100">1. Acceptance</h2>
        <p>By creating an account on the Bangladesh Software Development Community (BSDC, {APP_URL}), you agree to these terms. BSDC is operated by RRC Development, founded by Rizwan Rahim Chowdhury.</p>
      </section>
      <section>
        <h2 className="mb-2 font-bold text-neutral-900 dark:text-neutral-100">2. Accounts</h2>
        <p>You are responsible for your account credentials and all activity under your account. You must provide accurate information during registration. One person, one account.</p>
      </section>
      <section>
        <h2 className="mb-2 font-bold text-neutral-900 dark:text-neutral-100">3. Content</h2>
        <p>You retain ownership of content you publish. By posting, you grant BSDC a non-exclusive, worldwide license to host, display and distribute your content within the platform. Illegal content, harassment, spam, plagiarism and malware are strictly prohibited.</p>
      </section>
      <section>
        <h2 className="mb-2 font-bold text-neutral-900 dark:text-neutral-100">4. BSDC Points</h2>
        <p>BSDC Points are a platform-native digital point system with no cash value. Points may be earned through activity and transferred between users. Abuse of the points system (farming, botting, fraud) results in forfeiture and account action.</p>
      </section>
      <section>
        <h2 className="mb-2 font-bold text-neutral-900 dark:text-neutral-100">5. Marketplace & Licenses</h2>
        <p>Marketplace transactions occur between users; BSDC reviews listings but is not a payment processor. BSDC-issued software licenses certify registration metadata and do not constitute legal trademark or patent registration.</p>
      </section>
      <section>
        <h2 className="mb-2 font-bold text-neutral-900 dark:text-neutral-100">6. Termination</h2>
        <p>We may suspend or terminate accounts that violate these terms. You may delete your account at any time from Settings.</p>
      </section>
      <section>
        <h2 className="mb-2 font-bold text-neutral-900 dark:text-neutral-100">7. Liability</h2>
        <p>BSDC is provided "as is" without warranties. To the maximum extent permitted by law, RRC Development is not liable for indirect damages arising from use of the platform.</p>
      </section>
      <section>
        <h2 className="mb-2 font-bold text-neutral-900 dark:text-neutral-100">8. Contact</h2>
        <p>Questions about these terms: <a className="font-semibold text-brand-600 hover:underline" href={`mailto:${APP_EMAIL}`}>{APP_EMAIL}</a>.</p>
      </section>
    </LegalShell>
  );
}

export function Privacy() {
  return (
    <LegalShell title="Privacy Policy" updated="January 2026">
      <section>
        <h2 className="mb-2 font-bold text-neutral-900 dark:text-neutral-100">Data we collect</h2>
        <p>Account data (name, email, username, avatar), content you publish, interactions (reactions, comments, follows, bookmarks), messaging metadata, and device/browser information. Location and skills are optional and used only for feed relevance.</p>
      </section>
      <section>
        <h2 className="mb-2 font-bold text-neutral-900 dark:text-neutral-100">How we use it</h2>
        <p>To operate your account, personalize your feed (recency, engagement, relevance, proximity — computed on your activity), deliver notifications you enabled, keep the platform safe via moderation, and produce aggregate analytics.</p>
      </section>
      <section>
        <h2 className="mb-2 font-bold text-neutral-900 dark:text-neutral-100">Sharing</h2>
        <p>We do not sell your data. Data is processed by Firebase (Google), Cloudinary and ImgBB for storage, and OneSignal for push notifications — each under their own privacy policies.</p>
      </section>
      <section>
        <h2 className="mb-2 font-bold text-neutral-900 dark:text-neutral-100">Your rights (GDPR)</h2>
        <p>You can export all of your data (JSON/CSV) from Settings → Account, and delete your account at any time. Deletion removes your profile and personal data; anonymized aggregate statistics may be retained.</p>
      </section>
      <section>
        <h2 className="mb-2 font-bold text-neutral-900 dark:text-neutral-100">Security</h2>
        <p>Connections are encrypted in transit. Content is sanitized against XSS. Access to moderation tooling is role-restricted and fully audit-logged.</p>
      </section>
    </LegalShell>
  );
}

export function Guidelines() {
  return (
    <LegalShell title="Community Guidelines" updated="January 2026">
      <section>
        <h2 className="mb-2 font-bold text-neutral-900 dark:text-neutral-100">Be excellent to each other</h2>
        <p>BSDC is the pride of Bangladesh. Critique code, never people. Harassment, hate speech, or discrimination results in immediate moderation action.</p>
      </section>
      <section>
        <h2 className="mb-2 font-bold text-neutral-900 dark:text-neutral-100">Share knowledge generously</h2>
        <p>Write so a beginner in a rural district can learn. Credit your sources. Never plagiarize. Mark AI-generated content clearly.</p>
      </section>
      <section>
        <h2 className="mb-2 font-bold text-neutral-900 dark:text-neutral-100">Keep it safe and legal</h2>
        <p>No malware, piracy, personal data dumps, or illegal content. Job posts must be real opportunities with real compensation.</p>
      </section>
      <section>
        <h2 className="mb-2 font-bold text-neutral-900 dark:text-neutral-100">No spam or farming</h2>
        <p>Do not farm BSDC points, mass-follow, or engage-bait. One quality post beats a hundred spam posts.</p>
      </section>
      <section>
        <h2 className="mb-2 font-bold text-neutral-900 dark:text-neutral-100">Bangla and English</h2>
        <p>Both are first-class languages on BSDC. Post in whichever language serves your audience; both are welcome everywhere.</p>
      </section>
      <section>
        <h2 className="mb-2 font-bold text-neutral-900 dark:text-neutral-100">Reporting</h2>
        <p>Use the report button on any post, comment, user or listing. Our moderators review every report, prioritized by severity.</p>
      </section>
    </LegalShell>
  );
}

/* -------------------------------------------------------------- Tag/Report */

export function TagPage() {
  const { tag } = useParams<{ tag: string }>();
  const name = tag ? decodeURIComponent(tag) : '';
  return (
    <>
      <SEOHead title={`#${name} — BSDC`} description={`Posts tagged #${name} on the Bangladesh Software Development Community.`} path={`/tag/${encodeURIComponent(name)}`} />
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-4 flex items-center gap-2 text-xl font-extrabold sm:text-2xl">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
            <Hash className="h-5 w-5" aria-hidden />
          </span>
          #{name}
        </h1>
        <PostList sort="trending" tagFilter={name} emptyTitle={t0('name')} emptyBody="No posts use this tag yet. Start the trend!" />
      </div>
    </>
  );
}
function t0(name: string): string {
  return `#${name}`;
}

export function ReportPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const targetType = (searchParams.get('type') || 'post') as 'post' | 'comment' | 'user' | 'message' | 'listing' | 'group';
  const targetId = searchParams.get('id') || '';
  const [reason, setReason] = useState('spam');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!profile) {
      navigate('/login');
      return;
    }
    setSending(true);
    try {
      await submitReport(profile, targetType, targetId, targetId || 'direct report', reason, details);
      toast.success(t('post.reportThanks'));
      navigate(-1);
    } catch {
      toast.error('Could not submit report');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <SEOHead title={`Report — BSDC`} description="Report content to the BSDC moderation team." path="/report" noindex />
      <div className="mx-auto max-w-lg">
        <Breadcrumbs items={[{ name: 'BSDC', path: '/' }, { name: t('post.report'), path: '/report' }]} />
        <h1 className="mb-4 flex items-center gap-2 text-xl font-extrabold">
          <Flag className="h-6 w-6 text-red-500" aria-hidden />
          {t('post.report')}
        </h1>
        <div className="bsdc-surface space-y-3 p-5">
          <Select
            label={t('post.reportReason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            options={[
              { value: 'spam', label: 'Spam or point farming' },
              { value: 'harassment', label: 'Harassment or hate' },
              { value: 'misinformation', label: 'Misinformation' },
              { value: 'illegal', label: 'Illegal content' },
              { value: 'copyright', label: 'Copyright / plagiarism' },
              { value: 'other', label: 'Other' },
            ]}
          />
          <Textarea label={`${t('common.description')} (${t('common.optional')})`} value={details} onChange={(e) => setDetails(e.target.value)} minRows={4} />
          <Button variant="danger" loading={sending} onClick={() => void send()}>
            {t('common.submit')}
          </Button>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------ System pages */

export function NotFound() {
  return (
    <div className="py-10">
      <SEOHead title="Page not found — BSDC" description="This BSDC page does not exist." path="/404" />
      <EmptyState title="404" body="The page you are looking for does not exist or has moved." action={<Link to="/" className="text-sm font-bold text-brand-600 hover:underline dark:text-brand-400">Back to home</Link>} />
    </div>
  );
}

export function OfflinePage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <SEOHead title="Offline — BSDC" description="BSDC offline fallback page." path="/offline" noindex />
      <div className="text-center">
        <WifiOff className="mx-auto h-14 w-14 text-amber-500" aria-hidden />
        <h1 className="mt-4 text-2xl font-extrabold">{t('offline.title')}</h1>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{t('offline.body')}</p>
      </div>
    </div>
  );
}

export function ServerError() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <SEOHead title="Server error — BSDC" description="BSDC encountered an error." path="/500" noindex />
      <div className="text-center">
        <ServerCrash className="mx-auto h-14 w-14 text-red-500" aria-hidden />
        <h1 className="mt-4 text-2xl font-extrabold">500 — Something broke</h1>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">Our engineers are on it. Please try again in a moment.</p>
        <Link to="/" className="mt-5 inline-block text-sm font-bold text-brand-600 hover:underline dark:text-brand-400">
          Back to home
        </Link>
      </div>
    </div>
  );
}
