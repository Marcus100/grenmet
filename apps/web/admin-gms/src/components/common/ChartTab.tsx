import type React from "react";
import { useState } from "react";

const ChartTab: React.FC = () => {
  const [selected, setSelected] = useState<
    "optionOne" | "optionTwo" | "optionThree"
  >("optionOne");

  const getButtonClass = (option: "optionOne" | "optionTwo" | "optionThree") =>
    selected === option
      ? "shadow-theme-xs text-gray-900 dark:text-white bg-white dark:bg-gray-800"
      : "text-gray-500 dark:text-gray-400";

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900">
      <button
        className={`w-full rounded-md px-3 py-2 font-medium text-theme-sm hover:text-gray-900 dark:hover:text-white ${getButtonClass(
          "optionOne"
        )}`}
        onClick={() => setSelected("optionOne")}
        type="button"
      >
        Monthly
      </button>

      <button
        className={`w-full rounded-md px-3 py-2 font-medium text-theme-sm hover:text-gray-900 dark:hover:text-white ${getButtonClass(
          "optionTwo"
        )}`}
        onClick={() => setSelected("optionTwo")}
        type="button"
      >
        Quarterly
      </button>

      <button
        className={`w-full rounded-md px-3 py-2 font-medium text-theme-sm hover:text-gray-900 dark:hover:text-white ${getButtonClass(
          "optionThree"
        )}`}
        onClick={() => setSelected("optionThree")}
        type="button"
      >
        Annually
      </button>
    </div>
  );
};

export default ChartTab;
