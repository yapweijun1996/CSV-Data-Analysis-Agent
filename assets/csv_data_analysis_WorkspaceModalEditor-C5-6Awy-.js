const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./csv_data_analysis_monacoLoader-ox2flLEd.js","./csv_data_analysis_vendor-ai-sdk-J3KEucyx.js","./csv_data_analysis_vendor-data-gCZ_DPYi.js","./csv_data_analysis_vendor-storage-Dda2oZrY.js","./csv_data_analysis_vendor-ai-google-CTyAUw0K.js","./csv_data_analysis_vendor-ai-openai-Cf4Uvg1A.js"])))=>i.map(i=>d[i]);
import { _ as __vitePreload } from "./csv_data_analysis_app-agent-DytoEScF.js";
import { a as reactExports, j as jsxRuntimeExports } from "./csv_data_analysis_vendor-react-core-C-mUT8EF.js";
import "./csv_data_analysis_vendor-ai-sdk-J3KEucyx.js";
import "./csv_data_analysis_vendor-data-gCZ_DPYi.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-ai-google-CTyAUw0K.js";
import "./csv_data_analysis_vendor-ai-openai-Cf4Uvg1A.js";
const WorkspaceModalEditor = ({
  path,
  language,
  value
}) => {
  const [EditorComponent, setEditorComponent] = reactExports.useState(null);
  reactExports.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { ensureMonacoConfigured } = await __vitePreload(async () => {
        const { ensureMonacoConfigured: ensureMonacoConfigured2 } = await import("./csv_data_analysis_monacoLoader-ox2flLEd.js");
        return { ensureMonacoConfigured: ensureMonacoConfigured2 };
      }, true ? __vite__mapDeps([0,1,2,3,4,5]) : void 0, import.meta.url);
      await ensureMonacoConfigured();
      const module = await __vitePreload(() => import("./csv_data_analysis_vendor-react-core-C-mUT8EF.js").then((n) => n.i), true ? [] : void 0, import.meta.url);
      if (!cancelled) {
        setEditorComponent(() => module.default);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  if (!EditorComponent) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-full items-center justify-center p-5", children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-slate-500", children: "Loading workspace editor..." }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    EditorComponent,
    {
      path,
      language,
      theme: "vs",
      value,
      options: {
        readOnly: true,
        minimap: { enabled: false },
        fontFamily: "Arial",
        fontSize: 12,
        lineHeight: 22,
        wordWrap: "on",
        automaticLayout: true,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        padding: { top: 16, bottom: 16 },
        glyphMargin: false,
        folding: true,
        renderLineHighlight: "none",
        tabSize: 2
      }
    }
  );
};
export {
  WorkspaceModalEditor
};
