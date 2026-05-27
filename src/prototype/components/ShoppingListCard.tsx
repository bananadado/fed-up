import { ClipboardCheck, ClipboardList, ExternalLink, ShoppingBasket } from "lucide-react";
import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { AppButton } from "./primitives";
import type { ShoppingItem } from "../shopping";
import { buildTescoSearchUrl } from "../shopping";

export function ShoppingListCard({
  title,
  description,
  items,
  compact = false,
}: {
  title: string;
  description: string;
  items: ShoppingItem[];
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const shoppingUrl = useMemo(() => buildTescoSearchUrl(items), [items]);
  const listText = useMemo(() => items.map((item) => item.name).join("\n"), [items]);

  async function copyList() {
    if (!navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(listText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Card className="gap-0 rounded-lg border-stone-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
          <ShoppingBasket size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="font-bold">{title}</h2>
          <p className="mt-1 text-sm text-stone-500">{description}</p>
        </div>
      </div>

      <div className={compact ? "mt-4 flex flex-wrap gap-2" : "mt-4 grid gap-2"}>
        {items.map((item) => (
          <span key={item.name} className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700">
            {item.name}
            {item.count > 1 && <span className="ml-1 text-xs font-semibold text-stone-500">x{item.count}</span>}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <AppButton asChild className="justify-center">
          <a href={shoppingUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={16} /> Open in Tesco
          </a>
        </AppButton>
        <AppButton type="button" variant="secondary" onClick={copyList}>
          {copied ? <ClipboardCheck size={16} /> : <ClipboardList size={16} />}
          {copied ? "Copied" : "Copy list"}
        </AppButton>
      </div>
    </Card>
  );
}
