import { useEffect, useRef, useState } from "react";
import type { GameStatePayload } from "../types";
import { AgentSeat } from "./AgentSeat";
import { CommunityCards } from "./CommunityCards";
import { PotDisplay } from "./PotDisplay";

const SEAT_ANGLES = [-90, -30, 30, 90, 150, 210];

function seatPosition(index: number, radiusX: number, radiusY: number) {
  const angle = (SEAT_ANGLES[index % SEAT_ANGLES.length] * Math.PI) / 180;
  return {
    left: 50 + radiusX * Math.cos(angle),
    top: 50 + radiusY * Math.sin(angle),
  };
}

export function PokerTable({
  gameState,
  latestActions,
}: {
  gameState: GameStatePayload | null;
  latestActions: Record<string, { action: string; amount: number | null; timestamp: number }>;
}) {
  const tableBoundsRef = useRef<HTMLDivElement | null>(null);
  const [seatLayout, setSeatLayout] = useState({ radiusX: 44, radiusY: 36, scale: 1 });

  useEffect(() => {
    const node = tableBoundsRef.current;
    if (!node) return;

    const updateSeatLayout = () => {
      const { width, height } = node.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;

      // Keep all 6 seats fully visible even when the viewport is short.
      const scale = Math.max(0.72, Math.min(1, width / 1100, height / 640));
      const radiusX = 40 + 4 * scale;
      const radiusY = 28 + 8 * scale;

      setSeatLayout((current) => {
        if (
          Math.abs(current.scale - scale) < 0.01 &&
          Math.abs(current.radiusX - radiusX) < 0.2 &&
          Math.abs(current.radiusY - radiusY) < 0.2
        ) {
          return current;
        }
        return { scale, radiusX, radiusY };
      });
    };

    updateSeatLayout();

    const observer = new ResizeObserver(updateSeatLayout);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const stacks = gameState?.stacks ?? {};
  const pot = gameState?.pot ?? 0;
  const community = gameState?.communityCards ?? [];
  const players = gameState?.players ?? {};
  const seatOrder =
    gameState?.seatOrder ??
    (Object.keys(players).length > 0 ? Object.keys(players) : gameState?.activeOrder ?? []);
  const roundStarterId =
    gameState?.smallBlindId ??
    (Array.isArray(gameState?.activeOrder) && gameState.activeOrder.length > 0
      ? gameState.activeOrder[0]
      : null);
  const revealCards = true;

  return (
    <div className="relative h-full w-full overflow-hidden bg-felt/80 p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06)_0%,rgba(0,0,0,0)_60%)]" />
      <div
        className="pointer-events-none absolute inset-4 rounded-[50%] border-2 border-[#0d3d24] shadow-[inset_0_0_100px_rgba(0,0,0,0.45)]"
        style={{ clipPath: "ellipse(50% 44% at 50% 50%)" }}
      />
      <div ref={tableBoundsRef} className="relative mx-auto h-full w-full max-w-5xl">
        <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
          <CommunityCards cards={community} />
          <PotDisplay pot={pot} />
        </div>
        {seatOrder.map((id, index) => {
          const pos = seatPosition(index, seatLayout.radiusX, seatLayout.radiusY);
          const player = players[id];
          return (
            <div
              key={id}
              className="absolute"
              style={{
                left: `${pos.left}%`,
                top: `${pos.top}%`,
                transform: `translate(-50%, -50%) scale(${seatLayout.scale})`,
                transformOrigin: "center center",
              }}
            >
              <AgentSeat
                agentId={id}
                stack={player?.stack ?? stacks[id] ?? 10}
                folded={player?.folded ?? false}
                holeCards={player?.holeCards ?? []}
                revealCards={revealCards}
                isRoundStarter={id === roundStarterId}
                latestAction={latestActions[id]}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
