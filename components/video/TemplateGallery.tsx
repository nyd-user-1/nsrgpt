"use client";

import { EChartBlock, VideoChartBlock } from "@/components/chat/ChartBlocks";

// /chat/charts (brief 78): every chart template the chat can answer with, each drawn the way an answer draws it: the same
// block, the same fetch from the cached API, in the page's light or dark. Beside each, a question to type in the chat.

const BLOCKS: { name: string; ask: string; block: object }[] = [
  {
    name: "Cross section",
    ask: "Show me the U-235 fission cross section in ENDF/B-VIII.1 and JEFF-3.3 against the EXFOR measurements.",
    block: { templateId: "xs-curve", data: { nuclide: "U-235", mt: 18, releases: ["B-VIII.1", "JEFF-3.3"], exfor: true, annotation: { x: 0.0253, text: "Thermal, 0.0253 eV" } } },
  },
  {
    name: "Cross section, capture",
    ask: "Plot Au-197 neutron capture from 1 eV to 1 MeV with the measurements.",
    block: { templateId: "xs-curve", data: { nuclide: "Au-197", mt: 102, releases: ["B-VIII.1"], exfor: true, emin: 1, emax: 1e6, annotation: { x: 4.906, text: "First resonance, 4.9 eV" } } },
  },
  { name: "Decay chain", ask: "What does U-238 decay to? Show me the chain.", block: { templateId: "decay-chain", data: { nuclide: "U-238" } } },
  { name: "Decay chain, thorium", ask: "Show me the Th-232 decay series.", block: { templateId: "decay-chain", data: { nuclide: "Th-232" } } },
  {
    name: "Half-lives",
    ask: "Compare the half-lives of Co-60, Cs-137, Sr-90, I-131, Am-241 and Pu-239.",
    block: { templateId: "half-life-bars", data: { nuclides: ["Co-60", "Cs-137", "Sr-90", "I-131", "Am-241", "Pu-239"] } },
  },
  {
    name: "Trend",
    ask: "How many U-235 fission cross-section datasets are in EXFOR for each five years? (the chat counts with its tools, then fills this)",
    block: {
      templateId: "series-trend",
      props: {
        title: "U-235 fission cross-section datasets in EXFOR",
        series: [{ name: "Datasets", points: [["1940", 20], ["1945", 2], ["1950", 6], ["1955", 40], ["1960", 15], ["1965", 49], ["1970", 55], ["1975", 78], ["1980", 35], ["1985", 24], ["1990", 8], ["1995", 2], ["2000", 24], ["2005", 6], ["2010", 5], ["2015", 20], ["2020", 2], ["2025", 4]].map(([label, value]) => ({ label, value })) }],
        annotation: { atIndex: 7, text: "78 datasets, 1975 to 1979" },
        source: "EXFOR, U-235(n,f) σ, five-year spans",
      },
    },
  },
];

const FALLBACK = {
  title: { text: "Fallback: an ECharts option, for a shape no template covers" },
  xAxis: { type: "category", name: "Library", data: ["B-VIII.1", "B-VIII.0", "JEFF-3.3", "JENDL-5"] },
  yAxis: { type: "value", name: "Example value" },
  series: [{ type: "bar", data: [3, 4, 2, 5] }],
};

export function TemplateGallery() {
  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-10 p-4 sm:p-6">
      {BLOCKS.map((b) => (
        <section key={b.name}>
          <h2 className="text-lg font-semibold text-[var(--paper-text)]">{b.name}</h2>
          <p className="mt-1 text-sm text-[var(--paper-muted)]">Ask: “{b.ask}”</p>
          <VideoChartBlock text={JSON.stringify(b.block)} />
        </section>
      ))}
      <section>
        <h2 className="text-lg font-semibold text-[var(--paper-text)]">ECharts fallback</h2>
        <EChartBlock text={JSON.stringify(FALLBACK)} />
      </section>
    </div>
  );
}
