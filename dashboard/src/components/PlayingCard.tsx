type PlayingCardProps = {
  cardCode?: string | null;
  faceDown?: boolean;
  className?: string;
};

const SUIT_MAP: Record<string, string> = {
  s: "s",
  h: "h",
  d: "d",
  c: "c",
  "♠": "s",
  "♥": "h",
  "♦": "d",
  "♣": "c",
};

function toCardmeisterCid(cardCode?: string | null): string | null {
  if (!cardCode) return null;

  const code = cardCode.trim();
  if (code.length < 2) return null;

  const suitRaw = code.slice(-1);
  const suit = SUIT_MAP[suitRaw.toLowerCase()] ?? SUIT_MAP[suitRaw];
  if (!suit) return null;

  const rankRaw = code.slice(0, -1).toUpperCase();
  const rank = rankRaw === "10" ? "T" : rankRaw;
  const validRank = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
  if (!validRank.includes(rank)) return null;

  return `${rank}${suit}`;
}

export function PlayingCard({ cardCode, faceDown = false, className }: PlayingCardProps) {
  const cid = toCardmeisterCid(cardCode);
  const showBack = faceDown || !cid;

  return (
    <playing-card
      className={className}
      cid={showBack ? "00" : cid!}
      rank={showBack ? "0" : undefined}
      backcolor={showBack ? "#1d4a2d" : undefined}
      backtext={showBack ? "$10" : undefined}
      backtextcolor={showBack ? "#d9eadc" : undefined}
      draggable="false"
    />
  );
}
