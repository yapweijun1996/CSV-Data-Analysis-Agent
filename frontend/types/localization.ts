export type AppLanguage = 'English' | 'Mandarin' | 'Malay' | 'Japanese';

export interface LocalizedText {
    language: AppLanguage;
    text: string;
}
