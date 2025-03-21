import { useState, useEffect, useRef } from "react";
import * as Tone from "tone";
import Animation from "../components/Animation";
import { CirclePlay } from "lucide-react";

export default function Player({ currentMP3, setCurrentMP3 }) {
  const playerRef = useRef(null);
  const reverbRef = useRef(null);
  const waveformCanvasRef = useRef(null);
  const analyzerRef = useRef(null);
  const animationFrameRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [volume, setVolume] = useState(0);
  const [showPlayer, setShowPlayer] = useState(false);
  const [linearPlaybackRate, setLinearPlaybackRate] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [reverbLevel, setReverbLevel] = useState(0);
  const [loading, setLoading] = useState(false);
  const [waveformData, setWaveformData] = useState(null);

  async function unlockAudio() {
    await Tone.start();
    if (Tone.context.state !== "running") {
      await Tone.context.resume();
    }
    const osc = new Tone.Oscillator(0, "sine").toDestination();
    osc.start();
    osc.stop();
  }

  async function initializePlayer() {
    if (!currentMP3) return;
    const url = URL.createObjectURL(currentMP3);
    const reverb = new Tone.Reverb({ decay: 4.5, wet: 0 }).toDestination();
    const player = new Tone.Player({ url, loop: true });
    
    // Create analyzer for waveform visualization
    const analyzer = new Tone.Analyser("waveform", 1024);
    
    player.connect(reverb);
    player.connect(analyzer);
    
    player.grainSize = 0.2;
    player.overlap = 0.1;
    player.volume.value = volume;
    player.playbackRate = playbackRate;
    playerRef.current = player;
    reverbRef.current = reverb;
    analyzerRef.current = analyzer;
    
    // Generate waveform data for visualization
    await player.load();
    generateWaveformData(player.buffer);
  }

  const generateWaveformData = (buffer) => {
    if (!buffer) return;
    
    const rawData = buffer.getChannelData(0);
    const samples = 100; // Number of data points to display
    const blockSize = Math.floor(rawData.length / samples);
    const filteredData = [];
    
    for (let i = 0; i < samples; i++) {
      const blockStart = blockSize * i;
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(rawData[blockStart + j] || 0);
      }
      filteredData.push(sum / blockSize);
    }
    
    // Normalize the data
    const multiplier = Math.max(...filteredData) > 0 ? 1 / Math.max(...filteredData) : 1;
    const normalizedData = filteredData.map(n => n * multiplier);
    
    setWaveformData(normalizedData);
  };

  const drawWaveform = () => {
    if (!waveformCanvasRef.current || !analyzerRef.current || !isPlaying) return;
    
    const canvas = waveformCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Get waveform data from analyzer
    const waveform = analyzerRef.current.getValue();
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#3b82f6'); // blue-500
    gradient.addColorStop(0.5, '#a855f7'); // purple-500
    gradient.addColorStop(1, '#ec4899'); // pink-500
    
    ctx.beginPath();
    
    // Draw waveform
    for (let i = 0; i < waveform.length; i++) {
      const x = (i / waveform.length) * width;
      const y = ((waveform[i] + 1) / 2) * height;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    // Styling
    ctx.lineWidth = 2;
    ctx.strokeStyle = gradient;
    ctx.stroke();
    
    // Add glow effect
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
    
    // Request next frame
    animationFrameRef.current = requestAnimationFrame(drawWaveform);
  };

  const drawStaticWaveform = () => {
    if (!waveformCanvasRef.current || !waveformData) return;
    
    const canvas = waveformCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#3b82f6'); // blue-500
    gradient.addColorStop(0.5, '#a855f7'); // purple-500
    gradient.addColorStop(1, '#ec4899'); // pink-500
    
    // Center line
    const center = height / 2;
    
    ctx.beginPath();
    
    // Draw the waveform
    waveformData.forEach((point, index) => {
      const x = (index / waveformData.length) * width;
      const amplitude = point * (height / 2) * 0.8; // Scale to 80% of half height
      
      if (index === 0) {
        ctx.moveTo(x, center + amplitude);
      } else {
        ctx.lineTo(x, center + amplitude);
      }
    });
    
    // Continue back through the points to create a mirrored waveform
    for (let i = waveformData.length - 1; i >= 0; i--) {
      const x = (i / waveformData.length) * width;
      const amplitude = waveformData[i] * (height / 2) * 0.8;
      ctx.lineTo(x, center - amplitude);
    }
    
    ctx.closePath();
    
    // Fill with gradient
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Add subtle glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
  };

  async function handleToggle() {
    await unlockAudio();

    if (!playerRef.current) {
      await initializePlayer();
    }

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

  // Handle waveform drawing
  useEffect(() => {
    if (isPlaying && analyzerRef.current && waveformCanvasRef.current) {
      drawWaveform();
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (waveformCanvasRef.current && waveformData) {
        drawStaticWaveform();
      }
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, waveformData]);

  useEffect(() => {
    if (waveformCanvasRef.current && waveformData && !isPlaying) {
      drawStaticWaveform();
    }
  }, [waveformData]);

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.volume.value = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => {
      if (waveformCanvasRef.current) {
        const canvas = waveformCanvasRef.current;
        const container = canvas.parentElement;
        if (container) {
          canvas.width = container.clientWidth;
          canvas.height = container.clientHeight;
          
          if (isPlaying) {
            drawWaveform();
          } else if (waveformData) {
            drawStaticWaveform();
          }
        }
      }
    };
    
    window.addEventListener('resize', handleResize);
    if (showPlayer) {
      setTimeout(handleResize, 100); // Run after component has rendered
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [showPlayer, waveformData, isPlaying]);

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
    <div className="relative h-screen w-screen bg-black overflow-hidden">
      {!showPlayer ? (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
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
        <div
          style={{ overscrollBehaviorX: "none" }}
          className="h-screen w-screen bg-black flex items-center justify-center overflow-hidden relative px-4"
        >
          <div className="flex flex-col items-center justify-between max-w-lg w-full gap-2">
            <div className="flex flex-col items-center w-full gap-2">
              <Animation isPlaying={isPlaying} />
              
              {/* Waveform visualization - replacing the 4 buttons */}
              <div className="w-full h-14 rounded-lg shadow-lg overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 h-full rounded-lg blur-md opacity-70" />
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-10 rounded-lg" />
                <canvas 
                  ref={waveformCanvasRef} 
                  className="absolute inset-0 w-full h-full cursor-pointer"
                  onClick={handleToggle}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div 
                    className="bg-white bg-opacity-20 backdrop-blur-sm p-2 rounded-full cursor-pointer hover:bg-opacity-30 transition-all"
                    onClick={handleToggle}
                  >
                    <span className="text-white text-xs font-medium">
                      {isPlaying ? "Pause" : "Play"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
        
            <div className="flex flex-col items-center w-full gap-2">
              <div className="flex flex-col gap-2 w-full">
                <div className="w-full">
                  <label className="block text-sm font-medium text-white">
                    Volume
                  </label>
                  <div className="relative w-full">
                    <div className="relative h-8 flex items-center rounded-lg overflow-hidden shadow-lg">
                      <div className="absolute inset-0 bg-blue-500 rounded-lg" />
                      <input
                        type="range"
                        min="-60"
                        max="0"
                        value={volume}
                        onChange={(e) =>
                          setVolume(parseFloat(e.target.value))
                        }
                        className="absolute w-full h-full bg-transparent appearance-none z-10 cursor-pointer custom-slider"
                        style={{
                          WebkitAppearance: "none",
                          appearance: "none",
                          outline: "none",
                        }}
                      />
                    </div>
                  </div>
                </div>
        
                <div className="w-full">
                  <label className="block text-sm font-medium text-white">
                    Reverb
                  </label>
                  <div className="relative w-full">
                    <div className="relative h-8 flex items-center rounded-lg overflow-hidden shadow-lg">
                      <div className="absolute inset-0 bg-purple-500 rounded-lg" />
                      <input
                        type="range"
                        min="0.2"
                        max="0.8"
                        step="0.01"
                        value={reverbLevel}
                        onChange={handleReverbChange}
                        className="absolute w-full h-full bg-transparent appearance-none z-10 cursor-pointer custom-slider"
                        style={{
                          WebkitAppearance: "none",
                          appearance: "none",
                          outline: "none",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
        
              <div className="w-full mt-3">
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
                  onClick={(e) => e.preventDefault()}
                  className="px-4 py-2 bg-emerald-800 text-white rounded-lg shadow-md hover:scale-105 transition duration-300 w-full relative opacity-70 cursor-not-allowed group"
                  disabled={true}
                >
                  {loading ? (
                    <span className="flex items-center space-x-1">
                      <svg
                        className="animate-spin h-5 w-5 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v2.5a5.5 5.5 0 00-5.5 5.5H4z"
                        ></path>
                      </svg>
                      <span className="animate-pulse text-xs">
                        Processing...
                      </span>
                    </span>
                  ) : (
                    <>
                      Save
                      <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block bg-black bg-opacity-80 text-white text-xs rounded p-1 whitespace-nowrap">
                        Coming soon...
                      </span>
                    </>
                  )}
                </button>
              </div>
              <div className="text-center mt-2">
                <div
                  className="text-xs font-medium bg-gradient-to-r from-blue-500 via-purple-500 to-red-500 bg-clip-text text-transparent cursor-pointer"
                  onClick={() =>
                    window.open(
                      "https://github.com/umairair/",
                      "_blank"
                    )
                  }
                >
                  <h1>created by umair</h1>
                  
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        /* Remove default track styling for WebKit browsers (Safari, Chrome, etc.) */
        input[type="range"]::-webkit-slider-runnable-track {
          background: transparent;
        }

        /* Remove default track styling for Firefox */
        input[type="range"]::-moz-range-track {
          background: transparent;
        }

        /* Gradient slider thumb (for playback rate) */
        input[type="range"]:not(.custom-slider)::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 24px;
          height: 24px;
          background: radial-gradient(
            circle,
            #ffffff 20%,
            rgba(255, 255, 255, 0.3) 50%,
            transparent 60%
          );
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 0 12px rgba(255, 255, 255, 0.7);
          transition: transform 0.1s ease-in-out;
        }
        input[type="range"]:not(.custom-slider):active::-webkit-slider-thumb {
          transform: scale(1.2);
          box-shadow: 0 0 16px rgba(255, 255, 255, 1);
        }
        input[type="range"]:not(.custom-slider)::-moz-range-thumb {
          width: 24px;
          height: 24px;
          background: radial-gradient(
            circle,
            #ffffff 20%,
            rgba(255, 255, 255, 0.3) 50%,
            transparent 60%
          );
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 0 12px rgba(255, 255, 255, 0.7);
          transition: transform 0.1s ease-in-out;
        }
        input[type="range"]:not(.custom-slider):active::-moz-range-thumb {
          transform: scale(1.2);
          box-shadow: 0 0 16px rgba(255, 255, 255, 1);
        }

        /* Custom slider thumb (for Volume & Reverb) */
        .custom-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          background: white;
          border-radius: 50%;
          border: none;
          box-shadow: none;
          transition: transform 0.1s ease-in-out;
        }
        .custom-slider:active::-webkit-slider-thumb {
          transform: scale(1.1);
        }
        .custom-slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          background: white;
          border-radius: 50%;
          border: none;
          box-shadow: none;
          transition: transform 0.1s ease-in-out;
        }
        .custom-slider:active::-moz-range-thumb {
          transform: scale(1.1);
        }
      `}</style>
      <style jsx global>{`
        html,
        body {
          height: 100%;
          overflow-y: hidden;
          margin: 0; /* Remove any default margins that could cause overflow */
        }
      `}</style>
    </div>
  );
}