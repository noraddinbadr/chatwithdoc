import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';

type Language = 'ar' | 'en';
type Translations = { [key: string]: string };

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, replacements?: { [key: string]: string | number }) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      const savedLang = localStorage.getItem('appLanguage');
      return (savedLang === 'en' || savedLang === 'ar') ? savedLang : 'ar';
    } catch {
      return 'ar';
    }
  });

  const [translations, setTranslations] = useState<{ [key in Language]?: Translations }>({});

  useEffect(() => {
    const fetchTranslations = async () => {
      try {
        const [arResponse, enResponse] = await Promise.all([
          fetch('./locales/ar.json'), // Use path relative to index.html
          fetch('./locales/en.json')
        ]);
        if (!arResponse.ok || !enResponse.ok) {
            throw new Error(`Failed to fetch translation files: ${arResponse.statusText}, ${enResponse.statusText}`);
        }
        const arData = await arResponse.json();
        const enData = await enResponse.json();
        setTranslations({ ar: arData, en: enData });
      } catch (error) {
        console.error("Failed to load translation files", error);
        // Set empty translations to prevent app from crashing
        setTranslations({ ar: {}, en: {} });
      }
    };
    fetchTranslations();
  }, []);


  useEffect(() => {
    try {
      localStorage.setItem('appLanguage', lang);
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    } catch (error) {
      console.error("Failed to set language in localStorage", error);
    }
  }, [lang]);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
  };

  const t = useCallback((key: string, replacements?: { [key: string]: string | number }): string => {
    const langTranslations = translations[lang];
    
    // Fallback to key if translations for the current language haven't been loaded yet.
    if (!langTranslations) {
      return key;
    }

    let translation = langTranslations[key] || key;
    if (replacements) {
      Object.keys(replacements).forEach(placeholder => {
        translation = translation.replace(`{${placeholder}}`, String(replacements[placeholder]));
      });
    }
    return translation;
  }, [lang, translations]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
