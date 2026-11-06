"use client";

import { HomeGrid } from "@/components/home-grid";

/** The background grid behind the masthead and the plate — on / alone (and wherever `always` asks for it, as the
 *  AWS pages that show the homepage do), as before the frame became the (plate) layout. */
export function PlateBackground({ always }: { always?: boolean }) {
    return always ? <HomeGrid /> : null;
}
