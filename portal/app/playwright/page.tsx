import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, FileVideo, Bug, Globe, Smartphone, Network, Camera, Code2, Workflow, Database } from "lucide-react";

interface CliGuide {
  id: string;
  title: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
  examples: string[];
}

const GUIDES: CliGuide[] = [
  {
    id: "core-commands",
    title: "Core commands",
    blurb: "Open URLs, click, fill, navigate from a single Playwright CLI invocation.",
    icon: Terminal,
    examples: [
      "npx playwright open https://example.com",
      'npx playwright codegen --target=javascript https://example.com',
    ],
  },
  {
    id: "test-generation",
    title: "Test generation",
    blurb: "Auto-record interactions into a runnable .spec.ts via codegen.",
    icon: Code2,
    examples: ["npx playwright codegen --output tests/login.spec.ts https://staging.app/login"],
  },
  {
    id: "tracing-and-debugging",
    title: "Tracing & debugging",
    blurb: "Inspect traces, time-travel through a failed run.",
    icon: Bug,
    examples: ["npx playwright show-trace trace.zip", 'npx playwright test --trace on-first-retry'],
  },
  {
    id: "screenshots-and-media",
    title: "Screenshots & media",
    blurb: "Capture full-page screenshots and short videos for evidence.",
    icon: Camera,
    examples: ["npx playwright screenshot --full-page https://example.com out.png", "npx playwright video tests/recording"],
  },
  {
    id: "device-emulation",
    title: "Device emulation",
    blurb: "Run against iPhone/Pixel/iPad profiles, custom viewports, geolocation.",
    icon: Smartphone,
    examples: ['npx playwright test --project="Mobile Safari"', "npx playwright open --device='iPhone 15 Pro'"],
  },
  {
    id: "request-mocking",
    title: "Request mocking",
    blurb: "Stub network calls deterministically with route handlers.",
    icon: Network,
    examples: ["page.route('**/api/users', r => r.fulfill({ body: '[]' }))"],
  },
  {
    id: "session-management",
    title: "Session management",
    blurb: "Reuse storage state across runs to skip login flows.",
    icon: Database,
    examples: ["npx playwright codegen --save-storage=state.json", "npx playwright test --use-storage=state.json"],
  },
  {
    id: "running-custom-code",
    title: "Running custom code",
    blurb: "Inject inline JS or load a file into the CLI session.",
    icon: Workflow,
    examples: ['npx playwright eval "(page) => page.title()"', 'npx playwright load ./helpers/check-cart.js'],
  },
  {
    id: "screenshots-pdf",
    title: "Screenshots → PDF",
    blurb: "Generate a PDF snapshot of a rendered page.",
    icon: FileVideo,
    examples: ["npx playwright pdf https://example.com out.pdf"],
  },
  {
    id: "advanced-workflows",
    title: "Advanced workflows",
    blurb: "Multi-step CLI scripts that chain commands.",
    icon: Globe,
    examples: ['npx playwright test --grep "@smoke" --reporter=line --workers=4'],
  },
];

export default function PlaywrightCliPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Playwright CLI</h1>
        <p className="text-sm text-muted-foreground">
          Cheat-sheet for the <code className="rounded bg-muted px-1.5 py-0.5">npx playwright …</code> surface that
          agents call into. Every card maps to a guide under <code className="rounded bg-muted px-1.5 py-0.5">skills/playwright-cli/</code>.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {GUIDES.map((g) => {
          const Icon = g.icon;
          return (
            <Card key={g.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{g.title}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardDescription>{g.blurb}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-2">
                {g.examples.map((ex) => (
                  <pre
                    key={ex}
                    className="overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-foreground"
                  >
                    {ex}
                  </pre>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
