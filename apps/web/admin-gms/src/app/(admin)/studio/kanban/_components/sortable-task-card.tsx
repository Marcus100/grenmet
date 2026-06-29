"use client";

import { useSortable } from "@dnd-kit/sortable";

import { cn } from "@grenmet/ui/lib/utils";

import { TaskCard } from "./task-card";
import type { ColumnId, Task } from "./types";

export function SortableTaskCard({
  task,
  columnId,
}: {
  task: Task;
  columnId: ColumnId;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", task },
  });

  return (
    <div
      className={cn("touch-none", isDragging && "opacity-30")}
      ref={setNodeRef}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
      {...attributes}
      {...listeners}
    >
      <TaskCard columnId={columnId} task={task} />
    </div>
  );
}
