import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    APP_HEADER_HIDE_FOR_CARD_NAVIGATION_EVENT,
    navigateToCard,
} from '../utils/cardNavigation';

describe('card navigation', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('hides the app header, scrolls the main container, and highlights the card', () => {
        document.body.innerHTML = `
            <header data-app-header-root="true"></header>
            <div id="app-main-scroll-container"></div>
            <article id="card-123"></article>
        `;

        const header = document.querySelector('[data-app-header-root="true"]') as HTMLElement;
        const scrollContainer = document.getElementById('app-main-scroll-container') as HTMLElement;
        const card = document.getElementById('card-123') as HTMLElement;
        const scrollTo = vi.fn();
        const dispatchEvent = vi.spyOn(window, 'dispatchEvent');

        Object.defineProperty(scrollContainer, 'scrollTop', {
            configurable: true,
            value: 500,
            writable: true,
        });
        Object.defineProperty(scrollContainer, 'scrollTo', {
            configurable: true,
            value: scrollTo,
        });
        Object.defineProperty(header, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ top: 0, left: 0, bottom: 80, right: 1200, width: 1200, height: 80, x: 0, y: 0, toJSON: () => ({}) }),
        });
        Object.defineProperty(scrollContainer, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ top: 100, left: 0, bottom: 900, right: 1200, width: 1200, height: 800, x: 0, y: 100, toJSON: () => ({}) }),
        });
        Object.defineProperty(card, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ top: 460, left: 0, bottom: 860, right: 1200, width: 1200, height: 400, x: 0, y: 460, toJSON: () => ({}) }),
        });

        expect(navigateToCard('card-123')).toBe(true);

        expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
            type: APP_HEADER_HIDE_FOR_CARD_NAVIGATION_EVENT,
        }));
        expect(scrollTo).toHaveBeenCalledWith({
            top: 764,
            behavior: 'smooth',
        });
        expect(card.classList.contains('ring-4')).toBe(true);
        expect(card.classList.contains('ring-blue-500')).toBe(true);

        vi.advanceTimersByTime(2500);

        expect(card.classList.contains('ring-4')).toBe(false);
        expect(card.classList.contains('ring-blue-500')).toBe(false);
    });

    it('falls back to scrollIntoView when the main scroll container is unavailable', () => {
        document.body.innerHTML = '<article id="card-456"></article>';
        const card = document.getElementById('card-456') as HTMLElement;
        const scrollIntoView = vi.fn();

        Object.defineProperty(card, 'scrollIntoView', {
            configurable: true,
            value: scrollIntoView,
        });

        expect(navigateToCard('card-456', { highlight: false, hideHeader: false })).toBe(true);

        expect(scrollIntoView).toHaveBeenCalledWith({
            behavior: 'smooth',
            block: 'start',
        });
    });
});
