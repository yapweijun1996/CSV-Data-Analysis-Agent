export type AppLanguage = 'English' | 'Mandarin' | 'Malay' | 'Vietnamese' | 'Japanese';

export interface LocalizedText {
    language: AppLanguage;
    text: string;
}
