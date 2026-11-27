import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { engine } from "./audio/engine";
import { Info } from "./screens/Info";
import { Player } from "./screens/Player";
import { Themes } from "./screens/Themes";
import { Start } from "./screens/Start";
import { Announcer, Aura, MiniPlay, NowPlaying, useEngine } from "./ui";

const hasFile = (event: DragEvent) => !!event.dataTransfer?.types.includes("Files");

/** Hand over whatever was chosen, dropped or pasted: the songs among it, or all of it if nothing says what it is. Says whether there was anything. */
function take(files: FileList | undefined | null): boolean {
  const all = [...(files ?? [])];
  const songs = all.filter((file) => /^(audio|video)\//.test(file.type));
  const list = (songs.length ? songs : all).map((file) => ({ file, name: file.name }));
  if (list.length) void engine.add(list);
  return list.length > 0;
}

/** The two pages that open over whatever you were doing. Each is a place in the page's history, named in the address. */
type Page = "info" | "themes";
const onPage = (): Page | null => (location.hash === "#info" ? "info" : location.hash === "#themes" ? "themes" : null);

/** What is on screen: the player or the start screen, whether that start screen was opened from the player, and info or themes over either. */
interface View {
  player: boolean;
  adding: boolean;
  page: Page | null;
}
const viewKey = (view: View) => `${view.player} ${view.adding} ${view.page}`;
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Whether the keyboard's focus has nowhere to be: its element was taken away, hidden or put out of reach. */
const lostFocus = () => {
  const on = document.activeElement as HTMLElement | null;
  return !on || on === document.body || !on.isConnected || !!on.closest("[hidden], [inert]");
};
const focus = (selector: string) => document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
/** the start screen opened from the player, with the song still playing underneath */
const onAdding = () => history.state?.adding === true;

export function App() {
  const { status, duration } = useEngine();
  // a song is open: another one opens over it, so the player stays put while that loads
  const open = status === "ready" || (status === "opening" && duration > 0);
  const [page, setPage] = useState(onPage);
  const [adding, setAdding] = useState(onAdding);
  const [dropping, setDropping] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  /** the check, a moment after closing a page, that the history really went back */
  const settle = useRef(0);
  // what should be on screen, and what is: the second follows the first through a transition, so every change of
  // screen dissolves into the next instead of cutting (see `::view-transition` in styles.css)
  const view: View = { player: open && !adding, adding: open && adding, page };
  const [shown, setShown] = useState(view);
  const key = viewKey(view);
  useEffect(() => {
    if (key === viewKey(shown)) return;
    const next = view;
    // The dissolve is a nicety and the change of screen is not, so the change never depends on it. A browser can
    // fail to run a transition, or sit on one: a tab that was in the background, a phone coming back from another
    // tab. If the screen hasn't changed a moment after it was asked to, it is changed plainly instead. Without
    // this, `back` on info could do nothing at all after a trip to another tab on an iPhone
    let changed = false;
    const plain = () => {
      if (changed) return;
      changed = true;
      setShown(next);
    };
    const dissolve = () => {
      if (changed) return;
      changed = true;
      flushSync(() => setShown(next));
    };
    if (!document.startViewTransition || still() || document.visibilityState !== "visible") return plain();
    try {
      const transition = document.startViewTransition(dissolve);
      // a transition the browser gives up on says so by rejecting these, which is not an error worth reporting
      for (const step of [transition.ready, transition.finished, transition.updateCallbackDone]) step?.catch(() => {});
    } catch {
      return plain();
    }
    const late = window.setTimeout(plain, 250);
    return () => clearTimeout(late);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const player = shown.player;

  // Where the keyboard's focus goes when the screen changes, so someone using a keyboard or a screen reader is never
  // left on something that has gone. A page that opens takes it, and gives it back to whatever opened it on closing.
  // Otherwise, if what had it went away with the old screen, it lands on what the new one is for: the song's name at
  // the top of the player, `browse files` on the start screen, and the way back to it on coming back from there
  const opener = useRef<HTMLElement | null>(null);
  const before = useRef(shown);
  useEffect(() => {
    const was = before.current;
    before.current = shown;
    // nothing is moved when the page first opens
    if (was === shown) return;
    if (shown.page) {
      if (!was.page) focus('[role="dialog"]');
      return;
    }
    const back = was.page ? opener.current : null;
    opener.current = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
    if (!lostFocus()) return;
    if (shown.player) focus(was.adding ? ".bar .home" : ".player .title");
    else focus(".start .zone");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey(shown)]);

  const pick = () => {
    engine.wake();
    picker.current?.click();
  };

  // info and themes are places in the page's history, so the back button on a phone closes them
  const openPage = (next: Page) => {
    clearTimeout(settle.current);
    if (!page) opener.current = document.activeElement as HTMLElement | null;
    history.pushState({ page: next }, "", `#${next}`);
    setPage(next);
  };
  // Closing happens here and now, and the history is tidied up after it. It used to wait for the browser to go back
  // and report that it had, and when a browser didn't (seen on an iPhone after visiting another tab) the page stayed
  // open however often `back` was pressed. Going back is still asked for, so the phone's own back button isn't left
  // with an entry that does nothing, and if the address still names the page shortly after, it is cleared by hand
  const closePage = () => {
    setPage(null);
    clearTimeout(settle.current);
    const clear = () => {
      if (onPage()) history.replaceState(null, "", location.pathname + location.search);
    };
    if (!history.state?.page) return clear();
    history.back();
    settle.current = window.setTimeout(clear, 400);
  };
  // so is the start screen opened from the player: back on a phone returns to the song
  const openAdding = () => {
    clearTimeout(settle.current);
    history.pushState({ adding: true }, "");
    setAdding(true);
  };
  // closed the same way: at once, with the history following
  const closeAdding = () => {
    setAdding(false);
    clearTimeout(settle.current);
    if (!onAdding()) return;
    history.back();
    settle.current = window.setTimeout(() => {
      if (onAdding()) history.replaceState(null, "", location.href);
    }, 400);
  };
  // songs came in from the start screen: back to the player, where they join the list
  const took = (files: FileList | undefined | null) => {
    if (take(files) && engine.snapshot().duration > 0) closeAdding();
  };
  const tookRef = useRef(took);
  tookRef.current = took;

  useEffect(() => {
    const sync = () => {
      setPage(onPage());
      setAdding(onAdding());
    };
    window.addEventListener("popstate", sync);
    // a phone can put a tab to sleep and bring it back as it was: what is on screen is matched to the address again
    window.addEventListener("pageshow", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("pageshow", sync);
    };
  }, []);
  // nothing is playing after a reload, so a start screen left in the history has nothing to go back to
  useEffect(() => {
    if (!open && adding && status === "empty") {
      history.replaceState(null, "", location.href);
      setAdding(false);
    }
  }, [open, adding, status]);

  // songs can be dropped anywhere on the page, or pasted, one or many
  useEffect(() => {
    let inside = 0;
    const show = (on: boolean) => {
      if (!on) inside = 0;
      setDropping(on);
    };
    const enter = (event: DragEvent) => {
      if (!hasFile(event)) return;
      event.preventDefault();
      inside++;
      show(true);
    };
    const leave = (event: DragEvent) => {
      if (!hasFile(event)) return;
      inside = Math.max(0, inside - 1);
      // no related target means the file left the window altogether
      if (!inside || !event.relatedTarget) show(false);
    };
    const over = (event: DragEvent) => {
      if (!hasFile(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const drop = (event: DragEvent) => {
      if (!hasFile(event)) return;
      event.preventDefault();
      show(false);
      tookRef.current(event.dataTransfer?.files);
    };
    const paste = (event: ClipboardEvent) => tookRef.current(event.clipboardData?.files);
    const gone = () => show(false);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    window.addEventListener("dragend", gone);
    window.addEventListener("blur", gone);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
      window.removeEventListener("dragend", gone);
      window.removeEventListener("blur", gone);
      window.removeEventListener("paste", paste);
    };
  }, []);

  // space plays and pauses, the arrows move through the song, escape closes info or themes
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") return page ? closePage() : adding && closeAdding();
      if (page || engine.snapshot().status !== "ready") return;
      const on = event.target as HTMLElement | null;
      if (on?.closest("button, a, input")) return;
      if (event.key === " ") {
        event.preventDefault();
        engine.toggle();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        engine.nudge(event.key === "ArrowLeft" ? -10 : 10);
      }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [page, adding]);

  return (
    <>
      <Aura />
      <Announcer />
      {/* themes has no background, so the light behind the page shows through it: the screen underneath steps aside */}
      <div className={`screen ${shown.page === "themes" ? "is-away" : ""}`} inert={shown.page !== null}>
        {player && <Player />}
        {/* kept while the player is showing, so a YouTube import carries on and joins the list when it is done */}
        <Start onAdd={pick} onDone={closeAdding} hidden={player} />
        {/* the bottom of the screen: info and themes, and beside them the way between the two screens while a song is open.
            In the player the name goes to the start screen to add songs; there, the song playing comes back */}
        <div className="foot">
        <nav className="bar">
          {player && (
            // the name, and a plus beside it so it reads as the way to add a song, not only a logo
            // its name starts with the word on it, so it can be asked for by what it says
            <button className="home" onClick={openAdding} aria-label="sloverb, add songs">
              <span className="wordmark">sloverb</span>
              <span className="home__plus" aria-hidden>
                <svg viewBox="0 0 12 12">
                  <path d="M6 1.5v9M1.5 6h9" />
                </svg>
              </span>
            </button>
          )}
          {shown.adding && <MiniPlay />}
          {shown.adding && <NowPlaying onClick={closeAdding} />}
          {/* info and themes with a thin rule between them. With something beside them the line is centred as a whole;
              alone on it, the rule is on the centre line, under everything else on the start screen */}
          <span className="bar__pair">
            <button className="link" onClick={() => openPage("info")}>
              info
            </button>
            <span className="rule" aria-hidden />
            <button className="link" onClick={() => openPage("themes")}>
              themes
            </button>
          </span>
        </nav>
        </div>
      </div>
      {/* off screen rather than hidden: some phones won't open the picker for an input that isn't laid out */}
      <input
        ref={picker}
        className="sr"
        type="file"
        accept="audio/*,video/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus"
        multiple
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          took(event.target.files);
          event.target.value = "";
        }}
      />
      {dropping && (
        <div className="drop">
          <div className="drop__frame">
            <p className="head">drop to play</p>
          </div>
        </div>
      )}
      {shown.page === "info" && <Info onBack={closePage} />}
      {shown.page === "themes" && <Themes onBack={closePage} />}
    </>
  );
}
