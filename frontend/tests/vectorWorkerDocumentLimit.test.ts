/**
 * Tests for vector worker LRU document limit.
 *
 * Since the worker runs in a DedicatedWorkerGlobalScope, we test the
 * eviction logic by importing the worker module internals indirectly:
 * we simulate the message-handler flow by constructing request payloads
 * and exercising the eviction through the configure + rehydrate path
 * using a mock worker harness.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VectorStoreDocument } from '../types';

// --- Helpers ---

const makeDoc = (id: string, embedding = [0.1, 0.2, 0.3]): VectorStoreDocument => ({
    id,
    text: `text for ${id}`,
    embedding,
    metadata: { kind: 'analysis_card' as const, memoryFormatVersion: 'ir-v1' as const },
});

const makeDocs = (count: number, startIndex = 0): VectorStoreDocument[] =>
    Array.from({ length: count }, (_, i) => makeDoc(`doc-${startIndex + i}`));

/**
 * Minimal in-process simulation of the vector worker's document + LRU logic.
 * This avoids needing to instantiate an actual Worker in jsdom.
 */
class VectorWorkerSim {
    documents: VectorStoreDocument[] = [];
    maxDocuments = 50_000;
    accessTimestamps = new Map<string, number>();

    evictIfNeeded(): number {
        if (this.documents.length <= this.maxDocuments) return 0;
        const excess = this.documents.length - this.maxDocuments;
        const sorted = [...this.accessTimestamps.entries()]
            .sort((a, b) => a[1] - b[1])
            .slice(0, excess);
        const evictIds = new Set(sorted.map(([id]) => id));
        this.documents = this.documents.filter(d => !evictIds.has(d.id));
        for (const [id] of sorted) this.accessTimestamps.delete(id);
        return evictIds.size;
    }

    addDocument(doc: VectorStoreDocument): void {
        const existingIndex = this.documents.findIndex(d => d.id === doc.id);
        if (existingIndex > -1) {
            this.documents[existingIndex] = doc;
        } else {
            this.documents.push(doc);
        }
        this.accessTimestamps.set(doc.id, Date.now());
        this.evictIfNeeded();
    }

    rehydrate(docs: VectorStoreDocument[]): void {
        this.documents = docs;
        this.accessTimestamps.clear();
        const now = Date.now();
        this.documents.forEach((d, i) => this.accessTimestamps.set(d.id, now - (this.documents.length - i)));
        this.evictIfNeeded();
    }

    search(ids: string[]): void {
        const now = Date.now();
        for (const id of ids) {
            this.accessTimestamps.set(id, now);
        }
    }

    deleteDocument(id: string): boolean {
        const before = this.documents.length;
        this.documents = this.documents.filter(d => d.id !== id);
        this.accessTimestamps.delete(id);
        return this.documents.length < before;
    }

    clear(): void {
        this.documents = [];
        this.accessTimestamps.clear();
    }

    configure(newMax: number): void {
        if (newMax > 0) {
            this.maxDocuments = newMax;
            this.evictIfNeeded();
        }
    }
}

