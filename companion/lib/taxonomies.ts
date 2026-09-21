// Filing-tree stages per matter type. Copied onto matters.stages at creation, so a
// matter's tree can diverge later without touching these defaults.
export type Stage = { id: string; title: string; note?: string };

const s = (id: string, title: string, note?: string): Stage => ({ id, title, note });

export const TAXONOMIES: Record<string, Stage[]> = {
  arbitration: [
    s("chronology", "0. Chronology", "List of dates as filed."),
    s("appointment", "1. Appointment (A&C Act s.11)"),
    s("pleadings", "2. Pleadings (SoC / SoD)"),
    s("jurisdiction", "3. Jurisdiction (A&C Act s.16)"),
    s("interim", "4. Interim measures (A&C Act s.17)"),
    s("applications", "5. Later applications"),
    s("minutes", "6. Minutes of proceedings"),
    s("title", "7. Title & instruments"),
    s("financial", "8. Financial papers"),
    s("correspondence", "9. Correspondence"),
    s("other", "10. Other papers"),
  ],
  civil: [
    s("chronology", "0. Chronology"),
    s("plaint", "1. Plaint & annexures"),
    s("written-statement", "2. Written statement"),
    s("interim", "3. Interim applications (O.39 / O.40)"),
    s("issues", "4. Issues"),
    s("evidence", "5. Evidence & affidavits"),
    s("orders", "6. Orders & roznama"),
    s("documents", "7. Documents relied on"),
    s("correspondence", "8. Correspondence"),
    s("other", "9. Other papers"),
  ],
  consumer: [
    s("chronology", "0. Chronology"),
    s("complaint", "1. Complaint & annexures"),
    s("version", "2. Written version (OP)"),
    s("evidence", "3. Evidence affidavits"),
    s("applications", "4. Applications"),
    s("orders", "5. Orders & daily proceedings"),
    s("documents", "6. Documents relied on"),
    s("other", "7. Other papers"),
  ],
  writ: [
    s("chronology", "0. Chronology"),
    s("notices", "1. Court notices & service"),
    s("petition", "2. Petition & synopsis"),
    s("exhibits", "3. Exhibits to the petition"),
    s("replies", "4. Replies & rejoinders"),
    s("applications", "5. Applications"),
    s("orders", "6. Orders & judgments"),
    s("correspondence", "7. Correspondence"),
    s("other", "8. Other papers"),
  ],
  "rera-appeal": [
    s("chronology", "0. Chronology"),
    s("appeal", "1. Memo of appeal & synopsis"),
    s("impugned", "2. Impugned order"),
    s("complaint", "3. Complaint & proceedings below"),
    s("replies", "4. Replies"),
    s("applications", "5. Applications"),
    s("orders", "6. Orders & roznama"),
    s("other", "7. Other papers"),
  ],
};

export const DEFAULT_DISCLAIMER =
  "This workspace restates a party's papers. It is not an award, not legal advice, and not a determination of fact.";
