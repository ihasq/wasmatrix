const path = require("node:path");
const { themes: prismThemes } = require("prism-react-renderer");

const githubUrl = "https://github.com/ihasq/wasmatrix";

/** @type {import("@docusaurus/types").Config} */
const config = {
  title: "WASMatrix",
  tagline: "AssemblyScript matrix operations for WebAssembly SIMD runtimes.",
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
    defaultLocale: "en",
    locales: ["en"]
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
            label: "Docs"
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
            title: "Docs",
            items: [
              {
                label: "Getting Started",
                to: "/docs/getting-started"
              },
              {
                label: "API Guide",
                to: "/docs/api-guide"
              }
            ]
          },
          {
            title: "Community",
            items: [
              {
                label: "GitHub",
                href: githubUrl
              },
              {
                label: "Issues",
                href: `${githubUrl}/issues`
              }
            ]
          }
        ],
        copyright: `Copyright © ${new Date().getFullYear()} WASMatrix contributors.`
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
