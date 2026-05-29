import type React from "react";
import { useState } from "react";

const ChartTab: React.FC = () => {
  const [selected, setSelected] = useState<
    "optionOne" | "optionTwo" | "optionThree"
  >("optionOne");

  const getButtonClass = (option: "optionOne" | "optionTwo" | "optionThree") =>
    selected === option
      ? "shadow-gm-card text-foreground bg-background"
      : "text-muted-foreground";

  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
      <button
        className={`w-full rounded-md px-3 py-2 font-medium text-theme-sm hover:text-foreground ${getButtonClass(
          "optionOne"
        )}`}
        onClick={() => setSelected("optionOne")}
        type="button"
      >
        Monthly
      </button>

      <button
        className={`w-full rounded-md px-3 py-2 font-medium text-theme-sm hover:text-foreground ${getButtonClass(
          "optionTwo"
        )}`}
        onClick={() => setSelected("optionTwo")}
        type="button"
      >
        Quarterly
      </button>

      <button
        className={`w-full rounded-md px-3 py-2 font-medium text-theme-sm hover:text-foreground ${getButtonClass(
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
