import { useEffect, useMemo, useState } from 'react';

type ModelOption = {
  label: string;
  value: string;
};

type LanguageOption = {
  label: string;
  value: string;
};

type Theme = 'light' | 'dark';

const MODEL_OPTIONS: ModelOption[] = [
  { label: 'Gemini 3.1 Flash Lite', value: 'gemini-3.1-flash-lite' },
  { label: 'Gemini 3.5 Flash Lite', value: 'gemini-3.5-flash-lite' },
  { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
  { label: 'Gemini 3 Flash', value: 'gemini-3-flash' },
  { label: 'Gemini 3.5 Flash', value: 'gemini-3.5-flash' },
];

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { label: '繁體中文', value: '繁體中文' },
  { label: '簡體中文', value: '簡體中文' },
  { label: '英文', value: '英文' },
  { label: '日文', value: '日文' },
  { label: '韓文', value: '韓文' },
];

const STORAGE_KEYS = {
  apiKey: 'ai-translator.apiKey',
  model: 'ai-translator.model',
  targetLanguage: 'ai-translator.targetLanguage',
  theme: 'ai-translator.theme',
  annotateJapanese: 'ai-translator.annotateJapanese',
};

function getStoredValue(key: string, fallback: string) {
  if (typeof window === 'undefined') {
    return fallback;
  }

  return window.localStorage.getItem(key) ?? fallback;
}

function buildPrompt(sourceText: string, targetLanguage: string, annotateJapanese: boolean) {
  const targetInstruction =
    targetLanguage === '日文' && annotateJapanese
      ? 'Translate into natural Japanese. When kanji appears, annotate the reading in parentheses right after the kanji or kanji phrase, for example 漢字(かんじ). Keep the response as only the translated text.'
      : `Translate into ${targetLanguage}. Return only the translated text and nothing else.`;

  return [
    'You are a precise translation engine.',
    targetInstruction,
    'Preserve line breaks, formatting, numbers, and named entities unless translation requires otherwise.',
    '',
    'Source text:',
    sourceText,
  ].join('\n');
}

