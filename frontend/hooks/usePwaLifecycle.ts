import { useSyncExternalStore } from 'react';
import {
    getPwaLifecycleState,
    subscribePwaLifecycle,
} from '../services/pwa/pwaManager';

export const usePwaLifecycle = () => useSyncExternalStore(
    subscribePwaLifecycle,
    getPwaLifecycleState,
    getPwaLifecycleState,
);
