/* BSDC — Bangladesh Software Development Community. Copyright (c) RRC Development. Proprietary — see LICENSE. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { BsdcLogo, BsdcMark, BsdcAnimatedLogo, RrcLogo } from '@/components/branding/Logo';
import { BadgeWall } from '@/components/branding/Badges';
import { ALL_BADGE_GROUPS } from '@/components/branding/badgeData';
import { BrandBanner, SocialCoverRow, PromoBannerSet } from '@/components/branding/Banners';
import { IdCard, Certificate, TshirtDesign, SplashScreen } from '@/components/branding/Cards';
import { SEOHead, Breadcrumbs } from '@/components/seo/SEOHead';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useAuthStore } from '@/stores/authStore';

export default function Branding() {
  const { t } = useTranslation();
  const profile = useAuthStore((s) => s.profile);
  const [lang, setLang] = useState<'en' | 'bn'>('en');

  return (
    <>
      <SEOHead
        title="Brand Assets — BSDC"
        description="The complete BSDC brand system: logos, social covers, promo banners, ID cards, certificates, badges and T-shirt designs."
        path="/branding"
      />
      <div className="mx-auto max-w-5xl">
        <Breadcrumbs items={[{ name: 'BSDC', path: '/' }, { name: t('nav.branding'), path: '/branding' }]} />
        <h1 className="mb-1 text-xl font-extrabold sm:text-2xl">{t('nav.branding')}</h1>
        <p className="mb-5 text-sm text-neutral-500 dark:text-neutral-400">
          100+ official BSDC brand assets. All SVG-based, brand-color consistent, usable in both Bangla and English contexts.
        </p>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setLang('en')}
            className={`bsdc-tap rounded-lg px-4 py-2 text-sm font-bold ${lang === 'en' ? 'bg-brand-600 text-white' : 'bsdc-surface'}`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setLang('bn')}
            className={`bsdc-tap rounded-lg px-4 py-2 text-sm font-bold ${lang === 'bn' ? 'bg-brand-600 text-white' : 'bsdc-surface'}`}
          >
            বাংলা
          </button>
        </div>

        <Tabs defaultValue="logos">
          <div className="bsdc-surface mb-4 p-2">
            <TabsList>
              <TabsTrigger value="logos">Logos</TabsTrigger>
              <TabsTrigger value="covers">Covers</TabsTrigger>
              <TabsTrigger value="promo">Promo</TabsTrigger>
              <TabsTrigger value="badges">Badges</TabsTrigger>
              <TabsTrigger value="cards">ID Cards</TabsTrigger>
              <TabsTrigger value="certs">Certificates</TabsTrigger>
              <TabsTrigger value="shirts">T-Shirts</TabsTrigger>
              <TabsTrigger value="misc">Misc</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="logos">
            <section className="bsdc-surface space-y-8 p-6">
              <div>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-neutral-400">Primary logos</h2>
                <div className="flex flex-wrap items-center gap-8">
                  <div className="text-neutral-900 dark:text-neutral-100"><BsdcLogo height={40} withTagline /></div>
                  <div className="text-neutral-900 dark:text-neutral-100"><BsdcLogo height={40} stacked /></div>
                  <div className="rounded-xl bg-surface-dark p-4 text-white"><BsdcLogo height={36} variant="white" /></div>
                  <div className="rounded-xl bg-white p-4 text-neutral-900"><BsdcLogo height={36} variant="black" /></div>
                  <BsdcAnimatedLogo size={56} />
                </div>
              </div>
              <div>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-neutral-400">Marks & wordmark sizes</h2>
                <div className="flex flex-wrap items-end gap-6">
                  <BsdcMark size={72} />
                  <BsdcMark size={48} />
                  <BsdcMark size={32} />
                  <BsdcMark size={24} />
                  <BsdcMark size={72} monochrome="white" />
                  <BsdcMark size={72} monochrome="black" />
                  <RrcLogo height={30} />
                </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="covers">
            <div className="space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-400">Social media covers ({lang === 'bn' ? 'বাংলা' : 'English'})</h2>
              <SocialCoverRow lang={lang} />
              <section>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-neutral-400">Milestone & welcome banners</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <figure className="overflow-hidden rounded-xl">
                    <BrandBanner variant="milestone" title={lang === 'bn' ? '১ লাখ ডেভেলপার!' : '100K Developers!'} subtitle={lang === 'bn' ? 'ধন্যবাদ বাংলাদেশ' : 'Thank you, Bangladesh'} lang={lang} width={800} height={300} />
                  </figure>
                  <figure className="overflow-hidden rounded-xl">
                    <BrandBanner variant="welcome" title={lang === 'bn' ? 'BSDC-তে স্বাগতম' : 'Welcome to BSDC'} subtitle={lang === 'bn' ? 'আপনার যাত্রা শুরু হলো' : 'Your journey starts now'} lang={lang} width={800} height={300} />
                  </figure>
                  <figure className="overflow-hidden rounded-xl">
                    <BrandBanner variant="event" title="BSDC DevConf 2026" subtitle={lang === 'bn' ? 'ঢাকা · ডিসেম্বর' : 'Dhaka · December'} lang={lang} width={800} height={300} />
                  </figure>
                  <figure className="overflow-hidden rounded-xl">
                    <BrandBanner variant="job" title={lang === 'bn' ? 'হিরিং: সিনিয়র রিঅ্যাক্ট ডেভেলপার' : 'Hiring: Senior React Developer'} subtitle="remote · BDT" lang={lang} width={800} height={300} />
                  </figure>
                </div>
              </section>
            </div>
          </TabsContent>

          <TabsContent value="promo">
            <PromoBannerSet lang={lang} />
          </TabsContent>

          <TabsContent value="badges">
            <div className="space-y-8">
              {ALL_BADGE_GROUPS.map((group) => (
                <section key={group.title} className="bsdc-surface p-6">
                  <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-neutral-400">{group.title}</h2>
                  <BadgeWall variants={group.variants} />
                </section>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="cards">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {(['member', 'admin', 'moderator', 'manager', 'creator', 'speaker', 'attendee'] as const).map((role) => (
                <IdCard
                  key={role}
                  role={role}
                  displayName={profile?.displayName || 'Rizwan Rahim Chowdhury'}
                  username={profile?.username || 'rizwan'}
                  memberId={`BSDC-${role.slice(0, 2).toUpperCase()}-${(profile?.uid || '0001').slice(0, 6).toUpperCase()}`}
                  avatarUrl={profile?.avatar}
                  dark={role === 'admin' || role === 'creator'}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="certs">
            <div className="space-y-8">
              <Certificate kind="license" recipientName={profile?.displayName || 'Rizwan Rahim Chowdhury'} detail="for registering the software “DebateSylhetBD Platform v2.0” under an official BSDC software license (MIT)." serial="BSDC-LIC-2026-00001" />
              <Certificate kind="creator" recipientName={profile?.displayName || 'Ayesha Rahman'} detail="on reaching 100,000 followers and joining the BSDC Creator Program as a Standard Creator." serial="BSDC-CR-2026-00042" />
              <Certificate kind="achievement" recipientName={profile?.displayName || 'Tanvir Hasan'} detail="for publishing 100 quality posts and earning the Century Club achievement badge." serial="BSDC-ACH-2026-00777" />
              <Certificate kind="event" recipientName={profile?.displayName || 'Nusrat Jahan'} detail="for attending BSDC DevMeet Dhaka 2026, the largest developer meetup in Bangladesh." serial="BSDC-EVT-2026-00310" />
              <Certificate kind="hackathon" recipientName={profile?.displayName || 'Team Sylhet Syntax'} detail="FIRST PLACE — BSDC National Hackathon 2026, for outstanding engineering under 48 hours." serial="BSDC-HCK-2026-00003" />
            </div>
          </TabsContent>

          <TabsContent value="shirts">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <TshirtDesign text="BSDC" />
              <TshirtDesign text="</>" />
              <TshirtDesign text={lang === 'bn' ? 'আমি বাংলাদেশ গড়ি' : 'I Build Bangladesh'} bangla />
              <TshirtDesign text="DevConf 26" />
              <TshirtDesign text={lang === 'bn' ? 'কমিউনিটি' : 'Community'} bangla={lang === 'bn'} />
              <TshirtDesign text="BSDC" />
            </div>
          </TabsContent>

          <TabsContent value="misc">
            <div className="space-y-8">
              <section>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-neutral-400">Email headers & footers</h2>
                <div className="overflow-hidden rounded-xl">
                  <BrandBanner variant="email-header" width={600} height={140} lang={lang} title={lang === 'bn' ? 'বিএসডিসি নিউজলেটার' : 'BSDC Newsletter'} subtitle={lang === 'bn' ? 'এই সপ্তাহের সেরা' : 'This week on BSDC'} />
                </div>
                <div className="mt-3 overflow-hidden rounded-xl">
                  <BrandBanner variant="email-footer" width={600} height={90} lang={lang} title="BSDC · RRC Development" subtitle={lang === 'bn' ? 'আপনি এই ইমেইলের সাবস্ক্রাইব বাতিল করতে পারেন' : 'You can unsubscribe from these emails'} />
                </div>
              </section>
              <section>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-neutral-400">PWA splash / loading screens</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="overflow-hidden rounded-xl border border-surface-light-border dark:border-surface-dark-border">
                    <SplashScreen label="BSDC" />
                  </div>
                  <div className="overflow-hidden rounded-xl border border-surface-light-border dark:border-surface-dark-border">
                    <SplashScreen label={lang === 'bn' ? 'বিএসডিসি' : 'BSDC'} />
                  </div>
                </div>
              </section>
            </div>
          </TabsContent>
        </Tabs>

        <p className="mt-8 flex items-center justify-center gap-2 text-xs text-neutral-400">
          <Download className="h-3.5 w-3.5" aria-hidden />
          All assets are rendered as live SVG — right-click any element to copy, or screenshot at export size.
        </p>
      </div>
    </>
  );
}
