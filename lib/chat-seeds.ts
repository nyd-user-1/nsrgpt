// The sidebar's starter chats (Brendan, 2026-11-07): ten NSR questions, each answered with the papers the NSR search
// (services/nsr-search, hybrid) returned for it. They show while a reader has no saved chats, and open read from here.

import type { ChatMessage, ChatMeta } from "@/lib/chats"

export const CHAT_SEEDS: { meta: ChatMeta; messages: ChatMessage[] }[] = [
  {
    "meta": {
      "id": "seed-neutron-capture-au197",
      "title": "What do measurements of the neutron capture cross section of 197Au show?",
      "favorite": false,
      "pinned": false,
      "hidden": false,
      "archived": false,
      "createdAt": "2026-11-07T06:00:00Z",
      "updatedAt": "2026-11-07T06:00:00Z"
    },
    "messages": [
      {
        "id": "seed-0-q",
        "role": "user",
        "content": "What do measurements of the neutron capture cross section of 197Au show?"
      },
      {
        "id": "seed-0-a",
        "role": "assistant",
        "content": "Here are the NSR papers my search finds closest to that question, out of the 303,568 references I hold, closest first:\n\n1. Measurement of the $^{197}$Au (n,$\\gamma $) cross section at n\\_TOF: towards a new standard (2008), 2008MAZJ. Proc.Intern.Conf.Nuclear Data for Science and Technology, Nice, France, April 22-27, 2007, O.Bersillon, F.Gunsing, E.Bauge, R.Jacqmin, and S.Leray, Eds., p.1265 (2008)\n2. Cross Section for Radiative Capture of Neutrons by $^{197}$Au. An Analysis of Sources of Systematic Errors in Measurement of Activation (1988), 1988DA23. At.Energ. 65, 343 (1988)\n3. The Capture Cross-Section of $^{197}$Au for Fast Neutrons (1959), 1959FE20. J.Nuclear Energy 10, 19 (1959)\n4. Neutron capture cross section measurements for $^{197}$Au from 3.5 to 84 keV at GELINA (2014), 2014MA69. Eur.Phys.J. A 50, 124 (2014)\n5. Messungen am 191-keV-Ubergang von $^{197}$Au (1965), 1965GA06. Helv.Phys.Acta. 38, 379 (1965)\n\nAsk me about any of them by key number, or ask a follow-up and I'll read further into the corpus."
      }
    ]
  },
  {
    "meta": {
      "id": "seed-half-life-co60",
      "title": "How precisely is the half-life of 60Co known?",
      "favorite": false,
      "pinned": false,
      "hidden": false,
      "archived": false,
      "createdAt": "2026-11-06T23:00:00Z",
      "updatedAt": "2026-11-06T23:00:00Z"
    },
    "messages": [
      {
        "id": "seed-1-q",
        "role": "user",
        "content": "How precisely is the half-life of 60Co known?"
      },
      {
        "id": "seed-1-a",
        "role": "assistant",
        "content": "Here are the NSR papers my search finds closest to that question, out of the 303,568 references I hold, closest first:\n\n1. Experimental Study of Half-Life Determinations using $^{60}$Co (1983), 1983RU04. Nucl.Instrum.Methods 206, 211 (1983)\n2. The Half-Life of Co$^{60}$ (1953), 1953KA21. Phys.Rev. 91, 332 (1953)\n3. Half-Life of $^{60}$Fe (1984), 1984KU28. Nucl.Instrum.Methods Phys.Res., B5, 430 (1984)\n4. Update on the $^{60}$Fe half-life (2026), 2026RU03. Nucl.Instrum.Methods Phys.Res. B574, 166084 (2026)\n5. Activity measurement of $^{60}$Fe through the decay of $^{60m}$Co and confirmation of its half-life (2017), 2017OS02. Phys.Rev. C 95, 055809 (2017)\n\nAsk me about any of them by key number, or ask a follow-up and I'll read further into the corpus."
      }
    ]
  },
  {
    "meta": {
      "id": "seed-superdeformed-dy152",
      "title": "What is known about the superdeformed bands in 152Dy?",
      "favorite": false,
      "pinned": false,
      "hidden": false,
      "archived": false,
      "createdAt": "2026-11-06T16:00:00Z",
      "updatedAt": "2026-11-06T16:00:00Z"
    },
    "messages": [
      {
        "id": "seed-2-q",
        "role": "user",
        "content": "What is known about the superdeformed bands in 152Dy?"
      },
      {
        "id": "seed-2-a",
        "role": "assistant",
        "content": "Here are the NSR papers my search finds closest to that question, out of the 303,568 references I hold, closest first:\n\n1. Identical superdeformed bands in yrast $^{152}$Dy: a systematic description (2018), 2018DA10. J.Phys.(London) G45, 065103 (2018)\n2. New Features in the Spectrum of $^{152}$Dy: Evidence for hyperdeformation ( Question ) (1992), 1992GAZX. Contrib.Int.Conf.Nuclear Structure at High Angular Momentum, Ottawa, p.16 (1992)\n3. Collectivity of the Superdeformed Bands in $^{152}$Dy (1985), 1985TW01. Phys.Rev.Lett. 55, 1380 (1985)\n4. Superdeformed Band in $^{152}$Dy as Evidence for the Centrifugal Solidification of a Rotating Nucleus (1987), 1987SW01. Phys.Rev.Lett. 58, 1184  (1987)\n5. New Features in the Spectrum of $^{152}$Dy: Evidence for hyperdeformation (1992), 1992GAZS. Proc.Int.Conf.Nuclear Structure at High Angular Momentum, Ottawa, p.47 (1992)\n\nAsk me about any of them by key number, or ask a follow-up and I'll read further into the corpus."
      }
    ]
  },
  {
    "meta": {
      "id": "seed-be2-sn120",
      "title": "What is the B(E2) of the first 2+ state in 120Sn?",
      "favorite": false,
      "pinned": false,
      "hidden": false,
      "archived": false,
      "createdAt": "2026-11-06T09:00:00Z",
      "updatedAt": "2026-11-06T09:00:00Z"
    },
    "messages": [
      {
        "id": "seed-3-q",
        "role": "user",
        "content": "What is the B(E2) of the first 2+ state in 120Sn?"
      },
      {
        "id": "seed-3-a",
        "role": "assistant",
        "content": "Here are the NSR papers my search finds closest to that question, out of the 303,568 references I hold, closest first:\n\n1. Penetration Effects in the E1, E2-Forbidden Transitions in $^{120}$Sn (2013), 2013VIZZ. Contrib.63st International Conf.on \"Nucleus-2013\" Fundamental Problems of Nucl. Phys., Atomic Power Engineering,Moscow,p.81 (2013)\n2. Das Quadrupolmoment des 2,3 Mev-Zustandes in $^{120}$Sn (1970), 1970WO02. Z.Phys. 232, 256 (1970)\n3. Spin and Parity Assignment of $^{120}$Sn Levels via Homologous States (2003), 2003GUZW. Maier-Leibnitz-Laboratorium 2002 Ann.Rept., p.11 (2003)\n4. How can one synthesize the element Z = 120? (2010), 2010SI09. Int.J.Mod.Phys. E19, 500 (2010)\n5. The Second Excited State of Sn$^{120}$ (1961), 1961KA10. J.Phys.Soc.Japan 16, 1493 (1961)\n\nAsk me about any of them by key number, or ask a follow-up and I'll read further into the corpus."
      }
    ]
  },
  {
    "meta": {
      "id": "seed-gdr-pb208",
      "title": "What do experiments say about the giant dipole resonance in 208Pb?",
      "favorite": false,
      "pinned": false,
      "hidden": false,
      "archived": false,
      "createdAt": "2026-11-06T02:00:00Z",
      "updatedAt": "2026-11-06T02:00:00Z"
    },
    "messages": [
      {
        "id": "seed-4-q",
        "role": "user",
        "content": "What do experiments say about the giant dipole resonance in 208Pb?"
      },
      {
        "id": "seed-4-a",
        "role": "assistant",
        "content": "Here are the NSR papers my search finds closest to that question, out of the 303,568 references I hold, closest first:\n\n1. Probing the Microstructure of the Giant Dipole Resonance in $^{208}$Pb (1985), 1985BE18. Phys.Rev. C31, 1553 (1985)\n2. Search for the Isovector Giant Quadrupole Resonance in $^{208}$Pb (1987), 1987BEYH. ORNL-6326, p.24 (1987)\n3. Giant Multipole Resonances in $^{208}$Pb (1975), 1975GR33. Lett.Nuovo Cim. 14, 505 (1975)\n4. Giant Multipole Resonances in $^{208}$Pb (1988), 1988AL30. Nuovo Cim. 100A, 443 (1988)\n5. Description of the Giant Multipole Resonances in $^{208}$Pb in the Framework of the Resonant RPA (1989), 1989CUZZ. ATOMKI 1988 Ann.Rept., p.37 (1989)\n\nAsk me about any of them by key number, or ask a follow-up and I'll read further into the corpus."
      }
    ]
  },
  {
    "meta": {
      "id": "seed-neutron-rich-calcium",
      "title": "What has been learned about neutron-rich calcium isotopes?",
      "favorite": false,
      "pinned": false,
      "hidden": false,
      "archived": false,
      "createdAt": "2026-11-05T19:00:00Z",
      "updatedAt": "2026-11-05T19:00:00Z"
    },
    "messages": [
      {
        "id": "seed-5-q",
        "role": "user",
        "content": "What has been learned about neutron-rich calcium isotopes?"
      },
      {
        "id": "seed-5-a",
        "role": "assistant",
        "content": "Here are the NSR papers my search finds closest to that question, out of the 303,568 references I hold, closest first:\n\n1. Production of neutron-rich isotopes in the calcium region (2012), 2012TAZQ. Proc.Intern.Symposium Exotic Nuclei, Vladivostok, (Russia), 1-6 October 2012, Yu.E.Penionzhkevich, Eds., p.273 (2012)\n2. The structure of neutron-rich calcium isotopes studied by the shell model with realistic effective interactions (2019), 2019WA31. Chin.Phys.C 43, 124106 (2019)\n3. Isobaric yield ratio difference and neutron density difference in calcium isotopes (2014), 2014MA31. Phys.Rev. C 89, 057602 (2014)\n4. Nuclear Ground State Properties of Neutron Rich Calcium Isotopes (1992), 1992VEZZ. Contrib. 6th Intern.Conf.on Nuclei Far from Stability + 9th Intern.Conf.on Atomic Masses and Fundamental Constant, Bernkastel-Kues, Germany, PB1 (1992)\n5. Development of a sensitive setup for laser spectroscopy studies of very exotic calcium isotopes (2017), 2017GA02. J.Phys.(London) G44, 044003 (2017)\n\nAsk me about any of them by key number, or ask a follow-up and I'll read further into the corpus."
      }
    ]
  },
  {
    "meta": {
      "id": "seed-r-process-masses",
      "title": "Which nuclear mass measurements matter most for the r-process?",
      "favorite": false,
      "pinned": false,
      "hidden": false,
      "archived": false,
      "createdAt": "2026-11-05T12:00:00Z",
      "updatedAt": "2026-11-05T12:00:00Z"
    },
    "messages": [
      {
        "id": "seed-6-q",
        "role": "user",
        "content": "Which nuclear mass measurements matter most for the r-process?"
      },
      {
        "id": "seed-6-a",
        "role": "assistant",
        "content": "Here are the NSR papers my search finds closest to that question, out of the 303,568 references I hold, closest first:\n\n1. Sensitivity of the r-process to nuclear masses (2012), 2012BR17. Eur.Phys.J. A 48, 184 (2012)\n2. The contribution of precision mass measurements to nuclear physics (2005), 2005SC04. Nucl.Phys. A751, 209c (2005)\n3. New mass data for the rp-process above Z = 32 (2011), 2011HE10. Eur.Phys.J. A 47, 75 (2011)\n4. Mass measurements of neutron-deficient radionuclides near the end-point of the rp-process with SHIPTRAP (2007), 2007MA92. Eur.Phys.J. A 34, 341 (2007)\n5. Sensitivity of the r-Process Model to the Choice of a Mass Model (2022), 2022NE06. Bull.Rus.Acad.Sci.Phys. 86, 495 (2022)\n\nAsk me about any of them by key number, or ask a follow-up and I'll read further into the corpus."
      }
    ]
  },
  {
    "meta": {
      "id": "seed-cu64-production",
      "title": "How is the medical isotope 64Cu produced?",
      "favorite": false,
      "pinned": false,
      "hidden": false,
      "archived": false,
      "createdAt": "2026-11-05T05:00:00Z",
      "updatedAt": "2026-11-05T05:00:00Z"
    },
    "messages": [
      {
        "id": "seed-7-q",
        "role": "user",
        "content": "How is the medical isotope 64Cu produced?"
      },
      {
        "id": "seed-7-a",
        "role": "assistant",
        "content": "Here are the NSR papers my search finds closest to that question, out of the 303,568 references I hold, closest first:\n\n1. Production of Carrier-Free $^{64}$Cu: A positron emitting radionuclide (1989), 1989ZW01. J.Labelled Compd.Radiopharm. 26, 150 (1989)\n2. Automation of the $^{64}$Cu production at the Turku PET Centre (2011), 2011EL06. J.Labelled Compd.Radiopharm. Supp.1., 54, S244 (2011)\n3. Automated production of $^{64}$Cu prepared by 18 MeV cyclotron (2012), 2012OM01. J.Radioanal.Nucl.Chem. 293, 217 (2012)\n4. A novel method for determination of copper in zinc destined to $^{64}$Cu production in a nuclear reactor (2016), 2016CO09. J.Radioanal.Nucl.Chem. 309, 23 (2016)\n5. Production, purification and quality control of $^{64}$Cu with 10 MeV medical cyclotron (2026), 2026ZH05. J.Radioanal.Nucl.Chem. 335, 527 (2026)\n\nAsk me about any of them by key number, or ask a follow-up and I'll read further into the corpus."
      }
    ]
  },
  {
    "meta": {
      "id": "seed-shape-coexistence-pb186",
      "title": "What is the evidence for shape coexistence in 186Pb?",
      "favorite": false,
      "pinned": false,
      "hidden": false,
      "archived": false,
      "createdAt": "2026-11-04T22:00:00Z",
      "updatedAt": "2026-11-04T22:00:00Z"
    },
    "messages": [
      {
        "id": "seed-8-q",
        "role": "user",
        "content": "What is the evidence for shape coexistence in 186Pb?"
      },
      {
        "id": "seed-8-a",
        "role": "assistant",
        "content": "Here are the NSR papers my search finds closest to that question, out of the 303,568 references I hold, closest first:\n\n1. Evidence for Shape Coexistence in $^{186}$Pt (1987), 1987HE29. Z.Phys. A328, 387 (1987)\n2. Evidence for Shape Coexistence in $^{186}$Pt (1987), 1987HEZI. Proc.Intern.Conf.Nuclear Structure Through Static and Dynamic Moments, Melbourne, Australia, Vol.1, p.53 (1987)\n3. Search for a New Isomeric State in the 186Re Nucleus (2018), 2018KA49. Bull.Rus.Acad.Sci.Phys. 82, 1237 (2018)\n4. Evidence for Prolate-Oblate Shape Coexistence in $^{186}$Pt (1987), 1987GAZU. JUL-Spez-403, p.43 (1987)\n5. Evidence for oblate structure in $^{186}$Pb (2005), 2005PA42. Phys.Rev. C 72, 011304 (2005)\n\nAsk me about any of them by key number, or ask a follow-up and I'll read further into the corpus."
      }
    ]
  },
  {
    "meta": {
      "id": "seed-u235-fission-yields",
      "title": "What are the thermal neutron fission yields of 235U?",
      "favorite": false,
      "pinned": false,
      "hidden": false,
      "archived": false,
      "createdAt": "2026-11-04T15:00:00Z",
      "updatedAt": "2026-11-04T15:00:00Z"
    },
    "messages": [
      {
        "id": "seed-9-q",
        "role": "user",
        "content": "What are the thermal neutron fission yields of 235U?"
      },
      {
        "id": "seed-9-a",
        "role": "assistant",
        "content": "Here are the NSR papers my search finds closest to that question, out of the 303,568 references I hold, closest first:\n\n1. Uranium-235 Thermal Neutron Fission Yields (1953), 1953RE21. Phys.Rev. 92, 1473 (1953)\n2. Thermal-Neutron Fission Yields in U$^{235}$ (1951), 1951ENZT. Radiochemical Studies: The Fission Products, Book 3, Part V, McGraw-Hill, p.1372 (1951)\n3. Yields of Products from Thermal Neutron-Induced Fission of $^{235}$U (1990), 1990RU06. Radiochim.Acta 49, 155 (1990)\n4. Yields in U$^{235}$ Thermal Neutron Fission (1957), 1957BA16. Can.J.Chem. 35, 980 (1957)\n5. Determination of the U-235 thermal fission yields of stable neodymium fission products (1965), 1965RIZY. GEAP-5060 p.3 (1965)\n\nAsk me about any of them by key number, or ask a follow-up and I'll read further into the corpus."
      }
    ]
  }
]

export const seedChat = (id: string) => CHAT_SEEDS.find((s) => s.meta.id === id) ?? null
