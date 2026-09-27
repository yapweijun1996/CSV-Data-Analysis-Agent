// Tabulator v6 assigns style.textAlign / style.minHeight during cell and
// layout work, and Firefox logs parser warnings whenever the assigned value
// is syntactically invalid (for example "", undefined, false, NaNpx, or
// calc(...) strings with invalid numeric fragments).
//
// This module patches CSSStyleDeclaration so those invalid assignments are
// normalized into removeProperty(). The patch is idempotent, keeps valid
// assignments intact, and also guards setProperty() for the same CSS names.

const GUARDED_PROPS: Array<{ camel: 'textAlign' | 'minHeight'; css: 'text-align' | 'min-height' }> = [
    { camel: 'textAlign', css: 'text-align' },
    { camel: 'minHeight', css: 'min-height' },
];

const GUARDED_CSS_PROPS = new Set<string>(GUARDED_PROPS.map(prop => prop.css));

let applied = false;

/**
 * Find the prototype that owns the property descriptor for a CSS
 * camelCase property.  Firefox historically defines these on
 * CSS2Properties.prototype rather than CSSStyleDeclaration.prototype.
 */
function findDescriptorOwner(
    prop: string,
): [proto: object, desc: PropertyDescriptor] | null {
    // Walk the prototype chain of a live CSSStyleDeclaration instance.
    const probe = document.createElement('div').style;
    let current: object | null = Object.getPrototypeOf(probe);

    while (current) {
        const desc = Object.getOwnPropertyDescriptor(current, prop);
        if (desc?.set) return [current, desc];
        current = Object.getPrototypeOf(current);
    }
    return null;
}

function findMethodDescriptorOwner(
    prop: string,
): [proto: object, desc: PropertyDescriptor] | null {
    const probe = document.createElement('div').style;
    let current: object | null = Object.getPrototypeOf(probe);

    while (current) {
        const desc = Object.getOwnPropertyDescriptor(current, prop);
        if (typeof desc?.value === 'function') return [current, desc];
        current = Object.getPrototypeOf(current);
    }
    return null;
}

const isInvalidCssValue = (cssProp: string, value: unknown): boolean => {
    if (value == null || typeof value === 'boolean') {
        return true;
    }

    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            return true;
        }

        if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
            try {
                return !CSS.supports(cssProp, String(value));
            } catch {
                return false;
            }
        }

        return false;
    }

    if (typeof value !== 'string') {
        return true;
    }

    const normalized = value.trim();
    if (!normalized) {
        return true;
    }

    if (/\b(?:undefined|null|NaN)\b/i.test(normalized)) {
        return true;
    }

    if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
        try {
            return !CSS.supports(cssProp, normalized);
        } catch {
            return false;
        }
    }

    return false;
};

export function applyTabulatorStyleGuard(): void {
    if (applied) return;
    applied = true;

    const setPropertyOwner = findMethodDescriptorOwner('setProperty');
    if (setPropertyOwner) {
        const [proto, desc] = setPropertyOwner;
        const originalSetProperty = desc.value as CSSStyleDeclaration['setProperty'];

        Object.defineProperty(proto, 'setProperty', {
            ...desc,
            value(property: string, value: string | null, priority?: string) {
                if (GUARDED_CSS_PROPS.has(property) && isInvalidCssValue(property, value)) {
                    this.removeProperty(property);
                    return;
                }

                originalSetProperty.call(this, property, value, priority);
            },
        });
    }

    for (const { camel: camelProp, css: cssProp } of GUARDED_PROPS) {
        const found = findDescriptorOwner(camelProp);
        if (!found) continue;

        const [proto, desc] = found;
        const origSet = desc.set!;

        Object.defineProperty(proto, camelProp, {
            ...desc,
            set(value: unknown) {
                if (isInvalidCssValue(cssProp, value)) {
                    this.removeProperty(cssProp);
                    return;
                }
                origSet.call(this, value as string);
            },
        });
    }
}
