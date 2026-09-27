import React, { useEffect, useState } from 'react';

interface WorkspaceModalEditorProps {
    path: string;
    language: string;
    value: string;
}

type MonacoEditorComponent = React.ComponentType<{
    path: string;
    language: string;
    theme: string;
    value: string;
    options: {
        readOnly: boolean;
        minimap: { enabled: boolean };
        fontFamily: string;
        fontSize: number;
        lineHeight: number;
        wordWrap: 'on';
        automaticLayout: boolean;
        scrollBeyondLastLine: boolean;
        smoothScrolling: boolean;
        padding: { top: number; bottom: number };
        glyphMargin: boolean;
        folding: boolean;
        renderLineHighlight: 'none';
        tabSize: number;
    };
}>;

export const WorkspaceModalEditor: React.FC<WorkspaceModalEditorProps> = ({
    path,
    language,
    value,
}) => {
    const [EditorComponent, setEditorComponent] = useState<MonacoEditorComponent | null>(null);

    useEffect(() => {
        let cancelled = false;

        void (async () => {
            const { ensureMonacoConfigured } = await import('../../utils/monacoLoader');
            await ensureMonacoConfigured();
            const module = await import('@monaco-editor/react');
            if (!cancelled) {
                setEditorComponent(() => module.default as MonacoEditorComponent);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    if (!EditorComponent) {
        return (
            <div className="flex h-full items-center justify-center p-5">
                <p className="text-sm text-slate-500">Loading workspace editor...</p>
            </div>
        );
    }

    return (
        <EditorComponent
            path={path}
            language={language}
            theme="vs"
            value={value}
            options={{
                readOnly: true,
                minimap: { enabled: false },
                fontFamily: 'Arial',
                fontSize: 12,
                lineHeight: 22,
                wordWrap: 'on',
                automaticLayout: true,
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                padding: { top: 16, bottom: 16 },
                glyphMargin: false,
                folding: true,
                renderLineHighlight: 'none',
                tabSize: 2,
            }}
        />
    );
};
