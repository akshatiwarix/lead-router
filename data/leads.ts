/**
 * Seventy authored leads. Synthetic — every domain ends in `.example` and no
 * real company or person is described.
 *
 * The distribution is not random. It is authored so that every outcome and
 * every finding is reachable on the shipped corpus: eight leads pre-empt onto
 * an active account owner, two pre-empt onto a departed one, eleven fall into
 * the regulated-SMB hole, four have an industry that never came back from
 * enrichment and therefore fall past every `notIn` rule, and three arrived
 * before their country resolved.
 *
 * The counts are here for the reader, not for the code — nothing downstream
 * depends on them, and the tests recompute rather than assert these numbers by
 * hand.
 */

import { leadsSchema } from "@/lib/routing/schema";
import type { Lead } from "@/lib/routing/types";

type Draft = Omit<Lead, "existingCustomer" | "competitor"> &
  Partial<Pick<Lead, "existingCustomer" | "competitor">>;

const lead = (draft: Draft) => ({
  existingCustomer: false,
  competitor: false,
  ...draft,
});

const raw: Draft[] = [
  // ---------------------------------------------------------------------
  // Pre-emption onto an active account owner. The rules never run.
  // ---------------------------------------------------------------------
  { id: "l-001", name: "Camille Roux", company: "Northwind Labs", emailDomain: "northwind-labs.example", country: "FR", employees: 340, industry: "saas", source: "demo_request", seniority: "director", language: "fr" },
  { id: "l-002", name: "Ryan Beckett", company: "Veridian Pay", emailDomain: "veridian-pay.example", country: "US", employees: 820, industry: "fintech", source: "webinar", seniority: "vp", language: "en" },
  { id: "l-003", name: "Grace Oyelaran", company: "Kestrel Logistics", emailDomain: "kestrel-logistics.example", country: "CA", employees: 1200, industry: "manufacturing", source: "event", seniority: "manager", language: "en" },
  { id: "l-004", name: "Luca Ferrari", company: "Aurora Commerce", emailDomain: "aurora-commerce.example", country: "IT", employees: 90, industry: "ecommerce", source: "chat", seniority: "ic", language: "en" },
  { id: "l-005", name: "Yui Tanabe", company: "Sakura Systems", emailDomain: "sakura-systems.example", country: "JP", employees: 2400, industry: "saas", source: "demo_request", seniority: "vp", language: "ja" },
  { id: "l-006", name: "Peter Nyquist", company: "Lumen Grid", emailDomain: "lumen-grid.example", country: "US", employees: 5600, industry: "saas", source: "outbound_reply", seniority: "c_level", language: "en" },
  { id: "l-007", name: "Anke Brandt", company: "Halden Manufacturing", emailDomain: "halden-manufacturing.example", country: "DE", employees: 460, industry: "manufacturing", source: "content_download", seniority: "director", language: "de" },
  { id: "l-008", name: "Ishaan Kapoor", company: "Castellan Bank", emailDomain: "castellan-bank.example", country: "UK", employees: 3100, industry: "fintech", source: "event", seniority: "director", language: "en" },

  // ---------------------------------------------------------------------
  // TRAP: the departed owner. Pre-emption resolves to a rep who left.
  // ---------------------------------------------------------------------
  { id: "l-009", name: "Sven Bergström", company: "Bergström Health", emailDomain: "bergstrom-health.example", country: "DE", employees: 1800, industry: "healthcare", source: "demo_request", seniority: "vp", language: "de" },
  { id: "l-010", name: "Nadia Ellis", company: "Bergström Health", emailDomain: "bergstrom-health.example", country: "UK", employees: 1800, industry: "healthcare", source: "webinar", seniority: "manager", language: "en" },

  // ---------------------------------------------------------------------
  // Competitors. Deliberately nobody's.
  // ---------------------------------------------------------------------
  { id: "l-011", name: "Dominic Ashby", company: "Rival Routing", emailDomain: "rival-routing.example", country: "US", employees: 400, industry: "saas", source: "free_trial", seniority: "director", language: "en", competitor: true },
  { id: "l-012", name: "Ines Cardoso", company: "Rival Routing", emailDomain: "rival-routing.example", country: "BR", employees: 400, industry: "saas", source: "content_download", seniority: "ic", language: "pt", competitor: true },
  { id: "l-013", name: "Kenji Mori", company: "Parallel Ops", emailDomain: "parallel-ops.example", country: "JP", employees: 60, industry: "saas", source: "chat", seniority: "c_level", language: "ja", competitor: true },

  // ---------------------------------------------------------------------
  // Existing customers, sent to the catch-all by rule 2.
  // ---------------------------------------------------------------------
  { id: "l-014", name: "Tara Michaels", company: "Fernhill Retail", emailDomain: "fernhill-retail.example", country: "US", employees: 220, industry: "ecommerce", source: "chat", seniority: "manager", language: "en", existingCustomer: true },
  { id: "l-015", name: "Olivier Mercier", company: "Solstice Media", emailDomain: "solstice-media.example", country: "FR", employees: 75, industry: "other", source: "webinar", seniority: "ic", language: "fr", existingCustomer: true },
  { id: "l-016", name: "Bianca Moraes", company: "Brightpath Education", emailDomain: "brightpath-edu.example", country: "BR", employees: 130, industry: "education", source: "demo_request", seniority: "director", language: "pt", existingCustomer: true },

  // ---------------------------------------------------------------------
  // TRAP: the hole. Regulated industries under fifty people, in EMEA and
  // AMER. The specialist desk starts at fifty; the regional rules were
  // amended to exclude regulated industries. Nothing claims what is left.
  // ---------------------------------------------------------------------
  { id: "l-017", name: "Marta Silva", company: "Wren Hospital", emailDomain: "wren-hospital.example", country: "ES", employees: 32, industry: "healthcare", source: "demo_request", seniority: "manager", language: "es" },
  { id: "l-018", name: "Daniel Osei", company: "Quarry Civic", emailDomain: "quarry-civic.example", country: "UK", employees: 18, industry: "government", source: "content_download", seniority: "director", language: "en" },
  { id: "l-019", name: "Hélène Girard", company: "Clinique Beaumont", emailDomain: "clinique-beaumont.example", country: "FR", employees: 12, industry: "healthcare", source: "webinar", seniority: "c_level", language: "fr" },
  { id: "l-020", name: "Robert Vance", company: "Cedar County", emailDomain: "cedar-county.example", country: "US", employees: 44, industry: "government", source: "event", seniority: "manager", language: "en" },
  { id: "l-021", name: "Aiko Fischer", company: "Praxis Nord", emailDomain: "praxis-nord.example", country: "DE", employees: 7, industry: "healthcare", source: "chat", seniority: "ic", language: "de" },
  { id: "l-022", name: "Paulo Ribeiro", company: "Saúde Litoral", emailDomain: "saude-litoral.example", country: "BR", employees: 26, industry: "healthcare", source: "demo_request", seniority: "manager", language: "pt" },
  { id: "l-023", name: "Fiona Deane", company: "Borough Records", emailDomain: "borough-records.example", country: "UK", employees: 9, industry: "government", source: "content_download", seniority: "ic", language: "en" },
  { id: "l-024", name: "Giulia Conti", company: "Studio Medico Conti", emailDomain: "studio-conti.example", country: "IT", employees: 4, industry: "healthcare", source: "free_trial", seniority: "other", language: "en" },
  { id: "l-025", name: "Alonso Vega", company: "Aster Ministry", emailDomain: "aster-ministry.example", country: "ES", employees: 41, industry: "government", source: "event", seniority: "director", language: "es" },
  { id: "l-026", name: "Erin Callahan", company: "Lakeside Clinic", emailDomain: "lakeside-clinic.example", country: "CA", employees: 15, industry: "healthcare", source: "webinar", seniority: "manager", language: "en" },
  { id: "l-027", name: "Théo Lambert", company: "Mairie de Roselle", emailDomain: "mairie-roselle.example", country: "FR", employees: 30, industry: "government", source: "chat", seniority: "manager", language: "fr" },

  // ---------------------------------------------------------------------
  // Industry never came back from enrichment. `notIn` excludes the
  // unenriched value, so these fall past every regional rule. Nobody
  // intended this and nobody noticed.
  // ---------------------------------------------------------------------
  { id: "l-028", name: "Nils Aaberg", company: "Tessellate", emailDomain: "tessellate-io.example", country: "DE", employees: 140, industry: null, source: "demo_request", seniority: "director", language: "de" },
  { id: "l-029", name: "Priti Shah", company: "Juniper Labs", emailDomain: "juniper-labs.example", country: "UK", employees: 22, industry: null, source: "content_download", seniority: "ic", language: "en" },
  { id: "l-030", name: "Wes Halloran", company: "Cobalt Freight", emailDomain: "cobalt-freight.example", country: "US", employees: 310, industry: null, source: "webinar", seniority: "manager", language: "en" },
  { id: "l-031", name: "Renata Alves", company: "Tidewater Co-op", emailDomain: "tidewater-coop.example", country: "BR", employees: null, industry: null, source: "chat", seniority: "ic", language: "pt" },

  // ---------------------------------------------------------------------
  // Country not yet resolved. Every geographic rule needs it.
  // ---------------------------------------------------------------------
  { id: "l-032", name: "Unknown Visitor", company: "Pallas Energy", emailDomain: "pallas-energy.example", country: null, employees: 260, industry: "manufacturing", source: "chat", seniority: "other", language: "en" },
  { id: "l-033", name: "M. Devereux", company: "Marlowe Legal", emailDomain: "marlowe-legal.example", country: null, employees: 38, industry: "other", source: "content_download", seniority: "manager", language: "fr" },
  { id: "l-034", name: "A. Kowalski", company: "Hollowbrook Fund", emailDomain: "hollowbrook-fund.example", country: null, employees: null, industry: "fintech", source: "free_trial", seniority: "ic", language: "en" },

  // ---------------------------------------------------------------------
  // TRAP: the silent contest. Partner-sourced and C-level at once. The
  // partner rule and the C-level rule disagree; the partner rule wins only
  // because it was written first.
  // ---------------------------------------------------------------------
  { id: "l-035", name: "Constance Weir", company: "Orbit Analytics", emailDomain: "orbit-partner.example", country: "UK", employees: 640, industry: "saas", source: "partner_referral", seniority: "c_level", language: "en" },
  { id: "l-036", name: "Hugo Bernard", company: "Vantage Retail", emailDomain: "vantage-retail.example", country: "FR", employees: 2100, industry: "ecommerce", source: "partner_referral", seniority: "c_level", language: "fr" },
  { id: "l-037", name: "Dae-jung Park", company: "Meridian Freight", emailDomain: "meridian-freight.example", country: "SG", employees: 480, industry: "manufacturing", source: "partner_referral", seniority: "c_level", language: "en" },

  // ---------------------------------------------------------------------
  // TRAP: German-speaking Japan. The rule fires and resolves to nobody.
  // ---------------------------------------------------------------------
  { id: "l-038", name: "Lars Hoffmann", company: "Nihon Werke", emailDomain: "nihon-werke.example", country: "JP", employees: 210, industry: "manufacturing", source: "demo_request", seniority: "director", language: "de" },
  { id: "l-039", name: "Ute Brenner", company: "Kansai Systemtechnik", emailDomain: "kansai-system.example", country: "JP", employees: 34, industry: "saas", source: "webinar", seniority: "manager", language: "de" },

  // ---------------------------------------------------------------------
  // Ordinary traffic. Everything below routes.
  // ---------------------------------------------------------------------
  { id: "l-040", name: "Amelie Fontaine", company: "Grindstone Tools", emailDomain: "grindstone-tools.example", country: "FR", employees: 210, industry: "manufacturing", source: "demo_request", seniority: "director", language: "fr" },
  { id: "l-041", name: "Karl Osterman", company: "Rheinbrücke", emailDomain: "rheinbrucke.example", country: "DE", employees: 95, industry: "saas", source: "webinar", seniority: "manager", language: "de" },
  { id: "l-042", name: "Josie Pemberton", company: "Ashgrove Digital", emailDomain: "ashgrove-digital.example", country: "UK", employees: 610, industry: "saas", source: "content_download", seniority: "vp", language: "en" },
  { id: "l-043", name: "Rafael Ortiz", company: "Ibérica Comercio", emailDomain: "iberica-comercio.example", country: "ES", employees: 130, industry: "ecommerce", source: "event", seniority: "director", language: "es" },
  { id: "l-044", name: "Chiara Bruno", company: "Verona Retail", emailDomain: "verona-retail.example", country: "IT", employees: 55, industry: "ecommerce", source: "chat", seniority: "manager", language: "en" },
  { id: "l-045", name: "Nathan Priest", company: "Halcyon Bank", emailDomain: "halcyon-bank.example", country: "US", employees: 780, industry: "fintech", source: "demo_request", seniority: "vp", language: "en" },
  { id: "l-046", name: "Devon Marsh", company: "Northline Retail", emailDomain: "northline-retail.example", country: "CA", employees: 340, industry: "ecommerce", source: "webinar", seniority: "director", language: "en" },
  { id: "l-047", name: "Luciana Prado", company: "Costa Educação", emailDomain: "costa-educacao.example", country: "BR", employees: 88, industry: "education", source: "content_download", seniority: "manager", language: "pt" },
  { id: "l-048", name: "Emma Sørensen", company: "Bright Angle", emailDomain: "bright-angle.example", country: "UK", employees: 26, industry: "saas", source: "free_trial", seniority: "ic", language: "en" },
  { id: "l-049", name: "Pierre Lacombe", company: "Atelier Nord", emailDomain: "atelier-nord.example", country: "FR", employees: 14, industry: "other", source: "chat", seniority: "other", language: "fr" },
  { id: "l-050", name: "Maja Lindholm", company: "Kleinwerk", emailDomain: "kleinwerk.example", country: "DE", employees: 31, industry: "manufacturing", source: "event", seniority: "manager", language: "de" },
  { id: "l-051", name: "Owen Truesdale", company: "Copperfield Labs", emailDomain: "copperfield-labs.example", country: "US", employees: 19, industry: "saas", source: "free_trial", seniority: "ic", language: "en" },
  { id: "l-052", name: "Sara Nunes", company: "Litoral Shop", emailDomain: "litoral-shop.example", country: "BR", employees: 42, industry: "ecommerce", source: "chat", seniority: "manager", language: "pt" },
  { id: "l-053", name: "Hiroshi Ando", company: "Tokyo Fabrik", emailDomain: "tokyo-fabrik.example", country: "JP", employees: 900, industry: "manufacturing", source: "demo_request", seniority: "vp", language: "ja" },
  { id: "l-054", name: "Wei Lam", company: "Straits Data", emailDomain: "straits-data.example", country: "SG", employees: 120, industry: "saas", source: "webinar", seniority: "director", language: "en" },
  { id: "l-055", name: "Bridget Nolan", company: "Southern Cross Retail", emailDomain: "southern-cross.example", country: "AU", employees: 460, industry: "ecommerce", source: "event", seniority: "manager", language: "en" },
  { id: "l-056", name: "Arjun Menon", company: "Deccan Fintech", emailDomain: "deccan-fintech.example", country: "IN", employees: 240, industry: "fintech", source: "content_download", seniority: "director", language: "en" },
  { id: "l-057", name: "Colette Marchand", company: "Bureau Verte", emailDomain: "bureau-verte.example", country: "FR", employees: null, industry: "saas", source: "demo_request", seniority: "manager", language: "fr" },
  { id: "l-058", name: "Stefan Kohl", company: "Werkstatt Plus", emailDomain: "werkstatt-plus.example", country: "DE", employees: null, industry: "manufacturing", source: "webinar", seniority: "ic", language: "de" },
  { id: "l-059", name: "Naomi Ward", company: "Pinehurst Group", emailDomain: "pinehurst-group.example", country: "US", employees: null, industry: "other", source: "chat", seniority: "manager", language: "en" },
  { id: "l-060", name: "Felipe Andrade", company: "Andrade Comercial", emailDomain: "andrade-comercial.example", country: "BR", employees: null, industry: "ecommerce", source: "content_download", seniority: "director", language: "pt" },
  { id: "l-061", name: "Isabelle Perrot", company: "Groupe Perrot", emailDomain: "groupe-perrot.example", country: "FR", employees: 4200, industry: "manufacturing", source: "event", seniority: "vp", language: "fr" },
  { id: "l-062", name: "Tomas Vlcek", company: "Continental Rail", emailDomain: "continental-rail.example", country: "DE", employees: 12_000, industry: "manufacturing", source: "outbound_reply", seniority: "director", language: "de" },
  { id: "l-063", name: "Adaeze Nwosu", company: "Britannia Health Group", emailDomain: "britannia-health.example", country: "UK", employees: 6400, industry: "healthcare", source: "demo_request", seniority: "vp", language: "en" },
  { id: "l-064", name: "Kelsey Doyle", company: "Statewide Services", emailDomain: "statewide-services.example", country: "US", employees: 250, industry: "government", source: "webinar", seniority: "manager", language: "en" },
  { id: "l-065", name: "Margaret Ubale", company: "Meridian Clinics", emailDomain: "meridian-clinics.example", country: "US", employees: 520, industry: "healthcare", source: "event", seniority: "director", language: "en" },
  { id: "l-066", name: "Ravi Chandra", company: "Southbank Analytics", emailDomain: "southbank-analytics.example", country: "IN", employees: 1600, industry: "saas", source: "content_download", seniority: "c_level", language: "en" },
  { id: "l-067", name: "Sinead Barry", company: "Clonmel Software", emailDomain: "clonmel-software.example", country: "UK", employees: 47, industry: "saas", source: "free_trial", seniority: "ic", language: "en" },
  { id: "l-068", name: "Gustavo Pinto", company: "Pinto Educação", emailDomain: "pinto-educacao.example", country: "BR", employees: 610, industry: "education", source: "demo_request", seniority: "vp", language: "pt" },
  { id: "l-069", name: "Hanna Lehtinen", company: "Nordvik Retail", emailDomain: "nordvik-retail.example", country: "ES", employees: 830, industry: "ecommerce", source: "outbound_reply", seniority: "director", language: "es" },
  { id: "l-070", name: "Jerome Whitaker", company: "Aldergate Capital", emailDomain: "aldergate-capital.example", country: "CA", employees: 2900, industry: "fintech", source: "partner_referral", seniority: "vp", language: "en" },
];

export const LEADS: readonly Lead[] = leadsSchema.parse(raw.map(lead));
