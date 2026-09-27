export type ExternalCsvTransport = 'postMessage' | 'sessionStorage' | 'localStorage';

export interface ExternalCsvPayload {
    csv: string;
    header?: string;
}

export interface ExternalCsvPayloadEvent {
    payload: ExternalCsvPayload;
    payloadId: string;
    meta: {
        transport: ExternalCsvTransport;
        receivedAt: number;
        pendingKey?: string;
    };
    eventId: string;
}
