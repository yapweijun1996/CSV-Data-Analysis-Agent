import type { TranslationEntry } from './types';

export const part08: Record<string, TranslationEntry> = {
    'cleaning_shape_verification_failed': {
        'English': 'The current cleaning result did not pass final shape verification. The system will continue attempting repairs.',
        'Mandarin': '当前清洗结果未通过最终形状验证，系统将继续尝试修复。',
        'Japanese': '現在のクリーニング結果は最終形状検証に合格しませんでした。修復を続行します。',
        'Malay': 'Hasil pembersihan semasa tidak lulus pengesahan bentuk akhir. Sistem akan terus mencuba pembaikan.',
    },
    'cleaning_round_intermediate_only': {
        'English': 'This round\'s result is only an intermediate candidate and will not be committed as the final stable result.',
        'Mandarin': '本轮结果仅作为中间候选，不会直接作为最终稳定结果提交。',
        'Japanese': '今回の結果は中間候補のみであり、最終安定結果として直接コミットされません。',
        'Malay': 'Hasil pusingan ini hanyalah calon sementara dan tidak akan disimpan sebagai hasil stabil akhir.',
    },
    'cleaning_will_auto_recover': {
        'English': 'The system will continue automatic recovery and proceed to analysis once successful.',
        'Mandarin': '系统会继续自动恢复，成功后再进入分析。',
        'Japanese': 'システムは自動回復を続行し、成功後に分析を開始します。',
        'Malay': 'Sistem akan meneruskan pemulihan automatik dan memulakan analisis setelah berjaya.',
    },
    'cleaning_safe_mode_activated': {
        'English': 'The system has automatically switched to safe cleaning mode and will continue analysis based on the stable result.',
        'Mandarin': '系统已自动切换到安全清洗模式，并将基于该稳定结果继续分析。',
        'Japanese': 'システムは安全クリーニングモードに自動切替し、安定した結果に基づいて分析を続行します。',
        'Malay': 'Sistem telah beralih secara automatik kepada mod pembersihan selamat dan akan meneruskan analisis berdasarkan hasil stabil.',
    },
    'cleaning_safe_strategy_used': {
        'English': 'This round used the recovered safe strategy as the final cleaning result.',
        'Mandarin': '本轮已使用恢复后的安全策略作为最终清洗结果。',
        'Japanese': '今回は回復した安全な戦略を最終クリーニング結果として使用しました。',
        'Malay': 'Pusingan ini menggunakan strategi selamat yang dipulihkan sebagai hasil pembersihan akhir.',
    },
    'cleaning_analysis_labeled_safe_mode': {
        'English': 'The system will continue automatic analysis and label results as coming from safe cleaning mode.',
        'Mandarin': '系统将继续自动分析，并标注结果来自安全清洗模式。',
        'Japanese': 'システムは自動分析を続行し、結果が安全クリーニングモードからのものであることをラベル付けします。',
        'Malay': 'Sistem akan meneruskan analisis automatik dan melabel hasil sebagai berasal daripada mod pembersihan selamat.',
    },
    'cleaning_partial_noise_ok': {
        'English': 'The system could not fully remove all noise rows, but the current data is stable enough to proceed with automatic analysis.',
        'Mandarin': '系统无法完全移除所有噪音行，但当前数据已经足够稳定，可继续自动分析。',
        'Japanese': 'システムはすべてのノイズ行を完全に除去できませんでしたが、現在のデータは自動分析を続行するのに十分安定しています。',
        'Malay': 'Sistem tidak dapat membuang semua baris hingar sepenuhnya, tetapi data semasa cukup stabil untuk meneruskan analisis automatik.',
    },
    'cleaning_keep_snapshot_exclude_noise': {
        'English': 'The system will keep the current stable snapshot and exclude remaining noise rows during analysis.',
        'Mandarin': '系统将保留当前稳定快照，并在分析时排除剩余噪音行。',
        'Japanese': 'システムは現在の安定スナップショットを保持し、分析時に残りのノイズ行を除外します。',
        'Malay': 'Sistem akan mengekalkan petikan stabil semasa dan mengecualikan baki baris hingar semasa analisis.',
    },
    'cleaning_original_snapshot_both_safe': {
        'English': 'Both original data and stable snapshot have been preserved. No data was lost.',
        'Mandarin': '原始数据与稳定快照都已保留，未丢失数据。',
        'Japanese': '元データと安定スナップショットは両方とも保持されています。データの損失はありません。',
        'Malay': 'Data asal dan petikan stabil telah dikekalkan. Tiada data hilang.',
    },
    'cleaning_terminal_failure_summary': {
        'English': 'The system could not find a safe cleaning result to commit and has stopped automatic cleaning.',
        'Mandarin': '系统未能找到可安全提交的清洗结果，因此已停止自动清洗。',
        'Japanese': 'システムはコミットできる安全なクリーニング結果を見つけられず、自動クリーニングを停止しました。',
        'Malay': 'Sistem tidak dapat mencari hasil pembersihan yang selamat untuk disimpan dan telah menghentikan pembersihan automatik.',
    },
    'cleaning_terminal_failure_action': {
        'English': 'The system has preserved the previous stable snapshot and stopped attempting unsafe cleaning strategies.',
        'Mandarin': '系统已保留上一份稳定快照，并停止继续尝试不安全的清洗策略。',
        'Japanese': 'システムは前回の安定スナップショットを保持し、安全でないクリーニング戦略の試行を停止しました。',
        'Malay': 'Sistem mengekalkan petikan stabil sebelumnya dan menghentikan percubaan strategi pembersihan yang tidak selamat.',
    },
    'cleaning_terminal_failure_data_safety': {
        'English': 'Both original data and stable snapshot have not been lost.',
        'Mandarin': '原始数据和稳定快照都未丢失。',
        'Japanese': '元データと安定スナップショットは失われていません。',
        'Malay': 'Data asal dan petikan stabil tidak hilang.',
    },
    'cleaning_terminal_failure_next': {
        'English': 'You can continue using the current stable data, retry AI cleaning, or review technical details.',
        'Mandarin': '你可以继续使用当前稳定数据、重新尝试 AI 清洗，或查看技术细节。',
        'Japanese': '現在の安定データを使用し続けるか、AIクリーニングを再試行するか、技術的な詳細を確認できます。',
        'Malay': 'Anda boleh terus menggunakan data stabil semasa, mencuba pembersihan AI sekali lagi atau menyemak butiran teknikal.',
    },

    // ── Cleaning pipeline persistence messages ──
    'cleaning_persist_safe_mode_summary': {
        'English': 'The system has switched to safe cleaning mode and will continue automatic analysis based on the current stable result.',
        'Mandarin': '系统已切换到安全清洗模式，并将基于当前稳定结果继续自动分析。',
        'Japanese': 'システムは安全クリーニングモードに切り替え、現在の安定した結果に基づいて自動分析を続行します。',
        'Malay': 'Sistem telah beralih kepada mod pembersihan selamat dan akan meneruskan analisis automatik berdasarkan hasil stabil semasa.',
    },
    'cleaning_persist_snapshot_input': {
        'English': 'The current stable snapshot will be used as input for subsequent automatic analysis.',
        'Mandarin': '当前稳定快照会作为后续自动分析的输入。',
        'Japanese': '現在の安定スナップショットが後続の自動分析の入力として使用されます。',
        'Malay': 'Petikan stabil semasa akan digunakan sebagai input untuk analisis automatik seterusnya.',
    },
    'cleaning_persist_labeled_safe': {
        'English': 'Subsequent analysis results will be labeled as based on safe cleaning mode.',
        'Mandarin': '后续分析结果会标注为基于安全清洗模式。',
        'Japanese': '後続の分析結果は安全クリーニングモードに基づくものとしてラベル付けされます。',
        'Malay': 'Hasil analisis seterusnya akan dilabel sebagai berasaskan mod pembersihan selamat.',
    },
    'cleaning_persist_safe_completed_chat': {
        'English': 'AI cleaning completed in safe mode: the system preserved the current stable snapshot with {rowCount} rows and will continue automatic analysis.',
        'Mandarin': 'AI 清洗已在安全模式下完成：系统保留了当前稳定快照，共 {rowCount} 行，并将继续自动分析。',
        'Japanese': 'AIクリーニングがセーフモードで完了しました：システムは現在の安定スナップショット（{rowCount} 行）を保持し、自動分析を続行します。',
        'Malay': 'Pembersihan AI selesai dalam mod selamat: sistem mengekalkan petikan stabil semasa yang mengandungi {rowCount} baris dan akan meneruskan analisis automatik.',
    },

    // ── Cleaning strategy recovery messages ──
    'cleaning_hierarchy_mismatch_summary': {
        'English': 'The system attempted to preserve structure as a hierarchical report with subtotals, but the current preparation data no longer meets hierarchy annotation conditions.',
        'Mandarin': '系统尝试按带小计层级的报表来保留结构，但当前准备数据已经不满足层级注释条件。',
        'Japanese': 'システムは小計を含む階層レポートとして構造を保持しようとしましたが、現在のデータは階層アノテーション条件を満たしていません。',
        'Malay': 'Sistem cuba mengekalkan struktur sebagai laporan berhierarki dengan jumlah kecil, tetapi data penyediaan semasa tidak lagi memenuhi syarat anotasi hierarki.',
    },
    'cleaning_hierarchy_mismatch_action': {
        'English': 'The system has skipped this hierarchy strategy and will proceed with a safer cleaning candidate.',
        'Mandarin': '系统已跳过该层级策略，并改用更安全的清洗候选继续处理。',
        'Japanese': 'システムはこの階層戦略をスキップし、より安全なクリーニング候補で処理を続行します。',
        'Malay': 'Sistem melangkau strategi hierarki ini dan akan meneruskan dengan calon pembersihan yang lebih selamat.',
    },
    'cleaning_hierarchy_mismatch_safety': {
        'English': 'The current stable snapshot has been preserved. No data was lost.',
        'Mandarin': '当前稳定快照已保留，未丢失数据。',
        'Japanese': '現在の安定スナップショットは保持されています。データの損失はありません。',
        'Malay': 'Petikan stabil semasa telah dikekalkan. Tiada data hilang.',
    },
    'cleaning_hierarchy_mismatch_next': {
        'English': 'If safe cleaning succeeds, the system will proceed to automatic analysis; otherwise it will display a comprehensible failure explanation.',
        'Mandarin': '如果安全清洗成功，系统会继续自动分析；否则会展示可理解的失败说明。',
        'Japanese': '安全なクリーニングが成功した場合、システムは自動分析を続行します。そうでない場合は理解可能な失敗の説明を表示します。',
        'Malay': 'Jika pembersihan selamat berjaya, sistem akan meneruskan analisis automatik; jika tidak, penjelasan kegagalan yang mudah difahami akan dipaparkan.',
    },

    // ── Data restore messages (dataSlice.ts) ──
    'data_restore_unavailable': {
        'English': 'Cannot restore original data: original data is unavailable.',
        'Mandarin': '无法恢复原始数据：原始数据不可用。',
        'Japanese': '元データを復元できません：元データが利用できません。',
        'Malay': 'Data asal tidak dapat dipulihkan: data asal tidak tersedia.',
    },
    'data_restore_explanation': {
        'English': 'Original data has been restored. cleaned.csv has been reset to a copy of the originally imported data.',
        'Mandarin': '已恢复原始数据。cleaned.csv 已重置为原始导入数据的副本。',
        'Japanese': '元データが復元されました。cleaned.csv は元のインポートデータのコピーにリセットされました。',
        'Malay': 'Data asal telah dipulihkan. cleaned.csv telah ditetapkan semula sebagai salinan data yang mula-mula diimport.',
    },
    'data_restore_success': {
        'English': 'Original data has been restored.',
        'Mandarin': '已恢复原始数据。',
        'Japanese': '元データが復元されました。',
        'Malay': 'Data asal telah dipulihkan.',
    },

    // ── Column annotation popover ──
    'column_annotation_role_unspecified': {
        'English': '-- Unspecified --',
        'Mandarin': '-- 未指定 --',
        'Japanese': '-- 未指定 --',
        'Malay': '-- Tidak dinyatakan --',
    },
    'column_annotation_role_dimension': {
        'English': 'Dimension',
        'Mandarin': '维度 (Dimension)',
        'Japanese': 'ディメンション (Dimension)',
        'Malay': 'Dimensi',
    },
    'column_annotation_role_metric': {
        'English': 'Metric',
        'Mandarin': '指标 (Metric)',
        'Japanese': 'メトリック (Metric)',
        'Malay': 'Metrik',
    },
    'column_annotation_role_identifier': {
        'English': 'Identifier',
        'Mandarin': '标识符 (Identifier)',
        'Japanese': '識別子 (Identifier)',
        'Malay': 'Pengecam',
    },
    'column_annotation_role_helper': {
        'English': 'Helper column',
        'Mandarin': '辅助列 (Helper)',
        'Japanese': 'ヘルパー列 (Helper)',
        'Malay': 'Lajur sokongan',
    },
    'column_annotation_label_business_tag': {
        'English': 'Business label',
        'Mandarin': '业务标签',
        'Japanese': 'ビジネスラベル',
        'Malay': 'Label perniagaan',
    },
    'column_annotation_label_description': {
        'English': 'Description',
        'Mandarin': '描述',
        'Japanese': '説明',
        'Malay': 'Penerangan',
    },
    'column_annotation_description_placeholder': {
        'English': 'e.g., unique customer code',
        'Mandarin': '例如：客户唯一编码',
        'Japanese': '例：顧客固有コード',
        'Malay': 'cth., kod pelanggan unik',
    },
    'column_annotation_label_business_role': {
        'English': 'Business role',
        'Mandarin': '业务角色',
        'Japanese': 'ビジネスロール',
        'Malay': 'Peranan perniagaan',
    },
    'column_annotation_remove': {
        'English': 'Remove annotation',
        'Mandarin': '删除标注',
        'Japanese': 'アノテーションを削除',
        'Malay': 'Buang anotasi',
    },
    'column_annotation_cancel': {
        'English': 'Cancel',
        'Mandarin': '取消',
        'Japanese': 'キャンセル',
        'Malay': 'Batal',
    },
    'column_annotation_save': {
        'English': 'Save',
        'Mandarin': '保存',
        'Japanese': '保存',
        'Malay': 'Simpan',
    },

    // ── Data preparation workflow ──
    'data_preparation_revert_title': {
        'English': 'Revert to original data before cleaning',
        'Mandarin': '恢复到清洗前的原始数据',
        'Japanese': 'クリーニング前の元データに戻す',
        'Malay': 'Kembali kepada data asal sebelum pembersihan',
    },
    'data_preparation_revert_button': {
        'English': 'Revert to original',
        'Mandarin': '恢复原始数据',
        'Japanese': '元データに戻す',
        'Malay': 'Kembali kepada data asal',
    },

    // ── Export messages ──
    'export_csv_view': {
        'English': 'Export CSV',
        'Mandarin': '导出 CSV',
        'Japanese': 'CSV をエクスポート',
        'Malay': 'Eksport CSV',
    },
    'export_csv_view_desc': {
        'English': 'Download the rows currently shown (after search and filters) as a CSV file',
        'Mandarin': '将当前显示的行（含搜索与筛选结果）下载为 CSV 文件',
        'Japanese': '現在表示中の行（検索・フィルター適用後）を CSV としてダウンロード',
        'Malay': 'Muat turun baris yang dipaparkan (selepas carian dan penapis) sebagai fail CSV',
    },
    'export_csv_full': {
        'English': 'Export all {count} rows',
        'Mandarin': '导出全部 {count} 行',
        'Japanese': '全 {count} 行をエクスポート',
        'Malay': 'Eksport semua {count} baris',
    },
    'export_csv_full_desc': {
        'English': 'Stream the complete dataset from the local database to a CSV file (search text is not applied)',
        'Mandarin': '从本地数据库流式导出完整数据集为 CSV 文件（不应用搜索文字）',
        'Japanese': 'ローカルデータベースから全データを CSV にストリーム出力します（検索テキストは適用されません）',
        'Malay': 'Strim keseluruhan set data dari pangkalan data setempat ke fail CSV (teks carian tidak digunakan)',
    },
    'export_csv_progress': {
        'English': 'Exporting CSV… {done} / {total} rows',
        'Mandarin': '正在导出 CSV… {done} / {total} 行',
        'Japanese': 'CSV をエクスポート中… {done} / {total} 行',
        'Malay': 'Mengeksport CSV… {done} / {total} baris',
    },
    'export_csv_cancel': {
        'English': 'Cancel',
        'Mandarin': '取消',
        'Japanese': 'キャンセル',
        'Malay': 'Batal',
    },
    'export_csv_cancelled': {
        'English': 'CSV export cancelled',
        'Mandarin': '已取消 CSV 导出',
        'Japanese': 'CSV のエクスポートをキャンセルしました',
        'Malay': 'Eksport CSV dibatalkan',
    },
    'export_csv_success': {
        'English': 'Exported {count} rows to CSV ({file})',
        'Mandarin': '已导出 {count} 行到 CSV（{file}）',
        'Japanese': '{count} 行を CSV にエクスポートしました（{file}）',
        'Malay': 'Berjaya mengeksport {count} baris ke CSV ({file})',
    },

    'export_format_failed': {
        'English': 'Export {format} failed',
        'Mandarin': '导出{format}失败',
        'Japanese': '{format}のエクスポートに失敗しました',
        'Malay': 'Eksport {format} gagal',
    },

    // ── Table sort ──
    'table_sort_column': {
        'English': 'Sort: {column}',
        'Mandarin': '排序: {column}',
        'Japanese': 'ソート: {column}',
        'Malay': 'Isih: {column}',
    },

    // ── Goal proposer ──
    'goal_history_preference': {
        'English': 'Based on historical preferences',
        'Mandarin': '📊 基于历史偏好',
        'Japanese': '📊 履歴の好みに基づく',
        'Malay': 'Berdasarkan pilihan terdahulu',
    },

    // ── History panel: session switch confirmation ──
    'history_switch_session': { 'English': 'Switch Session', 'Mandarin': '切换会话', 'Malay': 'Tukar Sesi', 'Japanese': 'セッション切替' },
    'history_switch_session_desc': {
        'English': 'Loading this session will replace your current workspace. Your current data has been auto-saved and will not be lost.',
        'Mandarin': '加载此会话将替换当前工作区。您的当前数据已自动保存，不会丢失。',
        'Malay': 'Memuatkan sesi ini akan menggantikan ruang kerja semasa anda. Data anda telah disimpan secara automatik.',
        'Japanese': 'このセッションを読み込むと現在のワークスペースが置き換わります。データは自動保存済みです。',
    },
    'history_switch_cancel': { 'English': 'Cancel', 'Mandarin': '取消', 'Malay': 'Batal', 'Japanese': 'キャンセル' },
    'history_switch_confirm': { 'English': 'Load Session', 'Mandarin': '确认加载', 'Malay': 'Muatkan Sesi', 'Japanese': '読み込む' },

    // ── Tabulator pagination labels ──
    'tabulator_page_size': { 'English': 'Rows', 'Mandarin': '每页', 'Malay': 'Baris', 'Japanese': '行数' },
    'tabulator_page_title': { 'English': 'Show Page', 'Mandarin': '跳转页码', 'Malay': 'Pergi ke halaman', 'Japanese': 'ページを表示' },
    'tabulator_first': { 'English': 'First', 'Mandarin': '首页', 'Malay': 'Pertama', 'Japanese': '最初' },
    'tabulator_first_title': { 'English': 'First Page', 'Mandarin': '第一页', 'Malay': 'Halaman pertama', 'Japanese': '最初のページ' },
    'tabulator_last': { 'English': 'Last', 'Mandarin': '末页', 'Malay': 'Akhir', 'Japanese': '最後' },
    'tabulator_last_title': { 'English': 'Last Page', 'Mandarin': '最后一页', 'Malay': 'Halaman terakhir', 'Japanese': '最後のページ' },
    'tabulator_prev': { 'English': 'Prev', 'Mandarin': '上一页', 'Malay': 'Sebelumnya', 'Japanese': '前へ' },
    'tabulator_prev_title': { 'English': 'Previous Page', 'Mandarin': '上一页', 'Malay': 'Halaman sebelumnya', 'Japanese': '前のページ' },
    'tabulator_next': { 'English': 'Next', 'Mandarin': '下一页', 'Malay': 'Seterusnya', 'Japanese': '次へ' },
    'tabulator_next_title': { 'English': 'Next Page', 'Mandarin': '下一页', 'Malay': 'Halaman seterusnya', 'Japanese': '次のページ' },
    'tabulator_all': { 'English': 'All', 'Mandarin': '全部', 'Malay': 'Semua', 'Japanese': '全て' },
    'tabulator_showing': { 'English': 'Showing', 'Mandarin': '显示', 'Malay': 'Memaparkan', 'Japanese': '表示' },
    'tabulator_of': { 'English': 'of', 'Mandarin': '/', 'Malay': 'daripada', 'Japanese': '/' },
    'tabulator_rows': { 'English': 'rows', 'Mandarin': '行', 'Malay': 'baris', 'Japanese': '行' },
    'tabulator_pages': { 'English': 'pages', 'Mandarin': '页', 'Malay': 'halaman', 'Japanese': 'ページ' },

    // ── Spreadsheet filter operator labels ──
    'filter_op_eq': { 'English': 'equals', 'Mandarin': '等于', 'Malay': 'bersamaan dengan', 'Japanese': 'と等しい' },
    'filter_op_neq': { 'English': 'does not equal', 'Mandarin': '不等于', 'Malay': 'tidak bersamaan dengan', 'Japanese': 'と等しくない' },
    'filter_op_gt': { 'English': 'is greater than', 'Mandarin': '大于', 'Malay': 'lebih besar daripada', 'Japanese': 'より大きい' },
    'filter_op_gte': { 'English': 'is greater than or equal to', 'Mandarin': '大于等于', 'Malay': 'lebih besar atau sama dengan', 'Japanese': '以上' },
    'filter_op_lt': { 'English': 'is less than', 'Mandarin': '小于', 'Malay': 'lebih kecil daripada', 'Japanese': 'より小さい' },
    'filter_op_lte': { 'English': 'is less than or equal to', 'Mandarin': '小于等于', 'Malay': 'lebih kecil atau sama dengan', 'Japanese': '以下' },
    'filter_op_between': { 'English': 'is between', 'Mandarin': '介于', 'Malay': 'di antara', 'Japanese': 'の間にある' },
    'filter_op_contains': { 'English': 'contains', 'Mandarin': '包含', 'Malay': 'mengandungi', 'Japanese': 'を含む' },
    'filter_op_starts_with': { 'English': 'starts with', 'Mandarin': '以', 'Malay': 'bermula dengan', 'Japanese': 'で始まる' },
    'filter_op_ends_with': { 'English': 'ends with', 'Mandarin': '以', 'Malay': 'berakhir dengan', 'Japanese': 'で終わる' },
    'filter_op_in': { 'English': 'is in', 'Mandarin': '属于', 'Malay': 'terdapat dalam', 'Japanese': 'に含まれる' },
    'filter_op_not_in': { 'English': 'is not in', 'Mandarin': '不属于', 'Malay': 'tidak terdapat dalam', 'Japanese': 'に含まれない' },
    'filter_op_is_null': { 'English': 'is null', 'Mandarin': '为空', 'Malay': 'kosong', 'Japanese': 'が空である' },
    'filter_op_not_null': { 'English': 'is not null', 'Mandarin': '不为空', 'Malay': 'tidak kosong', 'Japanese': 'が空でない' },

    // ── AI prompt language instruction ──
    'ai_prompt_reply_language': { 'English': 'Reply in English.', 'Mandarin': '请用简体中文回答。', 'Malay': 'Sila jawab dalam Bahasa Melayu.', 'Japanese': '日本語で回答してください。' },

    // ── Data quality notes: one plain sentence per kind of import issue ──
    'dq_note_thousands': {
        'English': 'Some numbers contain thousands separators; we read them correctly.',
        'Mandarin': '部分数字带有千位分隔符，我们已正确读取。',
        'Japanese': '一部の数値に桁区切りが含まれていますが、正しく読み取っています。',
        'Malay': 'Sesetengah nombor mengandungi pemisah ribuan; kami membacanya dengan betul.',
    },
    'dq_note_decimal_comma': {
        'English': 'Some numbers use a decimal comma (such as 1.234,56); we read them correctly.',
        'Mandarin': '部分数字使用小数逗号（如 1.234,56），我们已正确读取。',
        'Japanese': '一部の数値は小数点にカンマを使っています（例：1.234,56）。正しく読み取っています。',
        'Malay': 'Sesetengah nombor menggunakan koma perpuluhan (seperti 1.234,56); kami membacanya dengan betul.',
    },
    'dq_note_apostrophe': {
        'English': 'Some numbers start with an apostrophe (a spreadsheet text marker); we read them correctly.',
        'Mandarin': '部分数字以撇号开头（电子表格的文本标记），我们已正确读取。',
        'Japanese': '一部の数値の先頭にアポストロフィ（表計算の文字列マーカー）がありますが、正しく読み取っています。',
        'Malay': 'Sesetengah nombor bermula dengan apostrof (penanda teks hamparan); kami membacanya dengan betul.',
    },
    'dq_note_mostly_empty': {
        'English': '{count} columns are mostly empty and will be ignored unless needed.',
        'Mandarin': '{count} 列大部分为空，除非需要，否则不会使用。',
        'Japanese': '{count} 列はほとんど空のため、必要な場合を除いて使用しません。',
        'Malay': '{count} lajur kebanyakannya kosong dan akan diabaikan kecuali diperlukan.',
    },
    'dq_note_other': {
        'English': '{count} other data quality issues were found; the analysis takes them into account.',
        'Mandarin': '还发现 {count} 个其他数据质量问题，分析时会将其考虑在内。',
        'Japanese': 'その他のデータ品質の問題が {count} 件見つかりました。分析ではこれらを考慮します。',
        'Malay': '{count} isu kualiti data lain ditemui; analisis mengambilnya kira.',
    },
    'dq_note_columns': {
        'English': 'Columns: {columns}',
        'Mandarin': '涉及的列：{columns}',
        'Japanese': '対象の列：{columns}',
        'Malay': 'Lajur: {columns}',
    },
};