async function translateWithGemini(
  apiKey: string,
  model: string,
  sourceText: string,
  targetLanguage: string,
  annotateJapanese: boolean,
) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: buildPrompt(sourceText, targetLanguage, annotateJapanese) }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(errorBody?.error?.message ?? `Gemini API request failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();

  if (!text) {
    throw new Error('Gemini did not return translation text.');
  }

  return text;
}

export default function App() {
  const [apiKey, setApiKey] = useState(() => getStoredValue(STORAGE_KEYS.apiKey, ''));
  const [model, setModel] = useState(() => getStoredValue(STORAGE_KEYS.model, MODEL_OPTIONS[0].value));
  const [targetLanguage, setTargetLanguage] = useState(() =>
    getStoredValue(STORAGE_KEYS.targetLanguage, LANGUAGE_OPTIONS[0].value),
  );
  const [theme, setTheme] = useState<Theme>(() => getStoredValue(STORAGE_KEYS.theme, 'light') as Theme);
  const [annotateJapanese, setAnnotateJapanese] = useState(
    () => getStoredValue(STORAGE_KEYS.annotateJapanese, 'true') === 'true',
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.apiKey, apiKey);
  }, [apiKey]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.model, model);
  }, [model]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.targetLanguage, targetLanguage);
  }, [targetLanguage]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.theme, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.annotateJapanese, String(annotateJapanese));
  }, [annotateJapanese]);

  useEffect(() => {
    if (feedback) {
      const timeoutId = window.setTimeout(() => setFeedback(''), 3200);
      return () => window.clearTimeout(timeoutId);
    }
  }, [feedback]);

  const canTranslate = useMemo(() => {
    return apiKey.trim().length > 0 && sourceText.trim().length > 0 && !isTranslating;
  }, [apiKey, sourceText, isTranslating]);

  const handleTranslate = async () => {
    if (!apiKey.trim()) {
      setFeedback('請先輸入 Gemini API KEY。');
      return;
    }

    if (!sourceText.trim()) {
      setFeedback('請先輸入要翻譯的內容。');
      return;
    }

    setIsTranslating(true);
    setFeedback('翻譯中...');

    try {
      const result = await translateWithGemini(apiKey.trim(), model, sourceText, targetLanguage, annotateJapanese);
      setTranslatedText(result);
      setFeedback('翻譯完成。');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '翻譯失敗。');
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSwap = () => {
    if (!translatedText.trim()) {
      setFeedback('目前沒有可交換的翻譯內容。');
      return;
    }

    setSourceText(translatedText);
    setTranslatedText('');
    setFeedback('已將翻譯內容放回輸入框。');
  };

  const handleCopy = async () => {
    if (!translatedText.trim()) {
      setFeedback('目前沒有可複製的翻譯內容。');
      return;
    }

    try {
      await navigator.clipboard.writeText(translatedText);
      setFeedback('已複製翻譯內容。');
    } catch {
      setFeedback('無法存取剪貼簿，請手動複製。');
    }
  };

  const handleClear = () => {
    if (!sourceText && !translatedText) {
      setFeedback('目前沒有可清除的內容。');
      return;
    }

    setSourceText('');
    setTranslatedText('');
    setFeedback('已清除輸入與輸出內容。');
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <h1>AI Translator <span className="version-badge">v0.4</span></h1>
          <p className="hero-text">
            輸入文字，選擇語言，讓 AI 幫你快速翻譯！
          </p>
        </div>

        <button
          type="button"
          className="settings-toggle"
          aria-label="開啟設定"
          aria-expanded={isSettingsOpen}
          onClick={() => setIsSettingsOpen((isOpen) => !isOpen)}
        >
          <Icon name="settings" />
        </button>

        {isSettingsOpen && <div className="settings-overlay" role="presentation" onClick={() => setIsSettingsOpen(false)}>
          <div className="settings-card" role="dialog" aria-modal="true" aria-label="設定" onClick={(event) => event.stopPropagation()}>
            <div className="settings-header">
              <h2>設定</h2>
              <button type="button" className="modal-close" aria-label="關閉設定" onClick={() => setIsSettingsOpen(false)}>
                <Icon name="close" />
              </button>
            </div>
            <label className="field">
              <span className="field-label-row">
                Gemini API KEY
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                  Google AI Studio <Icon name="external" />
                </a>
              </span>
              <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="AIza..." autoComplete="off" spellCheck={false} />
            </label>

            <div className="field-grid">
              <label className="field">
                <span>模型</span>
                <select value={model} onChange={(event) => setModel(event.target.value)}>
                  {MODEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>翻譯語言</span>
                <select value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)}>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="switch-row">
              <span>日文漢字標註拼音</span>
              <input type="checkbox" checked={annotateJapanese} onChange={(event) => setAnnotateJapanese(event.target.checked)} />
              <span className="switch" aria-hidden="true"><span /></span>
            </label>

            <div className="setting-row">
              <span>介面風格</span>
              <div className="segmented-control" role="group" aria-label="介面風格">
                <button type="button" className={theme === 'light' ? 'selected' : ''} onClick={() => setTheme('light')}><Icon name="sun" /> 淺色</button>
                <button type="button" className={theme === 'dark' ? 'selected' : ''} onClick={() => setTheme('dark')}><Icon name="moon" /> 深色</button>
              </div>
            </div>
          </div>
        </div>}
      </section>

      <section className="workspace">
        <article className="panel">
          <div className="panel-header">
            <h2>輸入文字</h2>
            <span>{sourceText.length.toLocaleString()} 字元</span>
          </div>
          <textarea
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            placeholder="在這裡輸入任意語言的內容..."
            spellCheck={false}
          />
        </article>

        <div className="actions">
          <button type="button" className="action-button translate" aria-label="翻譯" onClick={handleTranslate} disabled={!canTranslate}>
            <Icon name="translate" />
          </button>
          <button type="button" className="action-button swap" aria-label="交換" onClick={handleSwap} disabled={!translatedText.trim()}>
            <Icon name="swap" />
          </button>
          <button type="button" className="action-button copy" aria-label="複製" onClick={handleCopy} disabled={!translatedText.trim()}>
            <Icon name="copy" />
          </button>
          <button type="button" className="action-button clear" aria-label="清除" onClick={handleClear} disabled={!sourceText && !translatedText}>
            <Icon name="trash" />
          </button>
        </div>

        <article className="panel output-panel">
          <div className="panel-header">
            <h2>輸出文字</h2>
            <span>{translatedText.length.toLocaleString()} 字元</span>
          </div>
          <textarea value={translatedText} readOnly placeholder="翻譯結果會顯示在這裡。" spellCheck={false} />
        </article>
      </section>
      <footer className="site-footer">
        <span>2026/09/03</span>
        <span aria-hidden="true">|</span>
        <span>Copyright © 2026 Andy Chiang</span>
        <span aria-hidden="true">|</span>
        <a href="https://github.com/AndyChiangSH/AI-Translator" target="_blank" rel="noreferrer">GitHub</a>
      </footer>
      {feedback && <div className="toast" role="status" aria-live="polite">{feedback}</div>}
    </main>
  );
}

function Icon({ name }: { name: 'settings' | 'external' | 'sun' | 'moon' | 'translate' | 'swap' | 'copy' | 'trash' | 'close' }) {
  const iconNames = {
    settings: 'bi-gear',
    external: 'bi-box-arrow-up-right',
    sun: 'bi-sun',
    moon: 'bi-moon',
    translate: 'bi-translate',
    swap: 'bi-arrow-left-right',
    copy: 'bi-copy',
    trash: 'bi-trash3',
    close: 'bi-x-lg',
  } as const;

  return <i className={`icon bi ${iconNames[name]}`} aria-hidden="true" />;
}