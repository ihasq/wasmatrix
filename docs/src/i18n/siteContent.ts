const DEFAULT_LOCALE = "en";

const LOCALES = [
  { code: "en", label: "English", htmlLang: "en", direction: "ltr" },
  { code: "ja", label: "日本語", htmlLang: "ja-JP", direction: "ltr" },
  { code: "zh-CN", label: "简体中文", htmlLang: "zh-CN", direction: "ltr" },
  { code: "ko", label: "한국어", htmlLang: "ko-KR", direction: "ltr" },
  { code: "ru", label: "Русский", htmlLang: "ru-RU", direction: "ltr" },
  { code: "es", label: "Español", htmlLang: "es-ES", direction: "ltr" },
  { code: "fr", label: "Français", htmlLang: "fr-FR", direction: "ltr" },
  { code: "de", label: "Deutsch", htmlLang: "de-DE", direction: "ltr" },
  {
    code: "pt-BR",
    label: "Português (Brasil)",
    htmlLang: "pt-BR",
    direction: "ltr",
  },
  { code: "it", label: "Italiano", htmlLang: "it-IT", direction: "ltr" },
  { code: "nl", label: "Nederlands", htmlLang: "nl-NL", direction: "ltr" },
  { code: "pl", label: "Polski", htmlLang: "pl-PL", direction: "ltr" },
  { code: "tr", label: "Türkçe", htmlLang: "tr-TR", direction: "ltr" },
  { code: "ar", label: "العربية", htmlLang: "ar", direction: "rtl" },
  { code: "hi", label: "हिन्दी", htmlLang: "hi-IN", direction: "ltr" },
  {
    code: "id",
    label: "Bahasa Indonesia",
    htmlLang: "id-ID",
    direction: "ltr",
  },
  { code: "vi", label: "Tiếng Việt", htmlLang: "vi-VN", direction: "ltr" },
  { code: "th", label: "ไทย", htmlLang: "th-TH", direction: "ltr" },
  { code: "uk", label: "Українська", htmlLang: "uk-UA", direction: "ltr" },
  { code: "ms", label: "Bahasa Melayu", htmlLang: "ms-MY", direction: "ltr" },
];

