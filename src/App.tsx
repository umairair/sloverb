import { useEffect, useRef, useState } from "react";
import { engine } from "./audio/engine";
import { About } from "./screens/About";
import { Player } from "./screens/Player";
import { Start } from "./screens/Start";
import { useEngine } from "./ui";

const hasFile = (event: DragEvent) => !!event.dataTransfer?.types.includes("Files");

export function App() {
  const { status, duration } = useEngine();
  // a second song opens over the first, so the player stays put while it loads
  const player = status === "ready" || (status === "opening" && duration > 0);
  const [about, setAbout] = useState(false);
  const [dropping, setDropping] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const pick = () => {
    engine.wake();
    picker.current?.click();
  };

  // a song can also be dropped anywhere on the page, or pasted
  useEffect(() => {
    let inside = 0;
    const enter = (event: DragEvent) => {
      if (!hasFile(event)) return;
      inside++;
      setDropping(true);
    };
    const leave = (event: DragEvent) => {
      if (!hasFile(event)) return;
      inside = Math.max(0, inside - 1);
      if (!inside) setDropping(false);
    };
    const over = (event: DragEvent) => {
      if (hasFile(event)) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      if (!hasFile(event)) return;
      event.preventDefault();
      inside = 0;
      setDropping(false);
      const file = event.dataTransfer?.files[0];
      if (file) void engine.open(file, file.name);
    };
    const paste = (event: ClipboardEvent) => {
      const file = event.clipboardData?.files[0];
      if (file) void engine.open(file, file.name);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
      window.removeEventListener("paste", paste);
    };
  }, []);

  // space plays and pauses, the arrows move through the song, escape closes about
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") return setAbout(false);
      if (about || engine.snapshot().status !== "ready") return;
      const on = event.target as HTMLElement | null;
      if (on?.closest("button, a, input")) return;
      if (event.key === " ") {
        event.preventDefault();
        engine.toggle();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        engine.nudge(event.key === "ArrowLeft" ? -5 : 5);
      }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [about]);

  return (
    <>
      {player ? (
        <Player onOpen={pick} onAbout={() => setAbout(true)} />
      ) : (
        <Start
          onOpen={pick}
          onDemo={() => {
            engine.wake();
            engine.demo();
          }}
          onAbout={() => setAbout(true)}
        />
      )}
      <input
        ref={picker}
        type="file"
        accept="audio/*,video/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void engine.open(file, file.name);
        }}
      />
      {dropping && (
        <div className="overlay drop">
          <p className="head">drop</p>
        </div>
      )}
      {about && <About onBack={() => setAbout(false)} />}
    </>
  );
}
