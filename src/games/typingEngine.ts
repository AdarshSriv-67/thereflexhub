// Typing test engine. Powers the typing test and the 1 minute typing test.
// The engine owns rendering the word stream (a span per word, a span per
// character) into a caller-supplied container, reads keystrokes from a
// visually hidden input so mobile virtual keyboards open, and reports live
// WPM and accuracy. The timer starts on the first keystroke.
//
// Scoring model, kept deliberately simple:
// - Typed characters are compared position by position with the expected word.
// - Space commits the current word: mismatched characters count as incorrect,
//   characters left untyped count as incorrect by omission, and extra
//   characters typed past the end of the word are counted as incorrect but
//   not drawn.
// - The space itself counts as one correct character when the word was typed
//   exactly right, keeping WPM in line with the (chars / 5) convention.
// - Backspace edits the current word only; committed words are locked in.
//
// The page defines the look of the state classes (tt-pending, tt-correct,
// tt-incorrect, tt-caret, tt-caret-end) in its own style block using the
// site tokens: var(--ink), var(--ink-muted), var(--bad), var(--accent).

import { randomWords } from './words';

export interface TypingResult {
  wpm: number;
  accuracy: number;
  correctChars: number;
  incorrectChars: number;
  duration: number;
}

export interface TypingEngineOptions {
  /** clipping element about three lines tall; the engine scrolls inside it */
  container: HTMLElement;
  /** visually hidden input the engine focuses when the container is tapped */
  input: HTMLInputElement;
  /** test length in seconds: 15, 30, 60, or 120 */
  duration: number;
  /** fired at least every 250 ms while running, plus on every keystroke */
  onTick: (remainingSeconds: number, wpm: number, accuracy: number) => void;
  onFinish: (result: TypingResult) => void;
  /** lets the page show a "click to focus" overlay while the input is blurred */
  onFocusChange?: (focused: boolean) => void;
}

const INITIAL_WORDS = 120;
const APPEND_CHUNK = 60;
const APPEND_THRESHOLD = 40;
const TICK_MS = 100;

export class TypingEngine {
  private container: HTMLElement;
  private input: HTMLInputElement;
  private duration: number;
  private onTick: TypingEngineOptions['onTick'];
  private onFinish: TypingEngineOptions['onFinish'];
  private onFocusChange?: (focused: boolean) => void;

  /** block element the engine translates vertically to scroll the stream */
  private wrapper: HTMLElement;
  private words: string[] = [];
  private wordEls: HTMLElement[] = [];
  private current = 0;

  /** character totals locked in by committed (space-advanced) words */
  private committedCorrect = 0;
  private committedIncorrect = 0;

  private running = false;
  private finished = false;
  private startAt = 0;
  private timer: number | undefined;

  constructor(opts: TypingEngineOptions) {
    this.container = opts.container;
    this.input = opts.input;
    this.duration = opts.duration;
    this.onTick = opts.onTick;
    this.onFinish = opts.onFinish;
    this.onFocusChange = opts.onFocusChange;

    this.wrapper = document.createElement('div');
    this.wrapper.style.transform = 'translateY(0px)';
    this.wrapper.style.transition = 'transform 120ms ease-out';
    this.container.appendChild(this.wrapper);

    this.bind();
    this.reset();
  }

  private bind(): void {
    this.container.addEventListener('pointerdown', this.onPointer);
    this.container.addEventListener('click', this.onClick);
    this.input.addEventListener('keydown', this.onKeydown);
    this.input.addEventListener('input', this.onInput);
    this.input.addEventListener('focus', this.onFocus);
    this.input.addEventListener('blur', this.onBlur);
  }

  private onPointer = (e: PointerEvent): void => {
    // Keep focus on the hidden input instead of the container itself.
    e.preventDefault();
    this.input.focus();
  };

  private onClick = (): void => {
    // Fallback for browsers that only open the virtual keyboard on click.
    this.input.focus();
  };

  private onFocus = (): void => {
    this.onFocusChange?.(true);
  };

  private onBlur = (): void => {
    this.onFocusChange?.(false);
  };

