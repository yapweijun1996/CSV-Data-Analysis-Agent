// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudAiConsentModal } from '../components/modals/CloudAiConsentModal';
import type { CloudAiConsentRequest } from '../types';

const modalState = {
    pendingCloudAiConsent: {
        datasetId: 'dataset-a',
        provider: 'default' as const,
        disclosureVersion: '2026-07-27-v2',
        consentScope: 'provider' as const,
        sensitiveDataWarning: null,
    } as CloudAiConsentRequest,
    cloudAiConsentError: null as string | null,
    settings: {
        language: 'English' as const,
    },
    resolveCloudAiConsent: vi.fn(async () => undefined),
};

vi.mock('../store/useAppStore', () => ({
    useAppStore: (selector: (state: typeof modalState) => unknown) => selector(modalState),
}));

describe('CloudAiConsentModal', () => {
    beforeEach(() => {
        modalState.pendingCloudAiConsent = {
            datasetId: 'dataset-a',
            provider: 'default',
            disclosureVersion: '2026-07-27-v2',
            consentScope: 'provider',
            sensitiveDataWarning: null,
        };
        modalState.cloudAiConsentError = null;
        modalState.resolveCloudAiConsent.mockClear();
    });

    afterEach(cleanup);

    it('discloses cloud transfer, plaintext browser storage, and sensitive-data limits', () => {
        render(<CloudAiConsentModal />);

        expect(screen.getByRole('dialog', { name: 'Allow this AI provider?' })).toBeInTheDocument();
        expect(screen.getByText(/What may be sent:/)).toBeInTheDocument();
        expect(screen.getByText(/stored unencrypted in this browser/i)).toBeInTheDocument();
        expect(screen.getByText(/does not claim compliance for medical, payment, or regulated personal data/i)).toBeInTheDocument();
        expect(screen.getByText(/only be asked once for Shared GPT Server/i)).toBeInTheDocument();
    });

    it('keeps processing local when the user declines', () => {
        render(<CloudAiConsentModal />);

        fireEvent.click(screen.getByRole('button', { name: 'Use local processing only' }));

        expect(modalState.resolveCloudAiConsent).toHaveBeenCalledWith(false);
    });

    it('allows processing only through the explicit accept action', async () => {
        render(<CloudAiConsentModal />);

        fireEvent.click(screen.getByRole('button', { name: 'Allow and continue' }));

        await waitFor(() => {
            expect(modalState.resolveCloudAiConsent).toHaveBeenCalledWith(true);
        });
    });

    it('shows a user-facing error when the consent record cannot be saved', () => {
        modalState.cloudAiConsentError = 'technical details are intentionally hidden';
        render(<CloudAiConsentModal />);

        expect(screen.getByRole('alert')).toHaveTextContent(
            'Consent could not be saved. No data was sent. Please retry.',
        );
        expect(screen.queryByText('technical details are intentionally hidden')).not.toBeInTheDocument();
    });

    it('requires explicit acknowledgement when the local scan detects sensitive fields', () => {
        modalState.pendingCloudAiConsent = {
            datasetId: 'dataset-sensitive',
            provider: 'google',
            disclosureVersion: '2026-07-27-v2',
            consentScope: 'sensitive_dataset',
            sensitiveDataWarning: {
                reasonCodes: ['identity_document', 'contact_information'],
                matchedColumns: ['NRIC', 'email'],
                sampleMatchCount: 4,
            },
        };

        render(<CloudAiConsentModal />);

        expect(screen.getByRole('alert')).toHaveTextContent('Possible sensitive data detected');
        expect(screen.getByText(/Detected fields: NRIC, email/)).toBeInTheDocument();
        expect(screen.getByText(/each detected sensitive dataset requires confirmation/i)).toBeInTheDocument();
    });
});
