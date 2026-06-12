import { createElement } from "react";
import {
  Bean,
  Carrot,
  Egg,
  Fish,
  Leaf,
  Milk,
  Nut,
  Shell,
  Shrimp,
  Sprout,
  TriangleAlert,
  Wheat,
  Wine,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "./primitives";

const ALLERGEN_DISPLAY: Record<string, string> = {
  peanut: "peanuts",
  egg: "eggs",
};

// Standard menu-style allergen iconography. Keys are matched against a
// normalized (lowercased) allergen name so that data variants
// like "soy"/"soya" resolve to the same icon.
const ALLERGEN_ICONS: Array<{ match: RegExp; icon: LucideIcon }> = [
  { match: /peanut/, icon: Nut },
  { match: /tree ?nut|^nut/, icon: Nut },
  { match: /milk|dairy|lactose/, icon: Milk },
  { match: /egg/, icon: Egg },
  { match: /gluten|wheat|cereal|barley|rye|oat/, icon: Wheat },
  { match: /soy|soya/, icon: Bean },
  { match: /sesame|seed/, icon: Sprout },
  { match: /shellfish|crustacean|prawn|shrimp/, icon: Shrimp },
  { match: /mollusc|mussel|oyster|clam|squid/, icon: Shell },
  { match: /fish/, icon: Fish },
  { match: /celery/, icon: Carrot },
  { match: /mustard|lupin/, icon: Leaf },
  { match: /sulphite|sulfite/, icon: Wine },
];

function allergenIcon(allergen: string): LucideIcon {
  const normalized = allergen.trim().toLowerCase();
  return ALLERGEN_ICONS.find((entry) => entry.match.test(normalized))?.icon ?? TriangleAlert;
}

/**
 * Renders an allergen as an unambiguous "Contains X" tag with standard menu
 * iconography. The "Contains" prefix prevents the meaning from being inverted
 * (e.g. a bare "egg" tag being read as "no egg").
 */
export function AllergenTag({ allergen, className = "" }: { allergen: string; className?: string }) {
  const icon = allergenIcon(allergen);
  const display = ALLERGEN_DISPLAY[allergen.trim().toLowerCase()] ?? allergen;
  return (
    <Badge tone="rose" className={className}>
      {createElement(icon, { size: 13, className: "mr-1 shrink-0", "aria-hidden": true })}
      Contains {display}
    </Badge>
  );
}
