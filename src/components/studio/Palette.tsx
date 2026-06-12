"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CATEGORIES, CATEGORY_ORDER, SERVICES, type ServiceDef } from "@/lib/catalog";
import { useDesignStore } from "@/lib/store";
import { DND_MIME } from "./Canvas";

function PaletteItem({ svc }: { svc: ServiceDef }) {
  const addNodes = useDesignStore((s) => s.addNodes);
  const cat = CATEGORIES[svc.category];
  const Icon = svc.icon;
  return (
    <button
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_MIME, svc.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onDoubleClick={() => addNodes([{ serviceId: svc.id }])}
      className="group flex w-full cursor-grab items-center gap-2.5 border-l-2 border-transparent px-3 py-[7px] text-left transition-colors hover:border-l-current hover:bg-raised active:cursor-grabbing"
      style={{ color: cat.color }}
      title={`${svc.blurb}\nDrag onto the canvas, or double-click to add.`}
    >
      <Icon size={15} strokeWidth={1.6} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-dim transition-colors group-hover:text-fg">
        {svc.name}
      </span>
      {svc.zone && (
        <span className="rounded-[2px] border border-line px-1 font-mono text-[8px] tracking-[0.1em] text-fg-faint">
          ZONE
        </span>
      )}
    </button>
  );
}

export default function Palette() {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATEGORY_ORDER.map((cat) => ({
      cat,
      items: SERVICES.filter(
        (s) =>
          s.category === cat &&
          (!q || s.name.toLowerCase().includes(q) || s.id.includes(q) || s.blurb.toLowerCase().includes(q)),
      ),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
      <div className="border-b border-line p-3">
        <p className="u-label mb-2">Components</p>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-faint" />
          <input
            className="u-input !pl-8 font-mono !text-[12px]"
            placeholder="search services…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {groups.length === 0 && (
          <p className="px-3 py-4 font-mono text-[11px] text-fg-faint">
            no match for “{query}”
          </p>
        )}
        {groups.map(({ cat, items }) => (
          <section key={cat} className="mb-3">
            <div className="flex items-center gap-2 px-3 pb-1.5">
              <span
                className="font-mono text-[9px] uppercase tracking-[0.16em]"
                style={{ color: CATEGORIES[cat].color }}
              >
                {CATEGORIES[cat].label}
              </span>
              <span className="h-px flex-1 bg-line" />
              <span className="font-mono text-[9px] text-fg-faint">{items.length}</span>
            </div>
            {items.map((svc) => (
              <PaletteItem key={svc.id} svc={svc} />
            ))}
          </section>
        ))}
      </div>

      <div className="border-t border-line px-3 py-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg-faint">
          {SERVICES.length} services · AWS · more soon
        </p>
      </div>
    </aside>
  );
}
