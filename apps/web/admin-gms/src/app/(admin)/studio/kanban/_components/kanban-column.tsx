"use client";

import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@grenmet/ui/components/ui/button";
import { cn } from "@grenmet/ui/lib/utils";
import { GripVertical, MoreVertical, Plus } from "lucide-react";

import { SortableTaskCard } from "./sortable-task-card";
import type { Column, Task } from "./types";

interface KanbanColumnProps {
  column: Column;
  tasks: Task[];
}

export function KanbanColumn({ column, tasks }: KanbanColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: column.id,
    data: { type: "column", columnId: column.id },
  });

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col rounded-t-xl border bg-muted/50 transition-colors",
        isOver && "bg-muted/70",
        isDragging && "opacity-60"
      )}
      ref={setNodeRef}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-0.5">
            <Button
              aria-label={`Drag ${column.title} column`}
              className="-ml-2 cursor-grab text-foreground/70 active:cursor-grabbing"
              size="icon-xs"
              variant="ghost"
              {...attributes}
              {...listeners}
            >
              <GripVertical />
            </Button>
            <h2 className="truncate font-medium text-base leading-none">
              {column.title}
            </h2>
          </div>
          <p className="text-muted-foreground text-sm tabular-nums leading-none">
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
          </p>
        </div>
        <div className="-mr-2 flex items-center gap-0.5 text-muted-foreground">
          <Button
            aria-label={`Add task to ${column.title}`}
            size="icon-sm"
            variant="ghost"
          >
            <Plus />
          </Button>
          <Button
            aria-label={`${column.title} column actions`}
            size="icon-sm"
            variant="ghost"
          >
            <MoreVertical />
          </Button>
        </div>
      </div>

      <SortableContext
        items={tasks.map((task) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3 [scrollbar-color:var(--border)_transparent] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1">
          {tasks.map((task) => (
            <SortableTaskCard columnId={column.id} key={task.id} task={task} />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}
