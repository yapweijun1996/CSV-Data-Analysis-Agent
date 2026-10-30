export type UnitProvenance = 'confirmed' | 'inferred';
export type UnitSource = 'header' | 'unit_column' | 'user';

export interface UnitMeaning {
    unit: string;
    provenance: UnitProvenance;
    source: UnitSource;
    datasetVersion: string;
}

export type UnitResolution =
    | { status: 'trusted' | 'inferred'; unit: string }
    | { status: 'missing' | 'mixed' };

// ISO 4217 alphabetic codes, including fund, metal and testing codes.
const ISO_CURRENCIES = new Set(`AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAF XAG XAU XBA XBB XBC XBD XCD XDR XOF XPD XPF XPT XSU XTS XUA XXX YER ZAR ZMW ZWG`.split(' '));
const currencySymbol = /\p{Sc}/u;

/** Only an explicit parenthesized ISO suffix is evidence, not a bare abbreviation. */
export function inferUnitFromHeader(header: string): string | undefined {
    if (currencySymbol.test(header)) return undefined;
    const suffixes = header.match(/(?:\s*\([A-Za-z]{3}\))+\s*$/)?.[0];
    if (!suffixes) return undefined;
    const codes = Array.from(header.matchAll(/\(([A-Za-z]{3})\)/g), match => match[1].toUpperCase());
    if (codes.some(code => !ISO_CURRENCIES.has(code)) || new Set(codes).size !== 1) return undefined;
    return codes[0];
}

/** Validate all evidence together; a blank or stale input cannot authorize a result. */
export function validateUnitMeanings(meanings: readonly (UnitMeaning | null | undefined)[], datasetVersion: string): UnitResolution {
    if (!datasetVersion.trim() || meanings.length === 0) return { status: 'missing' };
    let unit: string | undefined;
    let inferred = false;
    for (const meaning of meanings) {
        if (!meaning || meaning.datasetVersion !== datasetVersion || !meaning.unit.trim()
            || currencySymbol.test(meaning.unit)
            || !['confirmed', 'inferred'].includes(meaning.provenance)
            || !['header', 'unit_column', 'user'].includes(meaning.source)
            || (meaning.provenance === 'inferred' && meaning.source === 'user')
            || (meaning.unit.trim().toLowerCase() === 'dimensionless' && meaning.provenance !== 'confirmed')) {
            return { status: 'missing' };
        }
        // Do not normalize aliases or whitespace: equality must be explicit.
        if (unit !== undefined && unit !== meaning.unit) return { status: 'mixed' };
        unit = meaning.unit;
        inferred ||= meaning.provenance === 'inferred';
    }
    return { status: inferred ? 'inferred' : 'trusted', unit: unit! };
}

export const resolveUnitMeaning = validateUnitMeanings;
