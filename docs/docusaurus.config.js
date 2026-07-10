const path = require("node:path");
const { themes: prismThemes } = require("prism-react-renderer");
const {
  DEFAULT_LOCALE,
  LOCALES,
  getContentForLocale,
  getLocaleCodes,
  uiContent
} = require("./src/i18n/siteContent.cjs");

const githubUrl = "https://github.com/ihasq/wasmatrix";
const currentLocale = process.env.DOCUSAURUS_CURRENT_LOCALE ?? DEFAULT_LOCALE;
const ui = getContentForLocale(uiContent, currentLocale);
const localeConfigs = Object.fromEntries(
  LOCALES.map(({ code, label, htmlLang, direction }) => [
    code,
    {
      label,
      htmlLang,
      direction
    }
  ])
);

/** @type {import("@docusaurus/types").Config} */
const config = {
  title: "WASMatrix",
  tagline: ui.tagline,
  favicon: "img/favicon.svg",
  url: "https://ihasq.github.io",
  baseUrl: "/",
  organizationName: "ihasq",
  projectName: "wasmatrix",
  trailingSlash: false,
  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn"
    }
  },
  i18n: {
    defaultLocale: DEFAULT_LOCALE,
    locales: getLocaleCodes(),
    localeConfigs
  },
  stylesheets: [
    {
      href: "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600;700&family=Inter+Tight:wght@600;700;800&family=Inter:wght@400;500;600;700;800&display=swap",
      type: "text/css"
    }
  ],
  presets: [
    [
      "classic",
      /** @type {import("@docusaurus/preset-classic").Options} */
      ({
        docs: {
          routeBasePath: "docs",
          sidebarPath: "./sidebars.js",
          editUrl: `${githubUrl}/edit/main/docs/`
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css"
        }
      })
    ]
  ],
  plugins: [
    function wasmatrixSandboxPlugin() {
      return {
        name: "wasmatrix-sandbox-web-component",
        getClientModules() {
          return [path.resolve(__dirname, "src/components/wasmatrixSandboxElement.js")];
        }
      };
    }
  ],
  themeConfig:
    /** @type {import("@docusaurus/preset-classic").ThemeConfig} */
    ({
      image: "img/social-card.svg",
      navbar: {
        title: "WASMatrix",
        items: [
          {
            type: "docSidebar",
            sidebarId: "tutorialSidebar",
            position: "left",
            label: ui.docs
          },
          {
            type: "localeDropdown",
            position: "right"
          },
          {
            type: "html",
            position: "right",
            value:
              `<a href="${githubUrl}" class="navbar__item navbar__link header-github-link" aria-label="GitHub repository" target="_blank" rel="noopener noreferrer"></a>`
          }
        ]
      },
      footer: {
        style: "dark",
        links: [
          {
            title: ui.docs,
            items: [
              {
                label: ui.gettingStarted,
                to: "/docs/getting-started"
              },
              {
                label: ui.apiGuide,
                to: "/docs/api-guide"
              }
            ]
          },
          {
            title: ui.community,
            items: [
              {
                label: ui.github,
                href: githubUrl
              },
              {
                label: ui.issues,
                href: `${githubUrl}/issues`
              }
            ]
          }
        ],
        copyright: `Copyright © ${new Date().getFullYear()} ${ui.copyright}`
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ["bash"]
      },
      metadata: [
        {
          name: "keywords",
          content: "wasmatrix, wasm, webassembly, simd, matrix, assemblyscript, linear algebra"
        }
      ]
    })
};

module.exports = config;
