import { motion } from "framer-motion";
import { PlayingCard } from "./PlayingCard";

export function CommunityCards({ cards }: { cards: string[] }) {
  const slots = [0, 1, 2, 3, 4];
  return (
    <div className="flex gap-3.5">
      {slots.map((i) => {
        const c = cards[i];
        return (
          <motion.div
            key={`${i}-${c ?? "back"}`}
            className="h-[96px] w-[68px] md:h-[110px] md:w-[78px] [transform-style:preserve-3d]"
            initial={c ? { rotateY: 90, opacity: 0.85 } : false}
            animate={{ rotateY: 0, opacity: 1 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <PlayingCard cardCode={c} faceDown={!c} className="h-full w-full" />
          </motion.div>
        );
      })}
    </div>
  );
}
