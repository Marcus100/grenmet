import type React from "react";
import { useState } from "react";

interface Option {
  selected: boolean;
  text: string;
  value: string;
}

interface MultiSelectProps {
  defaultSelected?: string[];
  disabled?: boolean;
  label: string;
  onChange?: (selected: string[]) => void;
  options: Option[];
}

const MultiSelect: React.FC<MultiSelectProps> = ({
  label,
  options,
  defaultSelected = [],
  onChange,
  disabled = false,
}) => {
  const [selectedOptions, setSelectedOptions] =
    useState<string[]>(defaultSelected);
  const [isOpen, setIsOpen] = useState(false);

  const toggleDropdown = () => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  };

  const handleSelect = (optionValue: string) => {
    const newSelectedOptions = selectedOptions.includes(optionValue)
      ? selectedOptions.filter((value) => value !== optionValue)
      : [...selectedOptions, optionValue];

    setSelectedOptions(newSelectedOptions);
    if (onChange) onChange(newSelectedOptions);
  };

  const removeOption = (_index: number, value: string) => {
    const newSelectedOptions = selectedOptions.filter((opt) => opt !== value);
    setSelectedOptions(newSelectedOptions);
    if (onChange) onChange(newSelectedOptions);
  };

  return (
    <div className="w-full">
      <span className="mb-1.5 block font-medium text-gray-700 text-sm">
        {label}
      </span>

      <div className="relative z-20 inline-block w-full">
        <div className="relative flex flex-col items-center">
          <div className="w-full">
            <div className="mb-2 flex h-11 rounded-lg border border-gray-300 py-1.5 pr-3 pl-3 shadow-gm-card outline-hidden transition focus:border-brand-300 focus:shadow-focus-ring">
              <div className="flex flex-auto flex-wrap gap-2">
                {selectedOptions.length > 0 ? (
                  selectedOptions.map((value) => {
                    const text =
                      options.find((o) => o.value === value)?.text || "";
                    return (
                      <div
                        className="group flex items-center justify-center rounded-full border-[0.7px] border-transparent bg-gray-100 py-1 pr-2 pl-2.5 text-foreground text-sm hover:border-border"
                        key={value}
                      >
                        <span className="max-w-full flex-initial">{text}</span>
                        <div className="flex flex-auto flex-row-reverse">
                          <button
                            className="cursor-pointer pl-2 text-muted-foreground group-hover:text-gray-400"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeOption(0, value);
                            }}
                            type="button"
                          >
                            <svg
                              aria-hidden="true"
                              className="fill-current"
                              height="14"
                              viewBox="0 0 14 14"
                              width="14"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                clipRule="evenodd"
                                d="M3.40717 4.46881C3.11428 4.17591 3.11428 3.70104 3.40717 3.40815C3.70006 3.11525 4.17494 3.11525 4.46783 3.40815L6.99943 5.93975L9.53095 3.40822C9.82385 3.11533 10.2987 3.11533 10.5916 3.40822C10.8845 3.70112 10.8845 4.17599 10.5916 4.46888L8.06009 7.00041L10.5916 9.53193C10.8845 9.82482 10.8845 10.2997 10.5916 10.5926C10.2987 10.8855 9.82385 10.8855 9.53095 10.5926L6.99943 8.06107L4.46783 10.5927C4.17494 10.8856 3.70006 10.8856 3.40717 10.5927C3.11428 10.2998 3.11428 9.8249 3.40717 9.53201L5.93877 7.00041L3.40717 4.46881Z"
                                fillRule="evenodd"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <input
                    className="h-full w-full appearance-none border-0 bg-transparent p-1 pr-2 text-sm outline-hidden placeholder:text-foreground focus:border-0 focus:outline-hidden focus:ring-0"
                    placeholder="Select option"
                    readOnly
                    value="Select option"
                  />
                )}
              </div>
              <div className="flex w-7 items-center py-1 pr-1 pl-1">
                <button
                  className="h-5 w-5 cursor-pointer text-gray-700 outline-hidden focus:outline-hidden"
                  onClick={toggleDropdown}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    className={`stroke-current ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    height="20"
                    viewBox="0 0 20 20"
                    width="20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M4.79175 7.39551L10.0001 12.6038L15.2084 7.39551"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {isOpen && (
            <div className="absolute top-full left-0 z-40 max-h-select w-full overflow-y-auto rounded-lg bg-background shadow-sm">
              <div className="flex flex-col">
                {options.map((option, index) => {
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static options list, no reordering
                    <div key={index}>
                      <button
                        className="w-full cursor-pointer rounded-t border-border border-b text-left hover:bg-primary/5"
                        onClick={() => handleSelect(option.value)}
                        type="button"
                      >
                        <div
                          className={`relative flex w-full items-center p-2 pl-2 ${
                            selectedOptions.includes(option.value)
                              ? "bg-primary/10"
                              : ""
                          }`}
                        >
                          <div className="mx-2 text-foreground leading-6">
                            {option.text}
                          </div>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MultiSelect;
