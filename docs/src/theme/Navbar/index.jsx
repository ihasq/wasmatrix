import React from "react";
import { useLocation } from "@docusaurus/router";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import Navbar from "@theme-original/Navbar";

function normalizePath(pathname) {
  return pathname.replace(/\/+$/, "") || "/";
}

export default function NavbarWrapper(props) {
  const { pathname } = useLocation();
  const {
    i18n: { currentLocale, defaultLocale }
  } = useDocusaurusContext();
  const currentPath = normalizePath(pathname);
  const homePath = currentLocale === defaultLocale ? "/" : `/${currentLocale}`;
  const isLandingPage = currentPath === homePath;

  return (
    <div className={isLandingPage ? "wasmatrix-lp-navbar" : undefined}>
      <Navbar {...props} />
    </div>
  );
}
