import { reviewTrustTranslations } from '../localizationReviewTrust';
import { part01 } from './part01';
import { part02 } from './part02';
import { part03 } from './part03';
import { part04 } from './part04';
import { part05 } from './part05';
import { part06 } from './part06';
import { part07 } from './part07';
import { part08 } from './part08';
import { part09 } from './part09';
import { part10 } from './part10';
import type { TranslationEntry } from './types';

export type { Language, TranslationEntry } from './types';

/** Merged UI string dictionary. Split into parts only to keep each file reviewable. */
export const translations: Record<string, TranslationEntry> = {
    ...reviewTrustTranslations,
    ...part01,
    ...part02,
    ...part03,
    ...part04,
    ...part05,
    ...part06,
    ...part07,
    ...part08,
    ...part09,
    ...part10,
};
