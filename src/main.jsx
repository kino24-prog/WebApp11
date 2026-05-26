import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import './styles.css';
import { deleteNote, getAllNotes, saveNote } from './storage.js';

const emptyDraft = () => ({
  id: crypto.randomUUID(),
  title: '',
  formulaText: '',
  answerText: '',
  imageDataUrl: '',
  strokes: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

function formatDate(value) {
  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function FormulaPreview({ formula }) {
  const html = useMemo(() => {
    if (!formula.trim()) {
      return '<span class="preview-empty">LaTeXプレビュー</span>';
    }

    return katex.renderToString(formula, {
      throwOnError: false,
      displayMode: true,
      strict: false,
    });
  }, [formula]);

  return <div className="formula-preview" dangerouslySetInnerHTML={{ __html: html }} />;
}

function DrawingCanvas({ strokes, setStrokes, penSize }) {
  const canvasRef = useRef(null);
  const currentStrokeRef = useRef(null);
  const activePointerIdRef = useRef(null);
  const activePointersRef = useRef(new Set());
  const multiTouchBlockedRef = useRef(false);

  const drawStroke = useCallback((context, stroke) => {
    if (stroke.points.length < 2) return;

    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.width;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);

    for (let index = 1; index < stroke.points.length; index += 1) {
      const point = stroke.points[index];
      context.lineTo(point.x, point.y);
    }

    context.stroke();
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * scale);
    canvas.height = Math.floor(rect.height * scale);

    const context = canvas.getContext('2d');
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    strokes.forEach((stroke) => drawStroke(context, stroke));
  }, [drawStroke, strokes]);

  useEffect(() => {
    redraw();
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, [redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const blockBrowserGesture = (event) => {
      event.preventDefault();
    };

    canvas.addEventListener('contextmenu', blockBrowserGesture);
    canvas.addEventListener('selectstart', blockBrowserGesture);
    canvas.addEventListener('touchstart', blockBrowserGesture, { passive: false });
    canvas.addEventListener('touchmove', blockBrowserGesture, { passive: false });

    return () => {
      canvas.removeEventListener('contextmenu', blockBrowserGesture);
      canvas.removeEventListener('selectstart', blockBrowserGesture);
      canvas.removeEventListener('touchstart', blockBrowserGesture);
      canvas.removeEventListener('touchmove', blockBrowserGesture);
    };
  }, []);

  const getPoint = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const finishCurrentStroke = () => {
    const completedStroke = currentStrokeRef.current;
    currentStrokeRef.current = null;
    activePointerIdRef.current = null;
    document.body.classList.remove('is-drawing');

    if (!completedStroke) return;

    if (completedStroke.points.length === 1) {
      const point = completedStroke.points[0];
      completedStroke.points.push({ x: point.x + 0.1, y: point.y + 0.1 });
    }

    setStrokes((current) => [...current, completedStroke]);
  };

  const cancelCurrentStroke = () => {
    currentStrokeRef.current = null;
    activePointerIdRef.current = null;
    document.body.classList.remove('is-drawing');
    redraw();
  };

  const startDrawing = (event) => {
    event.preventDefault();
    window.getSelection()?.removeAllRanges();

    activePointersRef.current.add(event.pointerId);

    if (activePointersRef.current.size > 1 || !event.isPrimary) {
      multiTouchBlockedRef.current = true;
      cancelCurrentStroke();
      return;
    }

    multiTouchBlockedRef.current = false;
    document.body.classList.add('is-drawing');
    canvasRef.current.setPointerCapture(event.pointerId);
    activePointerIdRef.current = event.pointerId;
    currentStrokeRef.current = {
      color: '#1d1d1d',
      width: Number(penSize),
      points: [getPoint(event)],
    };
  };

  const continueDrawing = (event) => {
    event.preventDefault();
    if (
      multiTouchBlockedRef.current ||
      event.pointerId !== activePointerIdRef.current ||
      !currentStrokeRef.current
    ) {
      return;
    }

    const point = getPoint(event);
    currentStrokeRef.current.points.push(point);

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    const points = currentStrokeRef.current.points;
    const previous = points[points.length - 2];

    context.strokeStyle = currentStrokeRef.current.color;
    context.lineWidth = currentStrokeRef.current.width;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const endDrawing = (event) => {
    event.preventDefault();
    activePointersRef.current.delete(event.pointerId);

    if (event.pointerId !== activePointerIdRef.current) {
      if (activePointersRef.current.size === 0) {
        multiTouchBlockedRef.current = false;
      }
      return;
    }

    if (multiTouchBlockedRef.current) {
      cancelCurrentStroke();
      if (activePointersRef.current.size === 0) {
        multiTouchBlockedRef.current = false;
      }
      return;
    }

    finishCurrentStroke();
  };

  return (
    <canvas
      ref={canvasRef}
      className="drawing-canvas"
      aria-label="手書き数式入力エリア"
      onContextMenu={(event) => event.preventDefault()}
      onSelect={(event) => event.preventDefault()}
      onPointerDown={startDrawing}
      onPointerMove={continueDrawing}
      onPointerUp={endDrawing}
      onPointerCancel={endDrawing}
      onPointerLeave={endDrawing}
    />
  );
}

function EditorView({ initialNote, onCancel, onSaved }) {
  const [draft, setDraft] = useState(initialNote);
  const [penSize, setPenSize] = useState(4);
  const [status, setStatus] = useState('');
  const canvasHostRef = useRef(null);

  const updateDraft = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const undo = () => {
    setDraft((current) => ({ ...current, strokes: current.strokes.slice(0, -1) }));
  };

  const clear = () => {
    if (!draft.strokes.length) return;
    if (confirm('手書きをすべて消しますか？')) {
      setDraft((current) => ({ ...current, strokes: [] }));
    }
  };

  const exportCanvasImage = () => {
    const canvas = canvasHostRef.current?.querySelector('canvas');
    if (!canvas) return '';
    return canvas.toDataURL('image/png');
  };

  const handleSave = async () => {
    if (!draft.title.trim()) {
      setStatus('タイトルを入力してください。');
      return;
    }

    if (!draft.strokes.length && !confirm('手書きが空です。このまま保存しますか？')) {
      return;
    }

    const now = new Date().toISOString();
    const note = {
      ...draft,
      title: draft.title.trim(),
      imageDataUrl: exportCanvasImage(),
      updatedAt: now,
    };

    await saveNote(note);
    setStatus('保存しました。');
    onSaved(note);
  };

  return (
    <main className="editor-page">
      <header className="topbar">
        <button className="ghost-button" type="button" onClick={onCancel}>
          一覧
        </button>
        <input
          className="title-input"
          value={draft.title}
          onChange={(event) => updateDraft('title', event.target.value)}
          placeholder="タイトル"
        />
        <button className="primary-button" type="button" onClick={handleSave}>
          保存
        </button>
      </header>

      <section className="editor-shell">
        <div className="canvas-panel">
          <div className="tool-row">
            <button type="button" onClick={undo} disabled={!draft.strokes.length}>
              戻る
            </button>
            <button type="button" onClick={clear} disabled={!draft.strokes.length}>
              クリア
            </button>
            <label className="pen-control">
              太さ
              <input
                type="range"
                min="2"
                max="12"
                value={penSize}
                onChange={(event) => setPenSize(event.target.value)}
              />
              <span>{penSize}</span>
            </label>
          </div>
          <div className="paper-canvas" ref={canvasHostRef}>
            <DrawingCanvas
              strokes={draft.strokes}
              setStrokes={(updater) => {
                setDraft((current) => ({
                  ...current,
                  strokes: typeof updater === 'function' ? updater(current.strokes) : updater,
                }));
              }}
              penSize={penSize}
            />
          </div>
        </div>

        <aside className="side-panel">
          <label>
            数式入力
            <textarea
              value={draft.formulaText}
              onChange={(event) => updateDraft('formulaText', event.target.value)}
              placeholder="例: x^2 - 5x + 6 = 0"
            />
          </label>

          <FormulaPreview formula={draft.formulaText} />

          <label>
            答え・解説
            <textarea
              className="answer-input"
              value={draft.answerText}
              onChange={(event) => updateDraft('answerText', event.target.value)}
              placeholder="例: (x - 2)(x - 3) = 0 より x = 2, 3"
            />
          </label>

          {status && <p className="status-message">{status}</p>}
        </aside>
      </section>
    </main>
  );
}

function HomeView({ notes, query, setQuery, onNew, onOpen, onDelete }) {
  const filteredNotes = notes.filter((note) =>
    note.title.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <main className="home-page">
      <header className="home-header">
        <div>
          <p className="eyebrow">iPad Web Notebook</p>
          <h1>手書き数式ノート</h1>
        </div>
        <button className="primary-button" type="button" onClick={onNew}>
          新規作成
        </button>
      </header>

      <section className="search-row">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="タイトルで検索"
        />
      </section>

      <section className="note-list" aria-label="保存済みノート一覧">
        {filteredNotes.length === 0 ? (
          <div className="empty-state">
            <h2>まだノートがありません</h2>
            <p>新規作成から、最初の数式を書き始められます。</p>
          </div>
        ) : (
          filteredNotes.map((note) => (
            <article className="note-card" key={note.id}>
              <button className="note-open" type="button" onClick={() => onOpen(note)}>
                <span>{note.title}</span>
                <time>{formatDate(note.updatedAt)}</time>
              </button>
              <button
                className="delete-button"
                type="button"
                onClick={() => onDelete(note)}
                aria-label={`${note.title}を削除`}
              >
                削除
              </button>
            </article>
          ))
        )}
      </section>
    </main>
  );
}

function DetailView({ note, onBack, onEdit, onDelete }) {
  return (
    <main className="detail-page">
      <header className="topbar">
        <button className="ghost-button" type="button" onClick={onBack}>
          一覧
        </button>
        <h1>{note.title}</h1>
        <div className="topbar-actions">
          <button type="button" onClick={() => onEdit(note)}>
            編集
          </button>
          <button className="delete-button" type="button" onClick={() => onDelete(note)}>
            削除
          </button>
        </div>
      </header>

      <section className="detail-grid">
        <div className="saved-image-panel">
          {note.imageDataUrl ? (
            <img src={note.imageDataUrl} alt={`${note.title}の手書き数式`} />
          ) : (
            <p>手書き画像はありません。</p>
          )}
        </div>

        <aside className="side-panel">
          <p className="meta-text">更新: {formatDate(note.updatedAt)}</p>
          <FormulaPreview formula={note.formulaText} />
          <div className="answer-box">
            <h2>答え・解説</h2>
            <p>{note.answerText || '未入力'}</p>
          </div>
        </aside>
      </section>
    </main>
  );
}

function App() {
  const [notes, setNotes] = useState([]);
  const [view, setView] = useState({ name: 'home' });
  const [query, setQuery] = useState('');

  const loadNotes = useCallback(async () => {
    const loaded = await getAllNotes();
    setNotes(loaded);
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const removeNote = async (note) => {
    if (!confirm(`「${note.title}」を削除しますか？`)) return;
    await deleteNote(note.id);
    await loadNotes();
    setView({ name: 'home' });
  };

  if (view.name === 'editor') {
    return (
      <EditorView
        initialNote={view.note}
        onCancel={() => setView({ name: 'home' })}
        onSaved={async (note) => {
          await loadNotes();
          setView({ name: 'detail', note });
        }}
      />
    );
  }

  if (view.name === 'detail') {
    const note = notes.find((item) => item.id === view.note.id) || view.note;
    return (
      <DetailView
        note={note}
        onBack={() => setView({ name: 'home' })}
        onEdit={(target) => setView({ name: 'editor', note: target })}
        onDelete={removeNote}
      />
    );
  }

  return (
    <HomeView
      notes={notes}
      query={query}
      setQuery={setQuery}
      onNew={() => setView({ name: 'editor', note: emptyDraft() })}
      onOpen={(note) => setView({ name: 'detail', note })}
      onDelete={removeNote}
    />
  );
}

createRoot(document.getElementById('root')).render(<App />);
