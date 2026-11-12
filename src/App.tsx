import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { engine } from "./audio/engine";
import { Info } from "./screens/Info";
import { Player } from "./screens/Player";
import { Start } from "./screens/Start";
import { Aura, NowPlaying, useEngine } from "./ui";

const hasFile = (event: DragEvent) => !!event.dataTransfer?.types.includes("Files");

/** Hand over whatever was chosen, dropped or pasted: the songs among it, or all of it if nothing says what it is. Says whether there was anything. */
function take(files: FileList | undefined | null): boolean {
  const all = [...(files ?? [])];
  const songs = all.filter((file) => /^(audio|video)\//.test(file.type));
  const list = (songs.length ? songs : all).map((file) => ({ file, name: file.name }));
  if (list.length) void engine.add(list);
  return list.length > 0;
}

const onInfo = () => location.hash === "#info";

/** What is on screen: the player or the start screen, whether that start screen was opened from the player, and info over either. */
interface View {
  player: boolean;
  adding: boolean;
  info: boolean;
}
const viewKey = (view: View) => `${view.player} ${view.adding} ${view.info}`;
const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** the start screen opened from the player, with the song still playing underneath */
const onAdding = () => history.state?.adding === true;

export function App() {
  const { status, duration } = useEngine();
  // a song is open: another one opens over it, so the player stays put while that loads
  const open = status === "ready" || (status === "opening" && duration > 0);
  const [info, setInfo] = useState(onInfo);
  const [adding, setAdding] = useState(onAdding);
  const [dropping, setDropping] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  // what should be on screen, and what is: the second follows the first through a transition, so every change of
  // screen dissolves into the next instead of cutting (see `::view-transition` in styles.css)
  const view: View = { player: open && !adding, adding: open && adding, info };
  const [shown, setShown] = useState(view);
  const key = viewKey(view);
  useEffect(() => {
    if (key === viewKey(shown)) return;
    const next = view;
    const change = () => flushSync(() => setShown(next));
    if (document.startViewTransition && !still() && document.visibilityState === "visible") document.startViewTransition(change);
    else setShown(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const player = shown.player;

  const pick = () => {
    engine.wake();
    picker.current?.click();
  };

  // info is a place in the page's history, so the back button on a phone closes it
  const openInfo = () => {
    history.pushState({ info: true }, "", "#info");
    setInfo(true);
  };
  const closeInfo = () => {
    if (history.state?.info) history.back();
    else {
      history.replaceState(null, "", location.pathname + location.search);
      setInfo(false);
    }
  };
  // so is the start screen opened from the player: back on a phone returns to the song
  const openAdding = () => {
    history.pushState({ adding: true }, "");
    setAdding(true);
  };
  const closeAdding = () => {
    if (onAdding()) history.back();
    else setAdding(false);
  };
  // songs came in from the start screen: back to the player, where they join the list
  const took = (files: FileList | undefined | null) => {
    if (take(files) && engine.snapshot().duration > 0) closeAdding();
  };
  const tookRef = useRef(took);
  tookRef.current = took;

  useEffect(() => {
    const sync = () => {
      setInfo(onInfo());
      setAdding(onAdding());
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
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

  // space plays and pauses, the arrows move through the song, escape closes info
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") return info ? closeInfo() : adding && closeAdding();
      if (info || engine.snapshot().status !== "ready") return;
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
  }, [info, adding]);

  return (
    <>
      <Aura />
      <div className="screen" inert={shown.info}>
        {player && <Player />}
        {/* kept while the player is showing, so a YouTube import carries on and joins the list when it is done */}
        <Start onAdd={pick} onDone={closeAdding} hidden={player} />
        {/* the bottom of the screen: info, and beside it the way between the two screens while a song is open.
            In the player the name goes to the start screen to add songs; there, the song playing comes back */}
        <nav className="foot bar">
          {player && (
            <button className="wordmark home" onClick={openAdding} aria-label="sloverb, add songs">
              sloverb
            </button>
          )}
          {shown.adding && <NowPlaying onClick={closeAdding} />}
          <button className="link" onClick={openInfo}>
            info
          </button>
        </nav>
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
      {shown.info && <Info onBack={closeInfo} />}
    </>
  );
}
