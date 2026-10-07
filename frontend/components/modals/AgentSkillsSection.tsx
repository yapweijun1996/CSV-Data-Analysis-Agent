import React, { useRef, useState, useSyncExternalStore } from 'react';
import type { Settings } from '../../types';
import { getTranslation } from '../../utils/localization';
import { resolveSkillEntries } from '../../services/agent/skills/skillRegistry';
import {
    getUserSkillsSnapshot,
    importUserSkills,
    removeUserSkill,
    subscribeUserSkills,
    type UserSkillImportResult,
} from '../../services/agent/skills/userSkillStore';

const EXAMPLE_SKILL = `---
name: house-style
description: Use when writing summaries for our leadership team.
---

Lead with the decision, then the evidence. Keep numbers to two figures.`;

/** Lists the agent's skills and lets the person add their own skill files. */
export const AgentSkillsSection: React.FC<{ language: Settings['language'] }> = ({ language }) => {
    // Re-render whenever the stored skills change.
    const snapshot = useSyncExternalStore(subscribeUserSkills, getUserSkillsSnapshot, getUserSkillsSnapshot);
    const { entries } = React.useMemo(() => resolveSkillEntries({}), [snapshot]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [lastImport, setLastImport] = useState<UserSkillImportResult | null>(null);

    const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files: File[] = event.target.files ? Array.from(event.target.files) : [];
        event.target.value = '';
        if (files.length === 0) return;
        const loaded = await Promise.all(files.map(async file => ({ fileName: file.name, text: await file.text() })));
        setLastImport(importUserSkills(loaded));
    };

    return (
        <div className="rounded-card border border-slate-200 bg-slate-50 p-4" data-agent-skills-section="true">
            <h3 className="text-sm font-semibold text-slate-900">{getTranslation('settings_skills_title', language)}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">{getTranslation('settings_skills_detail', language)}</p>

            <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                {entries.map(({ skill, source }) => (
                    <li key={skill.name} className="flex items-start gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                                <span className="truncate">{skill.name}</span>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    source === 'user' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'
                                }`}>
                                    {getTranslation(source === 'user' ? 'settings_skills_yours' : 'settings_skills_builtin', language)}
                                </span>
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">{skill.description}</p>
                        </div>
                        {source === 'user' && (
                            <button
                                type="button"
                                onClick={() => removeUserSkill(skill.name)}
                                aria-label={getTranslation('settings_skills_remove', language, { name: skill.name })}
                                className="min-h-[44px] shrink-0 rounded-md px-2 text-xs font-semibold text-red-700 hover:bg-red-50 md:min-h-0 md:py-1"
                            >
                                ✕
                            </button>
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

            {lastImport && (lastImport.added.length > 0 || lastImport.rejected.length > 0) && (
                <div role="status" className="mt-2 space-y-1 text-xs">
                    {lastImport.added.length > 0 && (
                        <p className="text-emerald-800">
                            {getTranslation('settings_skills_added', language, { names: lastImport.added.join(', ') })}
                        </p>
                    )}
                    {lastImport.rejected.map(item => (
                        <p key={`${item.fileName}-${item.reason}`} className="text-red-800">
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
