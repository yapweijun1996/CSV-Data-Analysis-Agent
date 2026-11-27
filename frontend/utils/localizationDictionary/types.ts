import type { AppLanguage } from '../../types';

export type Language = AppLanguage | 'Spanish' | 'French';
export type TranslationEntry = Partial<Record<Language, string>> & { English: string };
