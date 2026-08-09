import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

const GRID_CLASS_NAME = "grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
const VIRTUALIZE_ABOVE = 40;
const DEFAULT_ROW_ESTIMATE = 360;

type VirtualizedCardGridProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  estimateRowHeight?: number;
  virtualizeAbove?: number;
};

export function VirtualizedCardGrid<T>({
  items,
  getKey,
  renderItem,
  estimateRowHeight = DEFAULT_ROW_ESTIMATE,
  virtualizeAbove = VIRTUALIZE_ABOVE,
}: VirtualizedCardGridProps<T>) {
  const columns = useGridColumnCount();

  if (items.length <= virtualizeAbove) {
    return (
      <div className={GRID_CLASS_NAME}>
        {items.map((item) => (
          <div key={getKey(item)}>{renderItem(item)}</div>
        ))}
      </div>
    );
  }

  return (
    <WindowVirtualizedGrid
      columns={columns}
      estimateRowHeight={estimateRowHeight}
      getKey={getKey}
      items={items}
      renderItem={renderItem}
    />
  );
}

function WindowVirtualizedGrid<T>({
  columns,
  estimateRowHeight,
  getKey,
  items,
  renderItem,
}: {
  columns: number;
  estimateRowHeight: number;
  getKey: (item: T) => string;
  items: T[];
  renderItem: (item: T) => ReactNode;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const rowCount = Math.ceil(items.length / columns);

  useLayoutEffect(() => {
    const updateMargin = () => {
      setScrollMargin(listRef.current?.offsetTop ?? 0);
    };

    updateMargin();
    window.addEventListener("resize", updateMargin);
    return () => window.removeEventListener("resize", updateMargin);
  }, [items.length, columns]);

  const rowVirtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => estimateRowHeight,
    overscan: 4,
    scrollMargin,
  });

  return (
    <div
      aria-rowcount={rowCount}
      className="relative w-full"
      ref={listRef}
      role="grid"
      style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
    >
      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const startIndex = virtualRow.index * columns;
        const rowItems = items.slice(startIndex, startIndex + columns);

        return (
          <div
            className={GRID_CLASS_NAME}
            data-index={virtualRow.index}
            key={virtualRow.key}
            ref={rowVirtualizer.measureElement}
            role="row"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start - scrollMargin}px)`,
            }}
          >
            {rowItems.map((item) => (
              <div key={getKey(item)} role="gridcell">
                {renderItem(item)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function useGridColumnCount() {
  const [columns, setColumns] = useState(getColumnCount);

  useEffect(() => {
    const update = () => setColumns(getColumnCount());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return columns;
}

function getColumnCount() {
  if (typeof window === "undefined") {
    return 1;
  }

  const width = window.innerWidth;

  if (width >= 1280) {
    return 5;
  }

  if (width >= 1024) {
    return 4;
  }

  if (width >= 768) {
    return 3;
  }

  if (width >= 640) {
    return 2;
  }

  return 1;
}
