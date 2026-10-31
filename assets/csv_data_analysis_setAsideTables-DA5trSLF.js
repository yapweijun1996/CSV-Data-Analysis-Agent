import { ad as getTranslation } from "./csv_data_analysis_app-agent-DlyYMc3W.js";
const getSetAsideRowCounts = (sections) => (sections ?? []).map((section) => section.rowCount);
const getActiveSetAsideSections = (sections, humanBoundary) => {
  if (!(sections == null ? void 0 : sections.length)) return [];
  if (!humanBoundary) return [...sections];
  const summaryStart = humanBoundary.summaryStartIndex;
  return summaryStart === null ? [] : sections.filter((section) => section.rowStart >= summaryStart);
};
const usesIdeographicList = (language) => language === "Mandarin" || language === "Japanese";
const formatSetAsideRowCounts = (counts, language) => {
  const numbers = counts.map((count) => count.toLocaleString());
  const and = getTranslation("review_list_and", language);
  const ideographic = usesIdeographicList(language);
  const head = numbers.slice(0, -1).join(ideographic ? "、" : ", ");
  const last = numbers[numbers.length - 1] ?? "0";
  const rows = numbers.length <= 1 ? last : ideographic ? `${head}${and}${last}` : `${head} ${and} ${last}`;
  const isSingleRow = counts.length === 1 && counts[0] === 1;
  return getTranslation(isSingleRow ? "review_set_aside_rows_one" : "review_set_aside_rows_many", language, { rows });
};
const describeSetAsideTables = (counts, language) => {
  if (counts.length === 0) return null;
  return getTranslation(
    counts.length === 1 ? "report_set_aside_note_one" : "report_set_aside_note_many",
    language,
    { count: counts.length, rows: formatSetAsideRowCounts(counts, language) }
  );
};
export {
  getActiveSetAsideSections as a,
  describeSetAsideTables as d,
  formatSetAsideRowCounts as f,
  getSetAsideRowCounts as g
};
