const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./csv_data_analysis_monacoLoader-W6gtxy1G.js","./csv_data_analysis_vendor-storage-Dda2oZrY.js","./csv_data_analysis_vendor-data-CIO9Xlwr.js","./csv_data_analysis_vendor-react-core-DlbdMisc.js","./csv_data_analysis_vendor-ai-sdk-BsjzGh48.js","./csv_data_analysis_vendor-ai-shared-BR7-yMTm.js","./csv_data_analysis_vendor-ai-google-DYdleeb9.js","./csv_data_analysis_vendor-ai-openai-DYjgwaHN.js"])))=>i.map(i=>d[i]);
import { _ as __vitePreload } from "./csv_data_analysis_app-agent-DlyYMc3W.js";
import { a as reactExports, j as jsxRuntimeExports } from "./csv_data_analysis_vendor-react-core-DlbdMisc.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-data-CIO9Xlwr.js";
import "./csv_data_analysis_vendor-ai-sdk-BsjzGh48.js";
import "./csv_data_analysis_vendor-ai-shared-BR7-yMTm.js";
import "./csv_data_analysis_vendor-ai-google-DYdleeb9.js";
import "./csv_data_analysis_vendor-ai-openai-DYjgwaHN.js";
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
        const { ensureMonacoConfigured: ensureMonacoConfigured2 } = await import("./csv_data_analysis_monacoLoader-W6gtxy1G.js");
        return { ensureMonacoConfigured: ensureMonacoConfigured2 };
      }, true ? __vite__mapDeps([0,1,2,3,4,5,6,7]) : void 0, import.meta.url);
      await ensureMonacoConfigured();
      const module = await __vitePreload(() => import("./csv_data_analysis_vendor-react-core-DlbdMisc.js").then((n) => n.i), true ? [] : void 0, import.meta.url);
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
