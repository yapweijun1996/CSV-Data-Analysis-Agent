/**
 * @typedef {Object<string, string | number | null | undefined>} CsvRow
 */

/**
 * @typedef {'bar' | 'line' | 'pie' | 'doughnut' | 'scatter'} ChartType
 */

/**
 * @typedef {'sum' | 'count' | 'avg'} AggregationType
 */

/**
 * 描述数据列的剖面信息，供分析计划和预处理参考。
 *
 * @typedef {Object} ColumnProfile
 * @property {string} name 列名称
 * @property {'numerical' | 'categorical' | 'date' | 'time' | 'currency' | 'percentage'} type 列类型
 * @property {number} [uniqueValues] 不重复值数量
 * @property {[number, number]} [valueRange] 数值范围
 * @property {number} [missingPercentage] 缺失值百分比
 */

/**
 * AI 生成的分析计划描述，用于驱动图表渲染与聚合。
 *
 * @typedef {Object} AnalysisPlan
 * @property {ChartType} chartType 图表类型
 * @property {string} title 图表标题
 * @property {string} description 计划描述
 * @property {AggregationType} [aggregation] 聚合方式（scatter 可选）
 * @property {string} [groupByColumn] 分组列（scatter 可选）
 * @property {string} [valueColumn] 数值列（count 时可空）
 * @property {string} [xValueColumn] 散点图 X 轴
 * @property {string} [yValueColumn] 散点图 Y 轴
 * @property {number} [defaultTopN] 默认 Top N 值
 * @property {boolean} [defaultHideOthers] 是否默认隐藏 Others
 */

/**
 * 单个分析卡片的视图模型。
 *
 * @typedef {Object} AnalysisCardData
 * @property {string} id 卡片唯一标识
 * @property {AnalysisPlan} plan 对应的分析计划
 * @property {CsvRow[]} aggregatedData 聚合后的数据
 * @property {string} summary AI 文本摘要（可能包含多语部分）
 * @property {ChartType} displayChartType 当前显示的图表类型
 * @property {boolean} isDataVisible 是否展开数据表
 * @property {number|null} topN Top N 设置
 * @property {boolean} hideOthers 是否隐藏 Others
 * @property {boolean} [disableAnimation] 是否禁用动画
 * @property {{ column: string; values: Array<string | number> }} [filter] 当前筛选条件
 * @property {string[]} [hiddenLabels] 被隐藏的标签集合
 */

export {};
