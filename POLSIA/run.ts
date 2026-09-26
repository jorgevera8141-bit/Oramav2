import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";

const client = new Anthropic();

const AGENT_ID = process.env.POLSIA_AGENT_ID;
const ENV_ID = process.env.POLSIA_ENV_ID;
if (!AGENT_ID || !ENV_ID) {
  throw new Error("Missing POLSIA_AGENT_ID / POLSIA_ENV_ID - run setup.sh first.");
}

// Starter rubric - tune these criteria as real runs come back.
const RUBRIC = `# Polsia Lead Scout rubric - starter, tune the criteria
- Report contains between 0 and 10 leads; no filler leads added just to reach 10 - every included lead clears the evidence bar
- Every business is verified real: name, location, website, and a concrete verifiability check are stated
- Each lead names exactly ONE specific operational problem - not a generic or assumed issue
- The EVIDENCE section cites a real source, a relevant excerpt/finding, and a link substantiating the problem
- The POLSIA FIT section names a concrete automation/tool Polsia could build, reasons why it matches the observed problem using only Polsia's stated capabilities (Airtable, Make, Apple Shortcuts, APIs, Claude Code, GitHub, POS systems, automation), and states what can't be determined from public info
- The IMPLEMENTATION section gives a Low/Medium/High difficulty rating with rationale, lists likely systems/data involved, and names major unknowns
- The OPPORTUNITY section explains why it's worth investigating and what must be confirmed with the business before proposing anything
- The CONFIDENCE section rates both evidence confidence and Polsia-fit confidence (High/Medium/Low each)
- Every lead follows the exact section structure: BUSINESS / PROBLEM / EVIDENCE / POLSIA FIT / IMPLEMENTATION / OPPORTUNITY / CONFIDENCE
- Zero outreach actions appear anywhere in the session - no emails sent, forms submitted, LinkedIn connections made, CRM records created, purchases made, or commitments made on Polsia's behalf
`;

const DESCRIPTION =
  "Find up to 10 small businesses with a real, evidenced operational problem Polsia could plausibly solve. " +
  "For each: verify the business is real, identify ONE specific evidenced problem, explain the evidence, assess " +
  "Polsia fit and implementation difficulty, and write a structured lead report to /mnt/session/outputs/leads.md " +
  "following the agent's report template. This is scouting/research only - never contact any business or take " +
  "any action on Polsia's behalf.";

async function main() {
  const session = await client.beta.sessions.create({
    agent: AGENT_ID,
    environment_id: ENV_ID,
    title: `Polsia Lead Scout - ${new Date().toISOString().slice(0, 10)}`,
    initial_events: [
      {
        type: "user.define_outcome",
        description: DESCRIPTION,
        rubric: { type: "text", content: RUBRIC },
        max_iterations: 5,
      },
    ],
  });

  console.log(`Session: ${session.id} (status: ${session.status})`);
  // Swap 'default' for your workspace ID if this API key isn't in the org's Default workspace.
  console.log(`Watch live: https://platform.claude.com/workspaces/default/sessions/${session.id}`);

  const stream = await client.beta.sessions.events.stream(session.id);

  for await (const event of stream) {
    if (event.type === "agent.message") {
      for (const block of event.content) {
        if (block.type === "text") process.stdout.write(block.text);
      }
    } else if (event.type === "span.outcome_evaluation_end") {
      console.log(`\n[outcome] iteration ${event.iteration}: ${event.result} - ${event.explanation}`);
    }

    // Correct idle-break gate (see shared/managed-agents-client-patterns.md Pattern 5):
    // don't break on session.status_idle alone - it also fires transiently
    // (e.g. between tool calls). This agent has no confirmable tools
    // (bash is off, no MCP servers), so requires_action should never occur,
    // but the gate is kept for correctness/future-proofing.
    if (event.type === "session.status_terminated") break;
    if (event.type === "session.status_idle") {
      if (event.stop_reason.type === "requires_action") continue;
      break; // end_turn, retries_exhausted, or budget_reached
    }
  }

  // Brief indexing lag between idle and outputs appearing in the Files API.
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("\n--- Output files ---");
  for await (const file of client.beta.files.list({
    scope_id: session.id,
    betas: ["managed-agents-2026-04-01"],
  })) {
    console.log(`${file.filename} (${file.size_bytes} bytes)`);
    const resp = await client.beta.files.download(file.id);
    fs.writeFileSync(file.filename, await resp.text());
    console.log(`  saved to ./${file.filename}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
