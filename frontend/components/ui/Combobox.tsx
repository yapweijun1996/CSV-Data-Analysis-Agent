import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

type ComboboxProps = {
    id: string;
    name: string;
    value: string;
    options: string[];
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    className?: string;
    placeholder?: string;
};

export const Combobox: React.FC<ComboboxProps> = ({
    id,
    name,
    value,
    options,
    onChange,
    className,
    placeholder,
}) => {
    const listboxId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [isFiltering, setIsFiltering] = useState(false);

    const filteredOptions = useMemo(() => {
        if (!isFiltering) return options;
        const query = value.trim().toLowerCase();
        if (!query) return options;
        return options.filter(option => option.toLowerCase().includes(query));
    }, [isFiltering, options, value]);

    useEffect(() => {
        if (!isOpen) {
            setActiveIndex(-1);
            return;
        }

        setActiveIndex(filteredOptions.length > 0 ? 0 : -1);
    }, [filteredOptions, isOpen]);

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
                setIsFiltering(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, []);

    const emitChange = (nextValue: string) => {
        const syntheticEvent = {
            target: { name, value: nextValue },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(syntheticEvent);
    };

    const handleSelect = (nextValue: string) => {
        emitChange(nextValue);
        setIsOpen(false);
        setIsFiltering(false);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setIsOpen(true);
            setIsFiltering(false);
            setActiveIndex(prev => {
                if (filteredOptions.length === 0) return -1;
                return prev < filteredOptions.length - 1 ? prev + 1 : 0;
            });
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setIsOpen(true);
            setIsFiltering(false);
            setActiveIndex(prev => {
                if (filteredOptions.length === 0) return -1;
                return prev > 0 ? prev - 1 : filteredOptions.length - 1;
            });
            return;
        }

        if (event.key === 'Enter' && isOpen && activeIndex >= 0) {
            event.preventDefault();
            handleSelect(filteredOptions[activeIndex]);
            return;
        }

        if (event.key === 'Escape') {
            setIsOpen(false);
            setIsFiltering(false);
            return;
        }

        if (
            event.key.length === 1 ||
            event.key === 'Backspace' ||
            event.key === 'Delete'
        ) {
            setIsFiltering(true);
            setIsOpen(true);
        }
    };

    return (
        <div ref={rootRef} className="relative mt-1">
            <input
                id={id}
                name={name}
                type="text"
                value={value}
                placeholder={placeholder}
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isOpen}
                aria-controls={listboxId}
                aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
                onChange={event => {
                    onChange(event);
                    setIsOpen(true);
                    setIsFiltering(true);
                }}
                onFocus={() => {
                    setIsOpen(true);
                    setIsFiltering(false);
                }}
                onClick={() => {
                    setIsOpen(true);
                    setIsFiltering(false);
                }}
                onKeyDown={handleKeyDown}
                className={className}
            />
            <button
                type="button"
                aria-label="Toggle options"
                onClick={() => {
                    setIsFiltering(false);
                    setIsOpen(prev => !prev);
                }}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500"
            >
                <span className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>
            {isOpen && filteredOptions.length > 0 && (
                <ul
                    id={listboxId}
                    role="listbox"
                    className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
                >
                    {filteredOptions.map((option, index) => {
                        const isActive = index === activeIndex;
                        const isSelected = option === value;
                        return (
                            <li key={option} role="presentation">
                                <button
                                    id={`${listboxId}-option-${index}`}
                                    type="button"
                                    role="option"
                                    aria-selected={isSelected}
                                    onMouseDown={event => event.preventDefault()}
                                    onClick={() => handleSelect(option)}
                                    className={`flex w-full items-center px-3 py-2 text-left text-sm ${
                                        isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                                    } ${isSelected ? 'font-semibold' : ''}`}
                                >
                                    {option}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};
