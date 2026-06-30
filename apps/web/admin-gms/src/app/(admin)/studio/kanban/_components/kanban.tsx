"use client";

import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Button } from "@grenmet/ui/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@grenmet/ui/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@grenmet/ui/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@grenmet/ui/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@grenmet/ui/components/ui/tabs";
import {
  ArrowUpDown,
  Bot,
  ChevronDown,
  Kanban as KanbanIcon,
  LayoutTemplate,
  List,
  Plus,
  Search,
  SlidersHorizontal,
  Table2,
  Upload,
} from "lucide-react";
import * as React from "react";

import { columnIds, columns } from "./data";
import { KanbanColumn } from "./kanban-column";
import { TaskCard } from "./task-card";
import type { BoardState, ColumnId, Task } from "./types";
import { findColumnId, findTask } from "./utils";

interface KanbanProps {
  initialBoard: BoardState;
}

export function Kanban({ initialBoard }: KanbanProps) {
  const [board, setBoard] = React.useState<BoardState>(initialBoard);
  const [columnOrder, setColumnOrder] = React.useState<ColumnId[]>(columnIds);
  const [activeTask, setActiveTask] = React.useState<Task | null>(null);
  const [activeColumnId, setActiveColumnId] = React.useState<ColumnId | null>(
    null
  );
  const boardBeforeDrag = React.useRef<BoardState | null>(null);
  const orderedColumns = columnOrder.flatMap(
    (columnId) => columns.find((column) => column.id === columnId) ?? []
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart(event: DragStartEvent) {
    if (event.active.data.current?.type === "column") return;

    boardBeforeDrag.current = board;
    const task = findTask(board, String(event.active.id));
    setActiveTask(task ?? null);
    setActiveColumnId(findColumnId(board, String(event.active.id)) ?? null);
  }

  function handleDragCancel() {
    if (boardBeforeDrag.current) {
      setBoard(boardBeforeDrag.current);
    }
    boardBeforeDrag.current = null;
    setActiveTask(null);
    setActiveColumnId(null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    if (active.data.current?.type === "column") return;

    const activeId = String(active.id);
    const overId = String(over.id);

    setBoard((currentBoard) => {
      const activeColId = findColumnId(currentBoard, activeId);
      const overColId = findColumnId(currentBoard, overId);

      if (overColId) setActiveColumnId(overColId);

      if (!(activeColId && overColId) || activeColId === overColId)
        return currentBoard;

      const activeItems = currentBoard[activeColId];
      const overItems = currentBoard[overColId];
      const activeIndex = activeItems.findIndex((task) => task.id === activeId);
      if (activeIndex === -1) return currentBoard;

      const overIndex = overItems.findIndex((task) => task.id === overId);
      const nextIndex = overIndex >= 0 ? overIndex : overItems.length;
      const activeItem = activeItems[activeIndex];

      return {
        ...currentBoard,
        [activeColId]: activeItems.filter((task) => task.id !== activeId),
        [overColId]: [
          ...overItems.slice(0, nextIndex),
          activeItem,
          ...overItems.slice(nextIndex),
        ],
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const activeType = active.data.current?.type;
    const snapshot = boardBeforeDrag.current;
    boardBeforeDrag.current = null;
    setActiveTask(null);
    setActiveColumnId(null);

    if (activeType === "column") {
      if (!over) return;

      const activeColumnId = String(active.id) as ColumnId;
      const overColumnId = findColumnId(board, String(over.id));
      if (!overColumnId || activeColumnId === overColumnId) return;

      setColumnOrder((currentOrder) => {
        const activeIndex = currentOrder.indexOf(activeColumnId);
        const overIndex = currentOrder.indexOf(overColumnId);
        if (activeIndex === -1 || overIndex === -1) return currentOrder;
        return arrayMove(currentOrder, activeIndex, overIndex);
      });
      return;
    }

    if (!over) {
      if (snapshot) setBoard(snapshot);
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    setBoard((currentBoard) => {
      const activeColumnId = findColumnId(currentBoard, activeId);
      const overColumnId = findColumnId(currentBoard, overId);
      if (!(activeColumnId && overColumnId) || activeColumnId !== overColumnId)
        return currentBoard;

      const columnTasks = currentBoard[activeColumnId];
      const activeIndex = columnTasks.findIndex((task) => task.id === activeId);
      const overIndex = columnTasks.findIndex((task) => task.id === overId);
      if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex)
        return currentBoard;

      return {
        ...currentBoard,
        [activeColumnId]: arrayMove(columnTasks, activeIndex, overIndex),
      };
    });
  }

  return (
    <div className="flex h-[calc(100dvh-var(--dashboard-header-height))] min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <Tabs className="min-w-0" defaultValue="board">
          <TabsList className="w-full *:data-[slot=tabs-trigger]:flex-1 sm:w-fit sm:*:data-[slot=tabs-trigger]:flex-none">
            <TabsTrigger className="gap-2" value="board">
              <KanbanIcon />
              Board
            </TabsTrigger>
            <TabsTrigger className="gap-2" value="list">
              <List />
              List
            </TabsTrigger>
            <TabsTrigger className="gap-2" value="table">
              <Table2 />
              Table
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center 2xl:justify-end">
          <InputGroup className="min-w-0 sm:w-64 2xl:w-48">
            <InputGroupInput placeholder="Search tasks" type="search" />
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
          </InputGroup>
          <Button className="w-full sm:w-auto" variant="outline">
            <SlidersHorizontal data-icon="inline-start" />
            Filter
          </Button>
          <Button className="w-full sm:w-auto" variant="outline">
            <ArrowUpDown data-icon="inline-start" />
            Sort
          </Button>
          <ButtonGroup className="w-full sm:w-fit">
            <Button className="flex-1 sm:flex-none">
              <Plus data-icon="inline-start" />
              Add task
            </Button>
            <ButtonGroupSeparator />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button aria-label="Open add task menu" />}
              >
                <ChevronDown />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem>
                  <Upload />
                  Import CSV
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <LayoutTemplate />
                  Add from template
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Bot />
                  Create automation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
        </div>
      </div>

      <DndContext
        collisionDetection={closestCorners}
        id="kanban-board"
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <div className="scrollbar-thin min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden bg-muted/25 px-4 pt-4 pb-0 [scrollbar-color:var(--border)_transparent] lg:px-5 lg:pt-5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:h-1">
          <div className="inline-grid h-full min-w-full grid-cols-[repeat(5,minmax(20rem,1fr))] gap-4">
            <SortableContext
              items={columnOrder}
              strategy={horizontalListSortingStrategy}
            >
              {orderedColumns.map((column) => (
                <KanbanColumn
                  column={column}
                  key={column.id}
                  tasks={board[column.id]}
                />
              ))}
            </SortableContext>
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <TaskCard
              columnId={activeColumnId ?? undefined}
              isOverlay
              task={activeTask}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