const uiContent = {
  en: {
    tagline: "AssemblyScript matrix operations for WebAssembly SIMD runtimes.",
    docs: "Docs",
    gettingStarted: "Getting Started",
    apiGuide: "API Guide",
    community: "Community",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
  ja: {
    tagline: "WebAssembly SIMD ランタイム向けの AssemblyScript 行列演算。",
    docs: "ドキュメント",
    gettingStarted: "はじめに",
    apiGuide: "API ガイド",
    community: "コミュニティ",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
  "zh-CN": {
    tagline: "面向 WebAssembly SIMD 运行时的 AssemblyScript 矩阵运算。",
    docs: "文档",
    gettingStarted: "快速开始",
    apiGuide: "API 指南",
    community: "社区",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
  ko: {
    tagline: "WebAssembly SIMD 런타임을 위한 AssemblyScript 행렬 연산.",
    docs: "문서",
    gettingStarted: "시작하기",
    apiGuide: "API 가이드",
    community: "커뮤니티",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
  ru: {
    tagline: "Матричные операции AssemblyScript для сред WebAssembly SIMD.",
    docs: "Документация",
    gettingStarted: "Начало работы",
    apiGuide: "Руководство API",
    community: "Сообщество",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
  es: {
    tagline:
      "Operaciones matriciales en AssemblyScript para runtimes WebAssembly SIMD.",
    docs: "Documentación",
    gettingStarted: "Primeros pasos",
    apiGuide: "Guía de API",
    community: "Comunidad",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
  fr: {
    tagline:
      "Opérations matricielles AssemblyScript pour les runtimes WebAssembly SIMD.",
    docs: "Docs",
    gettingStarted: "Bien démarrer",
    apiGuide: "Guide API",
    community: "Communauté",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
  de: {
    tagline:
      "AssemblyScript-Matrixoperationen für WebAssembly-SIMD-Laufzeiten.",
    docs: "Dokumentation",
    gettingStarted: "Erste Schritte",
    apiGuide: "API-Leitfaden",
    community: "Community",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
  "pt-BR": {
    tagline:
      "Operações de matriz em AssemblyScript para runtimes WebAssembly SIMD.",
    docs: "Documentação",
    gettingStarted: "Primeiros passos",
    apiGuide: "Guia da API",
    community: "Comunidade",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
  it: {
    tagline:
      "Operazioni matriciali AssemblyScript per runtime WebAssembly SIMD.",
    docs: "Documentazione",
    gettingStarted: "Primi passi",
    apiGuide: "Guida API",
    community: "Community",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
  nl: {
    tagline: "AssemblyScript-matrixbewerkingen voor WebAssembly SIMD-runtimes.",
    docs: "Documentatie",
    gettingStarted: "Aan de slag",
    apiGuide: "API-gids",
    community: "Community",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
  pl: {
    tagline:
      "Operacje macierzowe AssemblyScript dla środowisk WebAssembly SIMD.",
    docs: "Dokumentacja",
    gettingStarted: "Pierwsze kroki",
    apiGuide: "Przewodnik API",
    community: "Społeczność",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
  tr: {
    tagline:
      "WebAssembly SIMD çalışma zamanları için AssemblyScript matris işlemleri.",
    docs: "Belgeler",
    gettingStarted: "Başlarken",
    apiGuide: "API Kılavuzu",
    community: "Topluluk",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
  ar: {
    tagline: "عمليات مصفوفات AssemblyScript لبيئات WebAssembly SIMD.",
    docs: "الوثائق",
    gettingStarted: "البدء",
    apiGuide: "دليل API",
    community: "المجتمع",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
  hi: {
    tagline:
      "WebAssembly SIMD runtimes के लिए AssemblyScript matrix operations.",
    docs: "दस्तावेज़",
    gettingStarted: "शुरू करें",
    apiGuide: "API गाइड",
    community: "समुदाय",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
  id: {
    tagline: "Operasi matriks AssemblyScript untuk runtime WebAssembly SIMD.",
    docs: "Dokumentasi",
    gettingStarted: "Mulai",
    apiGuide: "Panduan API",
    community: "Komunitas",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
  vi: {
    tagline: "Phép toán ma trận AssemblyScript cho runtime WebAssembly SIMD.",
    docs: "Tài liệu",
    gettingStarted: "Bắt đầu",
    apiGuide: "Hướng dẫn API",
    community: "Cộng đồng",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
  th: {
    tagline: "การคำนวณเมทริกซ์ AssemblyScript สำหรับ WebAssembly SIMD runtime.",
    docs: "เอกสาร",
    gettingStarted: "เริ่มต้น",
    apiGuide: "คู่มือ API",
    community: "ชุมชน",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
  uk: {
    tagline: "Матричні операції AssemblyScript для середовищ WebAssembly SIMD.",
    docs: "Документація",
    gettingStarted: "Початок роботи",
    apiGuide: "Довідник API",
    community: "Спільнота",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
  ms: {
    tagline: "Operasi matriks AssemblyScript untuk runtime WebAssembly SIMD.",
    docs: "Dokumentasi",
    gettingStarted: "Mula",
    apiGuide: "Panduan API",
    community: "Komuniti",
    github: "GitHub",
    issues: "Issues",
    copyright: "WASMatrix contributors.",
  },
};

const homeContent = {
  en: {
    title: "WASMatrix",
    description: uiContent.en.tagline,
    eyebrow: "AssemblyScript + WebAssembly SIMD",
    lede:
      "Fast dense matrix operations for JavaScript runtimes, with a TypeScript API and a SIMD-required WASM core.",
    getStarted: "Get started",
    apiGuide: "API guide",
    installAria: "Install command",
    features: [
      {
        title: "WASM memory first",
        body:
          "Matrix buffers stay in WebAssembly memory until an explicit readback asks for JavaScript values.",
      },
      {
        title: "Algebra-aware execution",
        body:
          "Lazy elementwise DAGs, transpose views, structure tags, and factorization caches reduce avoidable passes.",
      },
      {
        title: "Browser and server",
        body:
          "The ESM package ships JavaScript and WASM separately, using a bundler-friendly asset URL.",
      },
    ],
    tryEyebrow: "Try the runtime",
    tryTitle: "Use the same Matrix API in the guide.",
    tryBody:
      "The documentation includes a CodeMirror-based sandbox custom element with a live console, so examples can stay close to the API they describe.",
    optimizeEyebrow: "What it optimizes",
    optimizeTitle: "Less copying, fewer passes, reusable decomposition work.",
    operations: [
      "elementwise fusion",
      "matrix multiplication",
      "LU / Cholesky / QR",
      "Gram specialization",
      "broadcast vectors",
      "lazy inverse solves",
    ],
  },
  ja: {
    description: uiContent.ja.tagline,
    lede:
      "TypeScript API と SIMD 必須の WASM core で、JavaScript ランタイム向けの高速な密行列演算を提供します。",
    getStarted: "始める",
    apiGuide: "API ガイド",
    installAria: "インストールコマンド",
    features: [
      {
        title: "WASM メモリ優先",
        body:
          "明示的な readback まで、行列バッファは WebAssembly メモリ内に留まります。",
      },
      {
        title: "代数を意識した実行",
        body:
          "遅延 elementwise DAG、transpose view、構造タグ、分解 cache が不要な pass を減らします。",
      },
      {
        title: "ブラウザとサーバー",
        body:
          "ESM package は JavaScript と WASM を分けて配布し、bundler に扱いやすい asset URL を使います。",
      },
    ],
    tryEyebrow: "ランタイムを試す",
    tryTitle: "ガイドと同じ Matrix API を使えます。",
    tryBody:
      "ドキュメントには CodeMirror ベースの sandbox custom element と live console が含まれ、例を API の近くで実行できます。",
    optimizeEyebrow: "最適化対象",
    optimizeTitle: "コピーを減らし、pass を減らし、分解結果を再利用します。",
    operations: [
      "elementwise fusion",
      "matrix multiplication",
      "LU / Cholesky / QR",
      "Gram specialization",
      "broadcast vectors",
      "lazy inverse solves",
    ],
  },
  "zh-CN": {
    description: uiContent["zh-CN"].tagline,
    lede:
      "为 JavaScript 运行时提供快速密集矩阵运算，包含 TypeScript API 和必须支持 SIMD 的 WASM core。",
    getStarted: "开始使用",
    apiGuide: "API 指南",
    installAria: "安装命令",
    features: [
      {
        title: "WASM 内存优先",
        body:
          "矩阵缓冲区会保留在 WebAssembly 内存中，直到显式读取 JavaScript 值。",
      },
      {
        title: "代数感知执行",
        body:
          "惰性 elementwise DAG、transpose view、结构标签和分解缓存会减少不必要的 pass。",
      },
      {
        title: "浏览器与服务器",
        body:
          "ESM 包将 JavaScript 和 WASM 分开发布，并使用适合 bundler 的 asset URL。",
      },
    ],
    tryEyebrow: "试用运行时",
    tryTitle: "在指南中使用同一个 Matrix API。",
    tryBody:
      "文档包含基于 CodeMirror 的 sandbox custom element 和实时 console，示例可以贴近 API 运行。",
    optimizeEyebrow: "优化内容",
    optimizeTitle: "更少复制、更少 pass，并复用分解结果。",
    operations: [
      "elementwise fusion",
      "matrix multiplication",
      "LU / Cholesky / QR",
      "Gram specialization",
      "broadcast vectors",
      "lazy inverse solves",
    ],
  },
  ko: {
    description: uiContent.ko.tagline,
    lede:
      "TypeScript API와 SIMD 필수 WASM core로 JavaScript 런타임에서 빠른 dense matrix 연산을 제공합니다.",
    getStarted: "시작하기",
    apiGuide: "API 가이드",
    installAria: "설치 명령",
    features: [
      {
        title: "WASM 메모리 우선",
        body:
          "명시적으로 읽기 전까지 행렬 버퍼는 WebAssembly 메모리에 유지됩니다.",
      },
      {
        title: "대수 인식 실행",
        body:
          "지연 elementwise DAG, transpose view, 구조 태그, 분해 cache가 불필요한 pass를 줄입니다.",
      },
      {
        title: "브라우저와 서버",
        body:
          "ESM 패키지는 JavaScript와 WASM을 분리해 배포하고 bundler 친화적인 asset URL을 사용합니다.",
      },
    ],
    tryEyebrow: "런타임 체험",
    tryTitle: "가이드와 같은 Matrix API를 사용합니다.",
    tryBody:
      "문서에는 CodeMirror 기반 sandbox custom element와 live console이 있어 예제를 API 가까이에서 실행할 수 있습니다.",
    optimizeEyebrow: "최적화 대상",
    optimizeTitle: "복사와 pass를 줄이고 분해 작업을 재사용합니다.",
    operations: [
      "elementwise fusion",
      "matrix multiplication",
      "LU / Cholesky / QR",
      "Gram specialization",
      "broadcast vectors",
      "lazy inverse solves",
    ],
  },
  ru: {
    description: uiContent.ru.tagline,
    lede:
      "Быстрые операции над плотными матрицами для JavaScript-сред: TypeScript API и WASM core с обязательным SIMD.",
    getStarted: "Начать",
    apiGuide: "Руководство API",
    installAria: "Команда установки",
    features: [
      {
        title: "Сначала WASM-память",
        body:
          "Буферы матриц остаются в памяти WebAssembly, пока вы явно не запросите значения в JavaScript.",
      },
      {
        title: "Алгебраическое выполнение",
        body:
          "Ленивые elementwise DAG, transpose view, структурные теги и cache факторизаций уменьшают лишние проходы.",
      },
      {
        title: "Браузер и сервер",
        body:
          "ESM-пакет поставляет JavaScript и WASM отдельно и использует asset URL, удобный для bundler.",
      },
    ],
    tryEyebrow: "Попробуйте runtime",
    tryTitle: "Используйте тот же Matrix API из руководства.",
    tryBody:
      "В документацию встроен sandbox на CodeMirror с live console, поэтому примеры можно запускать рядом с описанием API.",
    optimizeEyebrow: "Что оптимизируется",
    optimizeTitle:
      "Меньше копирования, меньше проходов, повторное использование разложений.",
    operations: [
      "elementwise fusion",
      "matrix multiplication",
      "LU / Cholesky / QR",
      "Gram specialization",
      "broadcast vectors",
      "lazy inverse solves",
    ],
  },
};

const genericHome = {
  es: {
    description: uiContent.es.tagline,
    lede:
      "Operaciones rápidas con matrices densas para runtimes JavaScript, con API TypeScript y un core WASM que requiere SIMD.",
    getStarted: "Empezar",
    apiGuide: "Guía de API",
  },
  fr: {
    description: uiContent.fr.tagline,
    lede:
      "Opérations rapides sur matrices denses pour les runtimes JavaScript, avec une API TypeScript et un core WASM qui requiert SIMD.",
    getStarted: "Commencer",
    apiGuide: "Guide API",
  },
  de: {
    description: uiContent.de.tagline,
    lede:
      "Schnelle Operationen für dichte Matrizen in JavaScript-Laufzeiten, mit TypeScript-API und SIMD-pflichtigem WASM-Core.",
    getStarted: "Loslegen",
    apiGuide: "API-Leitfaden",
  },
  "pt-BR": {
    description: uiContent["pt-BR"].tagline,
    lede:
      "Operações rápidas com matrizes densas para runtimes JavaScript, com API TypeScript e core WASM que exige SIMD.",
    getStarted: "Começar",
    apiGuide: "Guia da API",
  },
  it: {
    description: uiContent.it.tagline,
    lede:
      "Operazioni rapide su matrici dense per runtime JavaScript, con API TypeScript e core WASM che richiede SIMD.",
    getStarted: "Inizia",
    apiGuide: "Guida API",
  },
  nl: {
    description: uiContent.nl.tagline,
    lede:
      "Snelle bewerkingen op dichte matrices voor JavaScript-runtimes, met een TypeScript API en een WASM-core die SIMD vereist.",
    getStarted: "Aan de slag",
    apiGuide: "API-gids",
  },
  pl: {
    description: uiContent.pl.tagline,
    lede:
      "Szybkie operacje na gęstych macierzach dla środowisk JavaScript, z API TypeScript i rdzeniem WASM wymagającym SIMD.",
    getStarted: "Start",
    apiGuide: "Przewodnik API",
  },
  tr: {
    description: uiContent.tr.tagline,
    lede:
      "JavaScript çalışma zamanları için hızlı yoğun matris işlemleri; TypeScript API ve SIMD gerektiren WASM core ile.",
    getStarted: "Başla",
    apiGuide: "API Kılavuzu",
  },
  ar: {
    description: uiContent.ar.tagline,
    lede:
      "عمليات سريعة للمصفوفات الكثيفة في بيئات JavaScript، مع API TypeScript ونواة WASM تتطلب SIMD.",
    getStarted: "ابدأ",
    apiGuide: "دليل API",
  },
  hi: {
    description: uiContent.hi.tagline,
    lede:
      "JavaScript runtimes के लिए तेज dense matrix operations, TypeScript API और SIMD-required WASM core के साथ.",
    getStarted: "शुरू करें",
    apiGuide: "API गाइड",
  },
  id: {
    description: uiContent.id.tagline,
    lede:
      "Operasi matriks dense yang cepat untuk runtime JavaScript, dengan API TypeScript dan core WASM yang mewajibkan SIMD.",
    getStarted: "Mulai",
    apiGuide: "Panduan API",
  },
  vi: {
    description: uiContent.vi.tagline,
    lede:
      "Phép toán ma trận dense nhanh cho runtime JavaScript, với API TypeScript và core WASM bắt buộc SIMD.",
    getStarted: "Bắt đầu",
    apiGuide: "Hướng dẫn API",
  },
  th: {
    description: uiContent.th.tagline,
    lede:
      "การคำนวณเมทริกซ์ dense ที่รวดเร็วสำหรับ JavaScript runtime พร้อม TypeScript API และ WASM core ที่ต้องใช้ SIMD.",
    getStarted: "เริ่มต้น",
    apiGuide: "คู่มือ API",
  },
  uk: {
    description: uiContent.uk.tagline,
    lede:
      "Швидкі операції з щільними матрицями для JavaScript-середовищ, з TypeScript API та WASM core, що потребує SIMD.",
    getStarted: "Почати",
    apiGuide: "Довідник API",
  },
  ms: {
    description: uiContent.ms.tagline,
    lede:
      "Operasi matriks dense yang pantas untuk runtime JavaScript, dengan API TypeScript dan core WASM yang memerlukan SIMD.",
    getStarted: "Mula",
    apiGuide: "Panduan API",
  },
};

for (const [locale, values] of Object.entries(genericHome)) {
  homeContent[locale] = {
    ...homeContent.en,
    ...values,
    installAria: uiContent[locale].installAria ?? homeContent.en.installAria,
    features: homeContent.en.features,
    operations: homeContent.en.operations,
  };
}

const apiGuideContent = {
  en: {
    title: "API Guide",
    description: "A generated guide to the WASMatrix public API.",
    generatedComment:
      "This file is generated by docs/scripts/generate-api-guide.ts from index.d.ts TSDoc. Do not edit it directly.",
    intro:
      "The default export is the `Matrix` class. Named exports include runtime helpers and global configuration.",
    generatedNote:
      "This page is generated from the TSDoc comments in `index.d.ts`, which is copied to `dist/index.d.ts` during the package build.",
    runtimeHelpers: "Runtime Helpers",
    configurationOptions: "Configuration Options",
    wasmBytes: "WasmBytes",
    constructor: "Constructor",
    properties: "Properties",
    staticMethods: "Static Methods",
    parameter: "Parameter",
    type: "Type",
    descriptionLabel: "Description",
    option: "Option",
    defaultLabel: "Default",
    remarks: "Remarks",
    returns: "Returns",
    throws: "Throws",
    methodGroups: {
      readingAndWriting: "Reading And Writing",
      elementwise: "Elementwise Operations",
      matrixOperations: "Matrix Operations",
      reductions: "Reductions",
      linearAlgebra: "Linear Algebra",
      memoryManagement: "Memory Management",
      utilities: "Utilities",
    },
  },
  ja: {
    title: "API ガイド",
    description: "WASMatrix public API の自動生成ガイド。",
    generatedComment:
      "このファイルは index.d.ts の TSDoc から docs/scripts/generate-api-guide.ts により生成されます。直接編集しないでください。",
    intro:
      "default export は `Matrix` class です。named export には runtime helper と global configuration が含まれます。",
    generatedNote:
      "このページは `index.d.ts` の TSDoc comments から生成されます。`index.d.ts` は package build 時に `dist/index.d.ts` へコピーされます。",
    runtimeHelpers: "Runtime Helpers",
    configurationOptions: "Configuration Options",
    wasmBytes: "WasmBytes",
    constructor: "Constructor",
    properties: "Properties",
    staticMethods: "Static Methods",
    parameter: "Parameter",
    type: "Type",
    descriptionLabel: "Description",
    option: "Option",
    defaultLabel: "Default",
    remarks: "Remarks",
    returns: "Returns",
    throws: "Throws",
    methodGroups: {
      readingAndWriting: "読み書き",
      elementwise: "Elementwise Operations",
      matrixOperations: "Matrix Operations",
      reductions: "Reductions",
      linearAlgebra: "Linear Algebra",
      memoryManagement: "Memory Management",
      utilities: "Utilities",
    },
  },
};

const translatedApiTitles = {
  "zh-CN": ["API 指南", "WASMatrix public API 的自动生成指南。"],
  ko: ["API 가이드", "WASMatrix public API 자동 생성 가이드."],
  ru: [
    "Руководство API",
    "Автоматически созданное руководство по public API WASMatrix.",
  ],
  es: ["Guía de API", "Guía generada del public API de WASMatrix."],
  fr: ["Guide API", "Guide généré de la public API de WASMatrix."],
  de: ["API-Leitfaden", "Generierter Leitfaden zur public API von WASMatrix."],
  "pt-BR": ["Guia da API", "Guia gerado para a public API do WASMatrix."],
  it: ["Guida API", "Guida generata per la public API di WASMatrix."],
  nl: ["API-gids", "Gegenereerde gids voor de public API van WASMatrix."],
  pl: ["Przewodnik API", "Wygenerowany przewodnik po public API WASMatrix."],
  tr: ["API Kılavuzu", "WASMatrix public API için oluşturulmuş kılavuz."],
  ar: ["دليل API", "دليل مولد لواجهة WASMatrix public API."],
  hi: ["API गाइड", "WASMatrix public API के लिए generated guide."],
  id: ["Panduan API", "Panduan yang dibuat dari public API WASMatrix."],
  vi: ["Hướng dẫn API", "Hướng dẫn được tạo cho public API của WASMatrix."],
  th: ["คู่มือ API", "คู่มือที่สร้างจาก public API ของ WASMatrix."],
  uk: ["Довідник API", "Автоматично створений довідник public API WASMatrix."],
  ms: ["Panduan API", "Panduan yang dijana untuk public API WASMatrix."],
};

for (
  const [locale, [title, description]] of Object.entries(translatedApiTitles)
) {
  apiGuideContent[locale] = {
    ...apiGuideContent.en,
    title,
    description,
  };
}

const gettingStartedContent = {
  en: {
    title: "Getting Started",
    description:
      "Install WASMatrix, load its WebAssembly SIMD runtime, and run practical matrix workflows.",
    intro:
      "WASMatrix is a TypeScript-authored matrix library backed by an AssemblyScript WebAssembly core. It keeps matrix buffers in WASM memory, uses `f32` row-major storage, and requires WebAssembly SIMD.",
    checklistIntro:
      "This guide walks through the first things most users need:",
    checklist: [
      "install the package",
      "create matrices",
      "run matrix, elementwise, and linear algebra operations",
      "read results back only when you need them",
      "understand when cached factorizations and lazy views help",
    ],
    installation: "Installation",
    installationBody:
      "WASMatrix is ESM-only. Importing the package initializes the adjacent WASM asset with top-level await.",
    packageBody:
      'The package ships JavaScript and WASM separately. The runtime resolves `dist/wasmatrix.wasm` with `new URL("./wasmatrix.wasm", import.meta.url)`, so Node, Deno, Bun, browsers, CDNs, and bundlers can handle the asset in their normal way.',
    requirements: "Runtime Requirements",
    requirementsBody:
      "WASMatrix needs ESM, top-level await, and WebAssembly SIMD. If SIMD validation fails, initialization throws instead of silently falling back to a scalar implementation.",
    firstProgram: "Run Your First Program",
    firstProgramBody:
      "Create a file named `hello.ts` and solve a small linear system. Deno and Bun can run it directly; Node projects can use their normal TypeScript toolchain.",
    firstProgramResult:
      "The solve, determinant, and multiplication work runs inside WASM. JavaScript receives values only when `toArray()`, `determinant()`, or `equalsApprox()` reads them back.",
    createMatrices: "Create Matrices",
    createMatricesBody:
      "`Matrix.from(rows, cols, values)` uses row-major values. Static constructors such as `zeros`, `ones`, `identity`, and `diagonal` also carry structure tags for later shortcuts.",
    keepData: "Keep Data In WASM",
    keepDataBody:
      "Most methods return another `Matrix`, and the result stays in WASM memory. Read back with `toArray()`, `toFloat32Array()`, `row()`, `column()`, or `diagonal()` only when JavaScript needs the values.",
    elementwise: "Elementwise pipeline",
    elementwiseBody:
      "Elementwise chains are represented lazily and fused into one WASM pass when materialized. Row and column vectors broadcast without expanding to dense matrices.",
    linear: "Linear Algebra Without Dense Inverses",
    linearBody:
      "Prefer `solve()` when you want `A^-1 B`. WASMatrix can reuse versioned LU, Cholesky, and QR caches across compatible `determinant`, `solve`, `inverse`, and `rank` calls on the same matrix object.",
    mutation: "Mutation And Cache Invalidation",
    mutationBody:
      "`set()` increments the matrix version and invalidates cached factorizations, reductions, packed operands, and materialized views. Keep the coefficient matrix object stable when you want cache reuse.",
    configuration: "設定",
    configurationBody:
      "`fastMath` enables more aggressive algebraic rewrites. `cacheLimitBytes` controls the WASM heap budget used by reusable caches.",
    dispose: "Dispose Long-Lived Temporaries",
    disposeBody:
      "Long-running services, apps, and benchmarks should call `dispose()` for large temporaries when they are no longer needed.",
    development: "Development Build",
    developmentBody:
      "`deno task build` compiles the AssemblyScript kernel, the TypeScript runtime, and the distributable WASM file. The benchmark suite prints JSON timings, speedups, and checksums.",
    next: "Where To Go Next",
    nextBody:
      "Read the [API Guide](./api-guide.md) for the full method list, structural shortcuts, cache behavior, and memory-management details.",
  },
  ja: {
    title: "はじめに",
    description:
      "WASMatrix を install し、WebAssembly SIMD runtime を load して、実用的な matrix workflow を動かします。",
    intro:
      "WASMatrix は AssemblyScript WebAssembly core に支えられた TypeScript 製 matrix library です。matrix buffer は WASM memory に保持され、`f32` row-major storage を使い、WebAssembly SIMD を必須とします。",
    checklistIntro: "この guide では最初に必要になる内容を順に扱います:",
    checklist: [
      "package の install",
      "matrix の作成",
      "matrix / elementwise / linear algebra operation の実行",
      "必要な時だけ result を readback すること",
      "factorization cache と lazy view が効く場面の理解",
    ],
    installation: "インストール",
    installationBody:
      "WASMatrix は ESM-only です。package を import すると top-level await により隣接する WASM asset が初期化されます。",
    packageBody:
      'package は JavaScript と WASM を別々に配布します。runtime は `new URL("./wasmatrix.wasm", import.meta.url)` で `dist/wasmatrix.wasm` を解決するため、Node、Deno、Bun、browser、CDN、bundler が通常の asset として扱えます。',
    requirements: "実行要件",
    requirementsBody:
      "WASMatrix には ESM、top-level await、WebAssembly SIMD が必要です。SIMD validation に失敗した場合は scalar fallback せず initialization 時に throw します。",
    firstProgram: "最初のプログラムを実行する",
    firstProgramBody:
      "`hello.ts` を作成し、小さな linear system を解きます。Deno と Bun は直接実行でき、Node project では通常の TypeScript toolchain を利用できます。",
    firstProgramResult:
      "`solve`、`determinant`、`matmul` は WASM 内で実行されます。JavaScript が値を受け取るのは `toArray()`、`determinant()`、`equalsApprox()` などで readback した時だけです。",
    createMatrices: "行列を作成する",
    createMatricesBody:
      "`Matrix.from(rows, cols, values)` は row-major values を受け取ります。`zeros`、`ones`、`identity`、`diagonal` などの static constructor は後続 shortcut のための structure tag も保持します。",
    keepData: "データを WASM に保持する",
    keepDataBody:
      "多くの method は別の `Matrix` を返し、結果は WASM memory に留まります。JavaScript 側で値が必要になった時だけ `toArray()`、`toFloat32Array()`、`row()`、`column()`、`diagonal()` で readback してください。",
    elementwise: "Elementwise Pipelines",
    elementwiseBody:
      "Elementwise chain は lazy に表現され、materialize 時に 1 つの WASM pass へ fusion されます。row/column vector は dense matrix に展開せず broadcast できます。",
    linear: "密な逆行列を作らない線形代数",
    linearBody:
      "`A^-1 B` が欲しい場合は `solve()` を優先してください。同じ matrix object では versioned LU、Cholesky、QR cache を `determinant`、`solve`、`inverse`、`rank` の間で再利用できます。",
    mutation: "変更と cache invalidation",
    mutationBody:
      "`set()` は matrix version を進め、factorization、reduction、packed operand、materialized view の cache を invalidate します。cache reuse したい場合は係数 matrix object を安定させてください。",
    configuration: "Configuration",
    configurationBody:
      "`fastMath` はより積極的な代数 rewrite を有効化します。`cacheLimitBytes` は reusable cache が使う WASM heap budget を制御します。",
    dispose: "長寿命の temporary を dispose する",
    disposeBody:
      "長時間動く service、app、benchmark では、不要になった大きな temporary に `dispose()` を呼んでください。",
    development: "開発ビルド",
    developmentBody:
      "`deno task build` は AssemblyScript kernel、TypeScript runtime、配布用 WASM file を compile します。benchmark suite は timing、speedup、checksum を JSON で出力します。",
    next: "次に読むもの",
    nextBody:
      "全 method、structural shortcut、cache behavior、memory management の詳細は [API Guide](./api-guide.md) を読んでください。",
  },
};

const localizedGettingStarted = {
  "zh-CN": [
    "快速开始",
    "安装 WASMatrix，加载 WebAssembly SIMD runtime，并运行实际的矩阵工作流。",
    "WASMatrix 是由 AssemblyScript WebAssembly core 支撑的 TypeScript 矩阵库。矩阵缓冲区保留在 WASM memory 中，使用 `f32` row-major storage，并要求 WebAssembly SIMD。",
  ],
  ko: [
    "시작하기",
    "WASMatrix를 설치하고 WebAssembly SIMD runtime을 로드한 뒤 실용적인 행렬 workflow를 실행합니다.",
    "WASMatrix는 AssemblyScript WebAssembly core를 사용하는 TypeScript 행렬 라이브러리입니다. 행렬 버퍼는 WASM memory에 유지되고 `f32` row-major storage를 사용하며 WebAssembly SIMD가 필요합니다.",
  ],
  ru: [
    "Начало работы",
    "Установите WASMatrix, загрузите WebAssembly SIMD runtime и запустите практический матричный workflow.",
    "WASMatrix — библиотека матриц на TypeScript с AssemblyScript WebAssembly core. Буферы матриц остаются в WASM memory, используется `f32` row-major storage, а WebAssembly SIMD обязателен.",
  ],
  es: [
    "Primeros pasos",
    "Instala WASMatrix, carga su runtime WebAssembly SIMD y ejecuta flujos de trabajo prácticos con matrices.",
    "WASMatrix es una biblioteca de matrices escrita en TypeScript y respaldada por un core AssemblyScript WebAssembly. Mantiene los buffers en WASM memory, usa almacenamiento `f32` row-major y requiere WebAssembly SIMD.",
  ],
  fr: [
    "Bien démarrer",
    "Installez WASMatrix, chargez son runtime WebAssembly SIMD et exécutez des workflows matriciels pratiques.",
    "WASMatrix est une bibliothèque matricielle TypeScript soutenue par un core AssemblyScript WebAssembly. Les buffers restent en WASM memory, le stockage est `f32` row-major et WebAssembly SIMD est requis.",
  ],
  de: [
    "Erste Schritte",
    "Installiere WASMatrix, lade die WebAssembly-SIMD-Laufzeit und führe praktische Matrix-Workflows aus.",
    "WASMatrix ist eine TypeScript-Matrixbibliothek mit AssemblyScript-WebAssembly-Core. Matrixpuffer bleiben im WASM memory, nutzen `f32` row-major storage und benötigen WebAssembly SIMD.",
  ],
  "pt-BR": [
    "Primeiros passos",
    "Instale o WASMatrix, carregue o runtime WebAssembly SIMD e execute fluxos práticos de matriz.",
    "WASMatrix é uma biblioteca de matrizes em TypeScript com core AssemblyScript WebAssembly. Os buffers ficam na WASM memory, usam armazenamento `f32` row-major e exigem WebAssembly SIMD.",
  ],
  it: [
    "Primi passi",
    "Installa WASMatrix, carica il runtime WebAssembly SIMD ed esegui workflow pratici con matrici.",
    "WASMatrix è una libreria di matrici TypeScript basata su un core AssemblyScript WebAssembly. I buffer restano in WASM memory, usano storage `f32` row-major e richiedono WebAssembly SIMD.",
  ],
  nl: [
    "Aan de slag",
    "Installeer WASMatrix, laad de WebAssembly SIMD-runtime en voer praktische matrixworkflows uit.",
    "WASMatrix is een TypeScript-matrixbibliotheek met een AssemblyScript WebAssembly-core. Matrixbuffers blijven in WASM memory, gebruiken `f32` row-major storage en vereisen WebAssembly SIMD.",
  ],
  pl: [
    "Pierwsze kroki",
    "Zainstaluj WASMatrix, załaduj runtime WebAssembly SIMD i uruchom praktyczne przepływy pracy z macierzami.",
    "WASMatrix to biblioteka macierzy w TypeScript oparta na AssemblyScript WebAssembly core. Bufory pozostają w WASM memory, używają `f32` row-major storage i wymagają WebAssembly SIMD.",
  ],
  tr: [
    "Başlarken",
    "WASMatrix'i kurun, WebAssembly SIMD runtime'ını yükleyin ve pratik matris workflow'ları çalıştırın.",
    "WASMatrix, AssemblyScript WebAssembly core ile desteklenen TypeScript tabanlı bir matris kütüphanesidir. Matris buffer'ları WASM memory içinde kalır, `f32` row-major storage kullanır ve WebAssembly SIMD gerektirir.",
  ],
  ar: [
    "البدء",
    "ثبّت WASMatrix، وحمّل WebAssembly SIMD runtime، ثم شغّل workflows عملية للمصفوفات.",
    "WASMatrix مكتبة مصفوفات مكتوبة بـ TypeScript ومدعومة بنواة AssemblyScript WebAssembly. تبقى buffers المصفوفات في WASM memory، وتستخدم `f32` row-major storage، وتتطلب WebAssembly SIMD.",
  ],
  hi: [
    "शुरू करें",
    "WASMatrix install करें, WebAssembly SIMD runtime load करें, और practical matrix workflows चलाएँ.",
    "WASMatrix एक TypeScript matrix library है जिसे AssemblyScript WebAssembly core support करता है। Matrix buffers WASM memory में रहते हैं, `f32` row-major storage इस्तेमाल करते हैं, और WebAssembly SIMD आवश्यक है।",
  ],
  id: [
    "Mulai",
    "Instal WASMatrix, muat runtime WebAssembly SIMD, lalu jalankan workflow matriks praktis.",
    "WASMatrix adalah library matriks TypeScript yang didukung core AssemblyScript WebAssembly. Buffer matriks tetap berada di WASM memory, memakai storage `f32` row-major, dan membutuhkan WebAssembly SIMD.",
  ],
  vi: [
    "Bắt đầu",
    "Cài WASMatrix, tải WebAssembly SIMD runtime và chạy các workflow ma trận thực tế.",
    "WASMatrix là thư viện ma trận viết bằng TypeScript với core AssemblyScript WebAssembly. Buffer ma trận nằm trong WASM memory, dùng `f32` row-major storage và yêu cầu WebAssembly SIMD.",
  ],
  th: [
    "เริ่มต้น",
    "ติดตั้ง WASMatrix โหลด WebAssembly SIMD runtime และรัน workflow เมทริกซ์แบบใช้งานจริง",
    "WASMatrix เป็นไลบรารีเมทริกซ์ TypeScript ที่มี AssemblyScript WebAssembly core รองรับ buffer ของเมทริกซ์จะอยู่ใน WASM memory ใช้ `f32` row-major storage และต้องมี WebAssembly SIMD",
  ],
  uk: [
    "Початок роботи",
    "Встановіть WASMatrix, завантажте WebAssembly SIMD runtime і запустіть практичні matrix workflow.",
    "WASMatrix — TypeScript-бібліотека матриць з AssemblyScript WebAssembly core. Буфери матриць залишаються у WASM memory, використовується `f32` row-major storage, а WebAssembly SIMD є обов'язковим.",
  ],
  ms: [
    "Mula",
    "Pasang WASMatrix, muatkan runtime WebAssembly SIMD, dan jalankan workflow matriks praktikal.",
    "WASMatrix ialah library matriks TypeScript yang disokong oleh core AssemblyScript WebAssembly. Buffer matriks kekal dalam WASM memory, menggunakan storage `f32` row-major, dan memerlukan WebAssembly SIMD.",
  ],
};

for (
  const [locale, [title, description, intro]] of Object.entries(
    localizedGettingStarted,
  )
) {
  gettingStartedContent[locale] = {
    ...gettingStartedContent.en,
    title,
    description,
    intro,
    nextBody: gettingStartedContent.en.nextBody,
  };
}

function getContentForLocale(map, locale) {
  return map[locale] ?? map[locale?.split("-")[0]] ?? map[DEFAULT_LOCALE];
}

function getLocaleCodes() {
  return LOCALES.map((locale) => locale.code);
}

export {
  apiGuideContent,
  DEFAULT_LOCALE,
  getContentForLocale,
  getLocaleCodes,
  gettingStartedContent,
  homeContent,
  LOCALES,
  uiContent,
};

export default {
  DEFAULT_LOCALE,
  LOCALES,
  apiGuideContent,
  getContentForLocale,
  getLocaleCodes,
  gettingStartedContent,
  homeContent,
  uiContent,
};
