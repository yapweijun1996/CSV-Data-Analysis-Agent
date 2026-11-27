import React, { useRef, useState, useSyncExternalStore } from 'react';
import type { Settings } from '../../types';
import { getTranslation } from '../../utils/localization';
import { resolveSkillEntries } from '../../services/agent/skills/skillRegistry';
import { serializeSkillMarkdown } from '../../services/agent/skills/skillMarkdown';
import {
    getUserSkillsSnapshot,
    importUserSkills,
    removeUserSkill,
    saveEditedUserSkill,
    setSkillEnabled,
    subscribeUserSkills,
    type UserSkillImportResult,
} from '../../services/agent/skills/userSkillStore';

const EXAMPLE_SKILL = `---
name: house-style
description: Use when writing summaries for our leadership team.
---

Lead with the decision, then the evidence. Keep numbers to two figures.`;

const downloadSkill = (name: string, text: string): void => {
    try {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${name}.md`;
        link.click();
        URL.revokeObjectURL(url);
    } catch { /* Downloads can be blocked; nothing else depends on this. */ }
};

/** Lists the agent's skills and lets the person add their own skill files. */
export const AgentSkillsSection: React.FC<{ language: Settings['language'] }> = ({ language }) => {
    // Re-render whenever the stored skills change.
    const snapshot = useSyncExternalStore(subscribeUserSkills, getUserSkillsSnapshot, getUserSkillsSnapshot);
    const { entries } = React.useMemo(() => resolveSkillEntries({}), [snapshot]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);
    const [lastImport, setLastImport] = useState<UserSkillImportResult | null>(null);
    const [editing, setEditing] = useState<{ name: string; text: string; error: string | null } | null>(null);
    // A skill the person saved under the name of a built-in one replaces it until restored.
    const builtinNames = React.useMemo(
        () => new Set(resolveSkillEntries({}, {}).entries.map(entry => entry.skill.name)),
        [],
    );

    const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files: File[] = event.target.files ? Array.from(event.target.files) : [];
        event.target.value = '';
        if (files.length === 0) return;
        if(files.length>512||files.reduce((bytes,file)=>bytes+file.size,0)>8*1024*1024){
            setLastImport({added:[],rejected:[{fileName:'Selected files',reason:'Import at most 512 files and 8 MiB.'}]});return;
        }
        const loaded = await Promise.all(files.map(async file => ({ fileName: file.webkitRelativePath||file.name, text: await file.text() })));
        setLastImport(importUserSkills(loaded));
    };

    return (
        <div className="rounded-card border border-slate-200 bg-slate-50 p-4" data-agent-skills-section="true">
            <h3 className="text-sm font-semibold text-slate-900">{getTranslation('settings_skills_title', language)}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">{getTranslation('settings_skills_detail', language)}</p>

            <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                {entries.map(({ skill, source, enabled, supportingSources }) => (
                    <li key={skill.name} className="px-3 py-2">
                        <div className="flex items-start gap-3">
                            <input
                                type="checkbox"
                                role="switch"
                                checked={enabled}
                                onChange={event => setSkillEnabled(skill.name, event.target.checked)}
                                aria-label={getTranslation('settings_skills_toggle_label', language, { name: skill.name })}
                                className="mt-1 h-4 w-4 shrink-0"
                            />
                            <div className={`min-w-0 flex-1 ${enabled ? '' : 'opacity-60'}`}>
                                <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                                    <span className="truncate">{skill.name}</span>
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                        source === 'user' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
                                    }`}>
                                        {getTranslation(source === 'user' ? 'settings_skills_yours' : 'settings_skills_builtin', language)}
                                    </span>
                                    {!enabled && (
                                        <span className="shrink-0 rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-semibold text-warning-800">
                                            {getTranslation('settings_skills_off', language)}
                                        </span>
                                    )}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500">{skill.description}</p>
                                {skill.manifest&&<p className="mt-1 text-xs text-slate-500">
                                    Version {skill.manifest.version} · Profiles: {skill.manifest.profiles.join(', ')||'guidance only'} · Required: {skill.manifest.requires.join(', ')||'none'} · Supporting files: {skill.manifest.supportingFiles.length}
                                </p>}
                                {skill.manifest?.supportingFiles.some(file=>typeof supportingSources[file.path]!=='string')&&<p role="status" className="text-xs text-warning-800">Supporting files missing; this skill is unavailable to the agent. Import its complete folder.</p>}
                                {skill.disableModelInvocation&&<p className="text-xs text-warning-800">Model invocation restricted.</p>}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setEditing({ name: skill.name, text: serializeSkillMarkdown(skill), error: null })}
                                    aria-label={getTranslation('settings_skills_edit_label', language, { name: skill.name })}
                                    className="min-h-[44px] rounded-md px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 md:min-h-0 md:py-1"
                                >
                                    {getTranslation('settings_skills_edit', language)}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => downloadSkill(skill.name, serializeSkillMarkdown(skill))}
                                    aria-label={getTranslation('settings_skills_export_label', language, { name: skill.name })}
                                    className="min-h-[44px] rounded-md px-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 md:min-h-0 md:py-1"
                                >
                                    {getTranslation('settings_skills_export', language)}
                                </button>
                                {source === 'user' && (
                                    <button
                                        type="button"
                                        onClick={() => removeUserSkill(skill.name)}
                                        aria-label={getTranslation(
                                            builtinNames.has(skill.name) ? 'settings_skills_restore' : 'settings_skills_remove',
                                            language,
                                            { name: skill.name },
                                        )}
                                        className="min-h-[44px] rounded-md px-2 text-xs font-semibold text-danger-700 hover:bg-danger-50 md:min-h-0 md:py-1"
                                    >
                                        {builtinNames.has(skill.name) ? getTranslation('settings_skills_restore', language) : '✕'}
                                    </button>
                                )}
                            </div>
                        </div>
                        {editing?.name === skill.name && (
                            <div className="mt-2 space-y-2">
                                <textarea
                                    value={editing.text}
                                    onChange={event => setEditing({ ...editing, text: event.target.value, error: null })}
                                    rows={10}
                                    spellCheck={false}
                                    aria-label={getTranslation('settings_skills_edit_label', language, { name: skill.name })}
                                    className="w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-[12px] text-slate-800"
                                />
                                {source === 'builtin' && (
                                    <p className="text-xs text-slate-500">{getTranslation('settings_skills_edit_hint', language)}</p>
                                )}
                                {editing.error && <p role="alert" className="text-xs text-danger-800">{editing.error}</p>}
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const outcome = saveEditedUserSkill(skill.name, editing.text,supportingSources);
                                            setEditing(outcome.ok ? null : { ...editing, error: outcome.reason ?? null });
                                        }}
                                        className="min-h-[44px] rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 md:min-h-0"
                                    >
                                        {getTranslation('settings_skills_save', language)}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditing(null)}
                                        className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 md:min-h-0"
                                    >
                                        {getTranslation('settings_skills_cancel', language)}
                                    </button>
                                </div>
                            </div>
                        )}
                    </li>
                ))}
            </ul>

            <input
                ref={fileInputRef}
                type="file"
                accept=".md,text/markdown"
                multiple
                className="sr-only"
                aria-label={getTranslation('settings_skills_import', language)}
                onChange={event => void handleFiles(event)}
            />
            <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
                {getTranslation('settings_skills_import', language)}
            </button>
            <input ref={folderInputRef} type="file" multiple {...{webkitdirectory:''}} className="sr-only" aria-label="Add skill folder" onChange={event=>void handleFiles(event)}/>
            <button type="button" onClick={()=>folderInputRef.current?.click()} className="ml-2 mt-3 min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Add skill folder</button>
            <p className="mt-2 text-xs text-slate-600">A task pins enabled skill versions. Edits apply to a new task; switching a skill off immediately blocks further loads. Supporting JavaScript uses the controlled code executor and existing permissions.</p>

            {lastImport && (lastImport.added.length > 0 || lastImport.rejected.length > 0) && (
                <div role="status" className="mt-2 space-y-1 text-xs">
                    {lastImport.added.length > 0 && (
                        <p className="text-emerald-800">
                            {getTranslation('settings_skills_added', language, { names: lastImport.added.join(', ') })}
                        </p>
                    )}
                    {lastImport.rejected.map(item => (
                        <p key={`${item.fileName}-${item.reason}`} className="text-danger-800">
                            {getTranslation('settings_skills_rejected', language, { fileName: item.fileName, reason: item.reason })}
                        </p>
                    ))}
                </div>
            )}

            <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-slate-600">
                    {getTranslation('settings_skills_format_title', language)}
                </summary>
                <p className="mt-1 text-xs text-slate-600">{getTranslation('settings_skills_format_hint', language)}</p>
                <pre className="mt-2 overflow-x-auto rounded-md bg-white p-2 text-[11px] text-slate-700">{EXAMPLE_SKILL}</pre>
            </details>
        </div>
    );
};
