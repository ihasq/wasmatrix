import type React from "react";

type WasmatrixSandboxAttributes =
  & React.DetailedHTMLProps<
    React.HTMLAttributes<HTMLElement>,
    HTMLElement
  >
  & {
    code?: string;
    "package-url"?: string;
  };

declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

declare module "@generated/docusaurus.config" {
  const siteConfig: {
    baseUrl: string;
    url: string;
  };
  export default siteConfig;
}

declare module "@docusaurus/Head" {
  const Head: React.ComponentType<React.PropsWithChildren>;
  export default Head;
}

declare module "@docusaurus/Link" {
  const Link: React.ComponentType<
    React.PropsWithChildren<{ className?: string; to?: string }>
  >;
  export default Link;
}

declare module "@docusaurus/router" {
  export function useLocation(): { pathname: string };
}

declare module "@docusaurus/useDocusaurusContext" {
  export default function useDocusaurusContext(): {
    i18n: {
      currentLocale: string;
      defaultLocale: string;
    };
    siteConfig: {
      url: string;
    };
  };
}

declare module "@theme/Layout" {
  const Layout: React.ComponentType<
    React.PropsWithChildren<{ title?: string; description?: string }>
  >;
  export default Layout;
}

declare module "@theme-original/Navbar" {
  const Navbar: React.ComponentType<Record<string, unknown>>;
  export default Navbar;
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "wasmatrix-sandbox": WasmatrixSandboxAttributes;
    }
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "wasmatrix-sandbox": WasmatrixSandboxAttributes;
    }
  }
}
