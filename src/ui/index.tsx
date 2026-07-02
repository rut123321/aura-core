import { useState } from "react";
import { render, Box, Text, useInput } from "ink";
import pc from "picocolors";

const VERSION = "2.1.0";

export function Banner({
  model,
  provider,
  reasoning,
}: {
  model?: string;
  provider?: string;
  reasoning?: string;
}) {
  const info: string[] = [];
  if (model) info.push(pc.bold(model));
  if (provider) info.push(provider);
  if (reasoning) info.push(reasoning);
  const infoLine = info.length > 0 ? `  ${info.join(" | ")}` : "";
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="cyan" bold>
        {"  AURA CORE"}
      </Text>
      <Text dimColor>
        {"  autonomous ai coding agent  v" + VERSION}
      </Text>
      <Text dimColor>{"  github.com/rut123321/aura-core"}</Text>
      {infoLine && (
        <Text dimColor>{infoLine}</Text>
      )}
    </Box>
  );
}

interface PromptResult {
  value: string;
  cancelled: boolean;
}

export function showPrompt(placeholder?: string): Promise<PromptResult> {
  return new Promise((resolve) => {
    function Prompt() {
      const [val, setVal] = useState("");

      useInput((input, key) => {
        if (key.return) {
          resolve({ value: val, cancelled: false });
          return;
        }
        if (key.escape || (key.ctrl && input === "c")) {
          resolve({ value: "", cancelled: true });
          return;
        }
        if (key.delete || key.backspace) {
          setVal((p: string) => p.slice(0, -1));
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setVal((p: string) => p + input);
        }
      });

      const display = val || (placeholder ? pc.dim(placeholder) : "");
      return (
        <Box>
          <Text bold color="cyan">{">"}</Text>
          <Text> </Text>
          <Text>{display}</Text>
        </Box>
      );
    }

    render(<Prompt />);
  });
}
