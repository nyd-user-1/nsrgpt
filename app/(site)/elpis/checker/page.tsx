import { Checker } from "@/components/elpis/checker/Checker"

// /elpis/checker (brief 71): the EXFOR TRANS checker, my version of JANIS Web's tool for EXFOR compilers. A static
// shell; the file goes to nsr-api's /exfor/check through ./api (components/elpis/checker/Checker.tsx).
export const metadata = { title: "EXFOR TRANS Checker" }

export default function Page() {
  return <Checker />
}
