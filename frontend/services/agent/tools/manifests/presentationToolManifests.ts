import type { ToolManifest } from '../../../../types';
import { requireAnalysisStage, validateCardId } from '../toolManifestSupport';

/**
 * Presentation tool manifests — declares the shape, policy, and validation
 * for presentation-layer tools (multi-series upgrade, chart-data correction).
 *
 * These tools are deterministic harness operations (no AI calls).
 */
export const createPresentationToolManifests = (): ToolManifest[] => [
    {
        name: 'analysis.presentation_upgrade',
        description: 'Detect and apply multi-series chart upgrade when data has 3+ numeric columns but plan uses single-series.',
        category: 'analysis',
        risk: 'low',
        enabledByDefault: true,
        inputSchema: {
            type: 'object',
            properties: {
                cardId: { type: 'string', description: 'The card to evaluate for multi-series upgrade.' },
            },
            required: ['cardId'],
        },
        groups: ['analysis.presentation'],
        promptHints: [
            'Use after card creation when a single-series chart may benefit from multi-series rendering.',
            'This tool is typically invoked by the runtime harness, not directly by the AI agent.',
        ],
        resultShape: 'Upgrades chart type to multi_line and injects matrixValueColumns into the plan, or returns no-op if upgrade is not applicable.',
        isAvailable: requireAnalysisStage,
        validate: (args, context) => validateCardId(args?.cardId, context, 'cardId'),
        capabilities: { deterministicOnly: true },
    },
];
