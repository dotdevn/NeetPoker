import { motion } from "framer-motion";

export function PotDisplay({ pot }: { pot: number }) {
  return (
    <motion.div
      className="mt-3 font-mono text-3xl text-pot"
      key={pot}
      initial={{ scale: 1.05 }}
      animate={{ scale: 1 }}
    >
      POT ${pot.toFixed(2)} USDC
    </motion.div>
  );
}
