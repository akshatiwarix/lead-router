import { Console } from "./components/Console";
import { LEADS, ORG, PRESETS, QUEUE_CATCHALL } from "@/data";
import { decodeRuleset } from "@/lib/routing";

/**
 * The corpus is read and validated on the server; every derivation happens on
 * the client. The engine ships to the browser on purpose — editing a rule has
 * to re-derive every finding and every assignment with no round trip, or the
 * analysis reads as a report about the ruleset rather than a property of it.
 *
 * The permalink is decoded here rather than in an effect. It is untrusted input
 * that goes through the same Zod schema as the shipped corpus, and doing it
 * before the first render means a bad link produces a message instead of a
 * console that flickers from one ruleset to another.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const encoded = typeof params.r === "string" ? params.r : null;
  const decoded = encoded ? decodeRuleset(encodeURIComponent(encoded)) : null;

  return (
    <Console
      presets={PRESETS}
      org={ORG}
      leads={LEADS}
      fallbackQueueId={QUEUE_CATCHALL}
      initialRuleset={decoded?.ok ? decoded.ruleset : null}
      linkError={decoded && !decoded.ok ? decoded.error : null}
    />
  );
}
