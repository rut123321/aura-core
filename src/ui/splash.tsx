import { useEffect, useState } from "react";
import { render, Box, Text, useInput } from "ink";

const VERSION = "2.1.0";

const FRAMES = ["◰", "◳", "◲", "◱"];
const BRAND = [
  { text: "╔═", color: "cyan" },
  { text: "AURA", color: "magenta" },
  { text: "═", color: "cyan" },
  { text: "CORE", color: "magenta" },
  { text: "═╗", color: "cyan" },
];

function SplashInner({ onDone }: { onDone: () => void }) {
  const [frame, setFrame] = useState(0);
  const [phase, setPhase] = useState<"boot" | "ready" | "exit">("boot");

  useInput(() => {
    setPhase("exit");
    onDone();
  });

  useEffect(() => {
    if (phase === "exit") return;
    const t1 = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 120);
    const t2 = setTimeout(() => {
      setPhase("ready");
    }, 1200);
    const t3 = setTimeout(() => {
      setPhase("exit");
      onDone();
    }, 2200);
    return () => {
      clearInterval(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [phase, onDone]);

  return (
    <Box flexDirection="column" alignItems="center" marginTop={2}>
      {/* Top border */}
      <Text color="cyan">╔══════════════════════════════════╗</Text>

      {/* Brand line */}
      <Box>
        {BRAND.map((p, i) => (
          <Text key={i} color={p.color as any} bold={p.text === "AURA" || p.text === "CORE"}>
            {p.text}
          </Text>
        ))}
      </Box>

      {/* Tagline */}
      <Text dimColor>  autonomous AI coding agent</Text>
      <Text dimColor>  v{VERSION}</Text>
      <Text dimColor>  github.com/rut123321/aura-core</Text>

      {/* Spinner area */}
      <Box marginTop={1}>
        {phase === "boot" ? (
          <Box>
            <Text color="cyan">{FRAMES[frame]}</Text>
            <Text> </Text>
            <Text dimColor>initializing...</Text>
          </Box>
        ) : (
          <Box>
            <Text color="green">●</Text>
            <Text> </Text>
            <Text dimColor>ready</Text>
          </Box>
        )}
      </Box>

      {/* Bottom border */}
      <Text color="cyan">╚══════════════════════════════════╝</Text>

      <Box marginTop={1}>
        <Text dimColor>press any key to continue</Text>
      </Box>
    </Box>
  );
}

export function showSplash(): Promise<void> {
  return new Promise((resolve) => {
    const { waitUntilExit } = render(<SplashInner onDone={resolve} />);
    waitUntilExit().then(() => resolve());
  });
}
