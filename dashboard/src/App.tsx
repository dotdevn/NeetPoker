import * as React from "react";
import { motion } from "framer-motion";
import { SensoryUIProvider } from "@/components/ui/sensory-ui/config/provider";
import { useGameSocket } from "./hooks/useGameSocket";
import { StatsBar } from "./components/StatsBar";
import { PokerTable } from "./components/PokerTable";
import { TransactionFeed } from "./components/TransactionFeed";
import { EventLog } from "./components/EventLog";
import { HandHistoryPanel } from "./components/HandHistoryPanel";
import { API_URL, withGameAdminAuth } from "./api";

export default function App() {
  const socket = useGameSocket();
  const [loopRunning, setLoopRunning] = React.useState(false);
  const [turboMode, setTurboMode] = React.useState(false);
  const [selectedHandNumber, setSelectedHandNumber] = React.useState<number | null>(null);
  const previousCurrentHandRef = React.useRef<number | null>(null);

  const running = loopRunning || socket.loopRunning;

  React.useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`${API_URL}/game/status`);
        const j = (await r.json()) as { running?: boolean };
        if (!cancelled && typeof j.running === "boolean") setLoopRunning(j.running);
      } catch {
        /* ignore */
      }
    };
    void poll();
    const id = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  React.useEffect(() => {
    if (socket.handHistory.length === 0) {
      setSelectedHandNumber(null);
      previousCurrentHandRef.current = socket.currentHandNumber;
      return;
    }
    if (
      socket.currentHandNumber != null &&
      socket.currentHandNumber !== previousCurrentHandRef.current
    ) {
      previousCurrentHandRef.current = socket.currentHandNumber;
      setSelectedHandNumber(socket.currentHandNumber);
      return;
    }
    setSelectedHandNumber((prev) => {
      if (prev != null && socket.handHistory.some((hand) => hand.handNumber === prev)) return prev;
      return socket.handHistory[0]?.handNumber ?? null;
    });
  }, [socket.handHistory, socket.currentHandNumber]);

  const selectedHand = React.useMemo(() => {
    if (socket.handHistory.length === 0) return null;
    return (
      socket.handHistory.find((hand) => hand.handNumber === selectedHandNumber) ?? socket.handHistory[0] ?? null
    );
  }, [socket.handHistory, selectedHandNumber]);

  const startGame = () => {
    void (async () => {
      try {
        const response = await fetch(
          `${API_URL}/game/start`,
          withGameAdminAuth({ method: "POST" }),
        );
        if (!response.ok) {
          console.error("Start failed:", response.status, response.statusText);
          setLoopRunning(false);
          return;
        }
        const body = (await response.json().catch(() => ({}))) as { ok?: boolean; started?: boolean };
        setLoopRunning(body.started === true);
      } catch (err) {
        console.error("Start fetch failed:", err);
        setLoopRunning(false);
      }
    })();
  };

  const stopGame = () => {
    setLoopRunning(false);
    void (async () => {
      try {
        const response = await fetch(`${API_URL}/game/stop`, withGameAdminAuth({ method: "POST" }));
        if (!response.ok) {
          // Revert visual state if failed
          setLoopRunning(true);
          console.error("Stop failed:", response.statusText);
        }
      } catch (err) {
        setLoopRunning(true);
        console.error("Stop fetch failed:", err);
      }
    })();
  };

  const toggleTurbo = () => {
    setTurboMode((previousMode) => {
      const nextMode = !previousMode;
      void fetch(
        `${API_URL}/game/speed`,
        withGameAdminAuth({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: nextMode ? "turbo" : "normal" }),
        }),
      );
      return nextMode;
    });
  };

  return (
    <SensoryUIProvider config={{ enabled: true, volume: 0.95, theme: "crisp" }}>
      <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-terminal text-white">
        <StatsBar
          hands={socket.handHistory}
          selectedHandNumber={selectedHandNumber}
          onSelectHand={setSelectedHandNumber}
          totalTransacted={socket.totalTransacted}
          live={socket.connected}
          loopRunning={running}
          gameState={socket.gameState}
          onStart={startGame}
          turboMode={turboMode}
          paymentMode={socket.paymentMode}
          onToggleTurbo={toggleTurbo}
          onStop={stopGame}
        />
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(360px,420px)] grid-rows-[minmax(0,1fr)_minmax(160px,24vh)] gap-2 overflow-hidden p-2">
          <div className="min-h-0 min-w-0 overflow-hidden rounded-lg border border-white/10">
            <PokerTable gameState={socket.gameState} latestActions={socket.latestActions} />
          </div>
          <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden">
            <div className="min-h-0 min-w-0 shrink-0 basis-[45%]">
              <TransactionFeed
                items={selectedHand?.transactions ?? []}
                handNumber={selectedHand?.handNumber ?? null}
              />
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <EventLog
                entries={selectedHand?.eventLog ?? []}
                handNumber={selectedHand?.handNumber ?? null}
              />
            </div>
          </div>
          <div className="col-span-2 flex min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-hidden">
              <HandHistoryPanel
                hands={socket.handHistory}
                selectedHandNumber={selectedHandNumber}
                onSelectHand={setSelectedHandNumber}
              />
            </div>
          </div>
        </div>
        {socket.tournamentWinner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 flex items-center justify-center bg-black/80 z-50"
          >
            <div className="text-2xl font-mono text-amber-400">Winner: {socket.tournamentWinner}</div>
          </motion.div>
        )}
      </div>
    </SensoryUIProvider>
  );
}
