import { describe, it, expect } from 'vitest';
import { getTranslation } from '../utils/localization';

describe('getTranslation', () => {
    it('should return English translation by default', () => {
        expect(getTranslation('assistant', 'English')).toBe('Assistant');
    });

    it('should return correct translation for other languages', () => {
        expect(getTranslation('assistant', 'Mandarin')).toBe('助手');
        expect(getTranslation('assistant', 'Malay')).toBe('Pembantu');
        expect(getTranslation('assistant', 'Japanese')).toBe('アシスタント');
    });

    it('should fallback to English if translation is missing for language', () => {
        // Assuming 'some_key' only exists in English or we mock it. 
        // Actually, let's use a key that exists.
        // If we pass a made-up language, it should fallback to English if the key exists in English?
        // The implementation is: translations[key]?.[lang] || translations[key]?.['English'] || key;

        // Test with a key that exists
        expect(getTranslation('assistant', 'UnknownLanguage')).toBe('Assistant');
    });

    it('should return key if key is missing entirely', () => {
        const missingKey = 'non_existent_key_12345';
        expect(getTranslation(missingKey, 'English')).toBe(missingKey);
    });

    it('should handle error boundary keys', () => {
        expect(getTranslation('error_boundary_title', 'English')).toBe('Analysis Card Failed to Render');
        expect(getTranslation('error_boundary_title', 'Mandarin')).toBe('分析卡片渲染失败');
    });

    it('should translate the executive KPI CTA', () => {
        expect(getTranslation('executive_kpi_view_breakdown', 'English')).toBe('View Breakdown');
        expect(getTranslation('executive_kpi_view_breakdown', 'Mandarin')).toBe('查看拆解');
    });

    it('should translate runtime cancellation labels', () => {
        expect(getTranslation('cancel_run', 'English')).toBe('Cancel run');
        expect(getTranslation('cancelling_run', 'Mandarin')).toBe('正在停止...');
    });

    it('should interpolate the queued message count label', () => {
        expect(getTranslation('chat_queue_count', 'English', { count: 1 })).toBe('1 queued');
        expect(getTranslation('chat_queue_count', 'Mandarin', { count: 3 })).toBe('3 条排队中');
    });

    it('should translate the queue-composer labels', () => {
        expect(getTranslation('chat_send_next', 'English')).toBe('Send next');
        expect(getTranslation('chat_queue_ready_title', 'Mandarin')).toBe('下一条消息已就绪');
        expect(getTranslation('chat_queue_shortcut_hint', 'English')).toBe('Enter queues this next · Shift+Enter for a new line');
    });

    it('should interpolate placeholders when params are provided', () => {
        expect(getTranslation('page_of', 'English', { current: 2, total: 5 })).toBe('Page 2 of 5');
        expect(getTranslation('executive_kpi_total_metric_label', 'Mandarin', { metric: 'Spend' })).toBe('总Spend');
    });

    it('should localize runtime error labels across the supported languages', () => {
        expect(getTranslation('chat_temporary_filter_failed', 'English', { message: 'network timeout' })).toBe('Temporary filter failed: network timeout');
        expect(getTranslation('chat_temporary_filter_failed', 'Mandarin', { message: 'network timeout' })).toBe('临时筛选执行失败：network timeout');
        expect(getTranslation('chat_temporary_filter_failed', 'Malay', { message: 'network timeout' })).toBe('Penapis sementara gagal: network timeout');
        expect(getTranslation('chat_temporary_filter_failed', 'Japanese', { message: 'network timeout' })).toBe('一時フィルターに失敗しました: network timeout');
    });

    it('covers the public beta navigation and Data Explorer in all launch languages', () => {
        const requiredKeys = [
            'header_analysis_actions',
            'header_new',
            'header_history',
            'header_data_explorer',
            'header_advanced',
            'header_workflow',
            'header_logs',
            'header_change_goal',
            'header_show_assistant',
            'explorer_query_templates',
            'explorer_query_builder',
            'explorer_refresh_session',
            'explorer_run_query',
            'explorer_template_preview_rows',
            'explorer_template_filter_lookup',
            'explorer_template_aggregate_breakdown',
            'explorer_template_duplicate_candidates',
            'explorer_template_null_blank_scan',
            'explorer_current_result',
            'explorer_search_result',
            'explorer_technical_details',
            'explorer_query_history',
            'explorer_no_history',
            'explorer_origin_workspace',
            'explorer_origin_chat',
            'explorer_origin_analysis',
            'research_run',
            'research_clarification_needed',
            'research_technical_details',
        ];

        for (const language of ['English', 'Mandarin', 'Japanese']) {
            for (const key of requiredKeys) {
                const value = getTranslation(key, language);
                expect(value, `${key} is missing for ${language}`).not.toBe(key);
                expect(value.trim(), `${key} is blank for ${language}`).not.toBe('');
            }
        }
    });
});
