import pc from "picocolors";
import Table from "cli-table3";

export interface TokenPlan {
  id: "plus" | "max" | "ultra";
  name: string;
  pricePerMonth: number;
  estimatedTokens: string;
  agents: string;
  bestFor: string;
}

export const MINIMAX_TOKEN_PLANS: TokenPlan[] = [
  {
    id: "plus",
    name: "Plus",
    pricePerMonth: 20,
    estimatedTokens: "~12.5B tokens/month",
    agents: "3-4 agents",
    bestFor: "Personal projects and prototyping",
  },
  {
    id: "max",
    name: "Max",
    pricePerMonth: 50,
    estimatedTokens: "~30B tokens/month",
    agents: "4-5 agents",
    bestFor: "Daily coding with agents and multimodal work",
  },
  {
    id: "ultra",
    name: "Ultra",
    pricePerMonth: 120,
    estimatedTokens: "Unlimited (heavy workloads)",
    agents: "6-7 agents",
    bestFor: "Heavy Agent workflows and extended sessions",
  },
];

export interface CreditPackage {
  price: number;
  credits: number;
}

export const MINIMAX_CREDIT_PACKAGES: CreditPackage[] = [
  { price: 5, credits: 5000 },
  { price: 25, credits: 25000 },
  { price: 100, credits: 100000 },
];

const SUITE_URL = "https://platform.minimax.io";
const DOCS_URL = "https://platform.minimax.io/docs/token-plan/quickstart";

export function printTokenPlans(): void {
  const t = new Table({
    style: { head: ["cyan"], border: ["gray"] },
    chars: { "top": "─", "top-mid": "┬", "top-left": "┌", "top-right": "┐",
             "bottom": "─", "bottom-mid": "┴", "bottom-left": "└", "bottom-right": "┘",
             "left": "│", "left-mid": "├", "mid": "─", "mid-mid": "┼",
             "right": "│", "right-mid": "┤" },
    colWidths: [12, 18, 22, 36],
  });
  t.push([pc.bold("Plan"), pc.bold("Price"), pc.bold("Tokens"), pc.bold("Best for")]);
  for (const plan of MINIMAX_TOKEN_PLANS) {
    const c = plan.id === "plus" ? pc.cyan : plan.id === "max" ? pc.magenta : pc.red;
    t.push([c(plan.name), pc.bold("$" + plan.pricePerMonth + "/month"), pc.dim(plan.estimatedTokens), pc.dim(plan.bestFor)]);
  }
  console.log();
  console.log(`  ${pc.bold("MiniMax Token Plans")}`);
  console.log(t.toString());

  const ct = new Table({
    style: { head: ["cyan"], border: ["gray"] },
    chars: { "top": "─", "top-mid": "┬", "top-left": "┌", "top-right": "┐",
             "bottom": "─", "bottom-mid": "┴", "bottom-left": "└", "bottom-right": "┘",
             "left": "│", "left-mid": "├", "mid": "─", "mid-mid": "┼",
             "right": "│", "right-mid": "┤" },
    colWidths: [14, 20],
  });
  ct.push([pc.bold("Price"), pc.bold("Credits")]);
  for (const pkg of MINIMAX_CREDIT_PACKAGES) {
    ct.push(["$" + pkg.price, pkg.credits.toLocaleString() + " credits"]);
  }
  console.log(`  ${pc.bold("Credit Packages")} ${pc.dim("(1,000 credits = $1)")}`);
  console.log(ct.toString());

  console.log(`  ${pc.dim("\u2192 Subscribe:")} ${pc.cyan(SUITE_URL + "/subscribe/token-plan")}`);
  console.log(`  ${pc.dim("\u2192 Docs:    ")} ${pc.cyan(DOCS_URL)}`);
  console.log();
}

export async function checkSubscriptionKey(envKey: string | null): Promise<{ valid: boolean; message: string }> {
  if (!envKey) {
    return { valid: false, message: "MINIMAX_API_KEY not set. Get one at platform.minimax.io" };
  }
  if (envKey.length < 20) {
    return { valid: false, message: "API key too short — check it at platform.minimax.io/user-center/payment/token-plan" };
  }
  return { valid: true, message: "Subscription key format looks valid" };
}

export function getSetupInstructions(): string[] {
  return [
    "1. Visit https://platform.minimax.io and sign in",
    "2. Go to User Center > Payment > Token Plan",
    "3. Copy your Subscription Key (NOT a pay-as-you-go key)",
    "4. Subscribe to Plus ($20), Max ($50), or Ultra ($120) plan",
    "5. Set MINIMAX_API_KEY environment variable",
    "6. Run: aura -p MiniMax -m MiniMax-M3 \"Hello world\"",
  ];
}

export const MINIMAX_SETUP_URL = "https://platform.minimax.io/subscribe/token-plan";
export const MINIMAX_DASHBOARD_URL = "https://platform.minimax.io/user-center/payment/token-plan";
export const MINIMAX_DOCS_URL = DOCS_URL;
