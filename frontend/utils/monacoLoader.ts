type MonacoWorkerFactory = {
    getWorker: (_workerId: string, label: string) => Worker;
};

let configured = false;

/**
 * Dynamically load and configure Monaco Editor at runtime.
 * Must be awaited before rendering any Monaco component.
 * Safe to call multiple times — configuration runs only once.
 *
 * All monaco-editor / @monaco-editor/react / worker imports are dynamic
 * so that vendor-monaco assets are never pulled into the cold-start graph.
 */
export async function ensureMonacoConfigured(): Promise<void> {
    if (configured) return;

    const [
        { loader },
        monaco,
        editorWorkerMod,
        jsonWorkerMod,
        cssWorkerMod,
        htmlWorkerMod,
        tsWorkerMod,
    ] = await Promise.all([
        import('@monaco-editor/react'),
        import('monaco-editor'),
        import('monaco-editor/editor/editor.worker?worker'),
        import('monaco-editor/language/json/json.worker?worker'),
        import('monaco-editor/language/css/css.worker?worker'),
        import('monaco-editor/language/html/html.worker?worker'),
        import('monaco-editor/language/typescript/ts.worker?worker'),
    ]);

    const EditorWorker = editorWorkerMod.default;
    const JsonWorker = jsonWorkerMod.default;
    const CssWorker = cssWorkerMod.default;
    const HtmlWorker = htmlWorkerMod.default;
    const TsWorker = tsWorkerMod.default;

    const localMonacoEnvironment: MonacoWorkerFactory = {
        getWorker(_workerId, label) {
            if (label === 'json') return new JsonWorker();
            if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
            if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
            if (label === 'typescript' || label === 'javascript') return new TsWorker();
            return new EditorWorker();
        },
    };

    const monacoGlobal = self as typeof self & { MonacoEnvironment?: MonacoWorkerFactory };
    monacoGlobal.MonacoEnvironment = localMonacoEnvironment;
    loader.config({ monaco });
    configured = true;
}
