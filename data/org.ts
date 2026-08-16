/**
 * The org the corpus routes into: three teams, twelve reps, two queues,
 * twenty-six accounts.
 *
 * Two details here are load-bearing rather than flavour.
 *
 * `r-hana` is departed (`active: false`) and still owns `bergstrom-health`.
 * That is the fifth named trap: pre-emption resolves to a ghost, and the lead
 * goes nowhere. Every CRM in the world has a few of these and none of them
 * report it.
 *
 * No active rep combines a Japanese territory with German. That is what makes
 * `rl-japan-german` a `NO_ELIGIBLE_OWNER` rather than a rule that merely never
 * happens to fire — the difference between "no lead has asked yet" and "no lead
 * could ever be served" is exactly the difference between an observation and a
 * proof.
 */

import { orgSchema } from "@/lib/routing/schema";
import type { Org } from "@/lib/routing/types";

export const TEAMS = [
  { id: "t-emea", name: "EMEA Commercial" },
  { id: "t-amer", name: "AMER Commercial" },
  { id: "t-ent", name: "Global Enterprise" },
] as const;

export const QUEUE_CATCHALL = "q-catchall";
export const QUEUE_DO_NOT_ROUTE = "q-donotroute";

const raw = {
  teams: [...TEAMS],

  reps: [
    // EMEA Commercial
    {
      id: "r-marie",
      name: "Marie Dubois",
      teamId: "t-emea",
      territory: ["FR", "ES", "IT"],
      languages: ["en", "fr", "es"],
      specialties: ["saas", "fintech"],
      capacity: 25,
      active: true,
    },
    {
      id: "r-jonas",
      name: "Jonas Weber",
      teamId: "t-emea",
      territory: ["DE", "IT"],
      languages: ["en", "de"],
      specialties: ["saas", "manufacturing"],
      capacity: 25,
      active: true,
    },
    {
      id: "r-priya",
      name: "Priya Nair",
      teamId: "t-emea",
      territory: ["UK", "IN"],
      languages: ["en"],
      specialties: ["saas", "fintech"],
      capacity: 25,
      active: true,
    },
    {
      id: "r-elena",
      name: "Elena Rossi",
      teamId: "t-emea",
      territory: ["IT", "ES"],
      languages: ["en", "es"],
      specialties: ["ecommerce", "other"],
      capacity: 20,
      active: true,
    },

    // AMER Commercial
    {
      id: "r-dana",
      name: "Dana Whitfield",
      teamId: "t-amer",
      territory: ["US", "CA"],
      languages: ["en"],
      specialties: ["healthcare", "government"],
      capacity: 30,
      active: true,
    },
    {
      id: "r-marcus",
      name: "Marcus Hale",
      teamId: "t-amer",
      territory: ["US"],
      languages: ["en"],
      specialties: ["fintech", "ecommerce"],
      capacity: 30,
      active: true,
    },
    {
      id: "r-sofia",
      name: "Sofia Braga",
      teamId: "t-amer",
      territory: ["BR"],
      languages: ["en", "pt", "es"],
      specialties: ["ecommerce", "education"],
      capacity: 20,
      active: true,
    },
    {
      id: "r-tom",
      name: "Tom Okafor",
      teamId: "t-amer",
      territory: ["US", "CA"],
      languages: ["en"],
      specialties: ["manufacturing", "other"],
      capacity: 25,
      active: true,
    },

    // Global Enterprise
    {
      id: "r-akira",
      name: "Akira Sato",
      teamId: "t-ent",
      territory: ["JP", "SG", "AU"],
      languages: ["en", "ja"],
      specialties: ["saas", "manufacturing"],
      capacity: 15,
      active: true,
    },
    {
      id: "r-noor",
      name: "Noor Haddad",
      teamId: "t-ent",
      territory: ["FR", "DE", "UK"],
      languages: ["en", "fr", "de"],
      specialties: ["saas", "fintech"],
      capacity: 15,
      active: true,
    },
    {
      id: "r-vic",
      name: "Victor Lindqvist",
      teamId: "t-ent",
      territory: ["US", "CA", "UK"],
      languages: ["en"],
      specialties: ["saas", "fintech"],
      capacity: 15,
      active: true,
    },
    {
      // Left in March. Nobody reassigned her accounts, and nothing in the CRM
      // says so. This is the fifth trap.
      id: "r-hana",
      name: "Hana Kovač",
      teamId: "t-ent",
      territory: ["DE", "UK", "US"],
      languages: ["en", "de"],
      specialties: ["healthcare", "government"],
      capacity: 15,
      active: false,
    },
  ],

  queues: [
    { id: QUEUE_CATCHALL, name: "Catch-all", suppresses: false },
    { id: QUEUE_DO_NOT_ROUTE, name: "Do not route", suppresses: true },
  ],

  accounts: [
    { domain: "northwind-labs.example", name: "Northwind Labs", ownerId: "r-marie" },
    { domain: "veridian-pay.example", name: "Veridian Pay", ownerId: "r-marcus" },
    { domain: "kestrel-logistics.example", name: "Kestrel Logistics", ownerId: "r-tom" },
    { domain: "bergstrom-health.example", name: "Bergström Health", ownerId: "r-hana" },
    { domain: "aurora-commerce.example", name: "Aurora Commerce", ownerId: "r-elena" },
    { domain: "sakura-systems.example", name: "Sakura Systems", ownerId: "r-akira" },
    { domain: "lumen-grid.example", name: "Lumen Grid", ownerId: "r-vic" },
    { domain: "brightpath-edu.example", name: "Brightpath Education", ownerId: "r-sofia" },
    { domain: "halden-manufacturing.example", name: "Halden Manufacturing", ownerId: "r-jonas" },
    { domain: "castellan-bank.example", name: "Castellan Bank", ownerId: "r-priya" },
    { domain: "meridian-clinics.example", name: "Meridian Clinics", ownerId: "r-dana" },
    { domain: "orbit-analytics.example", name: "Orbit Analytics", ownerId: "r-noor" },
    // Akira already owns the only Japanese company in the corpus that the
    // "Japan" rule would otherwise win. The rule is perfectly live in the
    // lead-space and has still never fired, which no static pass can know.
    { domain: "tokyo-fabrik.example", name: "Tokyo Fabrik", ownerId: "r-akira" },

    // Known accounts with no owner: pre-emption does not fire, the rules run.
    { domain: "fernhill-retail.example", name: "Fernhill Retail", ownerId: null },
    { domain: "quarry-civic.example", name: "Quarry Civic", ownerId: null },
    { domain: "tessellate-io.example", name: "Tessellate", ownerId: null },
    { domain: "pallas-energy.example", name: "Pallas Energy", ownerId: null },
    { domain: "grindstone-tools.example", name: "Grindstone Tools", ownerId: null },
    { domain: "solstice-media.example", name: "Solstice Media", ownerId: null },
    { domain: "cobalt-freight.example", name: "Cobalt Freight", ownerId: null },
    { domain: "wren-hospital.example", name: "Wren Hospital", ownerId: null },
    { domain: "marlowe-legal.example", name: "Marlowe Legal", ownerId: null },
    { domain: "tidewater-coop.example", name: "Tidewater Co-op", ownerId: null },
    { domain: "juniper-labs.example", name: "Juniper Labs", ownerId: null },
    { domain: "aster-ministry.example", name: "Aster Ministry", ownerId: null },
    { domain: "hollowbrook-fund.example", name: "Hollowbrook Fund", ownerId: null },
  ],
};

export const ORG: Org = orgSchema.parse(raw);

export const REPS_BY_ID = new Map(ORG.reps.map((rep) => [rep.id, rep]));
export const TEAMS_BY_ID = new Map(ORG.teams.map((team) => [team.id, team]));
export const QUEUES_BY_ID = new Map(ORG.queues.map((queue) => [queue.id, queue]));
export const ACCOUNTS_BY_DOMAIN = new Map(ORG.accounts.map((account) => [account.domain, account]));
