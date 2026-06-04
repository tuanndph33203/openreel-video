import * as React from "react";
import { cn } from "@openreel/ui/lib/utils";
import type { InspectorTabDef, InspectorTabId } from "../clip-tabs.config";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface InspectorTabsProps {
  tabs: InspectorTabDef[];
  activeId: InspectorTabId;
  onSelect: (id: InspectorTabId) => void;
}

export const InspectorTabs: React.FC<InspectorTabsProps> = ({ tabs, activeId, onSelect }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [showLeftScroll, setShowLeftScroll] = React.useState(false);
  const [showRightScroll, setShowRightScroll] = React.useState(false);

  const checkScroll = React.useCallback(() => {
    const el = containerRef.current;
    if (el) {
      const showLeft = el.scrollLeft > 2;
      const showRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 2;
      setShowLeftScroll(showLeft);
      setShowRightScroll(showRight);
    }
  }, []);

  React.useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.addEventListener("scroll", checkScroll);
      window.addEventListener("resize", checkScroll);
      
      // Check scroll once rendering is complete
      const timer = setTimeout(checkScroll, 100);
      return () => {
        el.removeEventListener("scroll", checkScroll);
        window.removeEventListener("resize", checkScroll);
        clearTimeout(timer);
      };
    }
  }, [tabs, checkScroll]);

  // Check scroll when activeId changes to ensure the active tab is scrolled into view
  React.useEffect(() => {
    const el = containerRef.current;
    if (el) {
      const activeBtn = el.querySelector('[aria-selected="true"]');
      if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
      setTimeout(checkScroll, 300);
    }
  }, [activeId, checkScroll]);

  const scroll = (direction: "left" | "right") => {
    const el = containerRef.current;
    if (el) {
      const scrollAmount = el.clientWidth / 2;
      el.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    if (next) onSelect(next.id);
  };

  return (
    <div className="relative border-b border-border flex items-center bg-bg-1 w-full min-w-0">
      {showLeftScroll && (
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-0 bottom-0 px-1 bg-gradient-to-r from-bg-1 via-bg-1/90 to-transparent text-fg-3 hover:text-fg z-10 flex items-center justify-center transition-colors"
          title="Scroll tabs left"
        >
          <ChevronLeft size={14} />
        </button>
      )}
      <div
        ref={containerRef}
        role="tablist"
        aria-label="Inspector tabs"
        className="flex-1 flex items-center gap-0.5 px-2 overflow-x-auto scrollbar-none shrink-0 scroll-smooth w-full"
      >
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          const active = tab.id === activeId;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-2 text-[12px] font-medium whitespace-nowrap transition-colors border-b-2 -mb-px",
                active
                  ? "text-accent border-accent"
                  : "text-fg-3 border-transparent hover:text-fg",
              )}
            >
              <Icon size={13} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
      {showRightScroll && (
        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-0 bottom-0 px-1 bg-gradient-to-l from-bg-1 via-bg-1/90 to-transparent text-fg-3 hover:text-fg z-10 flex items-center justify-center transition-colors"
          title="Scroll tabs right"
        >
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
};
