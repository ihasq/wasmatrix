const path = require("node:path");
const fs = require("node:fs/promises");
const { themes: prismThemes } = require("prism-react-renderer");
const {
  DEFAULT_LOCALE,
  LOCALES,
  getContentForLocale,
  getLocaleCodes,
  uiContent
} = require("./src/i18n/siteContent.cjs");

const githubUrl = "https://github.com/ihasq/wasmatrix";
const npmUrl = "https://www.npmjs.com/package/wasmatrix";
const siteUrl = (process.env.DOCS_SITE_URL || process.env.SITE_URL || "https://wasmatrix.pages.dev")
  .replace(/\/+$/, "");
const socialImage = "img/social-card.png";
const socialImageUrl = `${siteUrl}/${socialImage}`;
const seoKeywords = [
  "wasmatrix",
  "WebAssembly SIMD",
  "WASM matrix library",
  "AssemblyScript",
  "TypeScript matrix library",
  "JavaScript linear algebra",
  "browser matrix operations",
  "Node.js matrix operations"
];
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

function wasmatrixSeoFilesPlugin() {
  return {
    name: "wasmatrix-seo-files",
    async postBuild({ outDir }) {
      const sitemapUrls = [
        `${siteUrl}/sitemap.xml`,
        ...getLocaleCodes()
          .filter((locale) => locale !== DEFAULT_LOCALE)
          .map((locale) => `${siteUrl}/${locale}/sitemap.xml`)
      ];
      const robots = [
        "User-agent: *",
        "Allow: /",
        "",
        ...sitemapUrls.map((sitemapUrl) => `Sitemap: ${sitemapUrl}`),
        ""
      ].join("\n");

      await fs.writeFile(path.join(outDir, "robots.txt"), robots, "utf8");
    }
  };
}

/** @type {import("@docusaurus/types").Config} */
const config = {
  title: "WASMatrix",
  tagline: ui.tagline,
  favicon: "img/favicon.svg",
  url: siteUrl,
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
      href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600;700&family=Inter+Tight:wght@600;700;800&family=Inter:wght@400;500;600;700;800&display=swap",
      type: "text/css"
    }
  ],
  headTags: [
    {
      tagName: "link",
      attributes: {
        rel: "preconnect",
        href: "https://fonts.googleapis.com"
      }
    },
    {
      tagName: "link",
      attributes: {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossorigin: "anonymous"
      }
    },
    {
      tagName: "meta",
      attributes: {
        name: "theme-color",
        content: "#0f172a"
      }
    },
    {
      tagName: "meta",
      attributes: {
        name: "application-name",
        content: "WASMatrix"
      }
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
        sitemap: {
          changefreq: "weekly",
          priority: 0.8,
          ignorePatterns: ["/wasmatrix-runtime/**"]
        },
        theme: {
          customCss: "./src/css/custom.css"
        }
      })
    ]
  ],
  plugins: [
    wasmatrixSeoFilesPlugin,
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
      image: socialImage,
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
          content: seoKeywords.join(", ")
        },
        {
          name: "robots",
          content: "index, follow, max-image-preview:large"
        },
        {
          name: "googlebot",
          content: "index, follow, max-image-preview:large"
        },
        {
          property: "og:site_name",
          content: "WASMatrix"
        },
        {
          property: "og:type",
          content: "website"
        },
        {
          property: "og:image",
          content: socialImageUrl
        },
        {
          property: "og:image:width",
          content: "1200"
        },
        {
          property: "og:image:height",
          content: "630"
        },
        {
          property: "og:image:alt",
          content: "WASMatrix documentation"
        },
        {
          name: "twitter:card",
          content: "summary_large_image"
        },
        {
          name: "twitter:image",
          content: socialImageUrl
        },
        {
          name: "twitter:image:alt",
          content: "WASMatrix documentation"
        },
        {
          name: "npm",
          content: npmUrl
        }
      ]
    })
};

module.exports = config;
