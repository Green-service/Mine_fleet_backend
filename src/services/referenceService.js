import * as ref from "../data/referenceCatalog.js";
import { readTable } from "./store.js";

function sortRows(rows) {
  return [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function toKpi(row) {
  return { label: row.label, value: row.value, hint: row.hint || undefined, tone: row.tone || undefined };
}

function toTerm(row) {
  return { term: row.term, desc: row.description };
}

function toNote(row) {
  return { tone: row.tone || undefined, label: row.label || undefined, text: row.text };
}

async function scoped(table, fallback, page, groupKey) {
  const rows = await readTable(table, fallback);
  return sortRows(rows.filter((row) => row.page === page && row.group_key === groupKey));
}

export async function getReference(page, groupKey) {
  const [kpis, terms, notes] = await Promise.all([
    scoped("reference_kpis", ref.referenceKpis, page, groupKey),
    scoped("reference_terms", ref.referenceTerms, page, groupKey),
    scoped("reference_notes", ref.referenceNotes, page, groupKey),
  ]);
  return {
    kpis: kpis.map(toKpi),
    terms: terms.map(toTerm),
    notes: notes.map(toNote),
  };
}