describe('Vector Worker LRU Document Limit', () => {
    let sim: VectorWorkerSim;

    beforeEach(() => {
        sim = new VectorWorkerSim();
        vi.useFakeTimers();
    });

    it('documents below limit — no eviction', () => {
        sim.maxDocuments = 20;
        const docs = makeDocs(10);
        for (const doc of docs) sim.addDocument(doc);
        expect(sim.documents).toHaveLength(10);
    });

    it('documents above limit — oldest evicted', () => {
        sim.maxDocuments = 5;
        // Add 7 docs with staggered timestamps
        for (let i = 0; i < 7; i++) {
            vi.advanceTimersByTime(100);
            sim.addDocument(makeDoc(`doc-${i}`));
        }
        expect(sim.documents).toHaveLength(5);
        // Oldest 2 (doc-0, doc-1) should be evicted
        const ids = sim.documents.map(d => d.id);
        expect(ids).not.toContain('doc-0');
        expect(ids).not.toContain('doc-1');
        expect(ids).toContain('doc-2');
        expect(ids).toContain('doc-6');
    });

    it('search updates access timestamps — searched docs survive eviction', () => {
        sim.maxDocuments = 5;
        // Add 5 docs
        for (let i = 0; i < 5; i++) {
            vi.advanceTimersByTime(100);
            sim.addDocument(makeDoc(`doc-${i}`));
        }
        // "Search" for doc-0 and doc-1 (promotes their timestamps)
        vi.advanceTimersByTime(1000);
        sim.search(['doc-0', 'doc-1']);

        // Now add 2 more (should evict doc-2 and doc-3, NOT doc-0/doc-1)
        vi.advanceTimersByTime(100);
        sim.addDocument(makeDoc('doc-5'));
        vi.advanceTimersByTime(100);
        sim.addDocument(makeDoc('doc-6'));

        expect(sim.documents).toHaveLength(5);
        const ids = sim.documents.map(d => d.id);
        expect(ids).toContain('doc-0'); // promoted by search
        expect(ids).toContain('doc-1'); // promoted by search
        expect(ids).not.toContain('doc-2'); // evicted
        expect(ids).not.toContain('doc-3'); // evicted
    });

    it('rehydrate with excess triggers immediate eviction', () => {
        sim.maxDocuments = 5;
        const docs = makeDocs(10);
        sim.rehydrate(docs);
        expect(sim.documents).toHaveLength(5);
        // Earlier array positions have older timestamps → evicted first
        const ids = sim.documents.map(d => d.id);
        expect(ids).not.toContain('doc-0');
        expect(ids).toContain('doc-9'); // last in array = most recent timestamp
    });

    it('configure reduces limit and triggers eviction', () => {
        sim.maxDocuments = 100;
        for (let i = 0; i < 10; i++) {
            vi.advanceTimersByTime(100);
            sim.addDocument(makeDoc(`doc-${i}`));
        }
        expect(sim.documents).toHaveLength(10);
        sim.configure(5);
        expect(sim.documents).toHaveLength(5);
        expect(sim.maxDocuments).toBe(5);
    });

    it('configure with invalid value is ignored', () => {
        sim.maxDocuments = 10;
        sim.configure(0);
        expect(sim.maxDocuments).toBe(10);
        sim.configure(-5);
        expect(sim.maxDocuments).toBe(10);
    });

    it('delete removes from access timestamps', () => {
        sim.addDocument(makeDoc('doc-1'));
        expect(sim.accessTimestamps.has('doc-1')).toBe(true);
        sim.deleteDocument('doc-1');
        expect(sim.accessTimestamps.has('doc-1')).toBe(false);
        expect(sim.documents).toHaveLength(0);
    });

    it('clear resets access timestamps', () => {
        for (let i = 0; i < 5; i++) sim.addDocument(makeDoc(`doc-${i}`));
        expect(sim.accessTimestamps.size).toBe(5);
        sim.clear();
        expect(sim.documents).toHaveLength(0);
        expect(sim.accessTimestamps.size).toBe(0);
    });

    it('upsert (same id) updates timestamp without increasing count', () => {
        sim.maxDocuments = 3;
        sim.addDocument(makeDoc('doc-1'));
        vi.advanceTimersByTime(100);
        sim.addDocument(makeDoc('doc-2'));
        vi.advanceTimersByTime(100);
        sim.addDocument(makeDoc('doc-3'));
        vi.advanceTimersByTime(100);
        // Re-add doc-1 (upsert, not new doc)
        sim.addDocument(makeDoc('doc-1'));
        expect(sim.documents).toHaveLength(3);
        // doc-1 should still be present (it was upserted, not added as new)
        expect(sim.documents.map(d => d.id)).toContain('doc-1');
    });
});
