import type React from "react";
import { useSidebar } from "@/context/SidebarContext";

const Backdrop: React.FC = () => {
  const { isMobileOpen, toggleMobileSidebar } = useSidebar();

  if (!isMobileOpen) {
    return null;
  }

  return (
    <button
      aria-label="Close sidebar"
      className="fixed inset-0 z-40 cursor-pointer border-0 bg-gray-900/50 p-0 lg:hidden"
      onClick={toggleMobileSidebar}
      type="button"
    />
  );
};

export default Backdrop;
