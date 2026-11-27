import { vietnamesePart01 } from './part01';
import { vietnamesePart02 } from './part02';
import { vietnamesePart03 } from './part03';
import { vietnamesePart04 } from './part04';
import { vietnamesePart05 } from './part05';

/** Vietnamese strings beyond the hand-written core set in localizationVietnamese.ts. */
export const vietnameseExtraTranslations: Readonly<Record<string, string>> = {
    ...vietnamesePart01,
    ...vietnamesePart02,
    ...vietnamesePart03,
    ...vietnamesePart04,
    ...vietnamesePart05,
};
