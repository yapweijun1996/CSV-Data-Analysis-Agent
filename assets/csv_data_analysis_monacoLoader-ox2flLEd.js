const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./csv_data_analysis_vendor-ai-sdk-J3KEucyx.js","./csv_data_analysis_vendor-data-gCZ_DPYi.js","./csv_data_analysis_vendor-storage-Dda2oZrY.js","./csv_data_analysis_vendor-ai-google-CTyAUw0K.js","./csv_data_analysis_vendor-ai-openai-Cf4Uvg1A.js"])))=>i.map(i=>d[i]);
import { _ as __vitePreload } from "./csv_data_analysis_app-agent-DytoEScF.js";
import "./csv_data_analysis_vendor-ai-sdk-J3KEucyx.js";
import "./csv_data_analysis_vendor-data-gCZ_DPYi.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-ai-google-CTyAUw0K.js";
import "./csv_data_analysis_vendor-ai-openai-Cf4Uvg1A.js";
let configured = false;
async function ensureMonacoConfigured() {
  if (configured) return;
  const [
    { loader },
    monaco,
    editorWorkerMod,
    jsonWorkerMod,
    cssWorkerMod,
    htmlWorkerMod,
    tsWorkerMod
  ] = await Promise.all([
    __vitePreload(() => import("./csv_data_analysis_vendor-react-core-C-mUT8EF.js").then((n) => n.i), true ? [] : void 0, import.meta.url),
    __vitePreload(() => import("./csv_data_analysis_vendor-monaco-qW3DRawE.js").then((n) => n.i), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
    __vitePreload(() => import("./csv_data_analysis_vendor-monaco-qW3DRawE.js").then((n) => n.e), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
    __vitePreload(() => import("./csv_data_analysis_vendor-monaco-qW3DRawE.js").then((n) => n.j), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
    __vitePreload(() => import("./csv_data_analysis_vendor-monaco-qW3DRawE.js").then((n) => n.c), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
    __vitePreload(() => import("./csv_data_analysis_vendor-monaco-qW3DRawE.js").then((n) => n.h), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url),
    __vitePreload(() => import("./csv_data_analysis_vendor-monaco-qW3DRawE.js").then((n) => n.t), true ? __vite__mapDeps([0,1,2,3,4]) : void 0, import.meta.url)
  ]);
  const EditorWorker = editorWorkerMod.default;
  const JsonWorker = jsonWorkerMod.default;
  const CssWorker = cssWorkerMod.default;
  const HtmlWorker = htmlWorkerMod.default;
  const TsWorker = tsWorkerMod.default;
  const localMonacoEnvironment = {
    getWorker(_workerId, label) {
      if (label === "json") return new JsonWorker();
      if (label === "css" || label === "scss" || label === "less") return new CssWorker();
      if (label === "html" || label === "handlebars" || label === "razor") return new HtmlWorker();
      if (label === "typescript" || label === "javascript") return new TsWorker();
      return new EditorWorker();
    }
  };
  const monacoGlobal = self;
  monacoGlobal.MonacoEnvironment = localMonacoEnvironment;
  loader.config({ monaco });
  configured = true;
}
export {
  ensureMonacoConfigured
};
