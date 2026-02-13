type PaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  const pagesAroundCurrent = Array.from(
    { length: Math.min(3, totalPages) },
    (_, i) => i + Math.max(currentPage - 1, 1)
  );

  return (
    <div className="flex items-center">
      <button
        className="mr-2.5 flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-gray-700 text-sm shadow-theme-xs hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03]"
        disabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        Previous
      </button>
      <div className="flex items-center gap-2">
        {currentPage > 3 && <span className="px-2">...</span>}
        {pagesAroundCurrent.map((page) => (
          <button
            className={`rounded px-4 py-2 ${
              currentPage === page
                ? "bg-brand-500 text-white"
                : "text-gray-700 dark:text-gray-400"
            } flex h-10 w-10 items-center justify-center rounded-lg font-medium text-sm hover:bg-blue-500/[0.08] hover:text-brand-500 dark:hover:text-brand-500`}
            key={page}
            onClick={() => onPageChange(page)}
          >
            {page}
          </button>
        ))}
        {currentPage < totalPages - 2 && <span className="px-2">...</span>}
      </div>
      <button
        className="ml-2.5 flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-gray-700 text-sm shadow-theme-xs hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03]"
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        Next
      </button>
    </div>
  );
};

export default Pagination;
