import { DictionaryTable } from "./DictionaryTable"

// /data-dictionary (brief 32): every field the API returns or a page shows, in the Glossary's TableBlock with its search,
// grouped by dataset, each column sortable. NSRgpt's own, built parallel to /glossary: the rows in lib/data-dictionary.ts,
// the table in DictionaryTable.tsx. A static shell: the rows are in the bundle, nothing loads.

export const metadata = { title: "Data dictionary" }

export default function DataDictionaryPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <DictionaryTable />
    </div>
  )
}
