"use client";

import { createContext, useContext } from "react";

// The reader and the products' state, apart from the provider (2026-11-08), so a page that only reads the session
// (SignedIn, the sign-in form, Welcome) doesn't load the provider's motion and home cards with it. The provider is
// components/ProductStatus.tsx, mounted once in the root layout.

export type Status = "idle" | "loading" | "ready";

export type LinkProps = { href: string; onClick?: (e: React.MouseEvent) => void };

export type Ctx = {
  /** The signed-in reader's email; null while signed out or not yet known. */
  email: string | null;
  /** True once /api/auth/me has answered: from then on a null email means signed out, not unknown. */
  checked: boolean;
  /** The reader is a site admin (an email in NSRGPT_ADMIN_EMAILS, lib/auth.ts); false while signed out or unknown. */
  admin: boolean;
  superAdmin: boolean;
  /** "idle" while signed out (or not yet known); then loading → ready per product. */
  statusOf: (url: string) => Status;
  /** Where a product link goes and what a click does, given the reader and the product's state. */
  linkProps: (url: string) => LinkProps;
};

/** The default stands only outside the provider, which wraps every page. */
export const ProductStatusContext = createContext<Ctx>({ email: null, checked: false, admin: false, superAdmin: false, statusOf: () => "idle", linkProps: (url) => ({ href: url }) });

export const useProductStatus = () => useContext(ProductStatusContext);
