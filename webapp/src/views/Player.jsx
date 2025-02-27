import { useState, useEffect, useRef } from "react";
import * as Tone from "tone";
import Animation from "../components/Animation";
import { CirclePlay } from "lucide-react";

export default function Player({ currentMP3, setCurrentMP3 }) {
  const playerRef = useRef(null);
  const reverbRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [volume, setVolume] = useState(0);
  const [showPlayer, setShowPlayer] = useState(false);
  const [linearPlaybackRate, setLinearPlaybackRate] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [reverbLevel, setReverbLevel] = useState(0);
  const [loading, setLoading] = useState(false);

  // Unlock the audio context immediately on user gesture.
  async function unlockAudio() {
    await Tone.start();
    if (Tone.context.state !== "running") {
      await Tone.context.resume();
    }
    // Play a silent oscillator to fully unlock the context.
    const osc = new Tone.Oscillator(0, "sine").toDestination();
    osc.start();
    osc.stop();
  }

  // Initialize the player after unlocking the AudioContext.
  async function initializePlayer() {
    if (!currentMP3) return;
    const url = URL.createObjectURL(currentMP3);
    const reverb = new Tone.Reverb({ decay: 4.5, wet: 0 }).toDestination();
    const player = new Tone.Player({ url, loop: true });
    player.connect(reverb);
    player.grainSize = 0.2;
    player.overlap = 0.1;
    // Set the initial values from state:
    player.volume.value = volume;
    player.playbackRate = playbackRate;
    playerRef.current = player;
    reverbRef.current = reverb;
    await player.load();
  }

  async function handleToggle() {
    // Unlock the AudioContext immediately on tap.
    await unlockAudio();

    // Initialize the player if not already done.
    if (!playerRef.current) {
      await initializePlayer();
    }

    // Double-check that the buffer is loaded.
    if (!playerRef.current.buffer.loaded) {
      await playerRef.current.load();
    }

    if (!isPlaying) {
      playerRef.current.start(0, playbackPosition);
      Tone.Transport.start();
      setShowPlayer(true);
      setIsPlaying(true);
    } else {
      setPlaybackPosition(Tone.Transport.seconds);
      if (playerRef.current.state === "started") {
        playerRef.current.stop();
      }
      Tone.Transport.pause();
      setIsPlaying(false);
    }
  }

  function seekBack() {
    if (!playerRef.current) return;
    const newTime = Math.max(0, playerRef.current.seek() - 10);
    setPlaybackPosition(newTime);
    if (isPlaying) {
      playerRef.current.stop();
      playerRef.current.start(0, newTime);
    }
  }

  function seekForward() {
    if (!playerRef.current) return;
    const newTime = Math.min(
      playerRef.current.buffer.duration,
      playerRef.current.seek() + 10
    );
    setPlaybackPosition(newTime);
    if (isPlaying) {
      playerRef.current.stop();
      playerRef.current.start(0, newTime);
    }
  }

  function restartPlayback() {
    if (!playerRef.current) return;
    setPlaybackPosition(0);
    if (isPlaying) {
      playerRef.current.stop();
      playerRef.current.start(0, 0);
    }
  }

  // When volume state changes, update the player's volume if available.
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.volume.value = volume;
    }
  }, [volume]);

  // When playbackRate state changes, update the player's playbackRate if available.
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Updates for the playback rate slider.
  const handlePlaybackChange = (e) => {
    const linearValue = parseFloat(e.target.value);
    const logValue = Math.pow(2, linearValue - 1);
    setLinearPlaybackRate(linearValue);
    setPlaybackRate(logValue);
  };

  const handleReverbChange = (event) => {
    const wet = event.target.value;
    if (wet == 0.2) {
      reverbRef.current.wet.value = 0;
      setReverbLevel(0);
    } else {
      reverbRef.current.wet.value = event.target.value;
      setReverbLevel(event.target.value);
    }
  };

  const resetSlider = () => {
    setLinearPlaybackRate(1);
    setPlaybackRate(1);
    if (reverbRef.current) {
      reverbRef.current.wet.value = 0;
    }
    setReverbLevel(0);
  };

  const getMP3DurationWebAudio = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsArrayBuffer(file);
      reader.onload = () => {
        const audioContext =
          new (window.AudioContext || window.webkitAudioContext)();
        audioContext.decodeAudioData(
          reader.result,
          (buffer) => resolve(buffer.duration),
          (err) => reject(err)
        );
      };
      reader.onerror = () => reject("Error reading file");
    });
  };

  async function handleDownload(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const duration = await getMP3DurationWebAudio(currentMP3);
      console.log("MP3 Duration:", duration, "seconds");
      const newDuration = duration / playerRef.current.playbackRate;
      console.log("New duration:", newDuration);

      const buffer = await Tone.Offline(async () => {
        const url = URL.createObjectURL(currentMP3);
        const reverb = new Tone.Reverb({ decay: 4.5, wet: reverbLevel }).toDestination();
        const player = new Tone.Player().connect(reverb);
        await player.load(url);
        player.playbackRate = playbackRate;
        player.grainSize = 0.2;
        player.overlap = 0.1;
        player.start(0);
        await Tone.loaded();
      }, newDuration);

      console.log("Rendered buffer:", buffer);
      const rawAudioData = buffer.getChannelData(0);
      const audioArrayBuffer = rawAudioData.buffer;
      const blob = new Blob([audioArrayBuffer], { type: "application/octet-stream" });
      const formData = new FormData();
      formData.append("audio", blob, "audio.raw");

      const response = await fetch("https://api.sloverb.app:8080/upload-audio", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        alert("Error!");
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const blobResponse = await response.blob();
      const audioURL = URL.createObjectURL(blobResponse);
      const a = document.createElement("a");
      a.href = audioURL;
      a.download = "audio.wav";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      alert("Error!");
    }
    setLoading(false);
  }

  return (
    <>
      {!showPlayer ? (
        <div className="flex flex-col items-center space-y-4">
          <CirclePlay
            className="cursor-pointer transition-transform duration-200 hover:scale-105"
            size="114"
            color="white"
            onClick={handleToggle}
          />
          <div className="overflow-visible">
            <h1 className="text-4xl font-extrabold bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 bg-clip-text text-transparent text-center relative animate-[epicFloat_6s_ease-in-out_infinite] leading-[1.2] pb-2">
              start the player
            </h1>
          </div>
        </div>
      ) : (
        <div className="min-h-[100dvh] w-screen bg-black flex items-center justify-center p-4 overflow-hidden">
          <div className="flex flex-col items-center justify-between max-w-lg w-full gap-4 flex-grow">
            <div className="flex flex-col items-center w-full gap-2">
              <Animation isPlaying={isPlaying} />
              <div className="grid grid-cols-4 gap-2 w-full">
                <button type="button" onClick={seekBack} className="px-4 py-2 text-white bg-slate-500 bg-opacity-40 rounded-lg shadow-md hover:bg-gray-600 transition duration-300 w-full">
                  -10s
                </button>
                <button type="button" onClick={handleToggle} className="px-4 py-2 text-white rounded-lg shadow-md bg-gradient-to-r from-blue-500 to-purple-600 hover:scale-105 transition duration-300 w-full">
                  {isPlaying ? "Pause" : "Play"}
                </button>
                <button type="button" onClick={seekForward} className="px-4 py-2 text-white bg-slate-500 bg-opacity-40 rounded-lg shadow-md hover:bg-gray-600 transition duration-300 w-full">
                  +10s
                </button>
                <button type="button" onClick={restartPlayback} className="px-4 py-2 text-white bg-slate-500 bg-opacity-40 rounded-lg shadow-md hover:bg-gray-600 transition duration-300 w-full">
                  Restart
                </button>
              </div>
            </div>

            <div className="flex flex-col items-center w-full gap-2">
              <div className="w-full">
                <label className="block text-sm font-medium text-white">Volume</label>
                <input
                  type="range"
                  min="-60"
                  max="0"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full accent-blue-500 cursor-pointer"
                />
              </div>
              <div className="w-full">
                <label className="block text-sm font-medium text-white">Reverb</label>
                <input
                  type="range"
                  min="0.2"
                  max="0.8"
                  step="0.01"
                  value={reverbLevel}
                  onChange={handleReverbChange}
                  className="w-full accent-purple-500 cursor-pointer"
                />
              </div>
              <div className="relative w-full">
                <div className="relative h-14 flex items-center rounded-lg overflow-hidden shadow-lg">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 h-full rounded-lg blur-md opacity-70" />
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 h-full rounded-lg opacity-90" />
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.01"
                    value={linearPlaybackRate}
                    onChange={handlePlaybackChange}
                    className="absolute w-full h-full bg-transparent appearance-none z-10 cursor-pointer"
                    style={{
                      WebkitAppearance: "none",
                      appearance: "none",
                      outline: "none",
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center w-full gap-2">
              <div className="grid grid-cols-3 gap-2 w-full">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentMP3(null);
                    if (playerRef.current) playerRef.current.disconnect();
                  }}
                  className="px-4 py-2 bg-fuchsia-800 text-white rounded-lg shadow-md hover:scale-105 transition duration-300 w-full"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={resetSlider}
                  className="px-4 py-2 text-white rounded-lg shadow-md bg-gradient-to-r from-blue-500 to-purple-600 hover:scale-105 transition duration-300 w-full"
                >
                  Reset
                </button>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-emerald-800 text-white rounded-lg shadow-md hover:scale-105 transition duration-300 w-full"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center space-x-1">
                      <svg
                        className="animate-spin h-5 w-5 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v2.5a5.5 5.5 0 00-5.5 5.5H4z"
                        ></path>
                      </svg>
                      <span className="animate-pulse text-xs">Processing...</span>
                    </span>
                  ) : (
                    "Save"
                  )}
                </button>
              </div>

              <div className="text-center mt-2">
                <div className="text-xs font-medium bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 bg-clip-text text-transparent">
                  <div className="flex flex-col items-center cursor-pointer" onClick={() => window.open("https://github.com/umairair/sloverb", "_blank")}>
                    <h1>created by umair</h1>
                    <h2>(github repo)</h2>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <style jsx>{`
            input[type="range"]::-webkit-slider-thumb {
              -webkit-appearance: none;
              appearance: none;
              width: 24px;
              height: 24px;
              background: radial-gradient(circle, #ffffff 20%, rgba(255, 255, 255, 0.3) 50%, transparent 60%);
              border: 2px solid white;
              border-radius: 50%;
              box-shadow: 0 0 12px rgba(255, 255, 255, 0.7);
              transition: transform 0.1s ease-in-out;
            }
            input[type="range"]:active::-webkit-slider-thumb {
              transform: scale(1.2);
              box-shadow: 0 0 16px rgba(255, 255, 255, 1);
            }
          `}</style>
        </div>
      )}
    </>
  );
}
