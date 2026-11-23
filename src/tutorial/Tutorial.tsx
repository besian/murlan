import { useCallback, useEffect, useState } from 'react';
import { Action, GameState, IllegalMove, applyAction, viewFor } from '../engine';
import { Table } from '../ui/Table';
import { LESSONS, Lesson, matchesSolution, solutionCards } from './lessons';

const DONE_KEY = 'murlan.tutorial.done';
const BOT_PAUSE = 900;

function loadDone(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}
function markDone(id: string) {
  try {
    const done = new Set(loadDone());
    done.add(id);
    localStorage.setItem(DONE_KEY, JSON.stringify([...done]));
  } catch {
    /* ignore */
  }
}

export function Tutorial({ onPlay }: { onPlay: () => void }) {
  const [lessonIdx, setLessonIdx] = useState<number | null>(null);
  const [done, setDone] = useState(loadDone);

  if (lessonIdx === null) {
    const next = LESSONS.findIndex((l) => !done.includes(l.id));
    return (
      <div className="start">
        <div className="start-card lessons">
          <h2>Learn to play</h2>
          <p>Short guided scenarios. A coach explains each situation and asks you to make the move.</p>
          <ol className="lesson-list">
            {LESSONS.map((l, i) => (
              <li key={l.id}>
                <button type="button" className="lesson" onClick={() => setLessonIdx(i)}>
                  <span className={'lesson-num' + (done.includes(l.id) ? ' done' : '')}>
                    {done.includes(l.id) ? '✓' : i + 1}
                  </span>
                  <span className="lesson-text">
                    <b>{l.title}</b>
                    <small>{l.summary}</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="primary big" onClick={() => setLessonIdx(next >= 0 ? next : 0)}>
            {next < 0 ? 'Replay from the start' : next === 0 ? 'Start the tutorial' : `Continue: ${LESSONS[next].title}`}
          </button>
        </div>
      </div>
    );
  }

  const lesson = LESSONS[lessonIdx];
  return (
    <LessonRunner
      key={lesson.id}
      lesson={lesson}
      index={lessonIdx}
      onExit={() => setLessonIdx(null)}
      onComplete={() => {
        markDone(lesson.id);
        setDone(loadDone());
      }}
      onNext={() => setLessonIdx(lessonIdx + 1 < LESSONS.length ? lessonIdx + 1 : null)}
      onPlay={onPlay}
    />
  );
}

function LessonRunner({
  lesson,
  index,
  onExit,
  onComplete,
  onNext,
  onPlay,
}: {
  lesson: Lesson;
  index: number;
  onExit: () => void;
  onComplete: () => void;
  onNext: () => void;
  onPlay: () => void;
}) {
  const [state, setState] = useState<GameState>(lesson.setup);
  const [stepIdx, setStepIdx] = useState(0);
  const [caption, setCaption] = useState('');
  const [botWaiting, setBotWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const step = lesson.steps[stepIdx];
  const finished = stepIdx >= lesson.steps.length;

  useEffect(() => {
    if (finished) onComplete();
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  // Enter each step: show its text, or play the scripted opponent move.
  useEffect(() => {
    if (!step) return;
    setError(null);
    setReveal(false);
    if (step.kind === 'say' || step.kind === 'you') {
      setCaption(step.text);
      return;
    }
    const t = window.setTimeout(() => {
      setState((s) => applyAction(s, step.action));
      if (step.text) {
        setCaption(step.text);
        setBotWaiting(true);
      } else {
        setStepIdx((i) => i + 1);
      }
    }, BOT_PAUSE);
    return () => window.clearTimeout(t);
  }, [stepIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = useCallback(() => {
    setBotWaiting(false);
    setStepIdx((i) => i + 1);
  }, []);

  const canNext = !finished && (step.kind === 'say' || (step.kind === 'bot' && botWaiting));

  // Enter / Space advance the coach when there's nothing to play.
  useEffect(() => {
    if (!canNext) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canNext, next]);

  const dispatch = (action: Action) => {
    if (step?.kind !== 'you') return;
    let after: GameState;
    try {
      after = applyAction(state, action);
    } catch (e) {
      if (!(e instanceof IllegalMove)) throw e;
      setError(`${e.message}. Try the glowing cards.`);
      setReveal(true);
      return;
    }
    if (!matchesSolution(action, step.solution, state)) {
      setError(step.wrong ?? 'Not quite — try the glowing cards.');
      setReveal(true);
      return;
    }
    setState(after);
    setStepIdx((i) => i + 1);
  };

  const youStep = step?.kind === 'you' ? step : null;
  const highlight = youStep && (youStep.highlight || reveal) ? solutionCards(youStep) : [];
  const highlightPass = !!youStep && youStep.solution.type === 'pass' && reveal;

  const banner = (
    <div className="coach" role="region" aria-label="Tutorial coach">
      <div className="coach-head">
        <span>
          Lesson {index + 1} of {LESSONS.length} · <b>{lesson.title}</b>
        </span>
        <button type="button" className="link" onClick={onExit}>
          All lessons
        </button>
      </div>
      <div className="coach-progress">
        <i style={{ width: `${(Math.min(stepIdx, lesson.steps.length) / lesson.steps.length) * 100}%` }} />
      </div>
      <p className="coach-text" key={caption}>
        {caption}
      </p>
      <div className="coach-actions">
        {canNext && (
          <button type="button" className="primary" onClick={next} autoFocus>
            Next
          </button>
        )}
        {youStep && <span className="badge your-move">Your move</span>}
        {youStep && !reveal && !youStep.highlight && (
          <button type="button" className="ghost" onClick={() => setReveal(true)}>
            Show me
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="tutorial">
      <Table
        view={viewFor(state, 0)}
        dispatch={dispatch}
        error={error}
        clearError={() => setError(null)}
        canDeal
        onNextHand={() => canNext && next()}
        onNewGame={() => canNext && next()}
        nextHandLabel="Continue"
        locked={!youStep}
        highlight={highlight}
        highlightPass={highlightPass}
        onHint={() => setReveal(true)}
        banner={banner}
        hideScores={lesson.id !== 'scoring'}
      />
      {finished && (
        <div className="modal-backdrop">
          <div className="modal lesson-done" role="dialog" aria-modal>
            <div className="big-check">✓</div>
            <h2>Lesson complete: {lesson.title}</h2>
            {index + 1 < LESSONS.length ? (
              <>
                <p>Up next: {LESSONS[index + 1].title} — {LESSONS[index + 1].summary}</p>
                <button type="button" className="primary big" onClick={onNext} autoFocus>
                  Next lesson
                </button>
              </>
            ) : (
              <>
                <p>You’ve learned every rule of Murlan. Ready for a real game?</p>
                <button type="button" className="primary big" onClick={onPlay} autoFocus>
                  Play vs 3 bots
                </button>
              </>
            )}
            <button type="button" className="link" onClick={onExit}>
              Back to lessons
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
