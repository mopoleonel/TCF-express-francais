import { ArrowRight } from 'lucide-react';
import { useLanguage } from '../../contexts/useLanguage';
import { isNative } from '../../hooks/useIsNative';
import LeoImage from '../../assets/images/leo-atelier.webp';

// L'Atelier de français est une petite appli à part (public/atelier/) : lien <a> classique, pas <Link>.
// Dans l'appli mobile, on ouvre la version en ligne.
export const ATELIER_LINK = isNative() ? 'https://tcf-express.com/atelier/' : '/atelier/';

const copy = {
  fr: {
    badge: 'Nouveau',
    title: "L'Atelier de français",
    text: 'Corrigez vos bases (A1 → B2) avant le TCF : leçons courtes, aide en anglais et oral avec Léo.',
    cta: 'Ouvrir',
  },
  en: {
    badge: 'New',
    title: "L'Atelier de français",
    text: 'Fix your French basics (A1 → B2) before the TCF: short lessons, help in English and speaking practice with Léo.',
    cta: 'Open',
  },
};

export default function AtelierDashboardCard() {
  const { lang } = useLanguage();
  const c = lang === 'en' ? copy.en : copy.fr;
  return (
    <a id="tour-atelier" href={ATELIER_LINK} className="group block">
      <div className="relative flex items-center gap-3 sm:gap-4 rounded-3xl p-4 sm:p-5 overflow-hidden bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/40 dark:to-cyan-950/30 border border-blue-100 dark:border-blue-900/60 group-hover:border-blue-300 dark:group-hover:border-blue-700 transition-colors">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-500/20 text-white font-black text-sm">
          fr.
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-gray-900 dark:text-white">{c.title}</p>
            <span className="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full">{c.badge}</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{c.text}</p>
        </div>
        <img src={LeoImage} alt="" aria-hidden="true" className="hidden md:block h-16 w-auto -mb-5 self-end" />
        <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 group-hover:bg-blue-700 text-white text-xs font-bold transition-colors">
          <span className="hidden sm:inline">{c.cta}</span>
          <ArrowRight className="w-4 h-4" />
        </span>
      </div>
    </a>
  );
}
