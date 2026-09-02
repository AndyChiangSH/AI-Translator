import { useEffect, useMemo, useState } from 'react';

type ModelOption = {
  label: string;
  value: string;
};

type LanguageOption = {
  label: string;
  value: string;
};

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
};

function getStoredValue(key: string, fallback: string) {
  if (typeof window === 'undefined') {
    return fallback;
  }

  return window.localStorage.getItem(key) ?? fallback;
}

function buildPrompt(sourceText: string, targetLanguage: string) {
  const targetInstruction =
    targetLanguage === '日文'
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

async function translateWithGemini(apiKey: string, model: string, sourceText: string, targetLanguage: string) {
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
          parts: [{ text: buildPrompt(sourceText, targetLanguage) }],
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
      const result = await translateWithGemini(apiKey.trim(), model, sourceText, targetLanguage);
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

    await navigator.clipboard.writeText(translatedText);
    setFeedback('已複製翻譯內容。');
  };

  const handleDownload = () => {
    if (!translatedText.trim()) {
      setFeedback('目前沒有可下載的翻譯內容。');
      return;
    }

    const blob = new Blob([translatedText], { type: 'text/plain;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    anchor.href = downloadUrl;
    anchor.download = `translation-${timestamp}.txt`;
    anchor.click();

    URL.revokeObjectURL(downloadUrl);
    setFeedback('已開始下載翻譯內容。');
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Gemini-powered translator</p>
          <h1>AI Translator</h1>
          <p className="hero-text">
            輸入你自己的 Gemini API KEY，選擇模型與目標語言，直接取得乾淨的翻譯結果。
          </p>
        </div>

        <div className="settings-card">
          <label className="field">
            <span>Gemini API KEY</span>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder="AIza..."
              autoComplete="off"
              spellCheck={false}
            />
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

          <p className="helper-text">
            日文輸出會自動要求在漢字後加入讀音標註，例如 漢字(かんじ)。
          </p>
        </div>
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
          <button type="button" className="primary" onClick={handleTranslate} disabled={!canTranslate}>
            {isTranslating ? '翻譯中...' : '翻譯'}
          </button>
          <button type="button" onClick={handleSwap} disabled={!translatedText.trim()}>
            交換
          </button>
          <button type="button" onClick={handleCopy} disabled={!translatedText.trim()}>
            複製
          </button>
          <button type="button" onClick={handleDownload} disabled={!translatedText.trim()}>
            下載
          </button>
          <div className="status" aria-live="polite">
            {feedback || '準備完成，請輸入內容開始翻譯。'}
          </div>
        </div>

        <article className="panel output-panel">
          <div className="panel-header">
            <h2>輸出文字</h2>
            <span>{translatedText.length.toLocaleString()} 字元</span>
          </div>
          <textarea value={translatedText} readOnly placeholder="翻譯結果會顯示在這裡。" spellCheck={false} />
        </article>
      </section>
    </main>
  );
}