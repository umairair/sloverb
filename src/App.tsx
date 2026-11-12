import { useEffect, useRef, useState } from "react";
import { engine } from "./audio/engine";
import { Info } from "./screens/Info";
import { Player } from "./screens/Player";
import { Start } from "./screens/Start";
import { Aura, useEngine } from "./ui";
import { LinkDialog } from "./imports/LinkImport";

const hasFile = (event: DragEvent) => !!event.dataTransfer?.types.includes("Files");

/** Hand over whatever was chosen, dropped or pasted: the songs among it, or all of it if nothing says what it is. */
function take(files: FileList | undefined | null) {
  const all = [...(files ?? [])];
  const songs = all.filter((file) => /^(audio|video)\//.test(file.type));
  const list = (songs.length ? songs : all).map((file) => ({ file, name: file.name }));
  if (list.length) void engine.add(list);
}

const onInfo = () => location.hash === "#info";

export function App() {
  const { status, duration } = useEngine();
  // another song opens over the one playing, so the player stays put while it loads
  const player = status === "ready" || (status === "opening" && duration > 0);
  const [info, setInfo] = useState(onInfo);
  const [dropping, setDropping] = useState(false);
  const [link, setLink] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

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
  useEffect(() => {
    const sync = () => setInfo(onInfo());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

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
      take(event.dataTransfer?.files);
    };
    const paste = (event: ClipboardEvent) => take(event.clipboardData?.files);
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
      if (event.key === "Escape") return info && closeInfo();
      if (info || link || engine.snapshot().status !== "ready") return;
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
  }, [info, link]);

  return (
    <>
      <Aura />
      <div className={`screen ${player ? "has-top" : ""}`} inert={info}>
        {/* with a song open the name sits at the top, the way back out to the start, as info sits at the bottom */}
        {player && (
          <button className="wordmark home" onClick={engine.clear} aria-label="sloverb, back to the start">
            sloverb
          </button>
        )}
        {player ? (
          <Player onAdd={pick} onLink={() => setLink(true)} />
        ) : (
          <Start onAdd={pick} />
        )}
        <button className="link foot" onClick={openInfo}>
          info
        </button>
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
          take(event.target.files);
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
      {info && <Info onBack={closeInfo} />}
      {link && <LinkDialog onClose={() => setLink(false)} />}
    </>
  );
}
