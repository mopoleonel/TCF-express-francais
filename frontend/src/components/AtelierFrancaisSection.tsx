import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, Languages, Mic, Sparkles } from 'lucide-react';
import { useLanguage } from '../contexts/useLanguage';
import LeoImage from '../assets/images/leo-atelier.webp';

// Section d'accueil « L'Atelier de français » : remise à niveau en français (A1 → B2) avant la préparation TCF.
// Le module est une petite appli à part, rangée dans public/atelier/ (son API : api.tcf-express.com/api/atelier/).
// On utilise donc un lien <a> classique (rechargement complet) et non un <Link> du routeur, qui afficherait la page 404.
export const ATELIER_URL = '/atelier/';

const copy = {
  fr: {
    badge: 'Nouveau',
    title: "L'Atelier de français",
    tagline: 'avec ton ami Léo',
    problem:
      "Beaucoup de candidats perdent des points au TCF à cause de fautes de base : conjugaison, accords, vocabulaire.",
    pitch:
      "L'Atelier de français vous aide à corriger vos bases, du niveau A1 au niveau B2, avant de vous attaquer au TCF. En jouant, quelques minutes par jour.",
    features: [
      { title: 'Leçons courtes', text: '12 étapes de A1 à B2, des défis et des mini-jeux.' },
      { title: 'Aide en anglais', text: 'Règles et corrections expliquées aussi en anglais.' },
      { title: "Entraînement à l'oral", text: '12 situations du quotidien avec Léo.' },
    ],
    cta: "Commencer l'Atelier",
    note: 'Fonctionne sur téléphone, même avec un petit réseau',
  },
  en: {
    badge: 'New',
    title: "L'Atelier de français",
    tagline: 'with your friend Léo',
    problem:
      'Many candidates lose TCF points because of basic French mistakes: verb forms, agreement, vocabulary.',
    pitch:
      "L'Atelier de français helps you fix your foundations, from A1 to B2, before you start your TCF preparation. Through play, a few minutes a day.",
    features: [
      { title: 'Short lessons', text: '12 steps from A1 to B2, challenges and mini-games.' },
      { title: 'Help in English', text: 'Rules and corrections also explained in English.' },
      { title: 'Speaking practice', text: '12 everyday situations with Léo.' },
    ],
    cta: 'Start the Atelier',
    note: 'Works on your phone, even on a weak connection',
  },
};

const icons = [BookOpen, Languages, Mic];

export default function AtelierFrancaisSection() {
  const { lang } = useLanguage();
  const c = lang === 'en' ? copy.en : copy.fr;

  return (
    <section id="atelier" className="py-20 bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950 overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 -right-24 w-96 h-96 bg-amber-300/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full px-4 sm:px-8 lg:px-12 xl:px-20">
        <div className="grid lg:grid-cols-[1fr_auto] gap-10 lg:gap-16 items-center max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-600/10 border border-blue-600/20 text-blue-700 dark:text-blue-300 text-sm font-semibold mb-5">
              <Sparkles className="w-4 h-4" />
              {c.badge}
            </span>
            <h2 className="text-3xl sm:text-4xl font-black leading-tight text-slate-900 dark:text-white">
              {c.title}
            </h2>
            <p className="mt-1 text-sm italic text-slate-500 dark:text-slate-400">{c.tagline}</p>

            <p className="mt-6 text-base sm:text-lg text-slate-700 dark:text-slate-300 leading-relaxed">
              <span className="font-semibold text-red-600 dark:text-red-400">{c.problem}</span>{' '}
              {c.pitch}
            </p>

            <div className="mt-8 grid sm:grid-cols-3 gap-4">
              {c.features.map((f, i) => {
                const Icon = icons[i];
                return (
                  <motion.div
                    key={f.title}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.1 + i * 0.1 }}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white flex items-center justify-center mb-3">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-slate-900 dark:text-white">{f.title}</h3>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{f.text}</p>
                  </motion.div>
                );
              })}
            </div>

            <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-3">
              <a
                href={ATELIER_URL}
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-bold shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 hover:-translate-y-0.5 transition-all"
              >
                {c.cta}
                <ArrowRight className="w-5 h-5" />
              </a>
              <span className="text-sm text-slate-500 dark:text-slate-400">{c.note}</span>
            </div>
          </motion.div>

          <motion.a
            href={ATELIER_URL}
            aria-label={c.cta}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="hidden lg:block relative"
          >
            <div className="absolute inset-x-6 bottom-2 h-6 bg-slate-900/20 blur-xl rounded-full" />
            <img src={LeoImage} alt="Léo" loading="lazy" className="relative w-56 xl:w-64 h-auto drop-shadow-xl" />
          </motion.a>
        </div>
      </div>
    </section>
  );
}
