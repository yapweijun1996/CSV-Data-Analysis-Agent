import { CsvRow, StatisticalAnalysisRequest, AnalysisPlan } from '../../../types';
import { StoreApi } from '../types';
import { executePlanAndCreateCard } from './cardExecutor';
import { robustParseFloat } from '../../data/dataProfiler';
import { createChatMessage } from '../../../utils/messageState';

const LOG_PREFIX = '[StatisticalExecutor]';

// Helper functions for correlation
const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
const stdDev = (arr: number[]) => {
    const arrMean = mean(arr);
    const sqDiff = arr.map(k => (k - arrMean) ** 2);
    const avgSqDiff = mean(sqDiff);
    return Math.sqrt(avgSqDiff);
};
const covariance = (arr1: number[], arr2: number[]) => {
    const mean1 = mean(arr1);
    const mean2 = mean(arr2);
    let covar = 0;
    for (let i = 0; i < arr1.length; i++) {
        covar += (arr1[i] - mean1) * (arr2[i] - mean2);
    }
    return covar / (arr1.length - 1);
};
const pearsonCorrelation = (arr1: number[], arr2: number[]): number => {
    const stdDev1 = stdDev(arr1);
    const stdDev2 = stdDev(arr2);
    if (stdDev1 === 0 || stdDev2 === 0) {
        return 0; // No variance, no correlation
    }
    return covariance(arr1, arr2) / (stdDev1 * stdDev2);
};

const getCorrelationInterpretation = (r: number): string => {
    const absR = Math.abs(r);
    if (absR >= 0.9) return "very strong";
    if (absR >= 0.7) return "strong";
    if (absR >= 0.5) return "moderate";
    if (absR >= 0.3) return "weak";
    return "very weak or no";
};

export const handleCorrelationAnalysis = async (request: StatisticalAnalysisRequest, store: StoreApi) => {
    const { getState, setState } = store;
    const { csvData } = getState();
    if (!csvData) {
        console.error(`${LOG_PREFIX} No CSV data available for correlation analysis.`);
        return;
    }

    console.log(`${LOG_PREFIX} Starting correlation analysis between "${request.columnA}" and "${request.columnB}".`);
    getState().addProgress(`Analyzing correlation: ${request.columnA} vs ${request.columnB}...`);

    // 1. Extract and clean data for the two columns
    const valuesA: number[] = [];
    const valuesB: number[] = [];
    
    csvData.data.forEach(row => {
        const valA = robustParseFloat(row[request.columnA]);
        const valB = robustParseFloat(row[request.columnB]);
        if (valA !== null && valB !== null) {
            valuesA.push(valA);
            valuesB.push(valB);
        }
    });

    if (valuesA.length < 2) {
        const errorMsg = `Not enough valid data points to calculate correlation between "${request.columnA}" and "${request.columnB}".`;
        console.warn(`${LOG_PREFIX} ${errorMsg}`);
        getState().addProgress(errorMsg, 'error');
        return;
    }

    // 2. Calculate correlation
    const correlation = pearsonCorrelation(valuesA, valuesB);
    console.log(`${LOG_PREFIX} Calculated Pearson Correlation: ${correlation}`);

    // 3. Create a scatter plot plan
    const plan: AnalysisPlan = {
        chartType: 'scatter',
        title: request.title,
        description: request.description,
        xValueColumn: request.columnA,
        yValueColumn: request.columnB,
    };

    // 4. Create the chart
    const card = await executePlanAndCreateCard(plan, csvData, store);

    // 5. Send a text response with the result
    if (card) {
        const interpretation = getCorrelationInterpretation(correlation);
        const direction = correlation > 0 ? "positive" : "negative";
        const summaryText = `I calculated the correlation between **${request.columnA}** and **${request.columnB}** to be **${correlation.toFixed(3)}**. This indicates a **${interpretation} ${direction} relationship**.

Here is a scatter plot visualizing this relationship.`;

        setState(prev => ({
            chatHistory: [...prev.chatHistory, createChatMessage({
                sender: 'ai',
                text: summaryText,
                timestamp: new Date(),
                type: 'ai_message',
                cardId: card.id,
            })],
        }));
    }
};
