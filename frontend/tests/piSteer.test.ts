import { describe, expect, it } from 'vitest';
import { steerPiFollowUpTurn } from '../services/agent/runtime/pi/piFollowUpRuntimeService';

describe('steerPiFollowUpTurn', () => {
    it('refuses when no Pi turn is running so the message falls back to the queue', () => {
        expect(steerPiFollowUpTurn('no-such-turn', 'focus on 2024')).toBe(false);
    });
});