  private onKeydown = (e: KeyboardEvent): void => {
    if (this.finished) {
      e.preventDefault();
      return;
    }
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      const typed = this.input.value;
      this.input.value = '';
      this.commit(typed);
    }
    // Backspace needs no handling: the input only ever holds the current
    // word, so editing can never reach back into committed words.
  };

  private onInput = (): void => {
    if (this.finished) {
      this.input.value = '';
      return;
    }
    let value = this.input.value;
    if (!this.running && value.length > 0) this.start();
    // Some mobile keyboards deliver the space through the input event rather
    // than a cancellable keydown, so consume any spaces found in the value.
    while (value.includes(' ')) {
      const i = value.indexOf(' ');
      const segment = value.slice(0, i);
      value = value.slice(i + 1);
      this.input.value = value;
      this.commit(segment);
    }
    this.paintCurrent();
    if (this.running) this.emitTick();
  };

  /** Lock in the current word and advance. Empty input means the space is ignored. */
  private commit(typed: string): void {
    if (this.finished || !this.running || typed.length === 0) return;
    const word = this.words[this.current]!;
    const el = this.wordEls[this.current]!;

    let correct = 0;
    let incorrect = 0;
    for (let i = 0; i < word.length; i++) {
      const charEl = el.children[i] as HTMLElement;
      if (i < typed.length) {
        if (typed[i] === word[i]) {
          correct++;
          charEl.className = 'tt-correct';
        } else {
          incorrect++;
          charEl.className = 'tt-incorrect';
        }
      } else {
        // Untyped remainder counts as incorrect by omission.
        incorrect++;
        charEl.className = 'tt-incorrect';
      }
    }
    // Extra characters beyond the word length count but are not rendered.
    if (typed.length > word.length) incorrect += typed.length - word.length;
    // A perfectly typed word earns its trailing space as a correct character.
    if (typed === word) correct++;

    this.committedCorrect += correct;
    this.committedIncorrect += incorrect;
    this.current++;
    this.ensureWords();
    this.paintCurrent();
    this.scrollToCurrent();
    this.emitTick();
  }

  /** Live correct/incorrect for the word in progress (no omission penalty yet). */
  private currentCounts(): { correct: number; incorrect: number } {
    const word = this.words[this.current] ?? '';
    const typed = this.input.value;
    let correct = 0;
    let incorrect = 0;
    const overlap = Math.min(typed.length, word.length);
    for (let i = 0; i < overlap; i++) {
      if (typed[i] === word[i]) correct++;
      else incorrect++;
    }
    if (typed.length > word.length) incorrect += typed.length - word.length;
    return { correct, incorrect };
  }

  private totals(): { correct: number; incorrect: number } {
    const cur = this.currentCounts();
    return {
      correct: this.committedCorrect + cur.correct,
      incorrect: this.committedIncorrect + cur.incorrect,
    };
  }

  private paintCurrent(): void {
    const word = this.words[this.current];
    const el = this.wordEls[this.current];
    if (!word || !el) return;
    const typed = this.input.value;
    const caretIndex = Math.min(typed.length, word.length - 1);
    const caretAtEnd = typed.length >= word.length;
    for (let i = 0; i < word.length; i++) {
      const charEl = el.children[i] as HTMLElement;
      let cls: string;
      if (i < typed.length) {
        cls = typed[i] === word[i] ? 'tt-correct' : 'tt-incorrect';
      } else {
        cls = 'tt-pending';
      }
      if (i === caretIndex) {
        cls += ' tt-caret';
        if (caretAtEnd) cls += ' tt-caret-end';
      }
      charEl.className = cls;
    }
  }

  private renderWord(word: string): void {
    const wordEl = document.createElement('span');
    wordEl.className = 'tt-word';
    for (const ch of word) {
      const charEl = document.createElement('span');
      charEl.textContent = ch;
      charEl.className = 'tt-pending';
      wordEl.appendChild(charEl);
    }
    this.wrapper.appendChild(wordEl);
    this.wordEls.push(wordEl);
  }

  /** Top up the stream so the player never reaches the last word. */
  private ensureWords(): void {
    if (this.words.length - this.current >= APPEND_THRESHOLD) return;
    const extra = randomWords(APPEND_CHUNK);
    for (const w of extra) {
      this.words.push(w);
      this.renderWord(w);
    }
  }

  /** Keep the active line as the second visible row once past the first line. */
  private scrollToCurrent(): void {
    const el = this.wordEls[this.current];
    if (!el) return;
    const lineHeight = el.offsetHeight;
    const shift = Math.max(0, el.offsetTop - lineHeight);
    this.wrapper.style.transform = `translateY(-${shift}px)`;
  }

  private start(): void {
    this.running = true;
    this.startAt = performance.now();
    this.timer = window.setInterval(() => {
      const elapsed = (performance.now() - this.startAt) / 1000;
      if (elapsed >= this.duration) this.finish();
      else this.emitTick();
    }, TICK_MS);
  }

  private emitTick(): void {
    const elapsed = Math.min((performance.now() - this.startAt) / 1000, this.duration);
    const remaining = Math.max(this.duration - elapsed, 0);
    const { correct, incorrect } = this.totals();
    const wpm = elapsed >= 1 ? correct / 5 / (elapsed / 60) : 0;
    const total = correct + incorrect;
    const accuracy = total > 0 ? (correct / total) * 100 : 100;
    this.onTick(remaining, wpm, accuracy);
  }

  private finish(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.running = false;
    this.finished = true;
    const { correct, incorrect } = this.totals();
    const total = correct + incorrect;
    const accuracy = total > 0 ? (correct / total) * 100 : 100;
    const wpm = correct / 5 / (this.duration / 60);
    this.onTick(0, wpm, accuracy);
    this.onFinish({
      wpm,
      accuracy,
      correctChars: correct,
      incorrectChars: incorrect,
      duration: this.duration,
    });
  }

  setDuration(seconds: number): void {
    this.duration = seconds;
    this.reset();
  }

  getDuration(): number {
    return this.duration;
  }

  isFinished(): boolean {
    return this.finished;
  }

  reset(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.running = false;
    this.finished = false;
    this.current = 0;
    this.committedCorrect = 0;
    this.committedIncorrect = 0;
    this.input.value = '';
    this.words = randomWords(INITIAL_WORDS);
    this.wordEls = [];
    this.wrapper.textContent = '';
    this.wrapper.style.transform = 'translateY(0px)';
    for (const w of this.words) this.renderWord(w);
    this.paintCurrent();
    this.onTick(this.duration, 0, 100);
  }

  destroy(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.container.removeEventListener('pointerdown', this.onPointer);
    this.container.removeEventListener('click', this.onClick);
    this.input.removeEventListener('keydown', this.onKeydown);
    this.input.removeEventListener('input', this.onInput);
    this.input.removeEventListener('focus', this.onFocus);
    this.input.removeEventListener('blur', this.onBlur);
    this.wrapper.remove();
  }
}
