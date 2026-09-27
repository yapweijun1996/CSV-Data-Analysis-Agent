const cancellationRequests = new Set<string>();

export const requestDataResearchCancellation = (runId: string) => {
    cancellationRequests.add(runId);
};

export const isDataResearchCancellationRequested = (runId: string) =>
    cancellationRequests.has(runId);

export const clearDataResearchCancellation = (runId: string) => {
    cancellationRequests.delete(runId);
};
