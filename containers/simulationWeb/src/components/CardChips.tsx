import { parseCard } from "../sim/cards";

const SUITS: Record<string, { glyph: string; color: string }> = {
  s: { glyph: "♠", color: "text-slate-800 dark:text-slate-200" },
  c: { glyph: "♣", color: "text-slate-800 dark:text-slate-200" },
  h: { glyph: "♥", color: "text-red-600 dark:text-red-400" },
  d: { glyph: "♦", color: "text-red-600 dark:text-red-400" },
};

/** A hand or board rendered as small playing-card chips. */
export default function CardChips({ cards }: { cards: readonly string[] }) {
  if (cards.length === 0) {
    return <span className="text-slate-400 dark:text-slate-500">—</span>;
  }
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {cards.map((card, i) => (
        <Chip key={`${card}-${i}`} raw={card} />
      ))}
    </span>
  );
}

function Chip({ raw }: { raw: string }) {
  let card: string;
  try {
    card = parseCard(raw);
  } catch {
    card = raw; // Unparseable input still renders, just without suit styling.
  }
  const suit = SUITS[card.slice(-1)];
  if (!suit) return <span className="font-mono text-sm">{raw}</span>;
  const rank = card.slice(0, -1);
  return (
    <span
      className={
        "inline-flex min-w-8 items-center justify-center rounded-md bg-white px-1.5 py-0.5 " +
        `font-mono text-sm font-semibold shadow-sm ring-1 ring-slate-300 dark:bg-(--input-background) dark:ring-slate-600 ${suit.color}`
      }
    >
      {rank === "T" ? "10" : rank}
      {suit.glyph}
    </span>
  );
}
